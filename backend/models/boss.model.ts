import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const BOSS_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

const bossSchema = new Schema(
  {
    khataId: { type: Schema.Types.ObjectId, ref: 'Khata', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Lowercased copy of `name`, matching Khata/Staff/Item. Customer search
    // normalizes the query term to lowercase and matches it against this field
    // — matching `name` directly with a plain $regex is case-sensitive, so a
    // search for "ram" never matched "Ram Bahadur".
    searchName: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '', maxlength: 40 },
    address: { type: String, default: '', maxlength: 200 },
    // Migrated paper due carried into this boss's first group bill.
    openingBalancePaisa: { type: Number, default: 0, min: 0 },
    isDefault: { type: Boolean, default: false }, // the "Office Direct" group
    status: { type: String, enum: BOSS_STATUSES, default: 'ACTIVE' },
    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: { type: String, default: null },
    notes: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

bossSchema.index({ khataId: 1, status: 1 });
bossSchema.index({ khataId: 1, isDefault: 1 });
bossSchema.index({ searchName: 1 });

export type BossDoc = InferSchemaType<typeof bossSchema> & { _id: mongoose.Types.ObjectId };
export const Boss = mongoose.model('Boss', bossSchema);