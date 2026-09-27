import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { handleError, ok } from '../shared/http.js';
import { ForbiddenError } from '../shared/errors.js';
import { checkInSchema } from '../schemas/index.js';
import { recordAudit } from '../services/audit.service.js';
import { invitationService } from '../services/invitation.service.js';
import { formatDateTime, formatTime } from '../shared/datetime.js';
import { hashToken, tokenPrefix } from '../shared/tokens.js';
import { logger } from '../config/logger.js';

/**
 * Controle de entrada (check-in) via QR Code.
 *
 * Ordem de validação (ver escopo §10):
 *   1. O código existe?
 *   2. Pertence ao evento correto?
 *   3. O convite foi cancelado?
 *   4. O convidado confirmou presença?
 *   5. O convite já foi utilizado?
 *   6. Tudo certo -> entrada autorizada + registro
 *
 * O QR Code carrega apenas um identificador opaco; toda a decisão acontece no
 * servidor. A liberação manual de uma segunda entrada é exclusiva de
 * ADMIN/SUPER_ADMIN, exige motivo e fica registrada na auditoria.
 */

// ---------------------------------------------------------------------------
// Includes do Prisma (declarados uma vez, um nível por linha)
// ---------------------------------------------------------------------------

const EVENT_WITH_VENUE = {
  include: {
    venue: true,
  },
} satisfies Prisma.EventDefaultArgs;

const CHECK_IN_WITH_OPERATOR = {
  orderBy: {
    createdAt: 'desc',
  },
  include: {
    operator: {
      select: {
        id: true,
        name: true,
      },
    },
  },
} satisfies Prisma.CheckInFindManyArgs;

const GUEST_WITH_EVENT = {
  include: {
    event: EVENT_WITH_VENUE,
  },
} satisfies Prisma.GuestDefaultArgs;

/** Convite completo usado na validação do QR Code. */
const FULL_INVITATION = {
  guest: GUEST_WITH_EVENT,
  response: true,
  checkIns: CHECK_IN_WITH_OPERATOR,
} satisfies Prisma.InvitationInclude;

/** Convite reduzido usado em listagens. */
const INVITATION_SUMMARY = {
  response: true,
  checkIns: {
    orderBy: {
      createdAt: 'desc',
    },
    take: 1,
  },
} satisfies Prisma.InvitationInclude;

// ---------------------------------------------------------------------------
// Tipos do resultado
// ---------------------------------------------------------------------------

export type CheckInOutcome =
  | 'AUTHORIZED'
  | 'INVALID'
  | 'WRONG_EVENT'
  | 'CANCELLED'
  | 'NOT_CONFIRMED'
  | 'ALREADY_USED';

