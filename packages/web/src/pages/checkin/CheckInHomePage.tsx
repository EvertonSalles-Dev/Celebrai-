import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarHeart,
  DoorOpen,
  LogOut,
  MapPin,
  QrCode,
  RefreshCw,
  Users,
} from 'lucide-react';
import { useCheckInEvents } from '@/hooks/useApi';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSession } from '@/hooks/useSession';
import { authApi } from '@/services/api';
import { formatShortDate, plural } from '@/lib/format';
import { EmptyState, ErrorState, LoadingState, EventStatusBadge } from '@/components/ui/States';

/**
 * Entrada do controle de entrada (portaria).
 *
 * Tela mínima: o operador escolhe o evento e vai direto ao scanner. Foi pensada
 * para ser usada em pé, com uma mão, no celular — botões grandes e poucos
 * elementos.
 */
export function CheckInHomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const { user } = useSession();
  const { data: events, isLoading, error, refetch } = useCheckInEvents();

  const handleLogout = async () => {
    queryClient.clear();
    navigate('/login', { replace: true });
    await authApi.logout();
  };

  const isReceptionist = user?.role === 'RECEPTIONIST';

  return (
    <div className="min-h-screen bg-wedding-50">
      <header className="safe-top border-b border-wedding-100 bg-white px-5 py-5">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="rounded-xl bg-wedding-900 p-2 text-white">
            <QrCode className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex flex-1">
            <h1 className="text-base font-semibold tracking-tight text-wedding-900">
              Controle de entrada
            </h1>
            <p className="text-xs text-wedding-400">
              {user ? `Operador: ${user.name}` : 'Selecione o evento para iniciar as leituras'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            aria-label="Atualizar lista"
            className="rounded-lg p-2 text-wedding-400 transition-colors hover:bg-wedding-100 hover:text-wedding-700"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            title="Sair da conta"
            className="flex items-center gap-1.5 rounded-lg border border-wedding-200 px-3 py-1.5 text-xs font-medium text-wedding-700 transition-colors hover:bg-wedding-100 hover:text-wedding-900"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 py-6">
        {!isOnline && (
          <div className="mb-5 rounded-2xl border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
            Sem conexão. O check-in exige validação do servidor e ficará bloqueado até a conexão
            voltar.
          </div>
        )}

        {isLoading && <LoadingState label="Carregando eventos..." />}

        {error && (
          <ErrorState
            title="Não foi possível carregar os eventos"
            description="Verifique sua conexão e tente novamente."
            onRetry={() => void refetch()}
          />
        )}

        {!isLoading && !error && (events?.length ?? 0) === 0 && (
          <EmptyState
            icon={CalendarHeart}
            title="Nenhum evento disponível"
            description="Você ainda não foi vinculado a nenhum evento. Peça ao administrador para liberar seu acesso."
            action={
              <Link to="/dashboard" className="btn-secondary">
                Ir para o painel
              </Link>
            }
          />
        )}

        {!isLoading && !error && (events?.length ?? 0) > 0 && (
          <ul className="space-y-3">
            {events?.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/check-in/scanner/${event.id}`)}
                  className="card w-full p-5 text-left transition-all hover:border-wedding-300 hover:shadow-card active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-wedding-900">
                        {event.hostsName ?? event.title}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-wedding-500">
                        <CalendarHeart className="h-3.5 w-3.5" />
                        {formatShortDate(event.eventDate)}
                      </p>
                    </div>
                    <EventStatusBadge status={event.status} />
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-sm font-medium text-wedding-700">
                    <DoorOpen className="h-4 w-4" />
                    Abrir scanner
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Ações auxiliares */}
        {!isLoading && !isReceptionist && (events?.length ?? 0) > 0 && (
          <div className="mt-6 space-y-2">
            <Link to="/dashboard" className="btn-ghost w-full flex justify-start">
              <Users className="h-4 w-4" />
              Ver painel do evento
            </Link>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-wedding-400">
          {plural(events?.length ?? 0, 'evento disponível', 'eventos disponíveis')}
        </p>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-wedding-400">
          <MapPin className="h-3 w-3" />
          Funciona melhor em celulares com a câmera traseira.
        </p>
      </main>
    </div>
  );
}


