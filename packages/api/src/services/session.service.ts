import { randomBytes, randomUUID } from 'node:crypto';
import type { Role } from '../config/permissions.js';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { hashToken } from '../shared/tokens.js';
import { logger } from '../config/logger.js';

/**
 * Sessões com JWT de acesso curto + refresh token rotativo.
 *
 * Segurança aplicada:
 *  - O refresh token é opaco (não é JWT) e persistido apenas como hash.
 *  - Cada login cria uma "família" de tokens. Ao rotacionar, o token antigo
 *    é revogado. Se um token já revogado for reapresentado, toda a família é
 *    derrubada (proteção contra replay/roubo de token).
 *  - O access token é assinado pelo @fastify/jwt com TTL curto.
 */

export interface SessionUser {
  id: string;
  role: Role;
  name: string;
  email: string;
}

export interface RefreshRecord {
  id: string;
  userId: string;
  family: string;
}

function addTtlToNow(ttl: string): Date {
  // Suporta formatos simples: 15m, 7d, 1h, 30s
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(ttl.trim());
  const now = Date.now();
  if (!match) return new Date(now + 15 * 60 * 1000);
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return new Date(now + value * multiplier);
}

export const sessionService = {
  /** Cria um refresh token novo (retorna o valor em claro, uma única vez). */
  async issueRefreshToken(
    userId: string,
    meta: { userAgent?: string | null; ip?: string | null },
    family?: string,
  ): Promise<{ token: string; family: string; expiresAt: Date }> {
    const token = randomBytes(48).toString('base64url');
    const tokenFamily = family ?? randomUUID();
    const expiresAt = addTtlToNow(env.JWT_REFRESH_TTL);

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        family: tokenFamily,
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
        expiresAt,
      },
    });

    return { token, family: tokenFamily, expiresAt };
  },

  /**
   * Valida e rotaciona um refresh token.
   * Retorna `null` para token inválido/expirado; lança em caso de reuso.
   */
  async rotateRefreshToken(
    rawToken: string,
    meta: { userAgent?: string | null; ip?: string | null },
  ): Promise<{ record: RefreshRecord; newToken: string } | null> {
    const tokenHash = hashToken(rawToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) return null;

    // Token já revogado sendo reapresentado → possível roubo.
    if (stored.revokedAt) {
      logger.security('Refresh token revogado reapresentado — revogando família', {
        userId: stored.userId,
        family: stored.family,
      });
      await prisma.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return null;
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      return null;
    }

    // Rotação: revoga o atual e emite um novo na mesma família.
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const issued = await this.issueRefreshToken(stored.userId, meta, stored.family);

    return {
      record: { id: stored.id, userId: stored.userId, family: stored.family },
      newToken: issued.token,
    };
  },

  async revokeToken(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async revokeAllForUser(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  /** Limpeza de tokens expirados (pode rodar periodicamente). */
  async pruneExpired(): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null}}]},
    });
    return result.count;
  },
};
