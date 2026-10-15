import { Response } from 'express';

interface Meta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

/**
 * Every successful response follows the same envelope:
 *   { success: true, data, meta? }
 * so the frontend's apiClient can unwrap responses uniformly regardless
 * of which endpoint it called.
 */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200, meta?: Meta): void {
  res.status(statusCode).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}
