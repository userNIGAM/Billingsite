import { z } from 'zod';
import { dateStr, objectId, pageQuery } from './common';

export const createStaffSchema = z.object({
  khataId: objectId,
  bossId: objectId.optional(),
  name: z.string().trim().min(1, 'Staff name is required').max(120),
  billingResponsibility: z.enum(['OFFICE', 'SELF']).optional().default('OFFICE'),
  phone: z.string().trim().max(40).optional().default(''),
  startDate: dateStr.optional(),
  notes: z.string().trim().max(500).optional().default(''),
});

export const updateStaffSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  billingResponsibility: z.enum(['OFFICE', 'SELF']).optional(),
  phone: z.string().trim().max(40).optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const transferStaffSchema = z.object({
  bossId: objectId,
});

export const staffIdParamSchema = z.object({ id: objectId });
export const staffListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  khataId: objectId.optional(),
  bossId: objectId.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: pageQuery.page,
  limit: pageQuery.limit,
});