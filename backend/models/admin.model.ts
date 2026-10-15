import mongoose, { Schema, InferSchemaType } from 'mongoose';

const adminSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN'], default: 'ADMIN' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type AdminDoc = InferSchemaType<typeof adminSchema> & { _id: mongoose.Types.ObjectId };
export const Admin = mongoose.model('Admin', adminSchema);