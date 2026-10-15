import { ApiError } from '../apiClient';
import type { PageMeta } from '../../types/api';

/**
 * Service modules are the only place endpoint paths appear. Components import
 * from here, so if an endpoint path changes it is a one-line edit instead of a
 * sweep across every page.
 *
 * The API client already unwraps the `{ success, data, meta }` envelope, so
 * these functions hand back `data` directly. Paginated endpoints put rows at
 * `data.rows`; the audit-log endpoint returns `data` as a bare array. Both are
 * normalized to one `{ rows, meta }` shape by `paged()` so no page has to know
 * which convention its endpoint used.
 */

export { ApiError };

/** Standard paginated-list result exposed to components. */
export interface ListResult<T> {
  rows: T[];
  meta: PageMeta;
}

const FALLBACK_META: PageMeta = { page: 1, limit: 20, total: 0, totalPages: 1 };

type RowsPayload<T> = { rows: T[] } | T[];

/**
 * Normalize a paginated payload into `{ rows, meta }`, accepting either the
 * `{ rows: [...] }` convention or a bare array.
 */
export function paged<T>(data: RowsPayload<T>, meta: PageMeta | undefined): ListResult<T> {
  const rows = Array.isArray(data) ? data : (data?.rows ?? []);
  return { rows, meta: meta ?? FALLBACK_META };
}


/**
 * Shape returned by endpoints that wrap the entity, e.g. `{ khata }`.
 * Falls back to `data` itself when unwrapped.
 */
export function unwrap<T>(data: unknown, key: string): T {
  const record = data as Record<string, unknown> | null | undefined;
  return (record?.[key] ?? data) as T;
}
