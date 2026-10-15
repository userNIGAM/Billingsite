import { cn } from '../../utils/cn';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-gray-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div> : null}
    </div>
  );
}
