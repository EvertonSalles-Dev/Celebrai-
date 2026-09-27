import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { created, handleError, ok } from '../shared/http.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { invitationService } from '../services/invitation.service.js';
import { logNotification } from '../services/notification.service.js';
import { mailProvider } from '../services/providers/mail.provider.js';
import { whatsappProvider } from '../services/providers/whatsapp.provider.js';
import { recordAudit } from '../services/audit.service.js';
import { sendInvitationsSchema } from '../schemas/index.js';
import { formatBrazilianPhone } from '../shared/brazil.js';
import { formatLongDate } from '../shared/datetime.js';
import {
  buildInviteEmailHtml,
  buildInviteEmailSubject,
  buildShareText,
  buildWhatsAppInviteText,
  eventDisplayName,
} from '../services/invite-templates.js';

/**
 * Controller de convites: envio por e-mail/WhatsApp/link, consulta de QR Code
 * e ações administrativas (cancelar, reabrir, reemitir token).
 *
 * Nota importante: como o token público é guardado apenas como hash, o link em
 * claro só pode ser obtido reemitindo o token (`reissueLink`, `send` e
 * `shareText`). O link anterior deixa de funcionar — comportamento intencional.
 */

/** Blocos de include declarados uma única vez para evitar duplicação. */
/**
 * O convidado NÃO entra como `include`: a relação é declarada sem campo inverso
 * em `Guest` (ver `prisma/schema.dev.prisma`), então os dados são anexados com
 * uma segunda consulta por `guestId` — ver `attachGuest`/`loadGuestsById`.
 */
const GUEST_SUMMARY_SELECT = {
  id: true,
  fullName: true,
  email: true,
  whatsapp: true,
  allowedCompanions: true,
} as const;

const GUEST_NAME_SELECT = { fullName: true } as const;

type GuestSummary = Prisma.GuestGetPayload<{ select: typeof GUEST_SUMMARY_SELECT }>;
type GuestName = Prisma.GuestGetPayload<{ select: typeof GUEST_NAME_SELECT }>;

/** Carrega convidados por id (substitui o antigo `include: { guest }`). */
async function loadGuestsById<T extends Prisma.GuestSelect>(
  guestIds: string[],
  select: T,
): Promise<Map<string, Prisma.GuestGetPayload<{ select: T }>>> {
  const guests = await prisma.guest.findMany({
    where: { id: { in: guestIds } },
    select,
  });

  return new Map(guests.map((guest) => [(guest as { id: string }).id, guest]));
}

function assertCanManage(role: string): void {
  if (role === 'RECEPTIONIST') {
    throw new ForbiddenError('Seu perfil não pode gerenciar convites.');
  }
}

/** Situação de disponibilidade dos canais de envio (UI mostra aviso). */
function channelsStatus() {
  return {
    email: mailProvider.isEnabled(),
    whatsapp: whatsappProvider.isEnabled(),
  };
}

