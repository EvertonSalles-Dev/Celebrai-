import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarHeart,
  CheckCircle2,
  Clock,
  DoorOpen,
  HelpCircle,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { useCheckInEvents, useCheckInStats, useValidateCheckIn } from '@/hooks/useApi';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useFeedbackSound } from '@/hooks/useFeedbackSound';
import { checkInApi } from '@/services/api';
import { CHECKIN_RESULT_TIMEOUT } from '@/config/app';
import { formatShortDate, formatTime, plural } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { QrScanner } from '@/components/ui/QrScanner';
import { LoadingState, EmptyState } from '@/components/ui/States';
import { cn } from '@/components/ui/utils';
import { useToast } from '@/components/ui/Toast';
import type { CheckInResult } from '@/types';

/**
 * Tela do scanner — coração do controle de entrada.
 *
 * Experiência desenhada para uso real na portaria:
 *  - scanner ocupa a maior parte da tela;
 *  - resultado em tela cheia com cor (verde/vermelho/amarelo),
 *    confirmando visualmente o veredito em segundos;
 *  - feedback sonoro opcional;
 *  - busca manual por nome quando o convidado não tem o QR Code;
 *  - autorização manual (somente admin) para liberar entradas duplicadas,
 *    com motivo obrigatório e registro em auditoria.
 */
