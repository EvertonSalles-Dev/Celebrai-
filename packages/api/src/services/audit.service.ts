import type { Prisma } from '@prisma/client';
import type { Role } from '../config/permissions.js';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { toJsonField } from '../shared/db-compat.js';

/**
 * Trilha de auditoria (LGPD + segurança).
 *
 * Toda ação relevante — criação de convidado, envio de convite, resposta do
 * convidado, check-in, autorização manual, cancelamento — passa por aqui.
 *
 * A gravação nunca deve derrubar a operação principal: erros são logados e
 * engolidos.
 */
export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.refresh_reuse_detected'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'event.created'
  | 'event.updated'
  | 'event.deleted'
  | 'venue.updated'
  | 'party.created'
  | 'party.deleted'
  | 'guest.created'
  | 'guest.updated'
  | 'guest.deleted'
  | 'guest.imported'
  | 'invitation.created'
  | 'invitation.sent'
  | 'invitation.cancelled'
  | 'invitation.reopened'
  | 'invitation.responded'
  | 'invitation.qrcode_issued'
  | 'invitation.qrcode_shared'
  | 'rsvp.confirmed'
  | 'rsvp.declined'
  | 'checkin.validated'
  | 'checkin.denied'
  | 'checkin.manual_override'
  | 'data.exported'
  | 'data.deleted';

export interface AuditInput {
  action: AuditAction;
  userId?: string | null;
  eventId?: string | null;
  actorRole?: Role | null;
  actorName?: string | null;
  entity?: string | null;
  entityId?: string | null;
  description?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        eventId: input.eventId ?? null,
        actorRole: input.actorRole ?? null,
        actorName: input.actorName ?? null,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        description: input.description ?? null,
        // `metadata` é Json no Postgres e String em SQLite; o cast é necessário
        // para que o mesmo código atenda aos dois providers.
        metadata: toJsonField(input.metadata ?? null) as never,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    logger.warn('Falha ao gravar log de auditoria', { action: input.action, error });
  }
}
