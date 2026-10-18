import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const STAFF_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const STAFF_BILLING_RESPONSIBILITIES = ['OFFICE', 'SELF'] as const;

const staffSchema = new Schema(
  {
    khataId: { type: Schema.Types.ObjectId, ref: 'Khata', required: true }, // office khata
    // Current billing group. Null = the staff belongs to the office pool
    // directly (no boss). Historical transactions keep the bossId recorded at
    // order time, so a later transfer never rewrites who owes what (E-5).
    bossId: { type: Schema.Types.ObjectId, ref: 'Boss', default: null },
    billingResponsibility: {
      type: String,
      enum: STAFF_BILLING_RESPONSIBILITIES,
      default: 'OFFICE',
    },
    // Migrated paper due carried into this staff member's first personal bill.
    // Only meaningful when billingResponsibility === 'SELF'.
    openingBalancePaisa: { type: Number, default: 0, min: 0 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    searchName: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '', maxlength: 40 },
    address: { type: String, default: '', maxlength: 200 },
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