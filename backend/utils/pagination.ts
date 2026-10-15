/**
 * Shared pagination helper. Page is 1-based; limit is bounded to keep any
 * list endpoint (transactions, khatas, bills, payments, expenses) from
 * loading thousands of documents at once (plan §72).
 */
export interface PageParams {
  page: number;
  limit: number;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  // Lets PageMeta satisfy response.ts's `Meta` without the controllers having
  // to cast it through `never` at the response envelope boundary.
  [key: string]: unknown;
}

export function parsePage(pageInput: unknown, limitInput: unknown): PageParams {
  const page = Math.max(1, Math.min(Number(pageInput) || 1, 1_000_000));
  const limit = Math.max(1, Math.min(Number(limitInput) || 20, 100));
  return { page, limit };
}

export function buildPageMeta(total: number, page: number, limit: number): PageMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Normalizes a search term into the lowercased form stored on documents. */
export function normalizeSearch(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Escapes a user search string so it is safe to use inside a RegExp. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}