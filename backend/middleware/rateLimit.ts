import { Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

/**
 * Login brute-force guard (§64): max 10 attempts per 15 minutes per IP.
 * Generic message on every failure so we never leak which field was wrong.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // express-rate-limit sets Retry-After before calling this handler, so the
  // response must be 429 (RFC 6585 / RFC 9110). It used to be 409 CONFLICT,
  // which contradicted the retry semantics the headers advertised and stopped
  // clients and proxies from backing off.
  handler: (_req: Request, _res: Response) => {
    throw ApiError.tooManyRequests(
      'Too many login attempts. Please try again in 15 minutes.',
      'TOO_MANY_ATTEMPTS'
    );
  },
});

/** Shared 429 handler for the general and mutation limiters. */
function throttle(_req: Request, _res: Response): void {
  throw ApiError.tooManyRequests(
    'Too many requests. Please slow down and try again shortly.',
    'RATE_LIMITED'
  );
}

/**
 * Blanket ceiling on authenticated API traffic: a per-IP cap that stops a
 * runaway client or a scripted scrape from saturating the API. The limit is
 * deliberately generous — comfortably above a single canteen's peak — so it
 * only trips on abuse, not normal use.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: throttle,
});

/**
 * Tighter cap on state-changing methods (POST/PUT/PATCH/DELETE) so a single
 * session can't hammer writes faster than a human ever would. Reads are left
 * to `apiLimiter` alone.
 */
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req: Request) =>
    env.isTest || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method),
  handler: throttle,
});