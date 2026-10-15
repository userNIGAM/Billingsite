import { z } from 'zod';
import { dateStr, objectId, pageQuery } from './common';

const baseFields = {
  displayName: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().max(40).optional().default(''),
  address: z.string().trim().max(200).optional().default(''),
  startDate: dateStr,
  status: z.enum(['ACTIVE', 'OFFLINE']).optional().default('ACTIVE'),
  billingStartDay: z.coerce.number().int().min(1, 'Billing day must be between 1 and 28').max(28).optional().default(1),
  openingBalancePaisa: z.coerce.number().int().min(0).optional().default(0),
  notes: z.string().trim().max(500).optional().default(''),
};

export const createIndividualSchema = z.object({
  type: z.literal('INDIVIDUAL'),
  ...baseFields,
});

export const createOfficeSchema = z.object({
  type: z.literal('OFFICE'),
  ...baseFields,
  defaultStaffBillingResponsibility: z.enum(['OFFICE', 'SELF']).optional().default('OFFICE'),
  initialBoss: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional().default(''),
  }).optional(),
  initialStaff: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional().default(''),
    billingResponsibility: z.enum(['OFFICE', 'SELF']).optional(),
  })).max(100).optional().default([]),
});

export const createKhataSchema = z.discriminatedUnion('type', [createIndividualSchema, createOfficeSchema]);

export const updateKhataSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(200).optional(),
  startDate: dateStr.optional(),
  billingStartDay: z.coerce.number().int().min(1).max(28).optional(),
  openingBalancePaisa: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const statusChangeSchema = z.object({
  status: z.enum(['ACTIVE', 'OFFLINE'], {
    errorMap: () => ({ message: 'Status must be ACTIVE or OFFLINE' }),
  }),
});

export const khataIdParamSchema = z.object({ id: objectId });
export const khataListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(['INDIVIDUAL', 'OFFICE']).optional(),
  status: z.enum(['ACTIVE', 'OFFLINE']).optional(),
  page: pageQuery.page,
  limit: pageQuery.limit,
});

// Optional from/to window for the summary rollup. Both are optional so the UI
// can request a lifetime total with no query string at all.
export const khataSummaryQuerySchema = z
  .object({
    from: dateStr.optional(),
    to: dateStr.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '"from" must not be after "to"',
    path: ['from'],
  });