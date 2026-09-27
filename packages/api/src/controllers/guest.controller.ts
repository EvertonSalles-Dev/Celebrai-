import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { created, handleError, noContent, ok, paginationMeta, toSkipTake } from '../shared/http.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { createGuestSchema, importGuestsSchema, listGuestsQuerySchema, updateGuestSchema } from '../schemas/index.js';
import { recordAudit } from '../services/audit.service.js';
import { invitationService } from '../services/invitation.service.js';
import { isValidCpf, normalizeBrazilianPhone, normalizeEmail, onlyDigits } from '../shared/brazil.js';
import { logger } from '../config/logger.js';

/**
 * Controller de convidados.
 *
 * Nada é gravado sem validação; a importação em massa tem sempre um passo de
 * prévia (`dryRun`) para o administrador revisar antes de confirmar.
 */

/** Garante que o usuário pode escrever no evento (recepção não pode). */
function assertCanWrite(role: string): void {
  if (role === 'RECEPTIONIST') {
    throw new ForbiddenError('Seu perfil não pode alterar convidados.');
  }
}

/** Junta os acompanhantes a partir do JSON persistido. */
function parseCompanions(value: unknown): Array<{ name: string; document?: string }> {
  if (!value) return [];
  if (Array.isArray(value)) return value as Array<{ name: string; document?: string }>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Retorna/cria o grupo (família) do convidado. */
async function resolveParty(
  eventId: string,
  partyId?: string,
  partyName?: string,
): Promise<string | null> {
  if (partyId) {
    const exists = await prisma.party.findFirst({ where: { id: partyId, eventId } });
    if (!exists) throw new ValidationError('Grupo informado não pertence a este evento.');
    return exists.id;
  }

  if (partyName) {
    const party = await prisma.party.upsert({
      where: { eventId_name: { eventId, name: partyName } },
      create: { eventId, name: partyName },
      update: {},
      select: { id: true },
    });
    return party.id;
  }

  return null;
}

/** Projeção segura do convidado para a UI (nunca expõe CPF completo). */
function toGuestView(guest: {
  id: string;
  fullName: string;
  email: string | null;
  whatsapp: string | null;
  allowedCompanions: number;
  notes: string | null;
  createdAt: Date;
  party: { id: string; name: string } | null;
  invitation: {
    id: string;
    status: string;
    sentAt: Date | null;
    qrCodePrefix: string | null;
    response: {
      fullName: string;
      cpfMasked: string | null;
      email: string | null;
      phone: string | null;
      attendingCount: number;
      companions: unknown;
      createdAt: Date;
    } | null;
    checkIns: Array<{ createdAt: Date; peopleCount: number; operatorLabel: string | null }>;
  } | null;
}) {
  return {
    // `id` é obrigatório na UI (seleção, edição e exclusão usam este campo).
    id: guest.id,
    fullName: guest.fullName,
    email: guest.email,
    whatsapp: guest.whatsapp,
    allowedCompanions: guest.allowedCompanions,
    notes: guest.notes,
    createdAt: guest.createdAt,
    party: guest.party,
    invitation: guest.invitation
      ? {
        id: guest.invitation.id,
        status: guest.invitation.status,
        sentAt: guest.invitation.sentAt,
        hasQrCode: Boolean(guest.invitation.qrCodePrefix),
        response: guest.invitation.response
          ? {
            fullName: guest.invitation.response.fullName,
            // LGPD: apenas a máscara, nunca o CPF completo.
            cpfMasked: guest.invitation.response.cpfMasked,
            email: guest.invitation.response.email,
            phone: guest.invitation.response.phone,
            attendingCount: guest.invitation.response.attendingCount,
            companions: parseCompanions(guest.invitation.response.companions),
            respondedAt: guest.invitation.response.createdAt,
          }
          : null,
        lastCheckIn: guest.invitation.checkIns[0] ?? null,
        checkInCount: guest.invitation.checkIns.length,
      }
      : null,
  };
}

export const guestController = {
  /** GET /events/:eventId/guests — lista paginada com filtros. */
  async list(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId } = request.params as { eventId: string };
      await request.server.assertEventAccess(request.user, eventId);

      const query = listGuestsQuerySchema.parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.perPage);

      // Filtro por status vive no convite; por check-in, na tabela de check-ins.
      const invitationFilter: Prisma.InvitationWhereInput = {};
      if (query.status !== 'ALL') invitationFilter.status = query.status;

      if (query.checkIn === 'IN') invitationFilter.checkIns = { some: {} };
      if (query.checkIn === 'OUT') invitationFilter.checkIns = { none: {} };

      // O filtro por status/check-in vive na tabela `invitations` (a coluna é
      // `invitations.guestId`). Filtramos os ids primeiro e usamos `id: { in }`
      // em vez de `invitation: {...}`, porque a relação inversa `guest.invitation`
      // não existe no schema de desenvolvimento (ver `prisma/schema.dev.prisma`).
      const hasInvitationFilter = Object.keys(invitationFilter).length > 0;

      const matchingGuestIds = hasInvitationFilter
        ? (
            await prisma.invitation.findMany({
              where: invitationFilter,
              select: { guestId: true },
            })
          ).map((row) => row.guestId)
        : null;

      const where: Prisma.GuestWhereInput = {
        eventId,
        ...(query.partyId ? { partyId: query.partyId } : {}),
        ...(matchingGuestIds ? { id: { in: matchingGuestIds } } : {}),
        ...(query.search
          ? {
            OR: [
              { fullName: { contains: query.search } },
              { email: { contains: query.search } },
              { whatsapp: { contains: query.search } },
            ],
          }
          : {}),
      };

      const orderBy: Prisma.GuestOrderByWithRelationInput =
        query.sort === 'name'
          ? { fullName: query.order }
          : { createdAt: query.order };

      const total = await prisma.guest.count({ where });
      const guests = await prisma.guest.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          party: { select: { id: true, name: true } },
        },
      });

      // Convites anexados em uma segunda consulta (mesma forma de resposta).
      const invitations = await prisma.invitation.findMany({
        where: { guestId: { in: guests.map((guest) => guest.id) } },
        include: {
          response: true,
          checkIns: { orderBy: { createdAt: 'desc' } },
        },
      });

      const invitationByGuest = new Map(
        invitations.map((invitation) => [invitation.guestId, invitation]),
      );

      return ok(
        reply,
        guests.map((g) => toGuestView({ ...g, invitation: invitationByGuest.get(g.id) ?? null })),
        paginationMeta(query.page, query.perPage, total),
      );
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** GET /events/:eventId/guests/:id */
  async get(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId, id } = request.params as { eventId: string; id: string };
      await request.server.assertEventAccess(request.user, eventId);

      const guest = await prisma.guest.findFirst({
        where: { id, eventId },
        include: {
          party: { select: { id: true, name: true } },
        },
      });

      if (!guest) throw new NotFoundError('Convidado não encontrado.');

      const invitation = await prisma.invitation.findUnique({
        where: { guestId: guest.id },
        include: {
          response: true,
          checkIns: { orderBy: { createdAt: 'desc' } },
        },
      });

      return ok(reply, toGuestView({ ...guest, invitation }));
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /**
   * POST /events/:eventId/guests
   * Cria o convidado e, na mesma operação, o convite individual com token único.
   */
  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId } = request.params as { eventId: string };
      await request.server.assertEventAccess(request.user, eventId);
      assertCanWrite(request.user.role);

      const body = createGuestSchema.parse(request.body);

      // Evita duplicidade evidente (mesmo e-mail no mesmo evento).
      if (body.email) {
        const duplicate = await prisma.guest.findFirst({
          where: { eventId, email: body.email },
          select: { id: true, fullName: true },
        });
        if (duplicate) {
          throw new ConflictError(`Já existe um convidado com este e-mail: ${duplicate.fullName}.`);
        }
      }

      const partyId = await resolveParty(eventId, body.partyId, body.partyName);

      const guest = await prisma.guest.create({
        data: {
          eventId,
          partyId,
          fullName: body.fullName,
          email: body.email ?? null,
          whatsapp: body.whatsapp ?? null,
          allowedCompanions: body.allowedCompanions,
          notes: body.notes ?? null,
        },
      });

      // Convite individual gerado automaticamente.
      const invitation = await invitationService.createForGuest(guest.id);

      await recordAudit({
        action: 'guest.created',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Guest',
        entityId: guest.id,
        description: `Convidado "${guest.fullName}" cadastrado`,
        metadata: { allowedCompanions: guest.allowedCompanions },
        ip: request.ip,
      });

      await recordAudit({
        action: 'invitation.created',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Invitation',
        entityId: invitation.id,
        description: `Convite gerado para "${guest.fullName}"`,
        ip: request.ip,
      });

      return created(reply, {
        guest: { ...guest, invitationId: invitation.id },
        // O token em claro é devolvido UMA única vez, para o admin copiar o link.
        inviteLink: invitation.link,
      });
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** PATCH /events/:eventId/guests/:id */
  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId, id } = request.params as { eventId: string; id: string };
      await request.server.assertEventAccess(request.user, eventId);
      assertCanWrite(request.user.role);

      const body = updateGuestSchema.parse(request.body);

      const guest = await prisma.guest.findFirst({ where: { id, eventId } });
      if (!guest) throw new NotFoundError('Convidado não encontrado.');

      const partyId =
        body.partyId !== undefined || body.partyName !== undefined
          ? await resolveParty(eventId, body.partyId, body.partyName)
          : undefined;

      const updated = await prisma.guest.update({
        where: { id },
        data: {
          ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
          ...(body.email !== undefined ? { email: body.email ?? null } : {}),
          ...(body.whatsapp !== undefined ? { whatsapp: body.whatsapp ?? null } : {}),
          ...(body.allowedCompanions !== undefined
            ? { allowedCompanions: body.allowedCompanions }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
          ...(partyId !== undefined ? { partyId } : {}),
        },
      });

      await recordAudit({
        action: 'guest.updated',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Guest',
        entityId: id,
        description: `Convidado "${updated.fullName}" atualizado`,
        metadata: { fields: Object.keys(body) },
        ip: request.ip,
      });

      return ok(reply, updated);
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** DELETE /events/:eventId/guests/:id */
  async remove(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId, id } = request.params as { eventId: string; id: string };
      await request.server.assertEventAccess(request.user, eventId);
      assertCanWrite(request.user.role);

      const guest = await prisma.guest.findFirst({ where: { id, eventId } });
      if (!guest) throw new NotFoundError('Convidado não encontrado.');

      await prisma.guest.delete({ where: { id } });

      await recordAudit({
        action: 'guest.deleted',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Guest',
        entityId: id,
        description: `Convidado "${guest.fullName}" excluído`,
        ip: request.ip,
      });

      return noContent(reply);
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /**
   * POST /events/:eventId/guests/import
   * Importa convidados em lote. Com `dryRun: true` apenas valida e devolve a
   * prévia com erros e duplicidades — nada é gravado.
   */
  async import(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId } = request.params as { eventId: string };
      await request.server.assertEventAccess(request.user, eventId);
      assertCanWrite(request.user.role);

      const body = importGuestsSchema.parse({ ...(request.body as object), eventId });

      // E-mails já existentes no evento (para detectar duplicidade).
      const existing = await prisma.guest.findMany({
        where: { eventId },
        select: { email: true, fullName: true },
      });
      const existingEmails = new Set(
        existing.filter((g) => g.email).map((g) => normalizeEmail(g.email as string)),
      );

      const seen = new Set<string>();
      const rows = body.rows.map((row, index) => {
        const errors: string[] = [];
        const fullName = row.fullName?.trim() ?? '';
        const email = row.email ? normalizeEmail(row.email) : '';
        const phone = row.whatsapp ? normalizeBrazilianPhone(row.whatsapp) : null;
        const allowed = Number(row.allowedCompanions) || 1;

        if (!fullName || fullName.length < 3) errors.push('Nome inválido');
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('E-mail inválido');
        if (row.whatsapp && !phone) errors.push('WhatsApp inválido');
        if (allowed < 1) errors.push('Quantidade permitida deve ser ao menos 1');
        if (allowed > 20) errors.push('Quantidade permitida máxima é 20');

        const key = email || fullName.toLowerCase();
        let warning: string | null = null;
        if (existingEmails.has(email)) {
          warning = 'Já cadastrado neste evento';
        } else if (seen.has(key)) {
          warning = 'Linha duplicada no arquivo';
        }
        seen.add(key);

        return {
          line: index + 2, // +2 porque a linha 1 é o cabeçalho
          fullName,
          email,
          whatsapp: row.whatsapp,
          normalizedPhone: phone,
          allowedCompanions: allowed,
          partyName: row.partyName?.trim() || null,
          errors,
          warning,
          valid: errors.length === 0,
        };
      });

      const summary = {
        total: rows.length,
        valid: rows.filter((r) => r.valid && !r.warning).length,
        invalid: rows.filter((r) => !r.valid).length,
        duplicates: rows.filter((r) => r.warning).length,
      };

      // Prévia: devolve sem gravar.
      if (body.dryRun) {
        return ok(reply, { preview: rows, summary, imported: 0 });
      }

      const importable = rows.filter((r) => r.valid && !r.warning);
      if (importable.length === 0) {
        throw new ValidationError('Nenhuma linha válida para importar.', summary);
      }

      let imported = 0;
      for (const row of importable) {
        const partyId = row.partyName ? await resolveParty(eventId, undefined, row.partyName) : null;

        const guest = await prisma.guest.create({
          data: {
            eventId,
            partyId,
            fullName: row.fullName,
            email: row.email || null,
            whatsapp: row.normalizedPhone,
            allowedCompanions: row.allowedCompanions,
          },
        });

        await invitationService.createForGuest(guest.id);
        imported += 1;
      }

      await recordAudit({
        action: 'guest.imported',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Guest',
        description: `Importação concluída: ${imported} convidado(s)`,
        metadata: summary,
        ip: request.ip,
      });

      return created(reply, { preview: rows, summary, imported });
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** GET /events/:eventId/guests/export?format=csv|json */
  async export(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId } = request.params as { eventId: string };
      await request.server.assertEventAccess(request.user, eventId);

      if (request.user.role === 'RECEPTIONIST') {
        throw new ForbiddenError('Seu perfil não pode exportar dados.');
      }

      const query = request.query as { status?: string; format?: string };
      const format = query.format === 'json' ? 'json' : 'csv';

      // Filtro por status vive em `invitations` — resolvido por `guestId`.
      const statusGuestIds =
        query.status && query.status !== 'ALL'
          ? (
              await prisma.invitation.findMany({
                where: { status: query.status },
                select: { guestId: true },
              })
            ).map((row) => row.guestId)
          : null;

      const guests = await prisma.guest.findMany({
        where: {
          eventId,
          ...(statusGuestIds ? { id: { in: statusGuestIds } } : {}),
        },
        orderBy: { fullName: 'asc' },
        include: {
          party: { select: { name: true } },
        },
      });

      const invitations = await prisma.invitation.findMany({
        where: { guestId: { in: guests.map((guest) => guest.id) } },
        include: { response: true, checkIns: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });

      const invitationByGuest = new Map(
        invitations.map((invitation) => [invitation.guestId, invitation]),
      );

      const rows = guests.map((guest) => ({
        nome: guest.fullName,
        email: guest.email ?? '',
        whatsapp: guest.whatsapp ?? '',
        quantidade_permitida: guest.allowedCompanions,
        grupo: guest.party?.name ?? '',
        status: invitationByGuest.get(guest.id)?.status ?? 'SEM_CONVITE',
        checkin_em:
          invitationByGuest.get(guest.id)?.checkIns[0]?.createdAt?.toISOString() ?? '',
        pessoas_confirmadas: invitationByGuest.get(guest.id)?.response?.attendingCount ?? '',
      }));

      await recordAudit({
        action: 'data.exported',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        description: `Exportação de convidados (${rows.length} registros, formato ${format})`,
        ip: request.ip,
      });

      if (format === 'json') {
        return ok(reply, rows);
      }

      const headers = Object.keys(rows[0] ?? { nome: '', email: '', whatsapp: '' });
      const csv = [
        headers.join(','),
        ...rows.map((row) =>
          headers
            .map((h) => {
              const value = String((row as Record<string, unknown>)[h] ?? '');
              return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
            })
            .join(','),
        ),
      ].join('\n');

      // BOM para o Excel abrir com acentuação correta.
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="convidados.csv"')
        .send(`\uFEFF${csv}`);
    } catch (error) {
      return handleError(reply, error);
    }
  },
};

export { isValidCpf, onlyDigits, env, logger };
