import { cn } from '../../utils/cn';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
  className?: string;
}

const VALUE_TONES = {
  default: 'text-gray-900',
  positive: 'text-brand-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
} as const;

export function StatCard({ label, value, hint, tone = 'default', className }: StatCardProps) {
  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white p-4', className)}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', VALUE_TONES[tone])}>{value}</p>
      {hint ? <p className="mt-2 text-sm text-gray-500">{hint}</p> : null}
    </div>
  );
}
