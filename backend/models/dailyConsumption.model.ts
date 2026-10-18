import mongoose, { Schema, InferSchemaType } from 'mongoose';

/**
 * Fast read model (§3.7). Grain: ONE document per
 *   (consumerId, bossId, payerStaffId, businessDate, itemId, servingSize, unitPricePaisa).
 *
 * The unique compound index is what makes the whole aggregation strategy
 * concurrency-safe: two admins tapping "Tea" for the same person at the same
 * moment upsert the same cell with $inc instead of creating duplicate rows.
 *
 * Including unitPricePaisa in the key means a mid-day price change produces
 * two cells (e.g. Tea ×2 @30, Tea ×1 @35) — never a corrupted single row.
 * servingSize is part of the key so a half plate and a full plate of the same
 * item stay separate rows even when the admin prices them identically.
 *
 * bossId IS part of the key because a consumer's billing group is not
 * immutable: when staff transfer between bosses (E-5) their history keeps the
 * bossId recorded at order time, so both groups bill correctly. Leaving bossId
 * out of the key made the second order $inc into the first boss's cell (bossId
 * was only set $setOnInsert), so the old boss was invoiced for both meals and
 * the new boss for none.
 */
const dailyConsumptionSchema = new Schema({
  khataId: { type: Schema.Types.ObjectId, ref: 'Khata', required: true },
  bossId: { type: Schema.Types.ObjectId, ref: 'Boss', default: null },
  payerStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  consumerType: { type: String, enum: ['INDIVIDUAL', 'BOSS', 'STAFF', 'OFFICE'], required: true },
  consumerId: { type: Schema.Types.ObjectId, required: true },
  consumerNameSnapshot: { type: String, required: true },
  consumerContextSnapshot: { type: String, required: true, default: '' },
  itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
  itemNameSnapshot: { type: String, required: true },
  servingSize: { type: String, enum: ['HALF', 'FULL'], default: 'FULL' },
  unitPricePaisa: { type: Number, required: true, min: 0 },
  unitCostPaisa: { type: Number, default: null, min: 0 },
  businessDate: { type: String, required: true },
  quantity: { type: Number, default: 0 },
  totalPaisa: { type: Number, default: 0 },
  updatedAt: { type: Date, default: () => new Date() },
});

dailyConsumptionSchema.index(
  { consumerId: 1, bossId: 1, payerStaffId: 1, businessDate: 1, itemId: 1, servingSize: 1, unitPricePaisa: 1 },
  { unique: true }
);
dailyConsumptionSchema.index({ khataId: 1, businessDate: -1 });
dailyConsumptionSchema.index({ bossId: 1, businessDate: -1 });
dailyConsumptionSchema.index({ payerStaffId: 1, businessDate: -1 });
dailyConsumptionSchema.index({ businessDate: -1 });
dailyConsumptionSchema.index({ consumerId: 1, businessDate: -1 });

export type DailyConsumptionDoc = InferSchemaType<typeof dailyConsumptionSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const DailyConsumption = mongoose.model('DailyConsumption', dailyConsumptionSchema);