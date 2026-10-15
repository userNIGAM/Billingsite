import { z } from 'zod';
import { dateStr, objectId, pageQuery } from './common';

export const generateBillSchema = z.object({
  khataId: objectId,
  bossId: objectId.nullable().optional(),
  staffId: objectId.nullable().optional(),
  periodStart: dateStr,
  periodEnd: dateStr,
});

export const voidBillSchema = z.object({
  reason: z.string().trim().min(2, 'A reason is required to void a bill').max(300),
});

export const billIdParamSchema = z.object({ id: objectId });
export const billListQuerySchema = z.object({
  khataId: objectId.optional(),
  bossId: objectId.optional(),
  staffId: objectId.optional(),
  status: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERPAID']).optional(),
  isVoided: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: pageQuery.page,
  limit: pageQuery.limit,
});