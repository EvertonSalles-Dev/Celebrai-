/**
 * Canal de notificação.
 *
 * Declarado localmente pelo mesmo motivo de `Role` (ver `config/permissions.ts`):
 * no schema de desenvolvimento os `enum` do Prisma viram `String`, então o tipo
 * `NotificationChannel` não existe no Client gerado.
 */
export type NotificationChannel = 'EMAIL' | 'WHATSAPP' | 'SMS' | 'LINK';

import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { toJsonField } from '../shared/db-compat.js';

/**
 * Registro de notificações.
 *
 * Toda tentativa de envio (e-mail, WhatsApp, SMS) é persistida com status,
 * provider e erro. Isso permite:
 *  - repassar falhas para o painel (reenviar convite);
 *  - comprovar comunicações (LGPD/auditoria);
 *  - funcionar mesmo com integração externa desativada.
 */
export interface LogNotificationInput {
  channel: NotificationChannel;
  eventId?: string | null;
  guestId?: string | null;
  invitationId?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  provider?: string | null;
  status?: 'QUEUED' | 'SENT' | 'FAILED';
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logNotification(input: LogNotificationInput): Promise<string | null> {
  try {
    const record = await prisma.notification.create({
      data: {
        channel: input.channel,
        eventId: input.eventId ?? null,
        guestId: input.guestId ?? null,
        invitationId: input.invitationId ?? null,
        to: input.to ?? null,
        subject: input.subject ?? null,
        body: input.body ?? null,
        provider: input.provider ?? null,
        status: input.status ?? 'QUEUED',
        error: input.error ?? null,
        sentAt: input.status === 'SENT' ? new Date() : null,
        metadata: toJsonField(input.metadata ?? null) as never,
      },
      select: { id: true },
    });
    return record.id;
  } catch (error) {
    logger.warn('Falha ao registrar notificação', { channel: input.channel, error });
    return null;
  }
}

export async function markNotification(
  id: string,
  status: 'SENT' | 'FAILED',
  error?: string,
): Promise<void> {
  try {
    await prisma.notification.update({
      where: { id },
      data: { status, error: error ?? null, sentAt: status === 'SENT' ? new Date() : null },
    });
  } catch (error) {
    logger.warn('Falha ao atualizar notificação', { id, error });
  }
}
