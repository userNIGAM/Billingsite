import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const KHATA_TYPES = ['INDIVIDUAL', 'OFFICE'] as const;
export const KHATA_STATUSES = ['ACTIVE', 'OFFLINE'] as const;

const khataSchema = new Schema(
  {
    khataCode: { type: String, required: true, unique: true, trim: true }, // KH-000001
    type: { type: String, enum: KHATA_TYPES, required: true },
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    searchName: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '', maxlength: 40 },
    address: { type: String, default: '', maxlength: 200 },
    status: { type: String, enum: KHATA_STATUSES, default: 'ACTIVE' },
    startDate: { type: String, required: true }, // YYYY-MM-DD (Asia/Kathmandu)
    endDate: { type: String, default: null },
    billingCycle: { type: String, enum: ['MONTHLY'], default: 'MONTHLY' },
    billingStartDay: { type: Number, default: 1, min: 1, max: 28 },
    defaultStaffBillingResponsibility: {
      type: String,
      enum: ['OFFICE', 'SELF'],
      default: 'OFFICE',
    },
    openingBalancePaisa: { type: Number, default: 0, min: 0 }, // migrated paper dues
    notes: { type: String, default: '', maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

khataSchema.index({ type: 1, status: 1 });
khataSchema.index({ searchName: 1 });
khataSchema.index({ status: 1, searchName: 1 });

export type KhataDoc = InferSchemaType<typeof khataSchema> & { _id: mongoose.Types.ObjectId };
export const Khata = mongoose.model('Khata', khataSchema);