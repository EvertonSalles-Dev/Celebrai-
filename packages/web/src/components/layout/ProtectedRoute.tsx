import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/hooks/useSession';
import { setSessionExpiredHandler } from '@/lib/api-client';
import { LoadingState } from '@/components/ui/States';

/**
 * Guarda de rota.
 *
 * Verifica:
 *  1. Se há sessão válida (o token é validado contra o servidor).
 *  2. Se o papel do usuário permite o que a rota exige.
 *
 * Também registra o handler de "sessão expirada": quando o refresh token falha
 * no meio do uso, o usuário é levado ao login em vez de ver erros soltos.
 */
export function ProtectedRoute({
  children,
  requireSuperAdmin = false,
  requireCheckIn = false,
}: {
  children: ReactNode;
  /** Restringe a rota ao SUPER_ADMIN (ex.: gestão de usuários). */
  requireSuperAdmin?: boolean;
  /** Permite acesso a ADMIN, SUPER_ADMIN e RECEPTIONIST (portaria). */
  requireCheckIn?: boolean;
}) {
  const { user, isLoading, isAuthenticated, refetch } = useSession();
  const location = useLocation();

  // Sessão expirada durante o uso → volta ao login preservando o destino.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      void refetch();
    });
    return () => setSessionExpiredHandler(null);
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-wedding-50">
        <LoadingState label="Verificando acesso..." />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireSuperAdmin && user.role !== 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireCheckIn) {
    const allowed = ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'];
    if (!allowed.includes(user.role)) {
      return <Navigate to="/dashboard" replace />;
    }
    // A recepção não tem painel: vai direto para a portaria.
    return <>{children}</>;
  }

  return <>{children}</>;
}
