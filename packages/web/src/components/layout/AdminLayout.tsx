import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarHeart,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  Users,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { authApi } from '@/services/api';
import { initials } from '@/lib/format';
import { cn } from '@/components/ui/utils';
import { Button } from '@/components/ui/Button';
import { WifiOff } from 'lucide-react';

/**
 * Layout do painel administrativo.
 *
 * - Sidebar fixa no desktop, gaveta no mobile.
 * - Mostra o usuário logado e o papel.
 * - Avisa quando a conexão cai (afeta o check-in no dia do evento).
 *
 * A RECEPÇÃO não enxerga o painel: o menu é reduzido ao controle de entrada.
 */
export function AdminLayout() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Fecha a gaveta ao trocar de rota.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isReceptionist = user?.role === 'RECEPTIONIST';

  const handleLogout = async () => {
    queryClient.clear();
    navigate('/login', { replace: true });
    await authApi.logout();
  };

  const navItems = isReceptionist
    ? [{ to: '/check-in', label: 'Controle de entrada', icon: QrCode }]
    : [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/eventos', label: 'Eventos', icon: CalendarHeart },
      { to: '/check-in', label: 'Controle de entrada', icon: QrCode },
      ...(user?.role === 'SUPER_ADMIN'
        ? [{ to: '/usuarios', label: 'Usuários', icon: Users }]
        : []),
    ];

  const roleLabel =
    user?.role === 'SUPER_ADMIN'
      ? 'Super Admin'
      : user?.role === 'ADMIN'
        ? 'Administrador'
        : 'Recepção';

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Marca */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="rounded-xl bg-wedding-800 p-2 text-white shadow-soft">
          <Heart className="h-4 w-4" fill="currentColor" />
        </div>
        <div>
          <p className="text-xl font-display font-semibold tracking-tight text-wedding-900">Celebrai</p>
          <p className="text-[11px] font-medium text-wedding-600">Gestão de convidados</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex flex-1 flex-col space-y-1 px-3 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-wedding-800 text-white shadow-sm'
                  : 'text-wedding-700 hover:bg-wedding-100/70 hover:text-wedding-900',
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0 opacity-80" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Rodapé: usuário + sair */}
      <div className="border-t border-wedding-200 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wedding-800 text-xs font-semibold text-white">
            {initials(user?.name ?? '?')}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-wedding-900">{user?.name}</p>
            <p className="truncate text-[11px] text-wedding-600">{roleLabel}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          fullWidth
          icon={<LogOut className="h-4 w-4" />}
          onClick={handleLogout}
          className="flex justify-start"
        >
          Sair da conta
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-wedding-50">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-wedding-200 bg-white lg:block">
        {sidebar}
      </aside>

      {/* Gaveta mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-wedding-950/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          role="presentation"
        >
          <aside
            className="animate-slide-in-right h-full w-72 bg-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
                className="rounded-lg p-2 text-wedding-500 hover:bg-wedding-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Barra superior */}
        <header className="safe-top sticky top-0 z-30 flex items-center gap-3 border-b border-wedding-200 bg-white/80 px-4 py-3 backdrop-blur lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            className="rounded-lg p-2 text-wedding-700 hover:bg-wedding-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link to="/dashboard" className="flex items-center gap-2 lg:hidden">
            <Heart className="h-5 w-5 text-wedding-800" fill="currentColor" />
            <span className="text-xl font-display font-semibold text-wedding-900">Celebrai</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/check-in"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-wedding-700 transition-colors hover:bg-wedding-100 hover:text-wedding-900 sm:flex"
            >
              <QrCode className="h-4 w-4" />
              Controle de entrada
            </Link>
          </div>
        </header>

        {/* Aviso de conexão */}
        {!isOnline && (
          <div className="flex items-center gap-2 bg-warning-100 px-4 py-2.5 text-sm text-warning-700 lg:px-8">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              Sem conexão com a internet. O check-in exige validação do servidor — as leituras
              ficarão bloqueadas até a conexão voltar.
            </span>
          </div>
        )}

        <main className="flex flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
