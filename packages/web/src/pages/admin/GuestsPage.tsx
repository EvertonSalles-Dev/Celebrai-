import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Filter,
  Link2,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useGuests, useDeleteGuest, useImportGuests } from '@/hooks/useApi';
import { guestsApi, invitationsApi } from '@/services/api';
import { usePermissions } from '@/hooks/useSession';
import { formatPhoneDisplay } from '@/lib/format';
import { ApiRequestError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import {
  EmptyState,
  ErrorState,
  SkeletonTable,
  StatusBadge,
} from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import type { Guest, GuestFilters, InvitationStatus } from '@/types';
import { GuestFormModal } from './components/GuestFormModal';

/**
 * Gerenciamento de convidados.
 *
 * Tabela com pesquisa, filtros, ordenação e paginação; ações de visualizar,
 * editar, excluir, copiar convite, enviar convite, ver QR Code e cancelar.
 * Inclui importação por CSV com prévia e exportação.
 */
export function GuestsPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const toast = useToast();
  const permissions = usePermissions();

  const [filters, setFilters] = useState<GuestFilters>({
    page: 1,
    perPage: 20,
    status: 'ALL',
    checkIn: 'ALL',
    sort: 'createdAt',
    order: 'desc',
  });
  const [searchInput, setSearchInput] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Guest | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [shareModal, setShareModal] = useState<{ guest: Guest; link?: string } | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useGuests(eventId, filters);
  const guests = data?.data ?? [];
  const meta = data?.meta;

  const deleteGuest = useDeleteGuest(eventId ?? '');

  /** Aplica a busca com um pequeno debounce manual via submit/blur. */
  const applySearch = () => {
    setFilters((current) => ({ ...current, search: searchInput, page: 1 }));
  };

  const handleStatusChange = (status: InvitationStatus | 'ALL') => {
    setFilters((current) => ({ ...current, status, page: 1 }));
  };

  const handleCheckInChange = (checkIn: 'ALL' | 'IN' | 'OUT') => {
    setFilters((current) => ({ ...current, checkIn, page: 1 }));
  };

  /** Copia/reemite o link do convite (o token antigo deixa de funcionar). */
  const handleCopyInvite = async (guest: Guest) => {
    if (!guest.invitation) {
      toast.warning('Convite não encontrado', 'Este convidado ainda não possui convite.');
      return;
    }

    try {
      const result = await invitationsApi.reissueLink(eventId as string, guest.invitation.id);
      await navigator.clipboard.writeText(result.link);
      setShareModal({ guest, link: result.link });
      toast.success('Link copiado!', 'Cole no WhatsApp ou e-mail do convidado.');
    } catch {
      toast.error('Não foi possível gerar o link', 'Tente novamente.');
    }
  };

  /** Envia o convite imediatamente usando o canal disponível. */
  const handleSendInvite = async (guest: Guest) => {
    if (!guest.invitation) return;

    const channel = guest.whatsapp ? 'WHATSAPP' : guest.email ? 'EMAIL' : 'LINK';

    try {
      const result = await invitationsApi.send(eventId as string, {
        invitationIds: [guest.invitation.id],
        channel,
      });

      const outcome = result.results[0];

      if (outcome?.status === 'SENT') {
        if (channel === 'LINK') {
          setShareModal({ guest, link: outcome.link });
        }
        toast.success('Convite enviado!', `Enviado por ${channel === 'WHATSAPP' ? 'WhatsApp' : channel === 'EMAIL' ? 'e-mail' : 'link'}.`);
      } else if (outcome?.status === 'SKIPPED') {
        setShareModal({ guest, link: outcome.link });
        toast.info(
          'Envio automático indisponível',
          outcome.error ?? 'Use o link copiado para enviar manualmente.',
        );
      } else {
        toast.error('Falha no envio', outcome?.error ?? 'Tente novamente.');
      }

      void refetch();
    } catch (error) {
      toast.error(
        'Não foi possível enviar',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      );
    }
  };

  const handleExport = async () => {
    try {
      const csv = await guestsApi.exportCsv(eventId as string, filters.status);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'convidados.csv';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Exportação concluída', 'Arquivo CSV gerado com sucesso.');
    } catch {
      toast.error('Falha na exportação', 'Tente novamente.');
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;

    deleteGuest.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Convidado excluído', `${deleteTarget.fullName} foi removido.`);
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error('Não foi possível excluir', 'Tente novamente.');
      },
    });
  };

  const totalPages = meta?.totalPages ?? 1;
  const currentPage = filters.page ?? 1;

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight text-wedding-900">Convidados</h1>
          <p className="mt-1 text-sm text-wedding-500">
            {meta ? `${meta.total} ${meta.total === 1 ? 'convidado' : 'convidados'}` : 'Carregando...'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
            Importar
          </Button>
          {permissions.canExport && (
            <Button variant="ghost" size="sm" icon={<Download className="h-4 w-4" />} onClick={handleExport}>
              Exportar
            </Button>
          )}
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditingGuest(null);
              setFormOpen(true);
            }}
          >
            Novo convidado
          </Button>
        </div>
      </header>

      {/* Filtros */}
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[240px] flex flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-wedding-400"
              aria-hidden
            />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && applySearch()}
              onBlur={applySearch}
              placeholder="Buscar por nome, e-mail ou WhatsApp..."
              className="input pl-10"
            />
          </div>

          <Select
            value={filters.status}
            onChange={(event) => handleStatusChange(event.target.value as InvitationStatus | 'ALL')}
            className="w-auto min-w-[160px]"
          >
            <option value="ALL">Todos os status</option>
            <option value="CONFIRMED">Confirmados</option>
            <option value="PENDING">Pendentes</option>
            <option value="DECLINED">Recusados</option>
            <option value="CHECKED_IN">Já entraram</option>
            <option value="CANCELLED">Cancelados</option>
          </Select>

          <Select
            value={filters.checkIn}
            onChange={(event) => handleCheckInChange(event.target.value as 'ALL' | 'IN' | 'OUT')}
            className="w-auto min-w-[150px]"
          >
            <option value="ALL">Check-in: todos</option>
            <option value="IN">Já entraram</option>
            <option value="OUT">Não entraram</option>
          </Select>

          <Select
            value={`${filters.sort}-${filters.order}`}
            onChange={(event) => {
              const [sort, order] = event.target.value.split('-') as [
                'name' | 'createdAt',
                'asc' | 'desc',
              ];
              setFilters((current) => ({ ...current, sort, order, page: 1 }));
            }}
            className="w-auto min-w-[170px]"
          >
            <option value="createdAt-desc">Mais recentes</option>
            <option value="createdAt-asc">Mais antigos</option>
            <option value="name-asc">Nome (A-Z)</option>
            <option value="name-desc">Nome (Z-A)</option>
          </Select>
        </div>
      </div>

      {/* Tabela */}
      {isLoading && <SkeletonTable rows={8} />}

      {error && (
        <ErrorState
          title="Não foi possível carregar os convidados"
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !error && guests.length === 0 && (
        <div className="card">
          <EmptyState
            icon={Users}
            title="Nenhum convidado encontrado"
            description={
              filters.search || filters.status !== 'ALL'
                ? 'Ajuste os filtros para ver mais resultados.'
                : 'Cadastre convidados manualmente ou importe uma lista em CSV.'
            }
            action={
              <div className="flex gap-2">
                <Button
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    setEditingGuest(null);
                    setFormOpen(true);
                  }}
                >
                  Adicionar convidado
                </Button>
                <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
                  Importar CSV
                </Button>
              </div>
            }
          />
        </div>
      )}

      {!isLoading && !error && guests.length > 0 && (
        <>
          <div className={`table-wrapper transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>WhatsApp</th>
                  <th>E-mail</th>
                  <th className="text-center">Limite</th>
                  <th>Status</th>
                  <th className="text-center">Check-in</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((guest) => (
                  <tr key={guest.id}>
                    <td>
                      <p className="font-medium text-wedding-900">{guest.fullName}</p>
                      {guest.party && (
                        <p className="text-xs text-wedding-400">{guest.party.name}</p>
                      )}
                      {guest.invitation?.response && (
                        <p className="text-xs text-wedding-400">
                          {guest.invitation.response.attendingCount} confirmado(s)
                          {guest.invitation.response.cpfMasked
                            ? ` · CPF ${guest.invitation.response.cpfMasked}`
                            : ''}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{formatPhoneDisplay(guest.whatsapp)}</td>
                    <td className="max-w-[200px] truncate">{guest.email ?? '—'}</td>
                    <td className="text-center tabular-nums">{guest.allowedCompanions}</td>
                    <td>
                      <StatusBadge status={guest.invitation?.status ?? 'SEM_CONVITE'} />
                    </td>
                    <td className="text-center">
                      {guest.invitation?.checkInCount ? (
                        <CheckCircle2 className="mx-auto h-4 w-4 text-success-600" />
                      ) : (
                        <span className="text-xs text-wedding-300">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {guest.invitation && (
                          <>
                            <ActionButton
                              title="Copiar convite"
                              icon={<Copy className="h-3.5 w-3.5" />}
                              onClick={() => void handleCopyInvite(guest)}
                            />
                            <ActionButton
                              title="Enviar convite"
                              icon={<Send className="h-3.5 w-3.5" />}
                              onClick={() => void handleSendInvite(guest)}
                            />
                            {(guest.invitation.status === 'CONFIRMED' ||
                              guest.invitation.status === 'CHECKED_IN') && (
                                <Link
                                  to={`/eventos/${eventId}/convites`}
                                  title="Ver QR Code"
                                  className="rounded-lg p-1.5 text-wedding-400 transition-colors hover:bg-wedding-100 hover:text-wedding-700"
                                >
                                  <Link2 className="h-3.5 w-3.5" />
                                </Link>
                              )}
                          </>
                        )}
                        <ActionButton
                          title="Editar"
                          icon={<Pencil className="h-3.5 w-3.5" />}
                          onClick={() => {
                            setEditingGuest(guest);
                            setFormOpen(true);
                          }}
                        />
                        {permissions.canManageEvent && (
                          <ActionButton
                            title="Excluir"
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            danger
                            onClick={() => setDeleteTarget(guest)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-wedding-500">
                Página {currentPage} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setFilters((current) => ({ ...current, page: currentPage - 1 }))}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setFilters((current) => ({ ...current, page: currentPage + 1 }))}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modais */}
      <GuestFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingGuest(null);
        }}
        eventId={eventId as string}
        guest={editingGuest}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Excluir convidado"
        description={`Esta ação remove ${deleteTarget?.fullName} e o convite associado. Não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        loading={deleteGuest.isPending}
      />

      <ImportGuestsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        eventId={eventId as string}
        onImported={() => void refetch()}
      />

      <Modal
        open={Boolean(shareModal)}
        onClose={() => setShareModal(null)}
        title="Convite pronto para enviar"
        description={`Compartilhe o link pessoal de ${shareModal?.guest.fullName}.`}
        size="md"
        footer={
          <Button variant="secondary" onClick={() => setShareModal(null)}>
            Fechar
          </Button>
        }
      >
        {shareModal?.link && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-xl border-warning-200 bg-warning-50 p-3.5 text-sm text-warning-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Este link é exclusivo e já está copiado. Ao gerar um novo link, o anterior deixa de
                funcionar.
              </span>
            </div>

            <div className="rounded-xl border-wedding-200 bg-wedding-50 p-3.5">
              <p className="break-all font-mono text-xs text-wedding-700">{shareModal.link}</p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                icon={<Copy className="h-4 w-4" />}
                onClick={async () => {
                  await navigator.clipboard.writeText(shareModal.link as string);
                  toast.success('Link copiado!');
                }}
              >
                Copiar novamente
              </Button>

              {shareModal.guest.whatsapp && (
                <a
                  href={`https://wa.me/${shareModal.guest.whatsapp.replace('+', '')}?text=${encodeURIComponent(
                    `Olá! Segue o link do seu convite: ${shareModal.link}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  <Send className="h-4 w-4" />
                  Abrir WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ActionButton({
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
      className={`rounded-lg p-1.5 transition-colors ${danger
        ? 'text-wedding-400 hover:bg-danger-50 hover:text-danger-600'
        : 'text-wedding-400 hover:bg-wedding-100 hover:text-wedding-700'
        }`}
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Modal de importação
// ---------------------------------------------------------------------------

function ImportGuestsModal({
  open,
  onClose,
  eventId,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  onImported: () => void;
}) {
  const toast = useToast();
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<import('@/types').ImportResult | null>(null);
  const importGuests = useImportGuests(eventId);

  /** Converte o CSV colado em linhas normalizadas. */
  const parseCsv = (text: string): Array<Record<string, unknown>> => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) return [];

    // Detecta e ignora o cabeçalho.
    const first = lines[0]!.toLowerCase();
    const hasHeader = first.includes('nome') || first.includes('name');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines.map((line) => {
      const columns = line.split(/[,;\t]/).map((value) => value.trim().replace(/^"|"$/g, ''));
      return {
        fullName: columns[0] ?? '',
        email: columns[1] ?? '',
        whatsapp: columns[2] ?? '',
        allowedCompanions: columns[3] ?? '1',
        partyName: columns[4] ?? '',
      };
    });
  };

  const handlePreview = () => {
    const rows = parseCsv(csv);

    if (rows.length === 0) {
      toast.warning('Nenhuma linha encontrada', 'Cole os dados no formato nome,email,whatsapp,quantidade.');
      return;
    }

    importGuests.mutate(
      { rows, dryRun: true },
      {
        onSuccess: (data) => setResult(data),
        onError: () => toast.error('Não foi possível validar', 'Confira o formato dos dados.'),
      },
    );
  };

  const handleConfirm = () => {
    const rows = parseCsv(csv);

    importGuests.mutate(
      { rows, dryRun: false },
      {
        onSuccess: (data) => {
          toast.success(
            'Importação concluída!',
            `${data.imported} convidado(s) adicionado(s), com convites gerados automaticamente.`,
          );
          setResult(null);
          setCsv('');
          onImported();
          onClose();
        },
        onError: (error) =>
          toast.error(
            'Falha na importação',
            error instanceof ApiRequestError ? error.message : 'Tente novamente.',
          ),
      },
    );
  };

  const reset = () => {
    setCsv('');
    setResult(null);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Importar convidados"
      description="Cole uma lista em CSV. O sistema valida tudo antes de gravar."
      size="lg"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancelar
          </Button>

          {result ? (
            <Button
              variant="success"
              icon={<CheckCircle2 className="h-4 w-4" />}
              onClick={handleConfirm}
              loading={importGuests.isPending}
              disabled={result.summary.valid === 0}
            >
              Importar {result.summary.valid - result.summary.duplicates > 0
                ? result.summary.valid - result.summary.duplicates
                : result.summary.valid}{' '}
              convidado(s)
            </Button>
          ) : (
            <Button icon={<Filter className="h-4 w-4" />} onClick={handlePreview} loading={importGuests.isPending}>
              Validar lista
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* Modelo */}
        <div className="rounded-xl border-wedding-200 bg-wedding-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-wedding-500">
            Formato esperado
          </p>
          <pre className="mt-2 overflow-x-auto font-mono text-xs leading-relaxed text-wedding-700">
            {`nome,email,whatsapp,quantidade_permitida
João da Silva,joao@email.com,21999999,2
Maria Souza,maria@email.com,21988888,1`}
          </pre>
          <p className="mt-2 text-xs text-wedding-400">
            Uma linha por convidado. O cabeçalho é opcional.
          </p>
        </div>

        {/* Entrada */}
        {!result && (
          <div>
            <label htmlFor="csv-input" className="label">
              Cole os dados aqui
            </label>
            <textarea
              id="csv-input"
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              rows={8}
              placeholder="nome,email,whatsapp,quantidade_permitida"
              className="input min-h-[180px] font-mono text-xs"
            />
          </div>
        )}

        {/* Prévia */}
        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <SummaryBox label="Total" value={result.summary.total} />
              <SummaryBox label="Válidos" value={result.summary.valid} tone="success" />
              <SummaryBox label="Com erro" value={result.summary.invalid} tone="danger" />
              <SummaryBox label="Duplicados" value={result.summary.duplicates} tone="warning" />
            </div>

            <div className="table-wrapper max-h-72 overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th className="text-center">Qtd</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((row) => (
                    <tr key={row.line}>
                      <td className="text-xs text-wedding-400">{row.line}</td>
                      <td className="font-medium">{row.fullName || '—'}</td>
                      <td className="text-xs">{row.email || '—'}</td>
                      <td className="text-center tabular-nums">{row.allowedCompanions}</td>
                      <td>
                        {row.errors.length > 0 ? (
                          <span className="badge-danger">{row.errors[0]}</span>
                        ) : row.warning ? (
                          <span className="badge-warning">{row.warning}</span>
                        ) : (
                          <span className="badge-success">Pronto</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-wedding-400">
              Linhas com erro ou duplicadas serão ignoradas. A importação gera um convite individual
              para cada convidado.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SummaryBox({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'danger' | 'warning';
}) {
  const toneClass = {
    neutral: 'text-wedding-900',
    success: 'text-success-600',
    danger: 'text-danger-600',
    warning: 'text-warning-600',
  }[tone];

  return (
    <div className="rounded-xl border-wedding-100 bg-white p-3 text-center">
      <p className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-wedding-400">{label}</p>
    </div>
  );
}

