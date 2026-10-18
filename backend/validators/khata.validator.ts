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
  // Which payers this office supports. DIRECT = office's own ledger only;
  // GROUPS = bosses/staff only (no office ledger); MIXED = both (default, so
  // every office structure the old API allowed stays reachable).
  billingMode: z.enum(['DIRECT', 'GROUPS', 'MIXED']).optional().default('MIXED'),
  defaultStaffBillingResponsibility: z.enum(['OFFICE', 'SELF']).optional().default('OFFICE'),
  // `initialBoss` (single) is kept as a legacy alias for `initialBosses`.
  initialBoss: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional().default(''),
    address: z.string().trim().max(200).optional().default(''),
    openingBalancePaisa: z.coerce.number().int().min(0).optional().default(0),
  }).optional(),
  // Named bosses created up front. No hidden "Office Direct" boss is created
  // anymore: a MIXED/DIRECT office's own direct due lives on the khata itself.
  initialBosses: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional().default(''),
    address: z.string().trim().max(200).optional().default(''),
    openingBalancePaisa: z.coerce.number().int().min(0).optional().default(0),
  })).max(50).optional().default([]),
  initialStaff: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional().default(''),
    address: z.string().trim().max(200).optional().default(''),
    billingResponsibility: z.enum(['OFFICE', 'SELF']).optional(),
    // Index into the combined named-boss list; omitted = office pool (MIXED).
    bossIndex: z.coerce.number().int().min(0).optional(),
    openingBalancePaisa: z.coerce.number().int().min(0).optional().default(0),
  })).max(100).optional().default([]),
});

// The cross-field billingMode rules run on the union rather than on the office
// schema itself: a ZodEffects (superRefine) member is rejected by
// discriminatedUnion, which requires plain ZodObject options.
export const createKhataSchema = z.discriminatedUnion('type', [createIndividualSchema, createOfficeSchema])
  .superRefine((value, ctx) => {
    if (value.type !== 'OFFICE') return;
    const bossSpecs = [...(value.initialBoss ? [value.initialBoss] : []), ...(value.initialBosses ?? [])];
    if (value.billingMode === 'DIRECT') {
      if (bossSpecs.length > 0 || (value.initialStaff?.length ?? 0) > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['billingMode'],
          message: 'A DIRECT office bills only the office itself — it cannot also create bosses or staff. Use MIXED for both.',
        });
      }
    }
    if (value.billingMode === 'GROUPS' && value.openingBalancePaisa > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['openingBalancePaisa'],
        message: 'A GROUPS office has no ledger of its own — put the old dues on a boss instead.',
      });
    }
  });

export const updateKhataSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(200).optional(),
  startDate: dateStr.optional(),
  billingStartDay: z.coerce.number().int().min(1).max(28).optional(),
  // Offices only. Transition guards live in the service (DIRECT rejects
  // existing bosses/staff; GROUPS rejects a non-zero office opening).
  billingMode: z.enum(['DIRECT', 'GROUPS', 'MIXED']).optional(),
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