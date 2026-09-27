import { env } from '../config/env.js';

/**
 * Compatibilidade de tipos entre PostgreSQL (produção) e SQLite (dev local).
 *
 * Alguns campos são declarados como `String?` **nos dois schemas**
 * (`schema.prisma` e `schema.dev.prisma`) para guardar estruturas complexas —
 * por exemplo `AuditLog.metadata`, `Notification.metadata` e
 * `InvitationResponse.companions` (JSON serializado em texto).
 *
 * Estes helpers centralizam a conversão para que o código de domínio não
 * precise saber qual banco está por trás.
 */

export const isSqlite = env.DATABASE_PROVIDER === 'sqlite';
// `DATABASE_PROVIDER` é derivado da `DATABASE_URL` em `config/env.ts`, então os
// dois nunca divergem — sem isso, uma URL de produção com provider "sqlite"
// fazia as funções abaixo pularem a serialização e o Prisma recusar a escrita.

/**
 * Serializa um valor destinado a um campo `String?` que guarda JSON.
 *
 * Atenção: o campo é `String?` tanto no Postgres quanto no SQLite (ver
 * `AuditLog.metadata` / `Notification.metadata`), então **sempre** precisa
 * virar string. Antes esta função só serializava no SQLite e devolvia o objeto
 * cru no Postgres — o que fazia o Prisma rejeitar a escrita com
 * `Argument metadata: Invalid value provided. Expected String or Null, provided
 * Object`, quebrando silenciosamente toda a trilha de auditoria em produção.
 */
export function toJsonField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Normaliza um valor destinado a um campo `String[]`.
 * Em SQLite devolve string JSON; em Postgres devolve o array.
 */
export function toStringListField(values: string[] | null | undefined): unknown {
  if (!values) return isSqlite ? null : [];
  if (!isSqlite) return values;
  return JSON.stringify(values);
}

/**
 * Lê um campo `Json` do banco, independentemente do provider.
 * Aceita objeto (Postgres), string JSON (SQLite) ou nulo.
 */
export function fromJsonField<T = unknown>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/** Lê um campo `String[]` do banco, independentemente do provider. */
export function fromStringListField(value: unknown): string[] {
  const parsed = fromJsonField<string[]>(value, []);
  return Array.isArray(parsed) ? parsed : [];
}
