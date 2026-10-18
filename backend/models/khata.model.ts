import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const KHATA_TYPES = ['INDIVIDUAL', 'OFFICE'] as const;
export const KHATA_STATUSES = ['ACTIVE', 'OFFLINE'] as const;
/**
 * How an OFFICE khata collects payment (the 4-option khata system):
 *   DIRECT — the office itself is the only payer (own ledger, no bosses/staff).
 *   GROUPS — bosses (and their staff) pay; the office has no ledger of its own.
 *   MIXED  — the office pays directly AND has bosses/staff who pay separately.
 * Only meaningful when type === 'OFFICE'. Defaults to MIXED so every office
 * structure stays reachable without a second migration.
 */
export const OFFICE_BILLING_MODES = ['DIRECT', 'GROUPS', 'MIXED'] as const;

const khataSchema = new Schema(
  {
    khataCode: { type: String, required: true, unique: true, trim: true }, // KH-000001
    type: { type: String, enum: KHATA_TYPES, required: true },
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    searchName: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '', maxlength: 40 },
    address: { type: String, default: '', maxlength: 200 },
    status: { type: String, enum: KHATA_STATUSES, default: 'ACTIVE' },
    startDate: { type: String, required: true }, // YYYY-MM-DD (Asia/Kathmandu)
    endDate: { type: String, default: null },
    billingCycle: { type: String, enum: ['MONTHLY'], default: 'MONTHLY' },
    billingStartDay: { type: Number, default: 1, min: 1, max: 28 },
    defaultStaffBillingResponsibility: {
      type: String,
      enum: ['OFFICE', 'SELF'],
      default: 'OFFICE',
    },
    // Office-only: which payers this khata supports (DIRECT / GROUPS / MIXED).
    // Null for individual khatas.
    billingMode: { type: String, enum: OFFICE_BILLING_MODES, default: null },
    // Migrated paper dues of this ledger. For an office this is the OFFICE
    // ledger's own opening (only billable when billingMode is DIRECT/MIXED);
    // bosses and staff carry theirs on their own documents.
    openingBalancePaisa: { type: Number, default: 0, min: 0 }, // migrated paper dues
    notes: { type: String, default: '', maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

khataSchema.index({ type: 1, status: 1 });
khataSchema.index({ searchName: 1 });
khataSchema.index({ status: 1, searchName: 1 });

export type KhataDoc = InferSchemaType<typeof khataSchema> & { _id: mongoose.Types.ObjectId };
export const Khata = mongoose.model('Khata', khataSchema);