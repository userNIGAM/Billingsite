/**
 * A typed, predictable error shape for the whole API.
 *
 * Every controller/service throws this (or lets Zod/Mongoose errors bubble
 * up, which the error middleware translates into this shape) so the client
 * always receives:
 *   { success: false, code, message, details? }
 * and never a raw Mongo/Node stack trace.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new ApiError(400, code, message, details);
  }
  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }
  static forbidden(message = 'You do not have permission to do this', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }
  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }
  static conflict(code: string, message: string, details?: unknown) {
    return new ApiError(409, code, message, details);
  }
  static tooManyRequests(message = 'Too many requests. Please try again later.', code = 'TOO_MANY_REQUESTS') {
    return new ApiError(429, code, message);
  }
  static validation(message: string, details?: unknown) {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }
  static internal(message = 'Something went wrong') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}
