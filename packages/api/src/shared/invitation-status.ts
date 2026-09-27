/**
 * Status de convite — fonte única, independente do Client gerado pelo Prisma.
 *
 * Por que este módulo existe
 * --------------------------
 * O projeto tem DOIS schemas Prisma:
 *
 *  - `prisma/schema.prisma`     → produção (PostgreSQL), `status` é um `enum`
 *  - `prisma/schema.dev.prisma` → desenvolvimento (SQLite), `status` é `String`
 *                                 (o gerador converte enums, que o SQLite não
 *                                 suporta — ver `scripts/set-provider.mjs`)
 *
 * O `type` do filtro (`Prisma.EnumInvitationStatusFilter`) só existe no Client
 * de produção. Um `query.status as never` compilava no desenvolvimento e
 * QUEBRAVA o build da Vercel, que roda a partir do schema de produção.
 *
 * Validar contra a lista conhecida resolve os dois casos sem `as never`: o valor
 * devolvido é uma união de literais, que o Prisma aceita tanto como enum quanto
 * como `String`. De quebra, um valor inesperado vindo da query string é
 * ignorado em vez de virar filtro inválido.
 */

export const INVITATION_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'DECLINED',
  'CHECKED_IN',
  'CANCELLED',
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/**
 * Converte um valor de query string em um status válido.
 * Devolve `null` para `undefined`, `'ALL'` ou qualquer valor desconhecido —
 * casos em que não deve haver filtro por status.
 */
export function parseInvitationStatus(value: string | undefined): InvitationStatus | null {
  if (!value || value === 'ALL') return null;
  return INVITATION_STATUSES.find((status) => status === value) ?? null;
}