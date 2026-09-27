/**
 * Papéis de acesso.
 *
 * O tipo é declarado AQUI (e não importado de `@prisma/client`) porque nos dois
 * schemas o campo `role` é `String`: no schema de desenvolvimento os `enum` do
 * Prisma viram `String` (SQLite não os suporta), então `Role` não existe no
 * Client gerado. Manter a fonte da verdade neste módulo deixa o código de
 * domínio independente de qual schema gerou o Client.
 */
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'RECEPTIONIST';

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  RECEPTIONIST: 'RECEPTIONIST',
} as const satisfies Record<string, Role>;

/** Hierarquia numérica — quanto maior, mais poder. */
const ROLE_WEIGHT: Record<Role, number> = {
  SUPER_ADMIN: 30,
  ADMIN: 20,
  RECEPTIONIST: 10,
};

export function roleAtLeast(role: Role, minimum: Role): boolean {
  return (ROLE_WEIGHT[role] ?? 0) >= (ROLE_WEIGHT[minimum] ?? 0);
}

export function isSuperAdmin(role: Role): boolean {
  return role === 'SUPER_ADMIN';
}

/**
 * Permissões por papel.
 *
 * O RECEPTIONIST tem acesso apenas ao controle de entrada: pode ler dados
 * mínimos necessários à validação do QR Code, mas nunca editar, excluir ou
 * alterar configurações.
 */
export type Permission =
  | 'event:read'
  | 'event:create'
  | 'event:update'
  | 'event:delete'
  | 'venue:update'
  | 'guest:read'
  | 'guest:create'
  | 'guest:update'
  | 'guest:delete'
  | 'guest:import'
  | 'invitation:read'
  | 'invitation:send'
  | 'invitation:cancel'
  | 'checkin:perform'
  | 'checkin:override'
  | 'checkin:read'
  | 'audit:read'
  | 'user:manage'
  | 'export:data';

const PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    'event:read',
    'event:create',
    'event:update',
    'event:delete',
    'venue:update',
    'guest:read',
    'guest:create',
    'guest:update',
    'guest:delete',
    'guest:import',
    'invitation:read',
    'invitation:send',
    'invitation:cancel',
    'checkin:perform',
    'checkin:override',
    'checkin:read',
    'audit:read',
    'user:manage',
    'export:data',
  ],
  ADMIN: [
    'event:read',
    'event:create',
    'event:update',
    'venue:update',
    'guest:read',
    'guest:create',
    'guest:update',
    'guest:delete',
    'guest:import',
    'invitation:read',
    'invitation:send',
    'invitation:cancel',
    'checkin:perform',
    'checkin:override',
    'checkin:read',
    'audit:read',
    'export:data',
  ],
  RECEPTIONIST: ['event:read', 'guest:read', 'checkin:perform', 'checkin:read'],
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role]?.includes(permission) ?? false;
}

export function assertCan(role: Role, permission: Permission): boolean {
  return can(role, permission);
}

/** Rótulos amigáveis para exibição na UI. */
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrador do evento',
  RECEPTIONIST: 'Recepção / Controle de entrada',
};
