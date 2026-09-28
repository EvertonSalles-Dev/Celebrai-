import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { uniqueSlug } from '../shared/tokens.js';
import { combineDateAndTime } from '../shared/datetime.js';
import { toJsonField } from '../shared/db-compat.js';
import { created, handleError, noContent, ok, paginationMeta, toSkipTake } from '../shared/http.js';
import { ForbiddenError, NotFoundError } from '../shared/errors.js';
import {
  auditQuerySchema,
  createEventSchema,
  updateEventSchema,
  upsertVenueSchema,
} from '../schemas/index.js';
import { recordAudit } from '../services/audit.service.js';
import { invitationService } from '../services/invitation.service.js';

/**
 * Controller de eventos.
 *
 * Regras de acesso:
 *  - SUPER_ADMIN enxerga e gerencia todos os eventos.
 *  - ADMIN enxerga apenas os eventos dos quais é dono.
 *  - RECEPTIONIST enxerga apenas eventos aos quais foi vinculado, e não pode
 *    alterar/excluir nada (somente leitura + check-in).
 */

/** Converte o payload validado no formato aceito pelo Prisma. */
function toEventData(input: Record<string, unknown>): Prisma.EventUncheckedUpdateInput {
  const data: Record<string, unknown> = {};
  const eventDate = input.eventDate as string | undefined;
  const startTime = input.startTime as string | undefined;

  const passthrough = [
    'title',
    'hostsName',
    'coupleNameA',
    'coupleNameB',
    'startTime',
    'endTime',
    'coverImageUrl',
    'welcomeMessage',
    'inviteMessage',
    'couplesMessage',
    'dressCode',
    'giftListUrl',
    'giftListNotes',
    'ceremonyInfo',
    'receptionInfo',
    'allowCompanions',
    'allowShareInvite',
    'status',
  ] as const;

  for (const key of passthrough) {
    if (input[key] !== undefined) data[key] = input[key];
  }

  // `galleryImages` é `String?` (JSON textual) em todos os bancos.
  // Usamos `toJsonField` para garantir que o array seja serializado em string.
  if (input.galleryImages !== undefined) {
    data.galleryImages = toJsonField(input.galleryImages);
  }

  if (eventDate) {
    data.eventDate = combineDateAndTime(eventDate, startTime);
  }

  if (input.rsvpDeadline !== undefined) {
    data.rsvpDeadline = input.rsvpDeadline ? new Date(input.rsvpDeadline as string) : null;
  }

  return data as Prisma.EventUncheckedUpdateInput;
}

/** Contadores de convite por evento, usados na listagem e no card. */
async function withInvitationCounts<T extends { id: string }>(events: T[]) {
  return Promise.all(
    events.map(async (event) => ({
      ...event,
      invitationCounts: await invitationService.statusCounts(event.id),
    })),
  );
}

