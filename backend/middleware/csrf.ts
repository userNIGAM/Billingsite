import { NextFunction, Request, Response } from 'express';
import { isOriginAllowed } from '../config/origins';
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

  // Compare the request's origin exactly (isOriginAllowed normalizes to
  // scheme://host[:port]) against the same allowlist the CORS layer uses. A
  // prefix match would also accept attacker hosts such as
  // `https://app.example.com.evil.io`; since the production cookie is
  // SameSite=None those requests carry the auth cookie and could drive every
  // authenticated mutation. The Referer is a full URL, so normalization drops
  // its path.
  if (!isOriginAllowed(origin ?? referer ?? '')) {
    next(ApiError.forbidden('Cross-site request blocked.', 'CSRF_BLOCKED'));
    return;
  }
  next();
}