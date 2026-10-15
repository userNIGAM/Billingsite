import { z } from 'zod';
import { dateStr } from './common';

export const reportDateQuerySchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  groupBy: z.enum(['day', 'item', 'office']).optional().default('day'),
});

export const auditQuerySchema = z.object({
  entity: z.string().trim().max(60).optional(),
  entityId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  adminId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});