/** Confirmações por dia (gráfico do dashboard). */
async function buildResponseTimeline(eventId: string) {
  const responses = await prisma.invitationResponse.findMany({
    where: { invitation: { guest: { eventId } } },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const byDay = new Map<string, number>();
  for (const response of responses) {
    const key = response.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  return [...byDay.entries()].map(([date, count]) => ({ date, count }));
}

export const eventController = {
  /** GET /events — lista eventos conforme o papel do usuário. */
  async list(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;

      let where: Prisma.EventWhereInput = {};
      if (user.role === 'ADMIN') where = { ownerId: user.sub };
      if (user.role === 'RECEPTIONIST') where = { members: { some: { userId: user.sub } } };

      const events = await prisma.event.findMany({
        where,
        orderBy: { eventDate: 'desc' },
        include: {
          venue: { select: { name: true, city: true, state: true } },
          _count: { select: { guests: true } },
        },
      });

      return ok(reply, await withInvitationCounts(events));
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** POST /events */
  async create(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = createEventSchema.parse(request.body);

      const event = await prisma.event.create({
        data: {
          ...toEventData(body),
          slug: uniqueSlug(body.title),
          ownerId: request.user.sub,
        } as Prisma.EventUncheckedCreateInput,
      });

      await recordAudit({
        action: 'event.created',
        userId: request.user.sub,
        eventId: event.id,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Event',
        entityId: event.id,
        description: `Evento "${event.title}" criado`,
        ip: request.ip,
      });

      return created(reply, event);
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** GET /events/:id */
  async get(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await request.server.assertEventAccess(request.user, id);

      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          venue: true,
          parties: { orderBy: { name: 'asc' } },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
        },
      });

      if (!event) throw new NotFoundError('Evento não encontrado.');

      return ok(reply, {
        ...event,
        invitationCounts: await invitationService.statusCounts(id),
      });
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** PATCH /events/:id */
  async update(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await request.server.assertEventAccess(request.user, id);

      if (request.user.role === 'RECEPTIONIST') {
        throw new ForbiddenError('Seu perfil não pode alterar dados do evento.');
      }

      const body = updateEventSchema.parse(request.body);

      const event = await prisma.event.update({
        where: { id },
        data: toEventData(body),
      });

      await recordAudit({
        action: 'event.updated',
        userId: request.user.sub,
        eventId: id,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Event',
        entityId: id,
        description: 'Dados do evento atualizados',
        metadata: { fields: Object.keys(body) },
        ip: request.ip,
      });

      return ok(reply, event);
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** DELETE /events/:id */
  async remove(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await request.server.assertEventAccess(request.user, id);

      if (request.user.role === 'RECEPTIONIST') {
        throw new ForbiddenError('Seu perfil não pode excluir eventos.');
      }

      await prisma.event.delete({ where: { id } });

      await recordAudit({
        action: 'event.deleted',
        userId: request.user.sub,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Event',
        entityId: id,
        description: 'Evento excluído',
        ip: request.ip,
      });

      return noContent(reply);
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** PUT /events/:id/venue */
  async upsertVenue(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await request.server.assertEventAccess(request.user, id);

      if (request.user.role === 'RECEPTIONIST') {
        throw new ForbiddenError('Seu perfil não pode alterar o local do evento.');
      }

      const body = upsertVenueSchema.parse(request.body);

      const venue = await prisma.venue.upsert({
        where: { eventId: id },
        create: { eventId: id, ...body } as Prisma.VenueUncheckedCreateInput,
        update: body as Prisma.VenueUncheckedUpdateInput,
      });

      await recordAudit({
        action: 'venue.updated',
        userId: request.user.sub,
        eventId: id,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Venue',
        entityId: venue.id,
        description: 'Informações do local atualizadas',
        ip: request.ip,
      });

      return ok(reply, venue);
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** GET /events/:id/dashboard — métricas e séries para os gráficos. */
  async dashboard(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await request.server.assertEventAccess(request.user, id);

      const counts = await invitationService.statusCounts(id);

      const checkIns = await prisma.checkIn.findMany({
        where: { eventId: id },
        select: { createdAt: true, peopleCount: true },
        orderBy: { createdAt: 'asc' },
      });

      const aggregates = await prisma.invitationResponse.aggregate({
        where: { invitation: { guest: { eventId: id } } },
        _sum: { attendingCount: true },
      });

      const totalGuests = await prisma.guest.count({ where: { eventId: id } });

      // Check-ins agrupados em blocos de 30 minutos (gráfico por horário).
      const buckets = new Map<string, number>();
      for (const checkIn of checkIns) {
        const d = checkIn.createdAt;
        const slot = `${String(d.getHours()).padStart(2, '0')}:${d.getMinutes() < 30 ? '00' : '30'}`;
        buckets.set(slot, (buckets.get(slot) ?? 0) + 1);
      }

      return ok(reply, {
        guests: totalGuests,
        invitations: counts,
        checkInTotal: checkIns.length,
        checkInPeople: checkIns.reduce((acc, c) => acc + c.peopleCount, 0),
        expectedPeople: aggregates._sum.attendingCount ?? 0,
        absent: Math.max(0, counts.confirmed - counts.checkedIn),
        checkInTimeline: [...buckets.entries()].map(([time, count]) => ({ time, count })),
        responsesTimeline: await buildResponseTimeline(id),
      });
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** GET /events/:id/audit — trilha de auditoria paginada. */
  async audit(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      await request.server.assertEventAccess(request.user, id);

      const query = auditQuerySchema.parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.perPage);

      const where: Prisma.AuditLogWhereInput = {
        eventId: id,
        ...(query.action ? { action: query.action } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.from || query.to
          ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
          : {}),
      };

      const total = await prisma.auditLog.count({ where });
      const logs = await prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, role: true } }, },
      });

      return ok(reply, logs, paginationMeta(query.page, query.perPage, total));
    } catch (error) {
      return handleError(reply, error);
    }
  },
};
