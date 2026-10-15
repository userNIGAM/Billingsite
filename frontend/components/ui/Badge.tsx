import { cn } from '../../utils/cn';

export type BadgeTone = 'gray' | 'green' | 'red' | 'amber' | 'blue';

const TONES: Record<BadgeTone, string> = {
  gray: 'bg-gray-100 text-gray-700',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-blue-100 text-blue-800',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ tone = 'gray', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Maps a khata/bill/payment status string to a badge tone, in one place. */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'ACTIVE':
    case 'PAID':
      return 'green';
    case 'PARTIALLY_PAID':
      return 'amber';
    case 'UNPAID':
    case 'OVERPAID':
      return 'blue';
    case 'OFFLINE':
    case 'INACTIVE':
    case 'VOIDED':
      return 'red';
    default:
      return 'gray';
  }
}
