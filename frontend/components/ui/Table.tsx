import { cn } from '../../utils/cn';

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-full divide-y divide-gray-100 text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-gray-50">{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-gray-100/80 bg-white">{children}</tbody>;
}

export interface ThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center';
}

export function Th({ align = 'left', className, children, ...rest }: ThProps) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-4 py-2.5 text-xs font-semibold text-gray-600 sm:px-5',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export interface TdProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center';
}

export function Td({ align = 'left', className, children, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        'whitespace-nowrap px-4 py-3 text-sm text-gray-700 sm:px-5',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({ className, children, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('hover:bg-gray-50', className)} {...rest}>
      {children}
    </tr>
  );
}
