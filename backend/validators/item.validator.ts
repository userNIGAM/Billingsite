import { z } from 'zod';
import { objectId, pageQuery } from './common';

export const createItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(120),
  category: z.string().trim().max(60).optional().default('Food'),
  sellingPricePaisa: z.coerce.number().int().min(0, 'Selling price must be >= 0'),
  costPricePaisa: z.coerce.number().int().min(0).nullable().optional().default(null),
  unit: z.string().trim().max(30).optional().default('plate'),
  isActive: z.boolean().optional().default(true),
  description: z.string().trim().max(300).optional().default(''),
});

export const updateItemSchema = createItemSchema.partial();

export const itemIdParamSchema = z.object({ id: objectId });
export const itemListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: pageQuery.page,
  limit: pageQuery.limit,
});