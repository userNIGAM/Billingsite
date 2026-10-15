import { z } from 'zod';
import { dateStr, objectId, pageQuery } from './common';

export const createConsumptionSchema = z.object({
  consumerType: z.enum(['INDIVIDUAL', 'BOSS', 'STAFF']),
  consumerId: objectId,
  itemId: objectId,
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(1000),
  // Must be in the schema: validate() replaces req.body with the Zod parse
  // output, which strips unknown keys. Without this the service's
  // businessDate branch was unreachable over HTTP and every order was silently
  // stamped with today's date, making backdating and re-imports impossible.
  businessDate: dateStr.optional(),
  notes: z.string().trim().max(300).optional().default(''),
});

export const voidConsumptionSchema = z.object({
  reason: z.string().trim().min(2, 'A reason is required to void a record').max(300),
});

export const consumptionIdParamSchema = z.object({ id: objectId });
export const consumptionListQuerySchema = z.object({
  date: dateStr.optional(),
  khataId: objectId.optional(),
  bossId: objectId.optional(),
  consumerId: objectId.optional(),
  itemId: objectId.optional(),
  page: pageQuery.page,
  limit: pageQuery.limit,
});

export const dailyQuerySchema = z.object({
  date: dateStr.optional(),
  khataId: objectId.optional(),
  bossId: objectId.optional(),
});