import mongoose, { Schema, InferSchemaType } from 'mongoose';

const canteenProfileSchema = new Schema(
  {
    name: { type: String, default: '', trim: true, maxlength: 120 },
    address: { type: String, default: '', trim: true, maxlength: 200 },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    billingNote: { type: String, default: '', trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

export type CanteenProfileDoc = InferSchemaType<typeof canteenProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const CanteenProfile = mongoose.model('CanteenProfile', canteenProfileSchema);