export function CheckInScannerPage() {
  const { eventId: routeEventId } = useParams<{ eventId?: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const isOnline = useOnlineStatus();
  const { playSuccess, playError, playWarning } = useFeedbackSound();

  const { data: events, isLoading: loadingEvents } = useCheckInEvents();

  // Se o evento não veio pela rota, usa o primeiro disponível.
  const eventId = routeEventId ?? events?.[0]?.id;
  const event = useMemo(
    () => events?.find((item) => item.id === eventId) ?? events?.[0],
    [events, eventId],
  );

  const [result, setResult] = useState<CheckInResult | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [lastCode, setLastCode] = useState<string>('');

  const { data: stats } = useCheckInStats(eventId);
  const validate = useValidateCheckIn(eventId ?? '');

  // A câmera pausa enquanto o resultado está visível e volta sozinha.
  const scannerPaused = Boolean(result) || validate.isPending || !isOnline;

  const handleScan = useCallback(
    (code: string) => {
      if (!eventId || !isOnline) return;
      setLastCode(code);

      validate.mutate(
        { code, operatorLabel: undefined },
        {
          onSuccess: (data) => {
            setResult(data);

            if (data.outcome === 'AUTHORIZED') playSuccess();
            else if (data.outcome === 'ALREADY_USED') playWarning();
            else playError();
          },
          onError: () => {
            toast.error('Falha na validação', 'Não foi possível consultar o servidor. Tente novamente.');
          },
        },
      );
    },
    [eventId, isOnline, playError, playSuccess, playWarning, toast, validate],
  );

  // Limpa o resultado após alguns segundos e retoma o scanner.
  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => setResult(null), CHECKIN_RESULT_TIMEOUT);
    return () => window.clearTimeout(timer);
  }, [result]);

  const handleManualOverride = () => {
    if (!lastCode) return;

    validate.mutate(
      { code: lastCode, manualOverride: true, overrideReason },
      {
        onSuccess: (data) => {
          setOverrideOpen(false);
          setOverrideReason('');
          setResult(data);
          if (data.outcome === 'AUTHORIZED') playSuccess();
        },
        onError: () => {
          toast.error('Não foi possível autorizar', 'Verifique sua permissão e tente novamente.');
        },
      },
    );
  };

  // -------------------------------------------------------------------------
  // Estados de carregamento / erro de configuração
  // -------------------------------------------------------------------------

  if (loadingEvents) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-wedding-50">
        <LoadingState label="Preparando o scanner..." />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-wedding-50 px-5">
        <EmptyState
          icon={CalendarHeart}
          title="Nenhum evento selecionado"
          description="Escolha um evento para iniciar o controle de entrada."
          action={
            <Link to="/check-in" className="btn-primary">
              Escolher evento
            </Link>
          }
        />
      </div>
    );
  }

  const isOverrideVisible = result?.outcome === 'ALREADY_USED' && result.canOverride;

  return (
    <div className="flex min-h-screen flex-col bg-wedding-50">
      {/* ---------------------------------------------------------------- */}
      {/* Barra superior: contadores rápidos                                */}
      {/* ---------------------------------------------------------------- */}
      <header className="safe-top sticky top-0 z-20 border-b border-wedding-100 bg-white">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/check-in')}
            aria-label="Voltar"
            className="rounded-lg p-2 text-wedding-500 transition-colors hover:bg-wedding-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex flex-1">
            <p className="truncate text-sm font-semibold text-wedding-900">
              {event.hostsName ?? event.title}
            </p>
            <p className="text-xs text-wedding-400">{formatShortDate(event.eventDate)}</p>
          </div>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar convidado por nome"
            className="rounded-lg p-2 text-wedding-500 transition-colors hover:bg-wedding-100"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>

        {/* Contadores em tempo real */}
        {stats && (
          <div className="mx-auto grid max-w-lg grid-cols-3 divide-x divide-wedding-100 border-t border-wedding-100 text-center">
            <Counter label="Entradas" value={stats.entriesCount} />
            <Counter label="Pessoas" value={stats.peopleInside} />
            <Counter label="Esperados" value={stats.expectedPeople} />
          </div>
        )}
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Área do scanner                                                   */}
      {/* ---------------------------------------------------------------- */}
      <main className="mx-auto w-full max-w-lg flex flex-1 px-4 py-5">
        {!isOnline ? (
          <div className="card flex flex-col items-center gap-3 p-8 text-center">
            <div className="rounded-2xl bg-warning-100 p-3.5 text-warning-600">
              <WifiOff className="h-8 w-8" />
            </div>
            <p className="text-base font-semibold text-wedding-900">Sem conexão</p>
            <p className="text-sm text-wedding-500">
              A validação do QR Code acontece no servidor e não pode ser feita offline. Reconecte
              para continuar os check-ins.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-wedding-700">Aponte a câmera para o QR Code</p>
              {validate.isPending && (
                <span className="flex items-center gap-1.5 text-xs text-wedding-400">
                  <Clock className="h-3.5 w-3.5 animate-spin" />
                  Validando...
                </span>
              )}
            </div>

            <QrScanner onScan={handleScan} paused={scannerPaused} />

            {/* Últimas entradas */}
            {stats && stats.lastCheckIns.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-wedding-400">
                  Últimas entradas
                </h2>
                <ul className="space-y-2">
                  {stats.lastCheckIns.slice(0, 4).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between rounded-xl border-wedding-100 bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-wedding-800">{entry.guestName}</p>
                        <p className="text-xs text-wedding-400">
                          {entry.atLabel} · {entry.peopleCount}{' '}
                          {plural(entry.peopleCount, 'pessoa', 'pessoas')}
                          {entry.method === 'MANUAL' ? ' · manual' : ''}
                        </p>
                      </div>
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success-500" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      {/* ---------------------------------------------------------------- */}
      {/* Resultado em tela cheia                                          */}
      {/* ---------------------------------------------------------------- */}
      {result && (
        <CheckInResultOverlay
          result={result}
          onClose={() => setResult(null)}
          onOverride={isOverrideVisible ? () => setOverrideOpen(true) : undefined}
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Modal de autorização manual                                      */}
      {/* ---------------------------------------------------------------- */}
      <Modal
        open={overrideOpen}
        onClose={() => {
          setOverrideOpen(false);
          setOverrideReason('');
        }}
        title="Autorizar entrada manualmente"
        description="Esta ação fica registrada na auditoria com seu nome e o motivo informado."
        size="sm"
        danger
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOverrideOpen(false);
                setOverrideReason('');
              }}
              disabled={validate.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              icon={<ShieldAlert className="h-4 w-4" />}
              onClick={handleManualOverride}
              loading={validate.isPending}
              disabled={overrideReason.trim().length < 3}
            >
              Autorizar entrada
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl border-warning-200 bg-warning-50 p-3.5 text-sm text-warning-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Este convite já foi utilizado em {result?.previousCheckIn?.atLabel}. Use a liberação
              manual apenas quando tiver certeza de que se trata da mesma pessoa.
            </span>
          </div>

          <div>
            <label htmlFor="override-reason" className="label">
              Motivo da liberação
              <span className="ml-0.5 text-danger-500">*</span>
            </label>
            <textarea
              id="override-reason"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              rows={3}
              required
              placeholder="Ex.: Convidado apresentou documento de identidade e confirmou que perdeu o celular."
              className="input min-h-[88px] resize-y"
            />
            <p className="helper">Mínimo de 3 caracteres. Ficará visível na trilha de auditoria.</p>
          </div>
        </div>
      </Modal>

      {/* ---------------------------------------------------------------- */}
      {/* Busca manual por nome                                            */}
      {/* ---------------------------------------------------------------- */}
      <SearchGuestModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        eventId={eventId ?? ''}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overlay de resultado
// ---------------------------------------------------------------------------

const TONE_STYLE = {
  success: {
    wrapper: 'bg-success-600',
    icon: CheckCircle2,
    title: 'ENTRADA AUTORIZADA',
  },
  danger: {
    wrapper: 'bg-danger-600',
    icon: XCircle,
    title: 'ENTRADA NÃO AUTORIZADA',
  },
  warning: {
    wrapper: 'bg-warning-500',
    icon: AlertTriangle,
    title: 'ATENÇÃO',
  },
} as const;

function CheckInResultOverlay({
  result,
  onClose,
  onOverride,
}: {
  result: CheckInResult;
  onClose: () => void;
  onOverride?: () => void;
}) {
  const tone = TONE_STYLE[result.tone];
  const Icon = tone.icon;

  const outcomeTitle: Record<string, string> = {
    INVALID: 'QR CODE INVÁLIDO',
    WRONG_EVENT: 'CONVITE DE OUTRO EVENTO',
    CANCELLED: 'CONVITE CANCELADO',
    NOT_CONFIRMED: 'PRESENÇA NÃO CONFIRMADA',
    ALREADY_USED: 'CONVITE JÁ UTILIZADO',
  };

  const title = outcomeTitle[result.outcome] ?? tone.title;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className={cn(
        'animate-fade-in fixed inset-0 z-50 flex-col text-white',
        tone.wrapper,
      )}
    >
      <div className="safe-top flex justify-end p-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar resultado"
          className="rounded-full bg-white/20 p-2 transition-colors hover:bg-white/30"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 text-center">
        <Icon className="h-20 w-20 shrink-0 drop-shadow" aria-hidden />

        <h2 className="mt-6 text-2xl font-bold tracking-tight">{title}</h2>

        <p className="mt-3 max-w-sm text-sm text-white/90">{result.message}</p>

        {/* Dados do convidado */}
        {result.guest && (
          <div className="mt-8 w-full max-w-sm rounded-3xl bg-white/15 p-5 backdrop-blur-sm">
            <p className="flex items-center justify-center gap-2 text-lg font-semibold">
              <Users className="h-4 w-4" />
              {result.guest.name}
            </p>

            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Autorizados">
                {result.guest.allowedCompanions}{' '}
                {plural(result.guest.allowedCompanions, 'pessoa', 'pessoas')}
              </Row>

              {result.guest.attendingCount !== null && (
                <Row label="Confirmados">
                  {result.guest.attendingCount}{' '}
                  {plural(result.guest.attendingCount, 'pessoa', 'pessoas')}
                </Row>
              )}

              {result.event && <Row label="Evento">{result.event.title}</Row>}

              {result.checkIn && (
                <>
                  <Row label="Horário de entrada">{result.checkIn.timeLabel}</Row>
                  {result.checkIn.method === 'MANUAL' && <Row label="Liberação">Manual</Row>}
                </>
              )}
            </dl>

            {/* Acompanhantes nomeados */}
            {result.guest.companions.length > 0 && (
              <div className="mt-4 border-t border-white/20 pt-3 text-left">
                <p className="text-[11px] uppercase tracking-wider text-white/70">Acompanhantes</p>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {result.guest.companions.map((companion, index) => (
                    <li key={`${companion.name}-${index}`} className="flex items-center gap-2">
                      <UserCheck className="h-3.5 w-3.5 shrink-0 opacity-80" />
                      {companion.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Entrada anterior (duplicidade) */}
        {result.previousCheckIn && (
          <div className="mt-5 w-full max-w-sm rounded-2xl bg-white/15 p-4 text-sm backdrop-blur-sm">
            <p className="flex items-center justify-center gap-2 font-medium">
              <Clock className="h-4 w-4" />
              Entrada registrada anteriormente
            </p>
            <p className="mt-1.5 text-white/90">
              {result.previousCheckIn.atLabel}
              {result.previousCheckIn.operatorLabel
                ? ` · ${result.previousCheckIn.operatorLabel}`
                : ''}
            </p>
            <p className="mt-2 text-xs text-white/75">
              Não é permitida uma segunda entrada automática.
            </p>
          </div>
        )}

        {/* Ações */}
        <div className="mt-8 flex w-full max-w-sm flex-col gap-2.5">
          {onOverride && (
            <button
              type="button"
              onClick={onOverride}
              className="btn-touch flex w-full items-center justify-center gap-2 bg-white font-semibold text-warning-700 transition-transform active:scale-[0.98]"
            >
              <ShieldAlert className="h-5 w-5" />
              Autorizar manualmente
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="btn-touch w-full bg-white/20 font-semibold text-white transition-colors hover:bg-white/30"
          >
            {result.tone === 'success' ? 'Escanear próximo' : 'Fechar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-white/70">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-2">
      <p className="text-lg font-semibold tabular-nums text-wedding-900">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-wedding-400">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Busca manual por nome
// ---------------------------------------------------------------------------

function SearchGuestModal({
  open,
  onClose,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<
    Array<{
      id: string;
      name: string;
      allowedCompanions: number;
      status: string;
      attendingCount: number | null;
      checkedInAt: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!term || term.trim().length < 3) {
      setResults([]);
      setSearched(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await checkInApi.search(eventId, term.trim());
        setResults(data);
        setSearched(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [term, eventId]);

  const statusLabel: Record<string, string> = {
    PENDING: 'Não confirmou',
    CONFIRMED: 'Confirmado',
    DECLINED: 'Recusou',
    CHECKED_IN: 'Já entrou',
    CANCELLED: 'Cancelado',
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Buscar convidado"
      description="Use quando o convidado não tiver o QR Code em mãos."
      size="md"
    >
      <div className="space-y-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-wedding-400"
            aria-hidden
          />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Digite o nome do convidado..."
            className="input pl-10"
            autoFocus
            autoComplete="off"
          />
        </div>

        {loading && (
          <p className="flex items-center gap-2 py-3 text-sm text-wedding-400">
            <Clock className="h-3.5 w-3.5 animate-spin" />
            Buscando...
          </p>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <HelpCircle className="h-6 w-6 text-wedding-300" />
            <p className="text-sm text-wedding-500">Nenhum convidado encontrado com esse nome.</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {results.map((guest) => (
              <li key={guest.id}>
                <div className="flex items-center justify-between gap-3 rounded-xl border-wedding-100 bg-white p-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-wedding-900">{guest.name}</p>
                    <p className="mt-0.5 text-xs text-wedding-500">
                      {statusLabel[guest.status] ?? guest.status}
                      {guest.attendingCount !== null
                        ? ` · ${guest.attendingCount} ${plural(guest.attendingCount, 'pessoa', 'pessoas')}`
                        : ` · até ${guest.allowedCompanions}`}
                    </p>
                  </div>

                  {guest.checkedInAt ? (
                    <span className="shrink-0 rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                      Entrada {formatTime(guest.checkedInAt)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-wedding-400">Sem check-in</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-start gap-2 rounded-xl border-wedding-100 bg-wedding-50 p-3.5 text-xs text-wedding-500">
          <DoorOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            A busca é apenas para localizar o convidado. A liberação da entrada continua sendo feita
            pela leitura do QR Code ou pela autorização manual, sempre registrada no servidor.
          </span>
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose} icon={<X className="h-4 w-4" />}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

