import { z } from 'zod';
import { dateStr, objectId, pageQuery } from './common';

export const createPaymentSchema = z.object({
  khataId: objectId,
  bossId: objectId.nullable().optional(),
  staffId: objectId.nullable().optional(),
  amountPaisa: z.coerce.number().int().min(1, 'Payment amount must be at least 1 paisa'),
  method: z.enum(['CASH', 'DIGITAL', 'OTHER']),
  digitalChannel: z.enum(['ESEWA', 'KHALTI', 'BANK', 'QR']).nullable().optional().default(null),
  paymentDate: dateStr,
  reference: z.string().trim().max(120).optional().default(''),
  note: z.string().trim().max(300).optional().default(''),
});

export const voidPaymentSchema = z.object({
  reason: z.string().trim().min(2, 'A reason is required to void a payment').max(300),
});

export const paymentIdParamSchema = z.object({ id: objectId });
export const paymentListQuerySchema = z.object({
  khataId: objectId.optional(),
  bossId: objectId.optional(),
  staffId: objectId.optional(),
  method: z.enum(['CASH', 'DIGITAL', 'OTHER']).optional(),
  isVoided: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  from: dateStr.optional(),
  to: dateStr.optional(),
  page: pageQuery.page,
  limit: pageQuery.limit,
});