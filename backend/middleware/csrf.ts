import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

/**
 * Lightweight CSRF protection (§64/§11): the auth cookie is HttpOnly so it is
 * never readable by scripts, and SameSite already blocks most cross-site
 * sends, but in production we set SameSite=None (cross-origin API), so we
 * verify the Origin/Referer of state-changing requests is in the CORS
 * allowlist. Non-browser clients (curl, Postman) send no Origin/Referer and
 * are accepted — they can't be driven by a malicious web page anyway.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  const allowed = ['GET', 'HEAD', 'OPTIONS'];
  if (allowed.includes(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (!origin && !referer) {
    // Non-browser client — same as above.
    next();
    return;
  }

  const source = (origin ?? referer ?? '').toString();
  const sourceOrigin = parseOrigin(source);

  // EXACT equality against the parsed origin. A `startsWith` check accepts
  // any host that merely begins with an allowed origin, so
  // `https://app.example.com.evil.io` passed when
  // CORS_ORIGIN=https://app.example.com — and since the production cookie is
  // SameSite=None, such a request carries the auth cookie and can drive every
  // authenticated mutation. Parse the Origin/Referer to its scheme+host+port
  // and compare that instead of the raw header.
  const isAllowed = env.corsOrigins.some((allowedOrigin) => {
    const allowed = parseOrigin(allowedOrigin);
    return allowed !== null && allowed === sourceOrigin;
  });

  if (!isAllowed) {
    next(ApiError.forbidden('Cross-site request blocked.', 'CSRF_BLOCKED'));
    return;
  }
  next();
}

/**
 * Reduces a URL to `scheme://host[:port]` so comparison ignores paths,
 * query strings and trailing slashes. Returns null for anything unparseable.
 */
function parseOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}