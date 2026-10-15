export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-5 py-14 text-center">
      <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-inset ring-brand-100">
        <span className="h-3 w-3 rounded-full bg-brand-500/70" />
      </span>
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      {description ? <p className="max-w-sm text-xs leading-5 text-gray-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
