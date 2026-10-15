import { z } from 'zod';
import { dateStr, objectId } from './common';

export const createBossSchema = z.object({
  // URL param `/offices/:khataId/bosses` is the source of truth; body khataId is optional.
  khataId: objectId.optional(),
  name: z.string().trim().min(1, 'Boss name is required').max(120),
  phone: z.string().trim().max(40).optional().default(''),
  startDate: dateStr.optional(),
  notes: z.string().trim().max(500).optional().default(''),
});

export const updateBossSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const bossIdParamSchema = z.object({ id: objectId });
export const listBossesQuerySchema = z.object({
  khataId: objectId.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});