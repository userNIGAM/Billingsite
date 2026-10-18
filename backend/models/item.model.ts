import mongoose, { Schema, InferSchemaType } from 'mongoose';

/**
 * Serving configuration. Item.sellingPricePaisa is always the FULL-plate
 * price (the field's original meaning), so items created before this feature
 * existed keep working as FULL_ONLY. HALF_AND_FULL additionally exposes
 * `halfPlatePricePaisa`, which is required whenever it is selected.
 */
export const SERVING_MODES = ['FULL_ONLY', 'HALF_AND_FULL'] as const;
export const SERVING_SIZES = ['HALF', 'FULL'] as const;

const itemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    searchName: { type: String, required: true, lowercase: true, trim: true },
    category: { type: String, default: 'Food', trim: true, maxlength: 60 },
    servingMode: { type: String, enum: SERVING_MODES, default: 'FULL_ONLY' },
    // Full-plate price (unchanged field name for backward compatibility).
    sellingPricePaisa: { type: Number, required: true, min: 0 },
    // Required by the API when servingMode is HALF_AND_FULL; null otherwise.
    halfPlatePricePaisa: { type: Number, default: null, min: 0 },
    costPricePaisa: { type: Number, default: null, min: 0 },
    unit: { type: String, default: 'plate', trim: true, maxlength: 30 },
    isActive: { type: Boolean, default: true },
    description: { type: String, default: '', maxlength: 300 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

itemSchema.index({ searchName: 1 });
itemSchema.index({ category: 1, isActive: 1 });

export type ItemDoc = InferSchemaType<typeof itemSchema> & { _id: mongoose.Types.ObjectId };
export const Item = mongoose.model('Item', itemSchema);