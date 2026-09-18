import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from './utils';

/**
 * Sistema de notificações (toast).
 *
 * Uso:
 *   const toast = useToast();
 *   toast.success('Convidado cadastrado!');
 *
 * Os toasts são anunciados por leitores de tela (aria-live) e desaparecem
 * automaticamente — exceto os de erro, que exigem fechamento manual quando
 * `persistent` é verdadeiro.
 */

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  persistent?: boolean;
}

interface ToastContextValue {
  push: (toast: Omit<ToastItem, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLE: Record<ToastVariant, { wrapper: string; Icon: typeof Info }> = {
  success: { wrapper: 'border-success-500/30 bg-success-50 text-success-700', Icon: CheckCircle2 },
  error: { wrapper: 'border-danger-500/30 bg-danger-50 text-danger-700', Icon: XCircle },
  warning: { wrapper: 'border-warning-500/30 bg-warning-50 text-warning-700', Icon: AlertTriangle },
  info: { wrapper: 'border-wedding-200 bg-white text-wedding-700', Icon: Info },
};

const AUTO_DISMISS_MS = 4500;

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const { wrapper, Icon } = VARIANT_STYLE[item.variant];

  useEffect(() => {
    if (item.persistent) return;
    const timer = window.setTimeout(() => onDismiss(item.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [item.id, item.persistent, onDismiss]);

  return (
    <div
      role="status"
      className={cn(
        'animate-slide-in-right pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-4 shadow-card',
        wrapper,
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex flex-1">
        <p className="text-sm font-semibold">{item.title}</p>
        {item.description && <p className="mt-0.5 text-sm opacity-90">{item.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Fechar notificação"
        className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current.slice(-3), { ...toast, id }]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      dismiss,
      success: (title, description) => push({ variant: 'success', title, description }),
      error: (title, description) =>
        push({ variant: 'error', title, description, persistent: true }),
      warning: (title, description) => push({ variant: 'warning', title, description }),
      info: (title, description) => push({ variant: 'info', title, description }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end sm:pt-4"
      >
        {toasts.map((item) => (
          <div key={item.id} className="w-full max-w-sm">
            <Toast item={item} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de <ToastProvider>.');
  }
  return context;
}
