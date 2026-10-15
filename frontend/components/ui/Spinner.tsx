import { cn } from '../../utils/cn';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-block', className)}>
      <span className="block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
    </span>
  );
}

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
      <Spinner />
      {message}
    </div>
  );
}
