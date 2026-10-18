import { z } from 'zod';
import { objectId, pageQuery } from './common';
import { SERVING_MODES } from '../models/item.model';

/**
 * Base object kept separate from the refined create schema so `updateItemSchema`
 * can be derived with `.partial()` (a ZodEffects from `.superRefine()` has no
 * `.partial()`). Cross-field price checks that depend on the MERGED document
 * are enforced in item.service, because a PATCH may change only one side.
 */
const baseItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(120),
  category: z.string().trim().max(60).optional().default('Food'),
  servingMode: z.enum(SERVING_MODES).optional().default('FULL_ONLY'),
  sellingPricePaisa: z.coerce.number().int().min(0, 'Selling price must be >= 0'),
  halfPlatePricePaisa: z.coerce.number().int().min(0).nullable().optional().default(null),
  costPricePaisa: z.coerce.number().int().min(0).nullable().optional().default(null),
  unit: z.string().trim().max(30).optional().default('plate'),
  isActive: z.boolean().optional().default(true),
  description: z.string().trim().max(300).optional().default(''),
});

export const createItemSchema = baseItemSchema.superRefine((value, ctx) => {
  if (value.servingMode === 'HALF_AND_FULL' && value.halfPlatePricePaisa == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['halfPlatePricePaisa'],
      message: 'A half-plate price is required when half plates are offered.',
    });
  }
});

export const updateItemSchema = baseItemSchema.partial();

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