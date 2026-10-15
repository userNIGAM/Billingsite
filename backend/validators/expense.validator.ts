import { z } from 'zod';
import { dateStr, objectId, pageQuery } from './common';

export const createExpenseSchema = z.object({
  categoryId: objectId,
  itemName: z.string().trim().min(1, 'Item name is required').max(120),
  quantity: z.coerce.number().min(0).optional().default(1),
  unit: z.string().trim().max(30).optional().default(''),
  amountPaisa: z.coerce.number().int().min(0, 'Amount must be >= 0'),
  supplier: z.string().trim().max(120).optional().default(''),
  businessDate: dateStr,
  paymentMethod: z.enum(['CASH', 'DIGITAL', 'OTHER']).optional().default('CASH'),
  note: z.string().trim().max(300).optional().default(''),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const expenseIdParamSchema = z.object({ id: objectId });
export const expenseListQuerySchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  categoryId: objectId.optional(),
  page: pageQuery.page,
  limit: pageQuery.limit,
});

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(60),
});