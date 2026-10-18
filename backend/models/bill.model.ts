import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const BILL_SCOPES = ['INDIVIDUAL', 'BOSS_GROUP', 'STAFF', 'OFFICE'] as const;
export const BILL_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERPAID'] as const;

const lineItemSchema = new Schema(
  {
    businessDate: { type: String, required: true },
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    itemNameSnapshot: { type: String, required: true },
    servingSize: { type: String, enum: ['HALF', 'FULL'], default: 'FULL' },
    quantity: { type: Number, required: true, min: 1 },
    unitPricePaisa: { type: Number, required: true, min: 0 },
    totalPaisa: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

/**
 * A bill FREEZES the consumption snapshot at generation time (§15, §24).
 * lineItems never point back to live data — editing a transaction weeks
 * later can never silently alter an already-printed bill.
 */
const billSchema = new Schema(
  {
    billNumber: { type: String, required: true, unique: true, trim: true }, // INV-2026-000001
    khataId: { type: Schema.Types.ObjectId, ref: 'Khata', required: true },
    bossId: { type: Schema.Types.ObjectId, ref: 'Boss', default: null },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    scope: { type: String, enum: BILL_SCOPES, required: true },
    payerNameSnapshot: { type: String, required: true },
    periodStart: { type: String, required: true },
    periodEnd: { type: String, required: true },
    generatedAt: { type: Date, default: () => new Date() },
    lineItems: { type: [lineItemSchema], default: [] },
    consumptionTotalPaisa: { type: Number, default: 0, min: 0 },
    previousDuePaisa: { type: Number, default: 0, min: 0 },
    creditAppliedPaisa: { type: Number, default: 0, min: 0 },
    totalPayablePaisa: { type: Number, default: 0, min: 0 },
    paidPaisa: { type: Number, default: 0, min: 0 },
    duePaisa: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: BILL_STATUSES, default: 'UNPAID' },
    isVoided: { type: Boolean, default: false },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, default: '', maxlength: 300 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

billSchema.index({ khataId: 1, periodStart: -1 });
billSchema.index({ bossId: 1, periodStart: -1 });
billSchema.index({ staffId: 1, periodStart: -1 });
billSchema.index({ khataId: 1, status: 1 });
billSchema.index(
  { khataId: 1, bossId: 1, staffId: 1, periodStart: 1, periodEnd: 1 },
  { unique: true, partialFilterExpression: { isVoided: false } }
);

export type BillDoc = InferSchemaType<typeof billSchema> & { _id: mongoose.Types.ObjectId };
export const Bill = mongoose.model('Bill', billSchema);