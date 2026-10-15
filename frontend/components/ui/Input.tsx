import { forwardRef, useId } from 'react';
import { cn } from '../../utils/cn';

export interface FieldProps {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + hint/error wrapper shared by Input, Select, Textarea. */
export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-xs font-semibold text-gray-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

const BASE_CONTROL =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 ' +
  'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, className, id, value, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} htmlFor={inputId} hint={hint} error={error} required={required} className={className}>
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(BASE_CONTROL, error && 'border-red-500 focus:ring-red-100')}
        {...rest}
        value={value ?? ''}
      />
    </Field>
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, className, id, children, value, ...rest },
  ref
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <Field label={label} htmlFor={selectId} hint={hint} error={error} required={required} className={className}>
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(BASE_CONTROL, 'pr-8', error && 'border-red-500 focus:ring-red-100')}
        {...rest}
        value={value ?? ''}
      >
        {children}
      </select>
    </Field>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, id, value, ...rest },
  ref
) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  return (
    <Field label={label} htmlFor={textareaId} hint={hint} error={error} required={required} className={className}>
      <textarea
        ref={ref}
        id={textareaId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(BASE_CONTROL, 'min-h-[80px]', error && 'border-red-500 focus:ring-red-100')}
        {...rest}
        value={value ?? ''}
      />
    </Field>
  );
});
