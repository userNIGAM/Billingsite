import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

/**
 * Catches routes that don't exist. Must be registered AFTER all routes.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

/**
 * Single place where every error in the app is translated into:
 *   { success: false, code, message, details? }
 *
 * Raw Mongo/Mongoose/Node errors are NEVER sent to the client (§47) —
 * they're logged server-side and replaced with a safe, generic message.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // 1. Our own typed errors pass straight through.
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) logger.error(`${req.method} ${req.originalUrl}`, err);
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // 2. Zod validation errors → 422 with field-level details.
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'One or more fields are invalid.',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // 3. Mongoose validation errors.
  if (err instanceof mongoose.Error.ValidationError) {
    res.status(422).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'One or more fields are invalid.',
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    });
    return;
  }

  // 4. Mongoose bad ObjectId cast.
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      success: false,
      code: 'INVALID_ID',
      message: `Invalid value for ${err.path}.`,
    });
    return;
  }

  // 5. Duplicate key (unique index violation) — e.g. billNumber, khataCode.
  if (isMongoDuplicateKeyError(err)) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'field';
    res.status(409).json({
      success: false,
      code: 'DUPLICATE_VALUE',
      message: `A record with this ${field} already exists.`,
    });
    return;
  }

  // 6. Anything else is unexpected — log full detail server-side only.
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again.',
    ...(env.isProduction ? {} : { details: err instanceof Error ? err.message : String(err) }),
  });
}

interface MongoDuplicateKeyError {
  code: number;
  keyPattern?: Record<string, unknown>;
}

function isMongoDuplicateKeyError(err: unknown): err is MongoDuplicateKeyError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 11000
  );
}
