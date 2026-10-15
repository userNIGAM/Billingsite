'use client';

import { Button } from './Button';
import type { PageMeta } from '../../types/api';

export interface PaginationProps {
  meta: PageMeta;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({ meta, onPageChange, disabled }: PaginationProps) {
  const { page, totalPages, total } = meta;
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-3 py-2 text-xs text-gray-600">
      <span>
        Page {page} of {totalPages} · {total} record{total === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
