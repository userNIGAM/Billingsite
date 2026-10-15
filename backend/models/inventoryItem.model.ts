import mongoose, { Schema, InferSchemaType } from 'mongoose';

/**
 * Optional inventory tracking (§3.11). Endpoints ship in a later phase; the
 * schema exists from day one so a future migration is non-breaking.
 */
const inventoryItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    searchName: { type: String, required: true, lowercase: true, trim: true },
    unit: { type: String, default: '', maxlength: 30 },
    currentStock: { type: Number, default: 0, min: 0 },
    minimumStock: { type: Number, default: 0, min: 0 },
    costPricePaisa: { type: Number, default: null, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

inventoryItemSchema.index({ searchName: 1 });

export type InventoryItemDoc = InferSchemaType<typeof inventoryItemSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const InventoryItem = mongoose.model('InventoryItem', inventoryItemSchema);