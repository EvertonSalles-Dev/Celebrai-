import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn, focusFirst } from './utils';

/**
 * Modal acessível com overlay.
 *
 * - Fecha com ESC e clique no overlay.
 * - Bloqueia o scroll do body enquanto aberto.
 * - Move o foco para o primeiro elemento interativo ao abrir.
 * - `size` controla a largura máxima; em telas pequenas ocupa quase tudo.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closable = true,
  danger = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closable?: boolean;
  danger?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    focusFirst(panelRef.current);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closable) onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, closable, onClose]);

  if (!open) return null;

  const width = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-wedding-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => closable && onClose()}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'animate-scale-in w-full rounded-t-3xl bg-white shadow-elevated sm:rounded-2xl',
          width,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-wedding-100 px-6 py-4">
          <div>
            <h2
              id="modal-title"
              className={cn('text-lg font-semibold', danger ? 'text-danger-700' : 'text-wedding-900')}
            >
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-wedding-500">{description}</p>}
          </div>
          {closable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="rounded-lg p-1.5 text-wedding-400 transition-colors hover:bg-wedding-100 hover:text-wedding-700"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </header>

        {children && <div className="max-h-[65vh] overflow-y-auto px-6 py-5">{children}</div>}

        {footer && (
          <footer className="safe-bottom flex-col-reverse gap-2 border-t border-wedding-100 px-6 py-4 sm:flex-row sm:justify-end">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/**
 * Diálogo de confirmação para ações destrutivas.
 * Sempre exige uma ação explícita do usuário.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  loading = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      danger={danger}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Processando...' : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
