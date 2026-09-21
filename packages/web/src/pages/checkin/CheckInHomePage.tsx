import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarHeart,
  ChevronRight,
  DoorOpen,
  LogOut,
  MapPin,
  QrCode,
  RefreshCw,
  Users,
  WifiOff,
} from 'lucide-react';
import { useCheckInEvents } from '@/hooks/useApi';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSession } from '@/hooks/useSession';
import { authApi } from '@/services/api';
import { dayjs, formatShortDate, plural, APP_TIMEZONE } from '@/lib/format';
import { EmptyState, ErrorState, LoadingState, EventStatusBadge } from '@/components/ui/States';
import { cn } from '@/components/ui/utils';

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
      <header className="safe-top sticky top-0 z-20 border-b border-wedding-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-5 py-4">
          <div className="rounded-2xl bg-wedding-900 p-2.5 text-white shadow-soft">
            <QrCode className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight text-wedding-900">
              Controle de entrada
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-wedding-500">
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  isOnline ? 'bg-success-500' : 'bg-danger-500',
                )}
                aria-hidden="true"
              />
              <span className="truncate">
                {user ? `Operador: ${user.name}` : 'Selecione o evento para iniciar'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            aria-label="Atualizar lista"
            className="rounded-xl p-2 text-wedding-500 transition-colors hover:bg-wedding-100 hover:text-wedding-800"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sair da conta"
            title="Sair da conta"
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-wedding-200 px-3 py-2 text-xs font-medium text-wedding-700 transition-colors hover:bg-wedding-100 hover:text-wedding-900"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-5 py-6">
        {!isOnline && (
          <div className="mb-5 flex items-start gap-2.5 rounded-2xl border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Sem conexão. O check-in exige validação do servidor e ficará bloqueado até a conexão
              voltar.
            </span>
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
          <ul className="space-y-3.5">
            {events?.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/check-in/scanner/${event.id}`)}
                  aria-label={`Abrir scanner de ${event.hostsName ?? event.title}`}
                  className="card group block w-full overflow-hidden p-0 text-left transition-all hover:border-wedding-300 hover:shadow-card active:scale-[0.99]"
                >
                  <div className="flex items-center gap-4 p-4">
                    <EventDateBadge date={event.eventDate} />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-wedding-900">
                        {event.hostsName ?? event.title}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-wedding-500">
                        <CalendarHeart className="h-3.5 w-3.5 shrink-0" />
                        {formatShortDate(event.eventDate)}
                      </p>
                      <div className="mt-2">
                        <EventStatusBadge status={event.status} />
                      </div>
                    </div>

                    <ChevronRight className="h-5 w-5 shrink-0 text-wedding-300 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-wedding-600" />
                  </div>

                  {/* CTA destacada */}
                  <div className="flex items-center gap-2 border-t border-wedding-100 bg-wedding-50/70 px-4 py-3 text-sm font-semibold text-wedding-800 transition-colors group-hover:bg-wedding-100/70">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-wedding-900 text-white">
                      <DoorOpen className="h-4 w-4" />
                    </span>
                    Abrir scanner
                    <ArrowRight className="ml-auto h-4 w-4 text-wedding-400 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Ações auxiliares */}
        {!isLoading && !isReceptionist && (events?.length ?? 0) > 0 && (
          <div className="mt-6">
            <Link
              to="/dashboard"
              className="btn-secondary flex w-full items-center justify-center"
            >
              <Users className="h-4 w-4" />
              Ver painel do evento
            </Link>
          </div>
        )}

        {!isLoading && !error && (events?.length ?? 0) > 0 && (
          <p className="mt-6 text-center text-xs text-wedding-400">
            {plural(events?.length ?? 0, 'evento disponível', 'eventos disponíveis')}
          </p>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-wedding-400">
          <MapPin className="h-3 w-3" />
          Funciona melhor em celulares com a câmera traseira.
        </p>
      </main>
    </div>
  );
}

/**
 * Selo de data do evento: dia em destaque + mês abreviado.
 * Dá um ponto de âncora visual ao cartão, no lugar de só repetir a data em texto.
 */
function EventDateBadge({ date }: { date: string }) {
  const parsed = dayjs(date).tz(APP_TIMEZONE);
  const day = parsed.isValid() ? parsed.format('DD') : '--';
  const month = parsed.isValid()
    ? parsed.format('MMM').replace('.', '').toUpperCase()
    : '---';

  return (
    <div
      className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border-wedding-100 bg-wedding-50 text-wedding-800"
      aria-hidden="true"
    >
      <span className="text-lg font-semibold leading-none tabular-nums">{day}</span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-wedding-500">
        {month}
      </span>
    </div>
  );
}


