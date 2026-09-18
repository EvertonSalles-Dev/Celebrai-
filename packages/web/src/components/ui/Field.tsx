import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from './utils';

/**
 * Campos de formulário do Design System.
 *
 * IMPORTANTE: `Input`, `Textarea` e `Select` usam `forwardRef`.
 * O React Hook Form registra cada campo através de uma `ref`; sem o
 * `forwardRef`, o React descarta a ref silenciosamente e o formulário passa a
 * ver todos os campos como vazios (erro de validação "Required" ao enviar).
 */

interface FieldWrapperProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function FieldWrapper({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: FieldWrapperProps) {
  return (
    <div>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span className="ml-0.5 text-danger-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="field-error" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="helper">{hint}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  variant?: 'default' | 'invite';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, variant = 'default', className, id, required, ...rest },
  ref,
) {
  const fieldId = id ?? rest.name;

  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <input
        id={fieldId}
        ref={ref}
        aria-invalid={Boolean(error)}
        required={required}
        className={cn(
          variant === 'invite' ? 'input-invite' : 'input',
          error && variant === 'default' && 'input-error',
          className,
        )}
        {...rest}
      />
    </FieldWrapper>
  );
});

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  variant?: 'default' | 'invite';
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, variant = 'default', className, id, required, ...rest },
  ref,
) {
  const fieldId = id ?? rest.name;

  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <textarea
        id={fieldId}
        ref={ref}
        aria-invalid={Boolean(error)}
        required={required}
        className={cn(
          variant === 'invite' ? 'input-invite min-h-[96px] resize-y' : 'input min-h-[96px] resize-y',
          error && variant === 'default' && 'input-error',
          className,
        )}
        {...rest}
      />
    </FieldWrapper>
  );
});

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, className, id, required, children, ...rest },
  ref,
) {
  const fieldId = id ?? rest.name;

  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <select
        id={fieldId}
        ref={ref}
        aria-invalid={Boolean(error)}
        required={required}
        className={cn('input cursor-pointer', error && 'input-error', className)}
        {...rest}
      >
        {children}
      </select>
    </FieldWrapper>
  );
});

// ---------------------------------------------------------------------------
// Checkbox
// ---------------------------------------------------------------------------

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, className, id, ...rest },
  ref,
) {
  const fieldId = id ?? rest.name;

  return (
    <div>
      <label
        htmlFor={fieldId}
        className="flex cursor-pointer items-start gap-2.5 text-sm text-wedding-700"
      >
        <input
          id={fieldId}
          ref={ref}
          type="checkbox"
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 rounded border-wedding-300 text-wedding-900',
            'focus:ring-2 focus:ring-wedding-900/20',
            className,
          )}
          {...rest}
        />
        <span className="leading-snug">{label}</span>
      </label>
      {error && (
        <p className="field-error" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
});
