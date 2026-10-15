import { Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../utils/ApiError';

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