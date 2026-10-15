import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const PAYMENT_METHODS = ['CASH', 'DIGITAL', 'OTHER'] as const;
export const DIGITAL_CHANNELS = ['ESEWA', 'KHALTI', 'BANK', 'QR'] as const;

/**
 * How a payment's money reached a bill. These are two different things that
 * used to be conflated in one array, which made payment voids destroy value:
 *
 * - `PAYMENT`: cash received and FIFO-allocated to the bill's due. Voiding it
 *   restores `paidPaisa` and `duePaisa`.
 * - `CREDIT`: previously-received money sitting as advance credit, consumed at
 *   bill generation. It was never `paidPaisa`, so voiding it must instead give
 *   the credit back — decrement `creditAppliedPaisa` and raise `duePaisa` — or
 *   the bill silently stops being collectible.
 */
export const ALLOCATION_KINDS = ['PAYMENT', 'CREDIT'] as const;

const allocationSchema = new Schema(
  {
    billId: { type: Schema.Types.ObjectId, ref: 'Bill', required: true },
    amountPaisa: { type: Number, required: true, min: 0 },
    kind: { type: String, enum: ALLOCATION_KINDS, default: 'PAYMENT' },
  },
  { _id: false }
);

/**
 * Payments are real money received. Every payment (partial, full, or advance)
 * is FIFO-allocated to the payer-key's oldest unpaid bills; the remainder
 * becomes credit (unallocatedPaisa) that is auto-consumed at the next bill
 * generation. The bill itself is never deleted or zeroed by a payment (§26-29).
 */
const paymentSchema = new Schema(
  {
    paymentCode: { type: String, required: true, unique: true, trim: true },
    khataId: { type: Schema.Types.ObjectId, ref: 'Khata', required: true },
    bossId: { type: Schema.Types.ObjectId, ref: 'Boss', default: null },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    payerNameSnapshot: { type: String, default: '' },
    amountPaisa: { type: Number, required: true, min: 0 },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    digitalChannel: { type: String, enum: DIGITAL_CHANNELS, default: null },
    paymentDate: { type: String, required: true }, // YYYY-MM-DD
    receivedAt: { type: Date, default: () => new Date() },
    reference: { type: String, default: '', maxlength: 120 },
    note: { type: String, default: '', maxlength: 300 },
    allocations: { type: [allocationSchema], default: [] },
    unallocatedPaisa: { type: Number, default: 0, min: 0 },
    isVoided: { type: Boolean, default: false },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, default: '', maxlength: 300 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ khataId: 1, paymentDate: -1 });
paymentSchema.index({ bossId: 1, paymentDate: -1 });
paymentSchema.index({ staffId: 1, paymentDate: -1 });
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ method: 1, paymentDate: -1 });
paymentSchema.index({ 'allocations.billId': 1 });

export type PaymentDoc = InferSchemaType<typeof paymentSchema> & { _id: mongoose.Types.ObjectId };
export const Payment = mongoose.model('Payment', paymentSchema);