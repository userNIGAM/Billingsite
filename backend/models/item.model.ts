import mongoose, { Schema, InferSchemaType } from 'mongoose';

const itemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    searchName: { type: String, required: true, lowercase: true, trim: true },
    category: { type: String, default: 'Food', trim: true, maxlength: 60 },
    sellingPricePaisa: { type: Number, required: true, min: 0 },
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