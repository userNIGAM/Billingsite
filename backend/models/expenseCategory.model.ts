import mongoose, { Schema, InferSchemaType } from 'mongoose';

const expenseCategorySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type ExpenseCategoryDoc = InferSchemaType<typeof expenseCategorySchema> & {
  _id: mongoose.Types.ObjectId;
};
export const ExpenseCategory = mongoose.model('ExpenseCategory', expenseCategorySchema);