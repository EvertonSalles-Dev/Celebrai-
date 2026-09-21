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
  const iconTone = {
    neutral: 'bg-wedding-100 text-wedding-700 ring-wedding-200/60',
    success: 'bg-success-100 text-success-700 ring-success-200/60',
    warning: 'bg-warning-100 text-warning-700 ring-warning-200/60',
    danger: 'bg-danger-100 text-danger-700 ring-danger-200/60',
    info: 'bg-blue-100 text-blue-700 ring-blue-200/60',
  }[tone];

  const accentBar = {
    neutral: 'from-wedding-300 to-wedding-500',
    success: 'from-success-500 to-success-700',
    warning: 'from-warning-500 to-warning-700',
    danger: 'from-danger-500 to-danger-700',
    info: 'from-blue-500 to-blue-700',
  }[tone];

  const valueTone = {
    neutral: 'text-wedding-900',
    success: 'text-success-700',
    warning: 'text-warning-700',
    danger: 'text-danger-700',
    info: 'text-blue-700',
  }[tone];

  return (
    <div className="card group relative animate-fade-in-up overflow-hidden p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card">
      {/* Barra de destaque superior — dá identidade visual ao cartão. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-70 transition-opacity duration-300 group-hover:opacity-100',
          accentBar,
        )}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-wedding-500">
            {label}
          </p>
          <p className={cn('mt-2.5 text-3xl font-semibold leading-none tabular-nums', valueTone)}>
            {value}
          </p>
          {hint && <p className="mt-2 truncate text-xs text-wedding-500">{hint}</p>}
        </div>

        {Icon && (
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset transition-transform duration-300 group-hover:scale-105',
              iconTone,
            )}
          >
            <span className="[&>svg]:h-5 [&>svg]:w-5">{Icon}</span>
          </div>
        )}
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
