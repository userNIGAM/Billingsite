/**
 * The only place in the frontend that calls fetch(). Every service module
 * (services/khataService.ts, services/billService.ts, ...) goes through
 * this so auth cookies, error shape, and JSON parsing are handled once.
 *
 * Response envelope (backend/utils/response.ts):
 *   success → { success: true, data, meta? }
 *   error   → { success: false, code, message, details? }
 *
 * `data` is returned unwrapped; `getWithMeta` additionally hands back `meta`
 * for paginated lists.
 */

// Defaults to the same-origin `/api`, which next.config.mjs rewrites to the
// backend (BACKEND_URL). Keeping the API same-origin makes the HttpOnly auth
// cookie first-party, so the route guard in proxy.ts can see it and browsers
// that block third-party cookies still keep the session.
const API_URL = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/+$/, '');

export class ApiError extends Error {
  code: string;
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  /** True when the session is missing/expired and the UI should re-login. */
  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

interface ErrorEnvelope {
  success: false;
  code: string;
  message: string;
  details?: unknown;
}

type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

type QueryValue = RequestOptions['query'];

function buildUrl(path: string, query?: QueryValue): string {
  // A relative API_URL (the default `/api`) is resolved against the page.
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const url = new URL(`${API_URL}${path}`, base);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      // undefined means "not supplied" — sending the literal string
      // "undefined" would make optional query params look present.
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function parse<T>(res: Response): Promise<SuccessEnvelope<T>> {
  let json: ApiEnvelope<T> | undefined;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    // Non-JSON response (e.g. a proxy error page) — fall through to the
    // generic error below rather than throwing a parse error.
  }

  if (!json) {
    throw new ApiError(res.status, 'INVALID_RESPONSE', 'The server sent an unreadable response.');
  }
  if (!json.success) {
    throw new ApiError(res.status, json.code, json.message, json.details);
  }
  return json;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include', // send the HttpOnly auth cookie
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    // An aborted request is a deliberate cancellation, not a network fault —
    // re-throw so callers can ignore it instead of showing an error.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      `Could not reach the API at ${API_URL}. Check that the backend is running and that its CORS origin allows this frontend.`
    );
  }

  return (await parse<T>(res)).data;
}

/** Same as `request`, but also returns pagination `meta`. */
async function requestWithMeta<T>(
  path: string,
  options: RequestOptions = {}
): Promise<{ data: T; meta?: PageMeta }> {
  const { method = 'GET', body, query, signal } = options;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      `Could not reach the API at ${API_URL}. Check that the backend is running and that its CORS origin allows this frontend.`
    );
  }

  const envelope = await parse<T>(res);
  return { data: envelope.data, meta: envelope.meta as PageMeta | undefined };
}

export const apiClient = {
  get: <T>(path: string, query?: QueryValue, signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', query, signal }),

  getWithMeta: <T>(path: string, query?: QueryValue, signal?: AbortSignal) =>
    requestWithMeta<T>(path, { method: 'GET', query, signal }),

  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body, signal }),

  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'PATCH', body, signal }),

  put: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'PUT', body, signal }),

  delete: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'DELETE', signal }),
};
