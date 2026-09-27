import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { hashPassword, isWeakPassword, verifyPassword } from '../services/password.service.js';
import { sessionService } from '../services/session.service.js';
import { recordAudit } from '../services/audit.service.js';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../shared/errors.js';
import { created, handleError, ok } from '../shared/http.js';
import { emailSchema, nameSchema, passwordSchema } from '../shared/validators.js';
import { hashToken } from '../shared/tokens.js';
import type { AccessTokenPayload } from '../plugins/auth.plugin.js';

/**
 * Autenticação administrativa.
 *
 * Fluxo:
 *  POST /auth/login    → access token (15m) + refresh token (cookie httpOnly)
 *  POST /auth/refresh  → rotaciona o refresh token
 *  POST /auth/logout   → revoga o refresh token atual
 *  GET  /auth/me       → dados do usuário autenticado
 */

const REFRESH_COOKIE = 'celebrai_refresh';

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha'),
});

const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['ADMIN', 'RECEPTIONIST']).default('ADMIN'),
});

function setRefreshCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, { path: '/' });
}

function buildAccessPayload(user: {
  id: string;
  /** `string` porque no schema de desenvolvimento `Role` é `String` (SQLite). */
  role: string;
  name: string;
  email: string;
}): AccessTokenPayload {
  return {
    sub: user.id,
    role: user.role as AccessTokenPayload['role'],
    name: user.name,
    email: user.email,
    typ: 'access',
  };
}

export const authController = {
  /** POST /auth/login */
  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = loginSchema.parse(request.body);

      const user = await prisma.user.findUnique({ where: { email: body.email } });

      // Mensagem genérica: não revela se o e-mail existe.
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        await recordAudit({
          action: 'auth.login_failed',
          actorName: body.email,
          description: 'Tentativa de login com credenciais inválidas',
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });
        throw new UnauthorizedError('E-mail ou senha incorretos.');
      }

      if (user.status === 'SUSPENDED') {
        throw new ForbiddenError('Sua conta está suspensa. Contate o administrador.');
      }

      const accessToken = request.server.jwt.sign(buildAccessPayload(user));
      const refresh = await sessionService.issueRefreshToken(user.id, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });

      setRefreshCookie(reply, refresh.token, refresh.expiresAt);

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

      await recordAudit({
        action: 'auth.login',
        userId: user.id,
        actorRole: user.role as AccessTokenPayload['role'],
        actorName: user.name,
        description: 'Login realizado com sucesso',
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });

      return ok(reply, {
        accessToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** POST /auth/refresh — rotaciona o refresh token. */
  async refresh(request: FastifyRequest, reply: FastifyReply) {
    try {
      const raw = request.cookies?.[REFRESH_COOKIE];
      if (!raw) throw new UnauthorizedError('Sessão não encontrada. Faça login novamente.');

      const rotated = await sessionService.rotateRefreshToken(raw, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });

      if (!rotated) {
        clearRefreshCookie(reply);
        await recordAudit({
          action: 'auth.refresh_reuse_detected',
          description: 'Refresh token inválido, expirado ou reutilizado',
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });
        throw new UnauthorizedError('Sessão expirada. Faça login novamente.');
      }

      const user = await prisma.user.findUnique({ where: { id: rotated.record.userId } });
      if (!user || user.status === 'SUSPENDED') {
        clearRefreshCookie(reply);
        throw new UnauthorizedError('Usuário indisponível.');
      }

      const accessToken = request.server.jwt.sign(buildAccessPayload(user));

      const issued = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(rotated.newToken) },
        select: { expiresAt: true },
      });

      setRefreshCookie(
        reply,
        rotated.newToken,
        issued?.expiresAt ?? new Date(Date.now() + 7 * 86_400_000),
      );

      return ok(reply, {
        accessToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** POST /auth/logout */
  async logout(request: FastifyRequest, reply: FastifyReply) {
    try {
      const raw = request.cookies?.[REFRESH_COOKIE];
      if (raw) await sessionService.revokeToken(raw);
      clearRefreshCookie(reply);

      if (request.user) {
        await recordAudit({
          action: 'auth.logout',
          userId: request.user.sub,
          actorRole: request.user.role,
          actorName: request.user.name,
          description: 'Logout realizado',
          ip: request.ip,
        });
      }

      return reply.status(204).send();
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** GET /auth/me */
  async me(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      if (!user) throw new UnauthorizedError('Usuário não encontrado.');

      return ok(reply, user);
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /**
   * POST /auth/users — somente SUPER_ADMIN cria usuários administrativos.
   */
  async createUser(request: FastifyRequest, reply: FastifyReply) {
    try {
      if (request.user.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Apenas o super admin pode criar usuários.');
      }

      const body = registerSchema.parse(request.body);

      if (isWeakPassword(body.password)) {
        throw new ValidationError('Senha muito fraca. Use ao menos 8 caracteres, com letras e números.');
      }

      const exists = await prisma.user.findUnique({ where: { email: body.email } });
      if (exists) throw new ValidationError('Já existe um usuário com este e-mail.');

      const user = await prisma.user.create({
        data: {
          name: body.name,
          email: body.email,
          passwordHash: await hashPassword(body.password),
          role: body.role,
        },
        select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
      });

      await recordAudit({
        action: 'user.created',
        userId: request.user.sub,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'User',
        entityId: user.id,
        description: `Usuário ${user.email} criado com perfil ${user.role}`,
        ip: request.ip,
      });

      return created(reply, user);
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** GET /auth/users — listagem de usuários administrativos. */
  async listUsers(request: FastifyRequest, reply: FastifyReply) {
    try {
      if (request.user.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Apenas o super admin pode listar usuários.');
      }

      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          _count: { select: { events: true, memberships: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return ok(reply, users);
    } catch (error) {
      return handleError(reply, error);
    }
  },
};
