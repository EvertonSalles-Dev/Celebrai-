import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarHeart,
  CalendarPlus,
  CheckCircle2,
  Clock,
  DoorOpen,
  Plus,
  TrendingUp,
  UserX,
  Users,
  XCircle,
} from 'lucide-react';
import { useEvents } from '@/hooks/useApi';
import { useSession } from '@/hooks/useSession';
import { formatShortDate, greeting, firstName, plural } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { EventStatusBadge, EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { QrCode as QrIcon } from 'lucide-react';

/**
 * Dashboard geral do organizador.
 *
 * Consolida a visão de todos os eventos aos quais o usuário tem acesso, com os
 * números-chave: convidados, confirmados, pendentes, recusados e presentes.
 */
export function DashboardPage() {
  const { user } = useSession();
  const { data: events, isLoading, error, refetch } = useEvents();

  // Totais consolidados de todos os eventos visíveis.
  const totals = (events ?? []).reduce(
    (acc, event) => {
      const counts = event.invitationCounts;
      if (!counts) return acc;

      acc.invitations += counts.total;
      acc.confirmed += counts.confirmed;
      acc.pending += counts.pending;
      acc.declined += counts.declined;
      acc.checkedIn += counts.checkedIn;
      acc.guests += event._count?.guests ?? 0;

      return acc;
    },
    { invitations: 0, guests: 0, confirmed: 0, pending: 0, declined: 0, checkedIn: 0 },
  );

  const upcoming = (events ?? [])
    .filter((event) => new Date(event.eventDate).getTime() >= Date.now() - 86_400_000)
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());

  const confirmedRate =
    totals.invitations > 0 ? Math.round((totals.confirmed / totals.invitations) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Cabeçalho */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-wedding-600">
            {greeting()}
            {user ? `, ${firstName(user.name)}` : ''} 👋
          </p>
          <h1 className="mt-1 text-3xl font-display font-semibold tracking-tight text-wedding-900">
            Visão geral dos eventos
          </h1>
          <p className="mt-1 text-sm text-wedding-700">
            Acompanhe convidados, confirmações e entradas em tempo real.
          </p>
        </div>

        <Link to="/eventos" className="btn-primary">
          <CalendarPlus className="h-4 w-4" />
          Gerenciar eventos
        </Link>
      </header>

      {isLoading && <LoadingState label="Carregando seus eventos..." />}

      {error && (
        <ErrorState
          title="Não foi possível carregar o dashboard"
          description="Verifique sua conexão e tente novamente."
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !error && (
        <>
          {/* Métricas consolidadas */}
          {(events?.length ?? 0) > 0 && (
            <section className="mb-8">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-wedding-600">
                Totais consolidados
              </h2>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <StatCard
                  label="Convidados"
                  value={totals.guests}
                  hint={`${totals.invitations} ${plural(totals.invitations, 'convite', 'convites')}`}
                  icon={<Users className="h-4 w-4" />}
                />
                <StatCard
                  label="Confirmados"
                  value={totals.confirmed}
                  hint={`${confirmedRate}% dos convites`}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  tone="success"
                />
                <StatCard
                  label="Pendentes"
                  value={totals.pending}
                  icon={<Clock className="h-4 w-4" />}
                  tone="warning"
                />
                <StatCard
                  label="Recusados"
                  value={totals.declined}
                  icon={<XCircle className="h-4 w-4" />}
                  tone="danger"
                />
                <StatCard
                  label="Presentes"
                  value={totals.checkedIn}
                  hint="Check-in realizado"
                  icon={<DoorOpen className="h-4 w-4" />}
                  tone="info"
                />
                <StatCard
                  label="Ausentes"
                  value={Math.max(0, totals.confirmed - totals.checkedIn)}
                  hint="Confirmados sem entrada"
                  icon={<UserX className="h-4 w-4" />}
                />
              </div>
            </section>
          )}

          {/* Lista de eventos */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-wedding-600">
                Seus eventos
              </h2>
              <Link
                to="/eventos"
                className="text-sm font-medium text-wedding-700 transition-colors hover:text-wedding-900"
              >
                Ver todos
              </Link>
            </div>

            {(events?.length ?? 0) === 0 ? (
              <div className="card">
                <EmptyState
                  icon={CalendarHeart}
                  title="Nenhum evento cadastrado"
                  description="Crie seu primeiro evento para começar a cadastrar convidados e enviar convites."
                  action={
                    <Link to="/eventos" className="btn-primary">
                      <Plus className="h-4 w-4" />
                      Criar evento
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="grid gap-4 lg:grid-cols-2">
                {upcoming.slice(0, 6).map((event) => (
                  <li key={event.id}>
                    <EventCard event={event} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cartão do evento
// ---------------------------------------------------------------------------

function EventCard({
  event,
}: {
  event: {
    id: string;
    title: string;
    hostsName: string | null;
    eventDate: string;
    startTime: string;
    status: string;
    coverImageUrl: string | null;
    venue?: { name: string; city: string; state: string } | null;
    invitationCounts?: {
      total: number;
      confirmed: number;
      pending: number;
      declined: number;
      checkedIn: number;
    };
    _count?: { guests: number };
  };
}) {
  const counts = event.invitationCounts ?? {
    total: 0,
    confirmed: 0,
    pending: 0,
    declined: 0,
    checkedIn: 0,
  };

  const confirmedPercent =
    counts.total > 0 ? Math.round((counts.confirmed / counts.total) * 100) : 0;

  return (
    <article className="card group overflow-hidden transition-shadow hover:shadow-card">
      <div className="flex gap-4 p-5">
        {/* Foto / placeholder */}
        <div className="hidden h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-wedding-100 sm:block">
          {event.coverImageUrl ? (
            <img
              src={event.coverImageUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-wedding-400">
              <CalendarHeart className="h-7 w-7" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-display font-semibold text-wedding-900">
                {event.hostsName ?? event.title}
              </h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-wedding-600">
                <span className="flex items-center gap-1.5">
                  <CalendarHeart className="h-3.5 w-3.5" />
                  {formatShortDate(event.eventDate)} às {event.startTime}
                </span>
                {event.venue && (
                  <>
                    <span className="text-wedding-400">·</span>
                    <span className="truncate">
                      {event.venue.name}, {event.venue.city}/{event.venue.state}
                    </span>
                  </>
                )}
              </p>
            </div>
            <EventStatusBadge status={event.status} />
          </div>

          {/* Números */}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <MiniStat label="Convites" value={counts.total} />
            <MiniStat label="Confirm." value={counts.confirmed} tone="success" />
            <MiniStat label="Pend." value={counts.pending} tone="warning" />
            <MiniStat label="Entraram" value={counts.checkedIn} tone="info" />
          </div>

          {/* Progresso de confirmação */}
          <div className="mt-3.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-wedding-100">
              <div
                className="h-full rounded-full bg-success-500 transition-all duration-500"
                style={{ width: `${confirmedPercent}%` }}
              />
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-xs text-wedding-600">
              <TrendingUp className="h-3 w-3" />
              {confirmedPercent}% de confirmações
            </p>
          </div>

          {/* Ações */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={`/eventos/${event.id}/convidados`} className="btn-secondary !px-3 !py-2 !text-xs">
              Convidados
            </Link>
            <Link to={`/eventos/${event.id}/convites`} className="btn-secondary !px-3 !py-2 !text-xs">
              Convites
            </Link>
            <Link
              to={`/check-in/scanner/${event.id}`}
              className="btn-ghost !px-3 !py-2 !text-xs"
            >
              <QrIcon className="h-3.5 w-3.5" />
              Check-in
            </Link>
            <Link
              to={`/eventos/${event.id}`}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-wedding-600 transition-colors hover:text-wedding-900"
            >
              Detalhes
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function MiniStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'warning' | 'info';
}) {
  const toneClass = {
    neutral: 'text-wedding-900',
    success: 'text-success-600',
    warning: 'text-warning-600',
    info: 'text-blue-600',
  }[tone];

  return (
    <div>
      <p className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-wedding-500">{label}</p>
    </div>
  );
}

