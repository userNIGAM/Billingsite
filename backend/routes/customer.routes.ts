import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { search } from '../controllers/customer.controller';

const customerSearchQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  includeOffline: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

const router = Router();

router.get('/search', validate({ query: customerSearchQuerySchema }), search);

export default router;