import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const STAFF_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const STAFF_BILLING_RESPONSIBILITIES = ['OFFICE', 'SELF'] as const;

const staffSchema = new Schema(
  {
    khataId: { type: Schema.Types.ObjectId, ref: 'Khata', required: true }, // office khata
    bossId: { type: Schema.Types.ObjectId, ref: 'Boss', required: true }, // current billing group
    billingResponsibility: {
      type: String,
      enum: STAFF_BILLING_RESPONSIBILITIES,
      default: 'OFFICE',
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    searchName: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '', maxlength: 40 },
    status: { type: String, enum: STAFF_STATUSES, default: 'ACTIVE' },
    startDate: { type: String, required: true },
    endDate: { type: String, default: null },
    notes: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

staffSchema.index({ khataId: 1, status: 1 });
staffSchema.index({ bossId: 1, status: 1 });
staffSchema.index({ searchName: 1 });

export type StaffDoc = InferSchemaType<typeof staffSchema> & { _id: mongoose.Types.ObjectId };
export const Staff = mongoose.model('Staff', staffSchema);