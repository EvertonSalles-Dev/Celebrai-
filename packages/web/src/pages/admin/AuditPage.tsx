import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Ban,
  CheckCircle2,
  DoorOpen,
  FileText,
  Filter,
  LogIn,
  LogOut,
  Send,
  ShieldAlert,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useAuditLogs } from '@/hooks/useApi';
import { useEvent } from '@/hooks/useApi';
import { formatDateTime, initials } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import type { Role } from '@/types';

/**
 * Trilha de auditoria do evento.
 *
 * Registra quem fez o quê e quando: criação/edição de convidados, envios,
 * confirmações, check-ins, liberações manuais e cancelamentos. É o registro
 * exigido pela LGPD e pela operação do evento.
 */
export function AuditPage() {
  const { id } = useParams<{ id: string }>();
  const [action, setAction] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data: event } = useEvent(id);
  const { data, isLoading, error, refetch } = useAuditLogs(id, {
    page,
    perPage: 30,
    action: action || undefined,
  });

  const logs = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <Link
          to={`/eventos/${id}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-wedding-500 transition-colors hover:text-wedding-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {event ? (event.hostsName ?? event.title) : 'Voltar'}
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-semibold tracking-tight text-wedding-900">Auditoria</h1>
            <p className="mt-1 text-sm text-wedding-500">
              Histórico completo das ações realizadas neste evento.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-wedding-400" />
            <Select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
              className="w-auto min-w-[220px]"
            >
              <option value="">Todas as ações</option>
              <option value="guest.created">Convidado criado</option>
              <option value="guest.updated">Convidado atualizado</option>
              <option value="guest.deleted">Convidado excluído</option>
              <option value="guest.imported">Importação de lista</option>
              <option value="invitation.sent">Convite enviado</option>
              <option value="invitation.cancelled">Convite cancelado</option>
              <option value="invitation.reopened">Convite reaberto</option>
              <option value="rsvp.confirmed">Presença confirmada</option>
              <option value="rsvp.declined">Presença recusada</option>
              <option value="checkin.validated">Check-in validado</option>
              <option value="checkin.denied">Check-in negado</option>
              <option value="checkin.manual_override">Entrada manual autorizada</option>
            </Select>
          </div>
        </div>
      </header>

      {isLoading && <LoadingState label="Carregando histórico..." />}

      {error && <ErrorState title="Não foi possível carregar a auditoria" onRetry={() => void refetch()} />}

      {!isLoading && !error && logs.length === 0 && (
        <div className="card">
          <EmptyState
            icon={FileText}
            title="Nenhuma ação registrada"
            description={
              action
                ? 'Nenhum registro para este filtro.'
                : 'As ações realizadas neste evento aparecerão aqui.'
            }
          />
        </div>
      )}

      {!isLoading && !error && logs.length > 0 && (
        <>
          <ol className="space-y-3">
            {logs.map((log) => {
              const config = ACTION_CONFIG[log.action] ?? {
                icon: Activity,
                tone: 'bg-wedding-100 text-wedding-600',
              };
              const Icon = config.icon;

              return (
                <li key={log.id} className="card flex gap-4 p-4">
                  <div className={`h-fit shrink-0 rounded-xl p-2.5 ${config.tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-medium text-wedding-900">
                        {log.description ?? log.action}
                      </p>
                      <time className="shrink-0 text-xs text-wedding-400">
                        {formatDateTime(log.createdAt)}
                      </time>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-wedding-500">
                      <span className="flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-wedding-100 text-[9px] font-semibold text-wedding-600">
                          {log.actorName ? initials(log.actorName) : '?'}
                        </span>
                        {log.actorName ?? log.user?.name ?? 'Convidado'}
                      </span>

                      {log.actorRole && (
                        <span className="rounded-md bg-wedding-100 px-1.5 py-0.5 font-medium">
                          {ROLE_LABELS[log.actorRole] ?? log.actorRole}
                        </span>
                      )}

                      {log.entity && (
                        <span>
                          {log.entity}
                          {log.entityId ? `#${log.entityId.slice(-6)}` : ''}
                        </span>
                      )}

                      {log.ip && <span className="font-mono">{log.ip}</span>}
                    </div>

                    {/* Metadados relevantes */}
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-wedding-400 hover:text-wedding-600">
                          Detalhes
                        </summary>
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-wedding-50 p-3 font-mono text-[11px] text-wedding-600">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-wedding-500">
                Página {page} de {totalPages} · {meta?.total} registros
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aparência por tipo de ação
// ---------------------------------------------------------------------------

const ACTION_CONFIG: Record<
  string,
  { icon: typeof Activity; tone: string }
> = {
  'auth.login': { icon: LogIn, tone: 'bg-wedding-100 text-wedding-600' },
  'auth.logout': { icon: LogOut, tone: 'bg-wedding-100 text-wedding-500' },
  'auth.login_failed': { icon: ShieldAlert, tone: 'bg-danger-100 text-danger-600' },

  'guest.created': { icon: UserPlus, tone: 'bg-blue-100 text-blue-600' },
  'guest.updated': { icon: Activity, tone: 'bg-wedding-100 text-wedding-600' },
  'guest.deleted': { icon: XCircle, tone: 'bg-danger-100 text-danger-600' },
  'guest.imported': { icon: FileText, tone: 'bg-blue-100 text-blue-600' },

  'invitation.sent': { icon: Send, tone: 'bg-blue-100 text-blue-600' },
  'invitation.cancelled': { icon: Ban, tone: 'bg-danger-100 text-danger-600' },
  'invitation.reopened': { icon: Activity, tone: 'bg-warning-100 text-warning-600' },
  'invitation.qrcode_issued': { icon: CheckCircle2, tone: 'bg-success-100 text-success-600' },

  'rsvp.confirmed': { icon: CheckCircle2, tone: 'bg-success-100 text-success-600' },
  'rsvp.declined': { icon: XCircle, tone: 'bg-danger-100 text-danger-600' },

  'checkin.validated': { icon: DoorOpen, tone: 'bg-success-100 text-success-600' },
  'checkin.denied': { icon: Ban, tone: 'bg-danger-100 text-danger-600' },
  'checkin.manual_override': { icon: ShieldAlert, tone: 'bg-warning-100 text-warning-600' },
};

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrador',
  RECEPTIONIST: 'Recepção',
};
