import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  CalendarHeart,
  CheckCircle2,
  Clock,
  DoorOpen,
  MapPin,
  QrCode,
  UserX,
  Users,
  XCircle,
} from 'lucide-react';
import { useDashboard, useEvent } from '@/hooks/useApi';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { formatLongDate, formatShortDate } from '@/lib/format';
import { StatCard, ProgressBar } from '@/components/ui/StatCard';
import { ErrorState, LoadingState, SkeletonCard } from '@/components/ui/States';

/**
 * Visão geral de um evento — dashboard com métricas e gráficos.
 *
 * Traz os contadores exigidos (convidados, confirmados, pendentes, recusados,
 * presentes, ausentes) e duas séries: confirmações por dia e check-ins por
 * horário (blocos de 30 minutos).
 */
export function EventOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const isOnline = useOnlineStatus();

  const { data: event, isLoading: loadingEvent, error: eventError, refetch } = useEvent(id);
  const { data: dashboard, isLoading: loadingDashboard } = useDashboard(id);

  if (loadingEvent) return <LoadingState label="Carregando evento..." />;

  if (eventError || !event) {
    return (
      <ErrorState
        title="Evento não encontrado"
        description="Você pode não ter acesso a este evento."
        onRetry={() => void refetch()}
      />
    );
  }

  const counts = dashboard?.invitations ?? {
    total: 0,
    confirmed: 0,
    pending: 0,
    declined: 0,
    checkedIn: 0,
    cancelled: 0,
  };

  const totalPeopleExpected = counts.confirmed + counts.checkedIn;

  return (
    <div className="mx-auto max-w-7xl">
      {/* Cabeçalho */}
      <header className="mb-8">
        <Link
          to="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-wedding-500 transition-colors hover:text-wedding-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-semibold tracking-tight text-wedding-900">
              {event.hostsName ?? event.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-wedding-500">
              <span className="flex items-center gap-1.5">
                <CalendarHeart className="h-3.5 w-3.5" />
                {formatLongDate(event.eventDate)} às {event.startTime}
              </span>
              {event.venue && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {event.venue.name}, {event.venue.city}/{event.venue.state}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link to={`/eventos/${id}/convidados`} className="btn-secondary">
              <Users className="h-4 w-4" />
              Convidados
            </Link>
            <Link to={`/eventos/${id}/convites`} className="btn-secondary">
              <QrCode className="h-4 w-4" />
              Convites
            </Link>
            <Link to={`/check-in/scanner/${id}`} className="btn-primary">
              <DoorOpen className="h-4 w-4" />
              Controle de entrada
            </Link>
          </div>
        </div>

        {/* Navegação do evento */}
        <nav className="no-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-wedding-100">
          <EventTab to={`/eventos/${id}`} label="Visão geral" active />
          <EventTab to={`/eventos/${id}/convidados`} label="Convidados" />
          <EventTab to={`/eventos/${id}/convites`} label="Convites" />
          <EventTab to={`/eventos/${id}/local`} label="Local" />
          <EventTab to={`/eventos/${id}/auditoria`} label="Auditoria" />
          <EventTab to={`/eventos/${id}/configuracoes`} label="Configurações" />
        </nav>
      </header>

      {!isOnline && (
        <p className="mb-5 rounded-xl bg-warning-100 px-4 py-2.5 text-sm text-warning-700">
          Sem conexão — os números podem estar desatualizados.
        </p>
      )}

      {loadingDashboard ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : (
        <>
          {/* Contadores principais */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Convidados"
              value={counts.total}
              hint={`${dashboard?.guests ?? 0} cadastrados`}
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              label="Confirmados"
              value={counts.confirmed}
              hint={`${totalPeopleExpected} pessoas esperadas`}
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone="success"
            />
            <StatCard
              label="Pendentes"
              value={counts.pending}
              icon={<Clock className="h-4 w-4" />}
              tone="warning"
            />
            <StatCard
              label="Recusados"
              value={counts.declined}
              icon={<XCircle className="h-4 w-4" />}
              tone="danger"
            />
            <StatCard
              label="Presentes"
              value={counts.checkedIn}
              hint={`${dashboard?.checkInPeople ?? 0} pessoas entraram`}
              icon={<DoorOpen className="h-4 w-4" />}
              tone="info"
            />
            <StatCard
              label="Ausentes"
              value={dashboard?.absent ?? 0}
              hint="Confirmados sem entrada"
              icon={<UserX className="h-4 w-4" />}
            />
          </section>

          {/* Progresso */}
          <section className="mt-6 card p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-wedding-400">
              Progresso geral
            </h2>

            <div className="grid gap-5 sm:grid-cols-2">
              <ProgressBar
                label="Confirmações"
                value={counts.confirmed + counts.checkedIn}
                max={counts.total}
                tone="success"
              />
              <ProgressBar
                label="Entradas realizadas"
                value={counts.checkedIn}
                max={Math.max(1, counts.confirmed + counts.checkedIn)}
                tone="ink"
              />
            </div>
          </section>

          {/* Gráficos */}
          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <CheckInTimelineChart data={dashboard?.checkInTimeline ?? []} />
            <ResponsesTimelineChart data={dashboard?.responsesTimeline ?? []} />
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Navegação do evento
// ---------------------------------------------------------------------------

function EventTab({ to, label, active = false }: { to: string; label: string; active?: boolean }) {
  return (
    <Link
      to={to}
      className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${active
          ? 'border-wedding-900 text-wedding-900'
          : 'border-transparent text-wedding-500 hover:border-wedding-200 hover:text-wedding-800'
        }`}
    >
      {label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Gráficos (SVG puro, sem dependência externa)
// ---------------------------------------------------------------------------

/**
 * Entradas por horário (blocos de 30 minutos).
 * O ponto mais alto da série define a escala da área do gráfico, e uma linha
 * de referência mostra a média de entradas por bloco.
 */
function CheckInTimelineChart({ data }: { data: Array<{ time: string; count: number }> }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (data.length === 0) return null;

    const maxCount = Math.max(...data.map((point) => point.count));
    const total = data.reduce((acc, point) => acc + point.count, 0);
    const average = total / data.length;
    const peak = data.find((point) => point.count === maxCount);

    return { maxCount, total, average, peak };
  }, [data]);

  return (
    <article className="card p-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-wedding-800">
            <Activity className="h-4 w-4 text-wedding-400" />
            Entradas por horário
          </h2>
          <p className="mt-0.5 text-xs text-wedding-400">Check-ins agrupados a cada 30 minutos</p>
        </div>

        {stats && (
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-wedding-900">{stats.total}</p>
            <p className="text-[10px] uppercase tracking-wider text-wedding-400">check-ins</p>
          </div>
        )}
      </header>

      {data.length === 0 ? (
        <EmptyChart message="Nenhum check-in registrado ainda." />
      ) : (
        <>
          <div className="flex h-44 items-end gap-1.5">
            {data.map((point) => {
              const height = stats ? (point.count / stats.maxCount) * 100 : 0;
              const isPeak = point.count === stats?.maxCount;

              return (
                <div
                  key={point.time}
                  className="group relative flex flex-1 flex-col items-center justify-end"
                  onMouseEnter={() => setHovered(point.time)}
                  onMouseLeave={() => setHovered(null)}
                  title={`${point.time} — ${point.count} entradas`}
                >
                  {hovered === point.time && (
                    <div className="absolute -top-8 z-10 whitespace-nowrap rounded-lg bg-wedding-900 px-2 py-1 text-[11px] text-white shadow-lg">
                      {point.time} · {point.count}
                    </div>
                  )}

                  <span className="mb-1 text-[10px] tabular-nums text-wedding-400">
                    {point.count > 0 ? point.count : ''}
                  </span>

                  <div
                    className={`w-full rounded-t-lg transition-all duration-500 ${isPeak ? 'bg-success-500' : 'bg-wedding-300 group-hover:bg-wedding-400'
                      }`}
                    style={{ height: `${Math.max(height, 3)}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* Eixo X */}
          <div className="mt-2 flex gap-1.5">
            {data.map((point, index) => (
              <span
                key={point.time}
                className="flex flex-1 text-center text-[9px] tabular-nums text-wedding-400"
              >
                {index % Math.ceil(data.length / 8) === 0 ? point.time : ''}
              </span>
            ))}
          </div>

          {stats?.peak && (
            <p className="mt-4 border-t border-wedding-100 pt-3 text-xs text-wedding-500">
              Pico de entradas às{' '}
              <strong className="font-semibold text-wedding-800">{stats.peak.time}</strong> com{' '}
              {stats.peak.count} {stats.peak.count === 1 ? 'entrada' : 'entradas'} · média de{' '}
              {stats.average.toFixed(1)} por bloco
            </p>
          )}
        </>
      )}
    </article>
  );
}

/**
 * Confirmações por dia (linha simples).
 */
function ResponsesTimelineChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const points = useMemo(() => data.slice(-14), [data]);

  const path = useMemo(() => {
    if (points.length < 2) return { line: '', area: '', max: 0 };

    const max = Math.max(...points.map((point) => point.count));
    const width = 100;
    const height = 100;

    const coords = points.map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - (point.count / max) * height;
      return `${x},${y}`;
    });

    return {
      line: `M ${coords.join(' L ')}`,
      area: `M 0,${height} L ${coords.join(' L ')} L ${width},${height} Z`,
      max,
    };
  }, [points]);

  return (
    <article className="card p-6">
      <header className="mb-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-wedding-800">
          <CalendarHeart className="h-4 w-4 text-wedding-400" />
          Confirmações por dia
        </h2>
        <p className="mt-0.5 text-xs text-wedding-400">Últimos 14 dias com respostas</p>
      </header>

      {points.length < 2 ? (
        <EmptyChart message="Ainda não há confirmações suficientes para o gráfico." />
      ) : (
        <>
          <div className="relative h-44 w-full">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="h-full w-full overflow-visible"
              role="img"
              aria-label="Gráfico de confirmações por dia"
            >
              <defs>
                <linearGradient id="responses-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Linhas de grade */}
              {[0, 25, 50, 75, 100].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2="100"
                  y2={y}
                  stroke="#eceef2"
                  strokeWidth="0.4"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              <path d={path.area} fill="url(#responses-gradient)" />
              <path
                d={path.line}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <div className="mt-3 flex justify-between text-[10px] text-wedding-400">
            <span>{formatShortDate(points[0]!.date)}</span>
            <span className="font-medium text-wedding-600">
              Pico: {path.max} {path.max === 1 ? 'confirmação' : 'confirmações'}
            </span>
            <span>{formatShortDate(points[points.length - 1]!.date)}</span>
          </div>
        </>
      )}
    </article>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-xl border-dashed border-wedding-200 text-center">
      <CalendarHeart className="h-6 w-6 text-wedding-300" />
      <p className="max-w-[220px] text-xs text-wedding-400">{message}</p>
    </div>
  );
}