export interface CheckInResult {
  outcome: CheckInOutcome;
  message: string;
  tone: 'success' | 'danger' | 'warning';
  guest?: {
    id: string;
    name: string;
    allowedCompanions: number;
    attendingCount: number | null;
    companions: Array<{ name: string; document?: string }>;
  };
  event?: {
    id: string;
    title: string;
    date: string;
    startTime: string;
    venueName: string | null;
  };
  checkIn?: {
    id: string;
    at: Date;
    atLabel: string;
    timeLabel: string;
    peopleCount: number;
    method: string;
    operatorLabel: string | null;
  };
  previousCheckIn?: {
    at: Date;
    atLabel: string;
    operatorLabel: string | null;
  };
  canOverride: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function buildGuestPayload(invitation: {
  guest: { id: string; fullName: string; allowedCompanions: number };
  response: { attendingCount: number; companions: unknown } | null;
}) {
  return {
    id: invitation.guest.id,
    name: invitation.guest.fullName,
    allowedCompanions: invitation.guest.allowedCompanions,
    attendingCount: invitation.response?.attendingCount ?? null,
    companions: parseCompanions(invitation.response?.companions),
  };
}

function buildEventPayload(event: {
  id: string;
  title: string;
  hostsName: string | null;
  eventDate: Date;
  startTime: string;
  venue: { name: string } | null;
}) {
  return {
    id: event.id,
    title: event.hostsName ?? event.title,
    date: event.eventDate.toISOString(),
    startTime: event.startTime,
    venueName: event.venue?.name ?? null,
  };
}

function blocked(
  outcome: CheckInOutcome,
  message: string,
  tone: 'danger' | 'warning',
  extra?: Partial<CheckInResult>,
): CheckInResult {
  return { outcome, message, tone, canOverride: false, ...extra };
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export const checkInController = {
  /**
   * POST /events/:eventId/check-in/validate
   */
  async validate(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId } = request.params as { eventId: string };
      await request.server.assertEventAccess(request.user, eventId);

      const body = checkInSchema.parse(request.body);
      const code = body.code.trim().toUpperCase();
      const prefix = tokenPrefix(code, 8);

      const invitation = await prisma.invitation.findUnique({
        where: { qrCodeHash: hashToken(code) },
        include: FULL_INVITATION,
      });

      // 1) O código existe?
      if (!invitation) {
        await recordAudit({
          action: 'checkin.denied',
          userId: request.user.sub,
          eventId,
          actorRole: request.user.role,
          actorName: request.user.name,
          entity: 'Invitation',
          description: 'Tentativa de check-in com QR Code inexistente',
          metadata: { tokenPrefix: prefix },
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        return ok(
          reply,
          blocked('INVALID', 'Este convite não foi encontrado.', 'danger'),
        );
      }

      const event = invitation.guest.event;
      const guest = invitation.guest;

      // 2) Pertence a este evento?
      if (event.id !== eventId) {
        await recordAudit({
          action: 'checkin.denied',
          userId: request.user.sub,
          eventId,
          actorRole: request.user.role,
          actorName: request.user.name,
          entity: 'Invitation',
          entityId: invitation.id,
          description: 'QR Code de outro evento apresentado neste controle de entrada',
          metadata: { codeEventId: event.id },
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        return ok(
          reply,
          blocked('WRONG_EVENT', 'Este convite pertence a outro evento.', 'danger', {
            event: buildEventPayload(event),
          }),
        );
      }

      // 3) Cancelado?
      if (invitation.status === 'CANCELLED') {
        await recordAudit({
          action: 'checkin.denied',
          userId: request.user.sub,
          eventId,
          actorRole: request.user.role,
          actorName: request.user.name,
          entity: 'Invitation',
          entityId: invitation.id,
          description: `Check-in negado: convite cancelado (${guest.fullName})`,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        return ok(
          reply,
          blocked('CANCELLED', 'Este convite foi cancelado pelo administrador.', 'danger', {
            guest: buildGuestPayload(invitation),
          }),
        );
      }

      // 4) Confirmou presença?
      if (invitation.status === 'PENDING' || invitation.status === 'DECLINED') {
        const reason =
          invitation.status === 'DECLINED'
            ? 'Este convidado informou que não poderá comparecer.'
            : 'Este convidado ainda não confirmou presença.';

        await recordAudit({
          action: 'checkin.denied',
          userId: request.user.sub,
          eventId,
          actorRole: request.user.role,
          actorName: request.user.name,
          entity: 'Invitation',
          entityId: invitation.id,
          description: `Check-in negado: ${reason} (${guest.fullName})`,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        return ok(
          reply,
          blocked('NOT_CONFIRMED', reason, 'warning', {
            guest: buildGuestPayload(invitation),
          }),
        );
      }

      // 5) Já utilizado?
      const lastCheckIn = invitation.checkIns[0];
      const canOverride = request.user.role === 'ADMIN' || request.user.role === 'SUPER_ADMIN';

      if (invitation.status === 'CHECKED_IN' && lastCheckIn) {
        const previous = {
          at: lastCheckIn.createdAt,
          atLabel: formatDateTime(lastCheckIn.createdAt),
          operatorLabel: lastCheckIn.operatorLabel ?? lastCheckIn.operator?.name ?? null,
        };

        // 5a) Liberação manual solicitada.
        if (body.manualOverride) {
          if (!canOverride) {
            throw new ForbiddenError('Apenas administradores podem autorizar entrada manual.');
          }

          if (!body.overrideReason || body.overrideReason.trim().length < 3) {
            return ok(
              reply,
              blocked(
                'ALREADY_USED',
                'Informe o motivo da liberação manual para prosseguir.',
                'warning',
                { guest: buildGuestPayload(invitation), previousCheckIn: previous, canOverride: true },
              ),
            );
          }

          const override = await prisma.checkIn.create({
            data: {
              eventId,
              invitationId: invitation.id,
              guestId: guest.id,
              method: 'MANUAL',
              peopleCount: invitation.response?.attendingCount ?? 1,
              operatorId: request.user.sub,
              operatorLabel: body.operatorLabel ?? request.user.name,
              tokenPrefix: prefix,
              ip: request.ip,
              userAgent: request.headers['user-agent'] ?? null,
              notes: body.overrideReason,
              overriddenFromCheckInId: lastCheckIn.id,
            },
          });

          await recordAudit({
            action: 'checkin.manual_override',
            userId: request.user.sub,
            eventId,
            actorRole: request.user.role,
            actorName: request.user.name,
            entity: 'CheckIn',
            entityId: override.id,
            description: `Entrada liberada MANUALMENTE para "${guest.fullName}" (convite já utilizado)`,
            metadata: {
              reason: body.overrideReason,
              previousCheckInId: lastCheckIn.id,
              previousAt: lastCheckIn.createdAt.toISOString(),
            },
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
          });

          return ok(reply, {
            outcome: 'AUTHORIZED',
            tone: 'success',
            message: 'Entrada liberada manualmente e registrada na auditoria.',
            guest: buildGuestPayload(invitation),
            event: buildEventPayload(event),
            checkIn: {
              id: override.id,
              at: override.createdAt,
              atLabel: formatDateTime(override.createdAt),
              timeLabel: formatTime(override.createdAt),
              peopleCount: override.peopleCount,
              method: 'MANUAL',
              operatorLabel: override.operatorLabel,
            },
            canOverride: false,
          } satisfies CheckInResult);
        }

        // 5b) Conflito: bloqueia e oferece autorização manual.
        await recordAudit({
          action: 'checkin.denied',
          userId: request.user.sub,
          eventId,
          actorRole: request.user.role,
          actorName: request.user.name,
          entity: 'Invitation',
          entityId: invitation.id,
          description: `Check-in duplicado bloqueado para "${guest.fullName}"`,
          metadata: { previousAt: lastCheckIn.createdAt.toISOString() },
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        return ok(
          reply,
          blocked('ALREADY_USED', 'Este convite já foi utilizado na entrada.', 'warning', {
            guest: buildGuestPayload(invitation),
            previousCheckIn: previous,
            canOverride,
          }),
        );
      }

      // 6) Entrada autorizada.
      const peopleCount = invitation.response?.attendingCount ?? 1;

      const result = await prisma.$transaction(async (tx) => {
        const created = await tx.checkIn.create({
          data: {
            eventId,
            invitationId: invitation.id,
            guestId: guest.id,
            method: 'QR_CODE',
            peopleCount,
            operatorId: request.user.sub,
            operatorLabel: body.operatorLabel ?? request.user.name,
            tokenPrefix: prefix,
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
          },
        });

        await tx.invitation.update({
          where: { id: invitation.id },
          data: { status: 'CHECKED_IN' },
        });

        return created;
      });

      await recordAudit({
        action: 'checkin.validated',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'CheckIn',
        entityId: result.id,
        description: `Entrada autorizada para "${guest.fullName}" (${peopleCount} pessoa(s))`,
        metadata: { peopleCount, method: 'QR_CODE', tokenPrefix: prefix },
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });

      logger.info(`Check-in autorizado: ${guest.fullName} (${peopleCount} pessoas)`);

      return ok(reply, {
        outcome: 'AUTHORIZED',
        tone: 'success',
        message: 'Entrada autorizada.',
        guest: buildGuestPayload(invitation),
        event: buildEventPayload(event),
        checkIn: {
          id: result.id,
          at: result.createdAt,
          atLabel: formatDateTime(result.createdAt),
          timeLabel: formatTime(result.createdAt),
          peopleCount: result.peopleCount,
          method: 'QR_CODE',
          operatorLabel: result.operatorLabel,
        },
        canOverride: false,
      } satisfies CheckInResult);
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /**
   * POST /events/:eventId/check-in/search?q=nome
   * Fallback quando o convidado não apresenta o QR Code.
   */
  async search(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId } = request.params as { eventId: string };
      await request.server.assertEventAccess(request.user, eventId);

      const query = request.query as { q?: string };
      const term = (query.q ?? '').trim();

      if (term.length < 3) return ok(reply, []);

      // A busca é por nome do convidado; o convite é anexado a partir de
      // `Invitation` (a relação inversa `guest.invitation` não existe no schema
      // de desenvolvimento — ver `prisma/schema.dev.prisma`), preservando a
      // mesma forma de resposta que a UI de portaria já consome.
      const guests = await prisma.guest.findMany({
        where: { eventId, fullName: { contains: term } },
        take: 20,
        orderBy: { fullName: 'asc' },
      });

      const invitations = await prisma.invitation.findMany({
        where: { guestId: { in: guests.map((guest) => guest.id) } },
        include: INVITATION_SUMMARY,
      });

      const invitationByGuest = new Map(
        invitations.map((invitation) => [invitation.guestId, invitation]),
      );

      return ok(
        reply,
        guests.map((guest) => {
          const invitation = invitationByGuest.get(guest.id);
          return {
            id: guest.id,
            name: guest.fullName,
            allowedCompanions: guest.allowedCompanions,
            status: invitation?.status ?? 'PENDING',
            attendingCount: invitation?.response?.attendingCount ?? null,
            checkedInAt: invitation?.checkIns[0]?.createdAt ?? null,
          };
        }),
      );
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /**
   * GET /events/:eventId/check-in/stats
   * Contadores em tempo real para a portaria.
   */
  async stats(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId } = request.params as { eventId: string };
      await request.server.assertEventAccess(request.user, eventId);

      const counts = await invitationService.statusCounts(eventId);

      const aggregates = await prisma.checkIn.aggregate({
        where: { eventId },
        _count: { _all: true },
        _sum: { peopleCount: true },
      });

      const lastCheckIns = await prisma.checkIn.findMany({
        where: { eventId },
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          invitation: {
            include: {
              guest: {
                select: { fullName: true },
              },
            },
          },
        },
      });

      return ok(reply, {
        invitations: counts,
        entriesCount: aggregates._count._all,
        peopleInside: aggregates._sum.peopleCount ?? 0,
        expectedPeople: counts.confirmed + counts.checkedIn,
        lastCheckIns: lastCheckIns.map((checkIn) => ({
          id: checkIn.id,
          guestName: checkIn.invitation.guest.fullName,
          peopleCount: checkIn.peopleCount,
          at: checkIn.createdAt,
          atLabel: formatTime(checkIn.createdAt),
          method: checkIn.method,
          operatorLabel: checkIn.operatorLabel,
        })),
      });
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /**
   * GET /check-in/events
   * Eventos disponíveis para o operador da portaria.
   */
  async myEvents(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;

      const select = {
        id: true,
        title: true,
        hostsName: true,
        eventDate: true,
        status: true,
      } as const;

      if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
        const events = await prisma.event.findMany({
          where: user.role === 'ADMIN' ? { ownerId: user.sub } : {},
          orderBy: { eventDate: 'desc' },
          select,
        });
        return ok(reply, events);
      }

      const memberships = await prisma.eventMember.findMany({
        where: { userId: user.sub },
        include: { event: { select } },
        orderBy: { createdAt: 'desc' },
      });

      return ok(
        reply,
        memberships.map((membership) => membership.event),
      );
    } catch (error) {
      return handleError(reply, error);
    }
  },
};
