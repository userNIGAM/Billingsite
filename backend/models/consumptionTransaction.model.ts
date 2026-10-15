import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const CONSUMER_TYPES = ['INDIVIDUAL', 'BOSS', 'STAFF'] as const;
export const ENTRY_TYPES = ['ORDER', 'REVERSAL'] as const;
export const TX_STATUSES = ['ACTIVE', 'VOIDED'] as const;

/**
 * Immutable event log (§3.6). Corrections are NEVER in-place edits: they
 * append a REVERSAL row whose quantity AND totalPaisa are both negated, so
 * the log stays additively consistent — summing `quantity` and summing
 * `totalPaisa` over any set of rows always agree. Both the mistake and the
 * correction remain visible forever.
 *
 * (Keeping `quantity` positive on a REVERSAL and negating only `totalPaisa`
 * would satisfy a `min: 1` constraint but break that agreement: a rebuild of
 * the read model from these events would sum quantities as 3 + 2 = 5 while
 * summing money to the correct 6000.)
 *
 * DailyConsumption read-model cells are derived from these rows via $inc, so
 * totals always match the sum of events.
 */
const consumptionTransactionSchema = new Schema(
  {
    transactionCode: { type: String, required: true, unique: true, trim: true },
    khataId: { type: Schema.Types.ObjectId, ref: 'Khata', required: true }, // who pays (root)
    bossId: { type: Schema.Types.ObjectId, ref: 'Boss', default: null }, // who pays (group)
    payerStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    consumerType: { type: String, enum: CONSUMER_TYPES, required: true },
    consumerId: { type: Schema.Types.ObjectId, required: true },
    consumerNameSnapshot: { type: String, required: true },
    consumerContextSnapshot: { type: String, required: true, default: '' },
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    itemNameSnapshot: { type: String, required: true },
    unitPricePaisa: { type: Number, required: true, min: 0 }, // SNAPSHOT
    unitCostPaisa: { type: Number, default: null, min: 0 }, // SNAPSHOT — real COGS
    // Signed: positive on ORDER, negative on REVERSAL. The per-type check
    // replaces the old blanket `min: 1`, which rejected every reversal.
    quantity: {
      type: Number,
      required: true,
      validate: {
        validator: function (this: mongoose.Document, value: number) {
          return this.get('entryType') === 'REVERSAL' ? value < 0 : value >= 1;
        },
        message: 'An ORDER quantity must be at least 1; a REVERSAL quantity must be negative.',
      },
    },
    totalPaisa: { type: Number, required: true }, // unitPricePaisa * quantity
    businessDate: { type: String, required: true }, // YYYY-MM-DD Asia/Kathmandu
    occurredAt: { type: Date, default: () => new Date() },
    entryType: { type: String, enum: ENTRY_TYPES, default: 'ORDER' },
    reversesTransactionId: { type: Schema.Types.ObjectId, default: null },
    status: { type: String, enum: TX_STATUSES, default: 'ACTIVE' },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, default: '', maxlength: 300 },
    notes: { type: String, default: '', maxlength: 300 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

consumptionTransactionSchema.index({ khataId: 1, businessDate: -1, createdAt: -1 });
consumptionTransactionSchema.index({ consumerId: 1, businessDate: -1 });
consumptionTransactionSchema.index({ bossId: 1, businessDate: -1 });
consumptionTransactionSchema.index({ payerStaffId: 1, businessDate: -1 });
consumptionTransactionSchema.index({ itemId: 1, businessDate: -1 });
consumptionTransactionSchema.index({ businessDate: -1 });

export type ConsumptionTransactionDoc = InferSchemaType<typeof consumptionTransactionSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const ConsumptionTransaction = mongoose.model(
  'ConsumptionTransaction',
  consumptionTransactionSchema
);