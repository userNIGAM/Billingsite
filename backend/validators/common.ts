import { z } from 'zod';

export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid 24-character id');

export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format');

export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const paginationQuerySchema = z.object({
  page: pageQuery.page,
  limit: pageQuery.limit,
});

export const qSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
  })
  .merge(paginationQuerySchema);

export const dateRangeQuerySchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
});

export function dateRangeOrDefault(fallbackFrom: string, query?: { from?: string; to?: string }) {
  const from = query?.from ?? fallbackFrom;
  const to = query?.to ?? todayStr();
  return { from, to };
}

function todayStr(): string {
  // Asia/Kathmandu friendly: acceptable since businessDate strings are ISO;
  // callers usually pass explicit ranges anyway.
  return new Date().toISOString().slice(0, 10);
}

export const positiveInt = z.number().int().min(1);
export const positiveMoney = z.number().int().min(0);