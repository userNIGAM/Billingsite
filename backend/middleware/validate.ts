import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates req.body / req.query / req.params against Zod schemas and
 * replaces them with the parsed (and coerced/defaulted) values.
 *
 * Thrown ZodErrors are caught by asyncHandler/errorHandler and turned into
 * a 422 VALIDATION_ERROR response — see middleware/errorHandler.ts.
 *
 * Usage:
 *   router.post('/items', validate({ body: createItemSchema }), controller);
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }
    if (schemas.query) {
      req.query = schemas.query.parse(req.query) as typeof req.query;
    }
    if (schemas.params) {
      req.params = schemas.params.parse(req.params) as typeof req.params;
    }
    next();
  };
}
