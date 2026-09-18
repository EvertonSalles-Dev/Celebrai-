import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/services/api';
import { getAccessToken } from '@/lib/api-client';
import type { AuthUser } from '@/types';

/**
 * Hook de sessão.
 *
 * A fonte de verdade é o servidor (`/auth/me`): o token no storage pode estar
 * expirado ou revogado. Enquanto houver token, validamos com o backend.
 */
export function useSession() {
  const hasToken = Boolean(getAccessToken());

  const query = useQuery<AuthUser>({
    queryKey: ['session', 'me'],
    queryFn: () => authApi.me(),
    enabled: hasToken,
    retry: false,
    staleTime: 60_000,
  });

  return {
    user: hasToken ? (query.data ?? null) : null,
    isLoading: hasToken && query.isLoading,
    isAuthenticated: hasToken && Boolean(query.data),
    refetch: query.refetch,
  };
}

/** Permissões derivadas do papel — espelham o backend. */
export function usePermissions() {
  const { user } = useSession();
  const role = user?.role;

  return {
    role,
    isSuperAdmin: role === 'SUPER_ADMIN',
    isAdmin: role === 'ADMIN',
    isReceptionist: role === 'RECEPTIONIST',

    /** Gerencia convidados, convites, evento e local. */
    canManageEvent: role === 'SUPER_ADMIN' || role === 'ADMIN',
    /** Realiza check-in na portaria. */
    canCheckIn: role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'RECEPTIONIST',
    /** Autoriza entrada manual após alerta de duplicidade. */
    canOverrideCheckIn: role === 'SUPER_ADMIN' || role === 'ADMIN',
    /** Exporta relatórios. */
    canExport: role === 'SUPER_ADMIN' || role === 'ADMIN',
    /** Gerencia usuários da plataforma. */
    canManageUsers: role === 'SUPER_ADMIN',
    /** Lê a trilha de auditoria. */
    canViewAudit: role === 'SUPER_ADMIN' || role === 'ADMIN',
  };
}
