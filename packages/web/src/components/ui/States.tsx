import type { ReactNode } from 'react';
import {
  AlertCircle,
  Ban,
  CalendarCheck,
  CalendarClock,
  CircleSlash,
  DoorOpen,
  Inbox,
  Loader2,
} from 'lucide-react';
import { cn } from './utils';
import type { InvitationStatus } from '@/types';

/**
 * Componentes de status e de estado (loading / vazio / erro).
 * Reutilizados em todas as tabelas, listas e telas do sistema.
 */

// ---------------------------------------------------------------------------
// Badge de status do convite
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  InvitationStatus,
  { label: string; className: string; Icon: typeof Inbox }
> = {
  PENDING: { label: 'Pendente', className: 'badge-warning', Icon: CalendarClock },
  CONFIRMED: { label: 'Confirmado', className: 'badge-success', Icon: CalendarCheck },
  DECLINED: { label: 'Recusado', className: 'badge-danger', Icon: CircleSlash },
  CHECKED_IN: { label: 'Entrou', className: 'badge-info', Icon: DoorOpen },
  CANCELLED: { label: 'Cancelado', className: 'badge-neutral', Icon: Ban },
};

export function StatusBadge({ status }: { status: InvitationStatus | 'SEM_CONVITE' }) {
  if (status === 'SEM_CONVITE') {
    return <span className="badge-neutral">Sem convite</span>;
  }

  const config = STATUS_CONFIG[status];
  if (!config) return <span className="badge-neutral">{status}</span>;

  const { label, className, Icon } = config;
  return (
    <span className={className}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}

/** Rótulo de status do evento. */
export function EventStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    DRAFT: { label: 'Rascunho', className: 'badge-neutral' },
    PUBLISHED: { label: 'Publicado', className: 'badge-success' },
    FINISHED: { label: 'Encerrado', className: 'badge-info' },
    CANCELLED: { label: 'Cancelado', className: 'badge-danger' },
  };
  const config = map[status] ?? { label: status, className: 'badge-neutral' };
  return <span className={config.className}>{config.label}</span>;
}

// ---------------------------------------------------------------------------
// Estados de tela
// ---------------------------------------------------------------------------

/** Indicador de carregamento. */
export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-wedding-400">
      <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Estado vazio com ação opcional. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: typeof Inbox;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="rounded-2xl bg-wedding-100 p-3.5 text-wedding-400">
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <div>
        <p className="text-base font-semibold text-wedding-800">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-md text-sm text-wedding-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Estado de erro com ação de tentar novamente. */
export function ErrorState({
  title = 'Não foi possível carregar',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="rounded-2xl bg-danger-50 p-3.5 text-danger-600">
        <AlertCircle className="h-7 w-7" aria-hidden />
      </div>
      <div>
        <p className="text-base font-semibold text-wedding-800">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-md text-sm text-wedding-500">{description}</p>}
      </div>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Esqueletos
// ---------------------------------------------------------------------------

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} />;
}

export function SkeletonCard() {
  return (
    <div className="card space-y-3 p-5">
      <SkeletonLine className="h-5 w-1/3" />
      <SkeletonLine className="w-2/3" />
      <SkeletonLine className="w-1/2" />
    </div>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="table-wrapper">
      <div className="space-y-3 p-4">
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonLine key={index} className="h-9" />
        ))}
      </div>
    </div>
  );
}
