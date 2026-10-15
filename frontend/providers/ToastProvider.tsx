'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from '../utils/cn';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASSES: Record<ToastTone, string> = {
  success: 'border-brand-200 bg-brand-50 text-brand-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-gray-200 bg-white text-gray-800',
};

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, tone, message }]);
      // Auto-dismiss; errors linger a little longer because they usually carry
      // an action the operator needs to read.
      window.setTimeout(() => remove(id), tone === 'error' ? 7000 : 4000);
    },
    [remove]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      success: (m) => notify(m, 'success'),
      error: (m) => notify(m, 'error'),
    }),
    [notify]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm shadow-lg',
              TONE_CLASSES[t.tone]
            )}
          >
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="Dismiss"
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
