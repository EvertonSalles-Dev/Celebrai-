import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Copy,
  Eye,
  Link2,
  QrCode,
  RotateCcw,
  Send,
  Users,
} from 'lucide-react';
import {
  useInvitations,
  useCancelInvitation,
  useReopenInvitation,
  useSendInvitations,
} from '@/hooks/useApi';
import { invitationsApi } from '@/services/api';
import { usePermissions } from '@/hooks/useSession';
import { formatDateTime, plural } from '@/lib/format';
import { ApiRequestError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { QrCodeViewer } from '@/components/ui/QrCodeViewer';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SkeletonTable,
  StatusBadge,
} from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import type { AdminInvitation, InvitationStatus, QrCodePayload, SendInvitationsResult } from '@/types';

/**
 * Central de convites.
 *
 * Permite: selecionar convites e enviar por e-mail/WhatsApp/link, copiar o
 * link individual, visualizar o QR Code, cancelar e reabrir convites, além de
 * acompanhar o status de envio.
 */
export function InvitationsPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const toast = useToast();
  const permissions = usePermissions();

  const [statusFilter, setStatusFilter] = useState<InvitationStatus | 'ALL'>('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [channel, setChannel] = useState<'EMAIL' | 'WHATSAPP' | 'LINK'>('LINK');
  const [sendResult, setSendResult] = useState<SendInvitationsResult | null>(null);
  const [qrTarget, setQrTarget] = useState<AdminInvitation | null>(null);
  const [qrData, setQrData] = useState<QrCodePayload | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<AdminInvitation | null>(null);
  const [shareTarget, setShareTarget] = useState<{ name: string; link: string } | null>(null);

  const { data: invitations, isLoading, error, refetch } = useInvitations(eventId, {
    status: statusFilter === 'ALL' ? undefined : statusFilter,
  });

  const send = useSendInvitations(eventId ?? '');
  const cancel = useCancelInvitation(eventId ?? '');
  const reopen = useReopenInvitation(eventId ?? '');

  const list = invitations ?? [];

  const filtered = useMemo(
    () =>
      statusFilter === 'ALL'
        ? list
        : list.filter((invitation) => invitation.status === statusFilter),
    [list, statusFilter],
  );

  const toggleSelection = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) =>
      current.size === filtered.length ? new Set() : new Set(filtered.map((item) => item.id)),
    );
  };

  const handleSend = () => {
    if (selected.size === 0) return;

    send.mutate(
      { invitationIds: [...selected], channel },
      {
        onSuccess: (data) => {
          setSendResult(data);
          setSelected(new Set());

          if (data.summary.sent > 0) {
            toast.success(
              `${data.summary.sent} convite(s) enviado(s)`,
              data.summary.skipped > 0
                ? `${data.summary.skipped} precisam de envio manual.`
                : undefined,
            );
          } else {
            toast.warning(
              'Nenhum envio automático realizado',
              'Configure e-mail ou WhatsApp, ou copie os links.',
            );
          }

          void refetch();
        },
        onError: (error) =>
          toast.error(
            'Falha no envio',
            error instanceof ApiRequestError ? error.message : 'Tente novamente.',
          ),
      },
    );
  };

  const handleCopyLink = async (invitation: AdminInvitation) => {
    try {
      const result = await invitationsApi.reissueLink(eventId as string, invitation.id);
      await navigator.clipboard.writeText(result.link);
      setShareTarget({ name: invitation.guest.fullName, link: result.link });
      toast.success('Link copiado!');
    } catch {
      toast.error('Não foi possível gerar o link', 'Tente novamente.');
    }
  };

  const handleViewQr = async (invitation: AdminInvitation) => {
    setQrTarget(invitation);
    setQrData(null);

    if (invitation.status !== 'CONFIRMED' && invitation.status !== 'CHECKED_IN') {
      return;
    }

    setLoadingQr(true);
    try {
      const data = await invitationsApi.issueQrCode(eventId as string, invitation.id);
      setQrData(data);
    } catch (error) {
      toast.error(
        'Não foi possível emitir o QR Code',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      );
    } finally {
      setLoadingQr(false);
    }
  };

  const confirmCancel = () => {
    if (!cancelTarget) return;

    cancel.mutate(
      { id: cancelTarget.id, reason: 'Cancelado pelo administrador' },
      {
        onSuccess: () => {
          toast.success('Convite cancelado', `${cancelTarget.guest.fullName} não poderá entrar.`);
          setCancelTarget(null);
        },
        onError: () => toast.error('Não foi possível cancelar'),
      },
    );
  };

  const handleReopen = (invitation: AdminInvitation) => {
    reopen.mutate(invitation.id, {
      onSuccess: () => toast.success('Convite reaberto', 'O convidado pode responder novamente.'),
      onError: () => toast.error('Não foi possível reabrir'),
    });
  };

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const sendableCount = [...selected].length;

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight text-wedding-900">Convites</h1>
          <p className="mt-1 text-sm text-wedding-500">
            {list.length} {plural(list.length, 'convite', 'convites')} · envie e acompanhe as
            respostas
          </p>
        </div>

        <div className="flex gap-2">
          <Link to={`/eventos/${eventId}/convidados`} className="btn-secondary">
            <Users className="h-4 w-4" />
            Convidados
          </Link>
          {permissions.canManageEvent && (
            <Button
              icon={<Send className="h-4 w-4" />}
              onClick={() => {
                setSendResult(null);
                setSendOpen(true);
              }}
              disabled={sendableCount === 0}
            >
              Enviar {sendableCount > 0 ? `(${sendableCount})` : ''}
            </Button>
          )}
        </div>
      </header>

      {/* Filtros por status */}
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ['ALL', 'Todos'],
            ['PENDING', 'Pendentes'],
            ['CONFIRMED', 'Confirmados'],
            ['CHECKED_IN', 'Já entraram'],
            ['DECLINED', 'Recusados'],
            ['CANCELLED', 'Cancelados'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setStatusFilter(value);
              setSelected(new Set());
            }}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === value
                ? 'bg-wedding-900 text-white'
                : 'bg-white text-wedding-600 hover:bg-wedding-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <SkeletonTable rows={8} />}

      {error && <ErrorState title="Não foi possível carregar os convites" onRetry={() => void refetch()} />}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="card">
          <EmptyState
            icon={QrCode}
            title="Nenhum convite neste filtro"
            description="Ajuste o filtro ou cadastre convidados para gerar convites."
          />
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                {permissions.canManageEvent && (
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Selecionar todos"
                      className="h-4 w-4 rounded border-wedding-300 text-wedding-900"
                    />
                  </th>
                )}
                <th>Convidado</th>
                <th className="text-center">Pessoas</th>
                <th>Status</th>
                <th>Envio</th>
                <th>Resposta</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((invitation) => (
                <tr key={invitation.id}>
                  {permissions.canManageEvent && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(invitation.id)}
                        onChange={() => toggleSelection(invitation.id)}
                        aria-label={`Selecionar ${invitation.guest.fullName}`}
                        className="h-4 w-4 rounded border-wedding-300 text-wedding-900"
                        disabled={invitation.status === 'CANCELLED'}
                      />
                    </td>
                  )}

                  <td>
                    <p className="font-medium text-wedding-900">{invitation.guest.fullName}</p>
                    <p className="text-xs text-wedding-400">
                      {invitation.guest.whatsapp ?? invitation.guest.email ?? 'sem contato'}
                    </p>
                  </td>

                  <td className="text-center tabular-nums">
                    <span className="text-wedding-500">
                      {invitation.response?.attendingCount ?? '—'} / {invitation.guest.allowedCompanions}
                    </span>
                  </td>

                  <td>
                    <StatusBadge status={invitation.status} />
                  </td>

                  <td className="text-xs text-wedding-500">
                    {invitation.sentAt ? (
                      <>
                        {invitation.sentVia ?? 'enviado'}
                        <span className="block text-wedding-400">
                          {formatDateTime(invitation.sentAt)}
                        </span>
                      </>
                    ) : (
                      <span className="text-wedding-300">não enviado</span>
                    )}
                  </td>

                  <td className="text-xs text-wedding-500">
                    {invitation.respondedAt ? formatDateTime(invitation.respondedAt) : '—'}
                  </td>

                  <td>
                    <div className="flex justify-end gap-1">
                      <RowAction
                        title="Copiar link do convite"
                        icon={<Copy className="h-3.5 w-3.5" />}
                        onClick={() => void handleCopyLink(invitation)}
                      />

                      <RowAction
                        title="Visualizar QR Code"
                        icon={<Eye className="h-3.5 w-3.5" />}
                        onClick={() => void handleViewQr(invitation)}
                      />

                      {permissions.canManageEvent && invitation.status === 'CANCELLED' && (
                        <RowAction
                          title="Reabrir convite"
                          icon={<RotateCcw className="h-3.5 w-3.5" />}
                          onClick={() => handleReopen(invitation)}
                        />
                      )}

                      {permissions.canManageEvent &&
                        invitation.status !== 'CANCELLED' &&
                        invitation.status !== 'CHECKED_IN' && (
                          <RowAction
                            title="Cancelar convite"
                            icon={<Ban className="h-3.5 w-3.5" />}
                            danger
                            onClick={() => setCancelTarget(invitation)}
                          />
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Modal de envio                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={sendOpen}
        onClose={() => {
          setSendOpen(false);
          setSendResult(null);
        }}
        title={sendResult ? 'Resultado do envio' : 'Enviar convites'}
        description={
          sendResult
            ? 'Resumo do que foi enviado automaticamente.'
            : `${sendableCount} convite(s) selecionado(s). Escolha o canal de envio.`
        }
        size="md"
        footer={
          sendResult ? (
            <Button
              variant="secondary"
              onClick={() => {
                setSendOpen(false);
                setSendResult(null);
              }}
            >
              Fechar
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => setSendOpen(false)}
                disabled={send.isPending}
              >
                Cancelar
              </Button>
              <Button
                icon={<Send className="h-4 w-4" />}
                onClick={handleSend}
                loading={send.isPending}
              >
                Enviar agora
              </Button>
            </>
          )
        }
      >
        {sendResult ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <ResultBox label="Enviados" value={sendResult.summary.sent} tone="success" />
              <ResultBox label="Manuais" value={sendResult.summary.skipped} tone="warning" />
              <ResultBox label="Falhas" value={sendResult.summary.failed} tone="danger" />
            </div>

            {!sendResult.channels.email && !sendResult.channels.whatsapp && (
              <div className="flex items-start gap-2 rounded-xl border-warning-200 bg-warning-50 p-3.5 text-sm text-warning-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Nenhum canal automático está configurado. Os links foram gerados e você pode
                  copiá-los para enviar manualmente.
                </span>
              </div>
            )}

            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {sendResult.results.map((result) => (
                <li
                  key={result.invitationId}
                  className="flex items-center justify-between gap-3 rounded-xl border-wedding-100 bg-white p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-wedding-800">{result.guestName}</p>
                    {result.error && <p className="text-xs text-warning-600">{result.error}</p>}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {result.link && (
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(result.link);
                          toast.success('Link copiado!');
                        }}
                        className="rounded-lg p-1.5 text-wedding-400 hover:bg-wedding-100 hover:text-wedding-700"
                        title="Copiar link"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {result.status === 'SENT' ? (
                      <CheckCircle2 className="h-4 w-4 text-success-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-warning-500" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            {(
              [
                {
                  value: 'WHATSAPP' as const,
                  label: 'WhatsApp',
                  description: 'Envio pela API oficial do WhatsApp Business',
                },
                {
                  value: 'EMAIL' as const,
                  label: 'E-mail',
                  description: 'Convite elegante em HTML, com botão "Ver meu convite"',
                },
                {
                  value: 'LINK' as const,
                  label: 'Somente gerar links',
                  description: 'Você copia e envia manualmente por qualquer canal',
                },
              ]
            ).map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  channel === option.value
                    ? 'border-wedding-900 bg-wedding-50'
                    : 'border-wedding-200 hover:bg-wedding-50'
                }`}
              >
                <input
                  type="radio"
                  name="channel"
                  value={option.value}
                  checked={channel === option.value}
                  onChange={() => setChannel(option.value)}
                  className="mt-0.5 h-4 w-4 border-wedding-300 text-wedding-900"
                />
                <div>
                  <p className="text-sm font-medium text-wedding-900">{option.label}</p>
                  <p className="mt-0.5 text-xs text-wedding-500">{option.description}</p>
                </div>
              </label>
            ))}

            <p className="rounded-xl bg-wedding-50 p-3.5 text-xs leading-relaxed text-wedding-500">
              Cada envio gera um novo link individual: o link anterior deixa de funcionar, garantindo
              que apenas o convidado tenha acesso ao próprio convite.
            </p>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Modal do QR Code                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={Boolean(qrTarget)}
        onClose={() => {
          setQrTarget(null);
          setQrData(null);
        }}
        title="QR Code do convidado"
        description={qrTarget?.guest.fullName}
        size="md"
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setQrTarget(null);
              setQrData(null);
            }}
          >
            Fechar
          </Button>
        }
      >
        {loadingQr && <LoadingState label="Emitindo QR Code..." />}

        {!loadingQr && qrData?.code && (
          <div className="space-y-4">
            <QrCodeViewer
              value={qrData.code}
              guestName={qrData.guest.name}
              size={220}
              showActions
            />

            <dl className="space-y-2 rounded-xl border-wedding-100 bg-wedding-50 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-wedding-500">Autorizados</dt>
                <dd className="font-medium text-wedding-800">
                  {qrData.guest.allowedCompanions}{' '}
                  {plural(qrData.guest.allowedCompanions, 'pessoa', 'pessoas')}
                </dd>
              </div>

              {qrData.guest.attendingCount !== null && (
                <div className="flex justify-between">
                  <dt className="text-wedding-500">Confirmados</dt>
                  <dd className="font-medium text-wedding-800">
                    {qrData.guest.attendingCount}{' '}
                    {plural(qrData.guest.attendingCount, 'pessoa', 'pessoas')}
                  </dd>
                </div>
              )}

              {qrData.alreadyCheckedIn && (
                <div className="flex justify-between">
                  <dt className="text-wedding-500">Check-in</dt>
                  <dd className="font-medium text-blue-700">Já realizado</dd>
                </div>
              )}
            </dl>

            <p className="text-xs leading-relaxed text-wedding-400">
              O QR Code contém apenas um identificador seguro — nenhum dado pessoal como CPF é
              gravado nele.
            </p>
          </div>
        )}

        {!loadingQr && qrTarget && !qrData?.code && (
          <div className="flex items-start gap-2 rounded-xl border-warning-200 bg-warning-50 p-4 text-sm text-warning-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              O QR Code só é liberado após a confirmação de presença do convidado. Status atual:{' '}
              <strong>{qrTarget.status}</strong>.
            </span>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Confirmação de cancelamento                                        */}
      {/* ------------------------------------------------------------------ */}
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        title="Cancelar convite"
        description={`O convite de ${cancelTarget?.guest.fullName} será invalidado e o acesso bloqueado na portaria.`}
        confirmLabel="Cancelar convite"
        danger
        loading={cancel.isPending}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Link copiado                                                       */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={Boolean(shareTarget)}
        onClose={() => setShareTarget(null)}
        title="Link do convite gerado"
        description={shareTarget?.name}
        size="md"
        footer={
          <Button variant="secondary" onClick={() => setShareTarget(null)}>
            Fechar
          </Button>
        }
      >
        {shareTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-xl border-warning-200 bg-warning-50 p-3.5 text-sm text-warning-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Link exclusivo copiado. O link anterior deste convidado foi invalidado.</span>
            </div>

            <div className="rounded-xl border-wedding-200 bg-wedding-50 p-3.5">
              <p className="break-all font-mono text-xs text-wedding-700">{shareTarget.link}</p>
            </div>

            <Button
              variant="secondary"
              fullWidth
              icon={<Copy className="h-4 w-4" />}
              onClick={async () => {
                await navigator.clipboard.writeText(shareTarget.link);
                toast.success('Link copiado!');
              }}
            >
              Copiar novamente
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function RowAction({
  title,
  icon,
  onClick,
  danger = false,
}: {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition-colors ${
        danger
          ? 'text-wedding-400 hover:bg-danger-50 hover:text-danger-600'
          : 'text-wedding-400 hover:bg-wedding-100 hover:text-wedding-700'
      }`}
    >
      {icon}
    </button>
  );
}

function ResultBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    success: 'text-success-600',
    warning: 'text-warning-600',
    danger: 'text-danger-600',
  }[tone];

  return (
    <div className="rounded-xl border-wedding-100 bg-white p-3 text-center">
      <p className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-wedding-400">{label}</p>
    </div>
  );
}
