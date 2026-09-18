import type { ReactNode } from 'react';
import { cn } from './utils';

/**
 * Cartão de métrica do dashboard (Total de convidados, Confirmados, etc.).
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const toneClass = {
    neutral: 'bg-wedding-100 text-wedding-600',
    success: 'bg-success-100 text-success-700',
    warning: 'bg-warning-100 text-warning-700',
    danger: 'bg-danger-100 text-danger-700',
    info: 'bg-blue-100 text-blue-700',
  }[tone];

  return (
    <div className="card animate-fade-in-up p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-wedding-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-wedding-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-wedding-400">{hint}</p>}
        </div>
        {Icon && <div className={cn('rounded-xl p-2.5', toneClass)}>{Icon}</div>}
      </div>
    </div>
  );
}

/**
 * Barra de progresso simples com rótulo (usada em relatórios e no dashboard).
 */
export function ProgressBar({
  value,
  max,
  label,
  tone = 'ink',
}: {
  value: number;
  max: number;
  label?: string;
  tone?: 'ink' | 'success' | 'warning' | 'danger';
}) {
  const percentage = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  const barClass = {
    ink: 'bg-wedding-900',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
  }[tone];

  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs text-wedding-500">
          <span>{label}</span>
          <span className="tabular-nums">
            {value} / {max}
          </span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-wedding-100">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barClass)}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  );
}
