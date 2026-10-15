import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const STOCK_MOVE_TYPES = ['PURCHASE', 'USAGE', 'ADJUSTMENT'] as const;

const stockMovementSchema = new Schema(
  {
    inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    type: { type: String, enum: STOCK_MOVE_TYPES, required: true },
    quantity: { type: Number, required: true }, // positive for PURCHASE, negative for USAGE
    unitCostPaisa: { type: Number, default: null, min: 0 },
    businessDate: { type: String, required: true },
    expenseId: { type: Schema.Types.ObjectId, ref: 'Expense', default: null }, // E-21 linkage
    note: { type: String, default: '', maxlength: 300 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

stockMovementSchema.index({ inventoryItemId: 1, businessDate: -1 });

export type StockMovementDoc = InferSchemaType<typeof stockMovementSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);