export const invitationController = {
  /** GET /events/:eventId/invitations */
  async list(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId } = request.params as { eventId: string };
      await request.server.assertEventAccess(request.user, eventId);

      const query = request.query as { status?: string; search?: string };

      // O vínculo convite→convidado é feito por `invitations.guestId`; a relação
      // `guest` é declarada sem campo inverso em `Guest` (ver
      // `prisma/schema.dev.prisma`), por isso o filtro por evento/nome é
      // resolvido antes, sobre `Guest`, e aplicado como `guestId: { in }`.
      const guests = await prisma.guest.findMany({
        where: {
          eventId,
          ...(query.search ? { fullName: { contains: query.search } } : {}),
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          whatsapp: true,
          allowedCompanions: true,
        },
      });

      const guestsById = new Map(guests.map((guest) => [guest.id, guest]));

      const invitations = await prisma.invitation.findMany({
        where: {
          guestId: { in: guests.map((guest) => guest.id) },
          ...(query.status && query.status !== 'ALL' ? { status: query.status as never } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          response: { select: { attendingCount: true, cpfMasked: true, createdAt: true } },
          checkIns: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      return ok(
        reply,
        invitations.map((invitation) => ({
          id: invitation.id,
          status: invitation.status,
          sentAt: invitation.sentAt,
          sentVia: invitation.sentVia,
          respondedAt: invitation.respondedAt,
          cancelledAt: invitation.cancelledAt,
          cancelledReason: invitation.cancelledReason,
          hasQrCode: Boolean(invitation.qrCodePrefix),
          qrCodePrefix: invitation.qrCodePrefix,
          guest: guestsById.get(invitation.guestId) ?? null,
          response: invitation.response,
          lastCheckIn: invitation.checkIns[0] ?? null,
        })),
      );
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /**
   * GET /events/:eventId/invitations/:id/link
   * Reemite o token e devolve o novo link em claro uma única vez.
   */
  async reissueLink(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId, id } = request.params as { eventId: string; id: string };
      await request.server.assertEventAccess(request.user, eventId);
      assertCanManage(request.user.role);

      const invitation = await prisma.invitation.findFirst({
        where: { id },
        select: { id: true, guestId: true, status: true },
      });

      if (!invitation) throw new NotFoundError('Convite não encontrado.');

      const guest = await prisma.guest.findFirst({
        where: { id: invitation.guestId, eventId },
        select: GUEST_NAME_SELECT,
      });

      if (!guest) throw new NotFoundError('Convite não encontrado.');

      if (invitation.status === 'CANCELLED') {
        throw new ValidationError('Este convite está cancelado. Reabra antes de gerar o link.');
      }

      const rotated = await invitationService.rotateToken(id);

      await recordAudit({
        action: 'invitation.created',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Invitation',
        entityId: id,
        description: `Link do convite reemitido para "${guest.fullName}"`,
        ip: request.ip,
      });

      return ok(reply, { link: rotated.link, guestName: guest.fullName });
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /**
   * POST /events/:eventId/invitations/send
   * Envia convites. Cada tentativa é registrada em `notifications`.
   */
  async send(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId } = request.params as { eventId: string };
      await request.server.assertEventAccess(request.user, eventId);
      assertCanManage(request.user.role);

      const body = sendInvitationsSchema.parse(request.body);

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { venue: true },
      });
      if (!event) throw new NotFoundError('Evento não encontrado.');

      const invitations = await prisma.invitation.findMany({
        where: { id: { in: body.invitationIds } },
      });

      // Só convites de convidados deste evento (o vínculo vem de `guestId`).
      const guestsById = await loadGuestsById(
        invitations.map((invitation) => invitation.guestId),
        GUEST_SUMMARY_SELECT,
      );

      const results: Array<{
        invitationId: string;
        guestName: string;
        channel: string;
        status: string;
        link: string;
        error?: string;
      }> = [];

      for (const invitation of invitations) {
        const guest = guestsById.get(invitation.guestId);
        if (!guest) continue;

        if (invitation.status === 'CANCELLED') {
          results.push({
            invitationId: invitation.id,
            guestName: guest.fullName,
            channel: body.channel,
            status: 'SKIPPED',
            link: '',
            error: 'Convite cancelado',
          });
          continue;
        }

        // O token em claro não é recuperável: reemite antes de enviar.
        const rotated = await invitationService.rotateToken(invitation.id);
        const link = rotated.link;

        if (body.channel === 'LINK') {
          await logNotification({
            channel: 'LINK',
            eventId,
            guestId: guest.id,
            invitationId: invitation.id,
            to: guest.whatsapp ?? guest.email ?? null,
            body: link,
            provider: 'internal',
            status: 'SENT',
          });

          results.push({
            invitationId: invitation.id,
            guestName: guest.fullName,
            channel: body.channel,
            status: 'SENT',
            link,
          });
          continue;
        }

        if (body.channel === 'EMAIL') {
          if (!guest.email) {
            results.push({
              invitationId: invitation.id,
              guestName: guest.fullName,
              channel: body.channel,
              status: 'SKIPPED',
              link,
              error: 'Convidado sem e-mail cadastrado',
            });
            continue;
          }

          const html = buildInviteEmailHtml({ guest, event, link });
          const subject = buildInviteEmailSubject(event);

          const notificationId = await logNotification({
            channel: 'EMAIL',
            eventId,
            guestId: guest.id,
            invitationId: invitation.id,
            to: guest.email,
            subject,
            body: body.customMessage ?? `Convite para ${eventDisplayName(event)}`,
            provider: env.MAIL_DRIVER,
            status: 'QUEUED',
          });

          const sent = await mailProvider.send({
            to: guest.email,
            subject,
            html,
            text: buildWhatsAppInviteText({ guest, event, link }),
          });

          await finalizeNotification(notificationId, sent.status, sent.error);

          if (sent.status !== 'FAILED') {
            await invitationService.markSent(invitation.id, 'EMAIL');
          }

          results.push({
            invitationId: invitation.id,
            guestName: guest.fullName,
            channel: body.channel,
            status: sent.status,
            link,
            ...(sent.error ? { error: sent.error } : {}),
          });
          continue;
        }

        // WHATSAPP
        if (!guest.whatsapp) {
          results.push({
            invitationId: invitation.id,
            guestName: guest.fullName,
            channel: body.channel,
            status: 'SKIPPED',
            link,
            error: 'Convidado sem WhatsApp cadastrado',
          });
          continue;
        }

        const text = body.customMessage ?? buildWhatsAppInviteText({ guest, event, link });

        const notificationId = await logNotification({
          channel: 'WHATSAPP',
          eventId,
          guestId: guest.id,
          invitationId: invitation.id,
          to: formatBrazilianPhone(guest.whatsapp),
          body: text,
          provider: env.WHATSAPP_DRIVER,
          status: 'QUEUED',
        });

        const sent = await whatsappProvider.send({ to: guest.whatsapp, body: text });

        await finalizeNotification(notificationId, sent.status, sent.error);

        if (sent.status !== 'FAILED') {
          await invitationService.markSent(invitation.id, 'WHATSAPP');
        }

        results.push({
          invitationId: invitation.id,
          guestName: guest.fullName,
          channel: body.channel,
          status: sent.status,
          link,
          ...(sent.error ? { error: sent.error } : {}),
        });
      }

      await recordAudit({
        action: 'invitation.sent',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Invitation',
        description: `Envio de convites via ${body.channel} (${results.length} convite(s))`,
        metadata: {
          channel: body.channel,
          sent: results.filter((r) => r.status === 'SENT').length,
          skipped: results.filter((r) => r.status === 'SKIPPED').length,
          failed: results.filter((r) => r.status === 'FAILED').length,
        },
        ip: request.ip,
      });

      return ok(reply, {
        results,
        summary: {
          total: results.length,
          sent: results.filter((r) => r.status === 'SENT').length,
          skipped: results.filter((r) => r.status === 'SKIPPED').length,
          failed: results.filter((r) => r.status === 'FAILED').length,
        },
        channels: channelsStatus(),
      });
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /**
   * GET /events/:eventId/invitations/:id/qrcode (admin)
   * Emite (ou reemite) o QR Code do convite confirmado.
   */
  async issueQrCode(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId, id } = request.params as { eventId: string; id: string };
      await request.server.assertEventAccess(request.user, eventId);

      const invitation = await prisma.invitation.findFirst({
        where: { id },
        include: { response: true },
      });

      if (!invitation) throw new NotFoundError('Convite não encontrado.');

      const guest = await prisma.guest.findFirst({
        where: { id: invitation.guestId, eventId },
        select: { fullName: true, allowedCompanions: true },
      });

      if (!guest) throw new NotFoundError('Convite não encontrado.');

      if (invitation.status !== 'CONFIRMED' && invitation.status !== 'CHECKED_IN') {
        throw new ValidationError(
          'O QR Code só pode ser emitido após a confirmação de presença do convidado.',
        );
      }

      const event = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
        include: { venue: true },
      });

      // Credencial estável: se já houver QR emitido, devolve o mesmo.
      const issued = await invitationService.getOrIssueQrCode(invitation.id, event.slug);

      await recordAudit({
        action: 'invitation.qrcode_issued',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Invitation',
        entityId: invitation.id,
        description: `QR Code emitido para "${guest.fullName}"`,
        ip: request.ip,
      });

      return ok(reply, {
        code: issued.code,
        issuedAt: issued.issuedAt,
        guest: {
          name: guest.fullName,
          allowedCompanions: guest.allowedCompanions,
          attendingCount: invitation.response?.attendingCount ?? null,
        },
        event: {
          title: eventDisplayName(event),
          date: event.eventDate,
          dateLabel: formatLongDate(event.eventDate),
          startTime: event.startTime,
          venue: event.venue
            ? {
              name: event.venue.name,
              address: event.venue.address,
              number: event.venue.number,
              city: event.venue.city,
              state: event.venue.state,
            }
            : null,
        },
      });
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** POST /events/:eventId/invitations/:id/cancel */
  async cancel(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId, id } = request.params as { eventId: string; id: string };
      await request.server.assertEventAccess(request.user, eventId);
      assertCanManage(request.user.role);

      const body = (request.body ?? {}) as { reason?: string };

      const invitation = await prisma.invitation.findFirst({
        where: { id },
        select: { id: true, guestId: true },
      });
      const guest = invitation
        ? await prisma.guest.findFirst({
          where: { id: invitation.guestId, eventId },
          select: GUEST_NAME_SELECT,
        })
        : null;
      if (!invitation || !guest) throw new NotFoundError('Convite não encontrado.');

      await invitationService.cancel(id, body.reason);

      await recordAudit({
        action: 'invitation.cancelled',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Invitation',
        entityId: id,
        description: `Convite de "${guest.fullName}" cancelado`,
        metadata: { reason: body.reason ?? null },
        ip: request.ip,
      });

      return ok(reply, { id, status: 'CANCELLED' });
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /** POST /events/:eventId/invitations/:id/reopen */
  async reopen(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId, id } = request.params as { eventId: string; id: string };
      await request.server.assertEventAccess(request.user, eventId);
      assertCanManage(request.user.role);

      const invitation = await prisma.invitation.findFirst({
        where: { id },
        select: { id: true, guestId: true },
      });
      const guest = invitation
        ? await prisma.guest.findFirst({
          where: { id: invitation.guestId, eventId },
          select: GUEST_NAME_SELECT,
        })
        : null;
      if (!invitation || !guest) throw new NotFoundError('Convite não encontrado.');

      await invitationService.reopen(id);

      await recordAudit({
        action: 'invitation.reopened',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Invitation',
        entityId: id,
        description: `Convite de "${guest.fullName}" reaberto`,
        ip: request.ip,
      });

      return ok(reply, { id, status: 'PENDING' });
    } catch (error) {
      return handleError(reply, error);
    }
  },

  /**
   * GET /events/:eventId/invitations/:id/share-text
   * Texto e URL prontos para compartilhar manualmente no WhatsApp.
   */
  async shareText(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { eventId, id } = request.params as { eventId: string; id: string };
      await request.server.assertEventAccess(request.user, eventId);
      assertCanManage(request.user.role);

      const invitation = await prisma.invitation.findFirst({
        where: { id },
        select: { id: true, guestId: true },
      });
      if (!invitation) throw new NotFoundError('Convite não encontrado.');

      const guest = await prisma.guest.findFirst({
        where: { id: invitation.guestId, eventId },
        select: GUEST_SUMMARY_SELECT,
      });
      if (!guest) throw new NotFoundError('Convite não encontrado.');

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { venue: true },
      });
      if (!event) throw new NotFoundError('Evento não encontrado.');

      const rotated = await invitationService.rotateToken(id);
      const text = buildWhatsAppInviteText({ guest, event, link: rotated.link });

      await recordAudit({
        action: 'invitation.qrcode_shared',
        userId: request.user.sub,
        eventId,
        actorRole: request.user.role,
        actorName: request.user.name,
        entity: 'Invitation',
        entityId: id,
        description: `Compartilhamento do convite de "${guest.fullName}"`,
        ip: request.ip,
      });

      return created(reply, {
        text,
        shortText: buildShareText(event, rotated.link),
        link: rotated.link,
        whatsappUrl: guest.whatsapp
          ? `https://wa.me/${guest.whatsapp.replace('+', '')}?text=${encodeURIComponent(text)}`
          : null,
      });
    } catch (error) {
      return handleError(reply, error);
    }
  },
};

/** Atualiza o status da notificação registrada. */
async function finalizeNotification(
  notificationId: string | null,
  status: 'SENT' | 'FAILED' | 'SKIPPED',
  error?: string,
): Promise<void> {
  if (!notificationId) return;
  await prisma.notification.update({
    where: { id: notificationId },
    data: {
      status: status === 'SENT' ? 'SENT' : status === 'SKIPPED' ? 'QUEUED' : 'FAILED',
      error: error ?? null,
      sentAt: status === 'SENT' ? new Date() : null,
    },
  });
}
