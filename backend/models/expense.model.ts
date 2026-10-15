import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const EXPENSE_PAYMENT_METHODS = ['CASH', 'DIGITAL', 'OTHER'] as const;

const expenseSchema = new Schema(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
    itemName: { type: String, required: true, trim: true, maxlength: 120 },
    quantity: { type: Number, default: 1, min: 0 },
    unit: { type: String, default: '', maxlength: 30 },
    amountPaisa: { type: Number, required: true, min: 0 },
    supplier: { type: String, default: '', maxlength: 120 },
    businessDate: { type: String, required: true }, // YYYY-MM-DD
    receivedAt: { type: Date, default: () => new Date() },
    paymentMethod: { type: String, enum: EXPENSE_PAYMENT_METHODS, default: 'CASH' },
    note: { type: String, default: '', maxlength: 300 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

expenseSchema.index({ businessDate: -1 });
expenseSchema.index({ categoryId: 1, businessDate: -1 });
expenseSchema.index({ paymentMethod: 1, businessDate: -1 });

export type ExpenseDoc = InferSchemaType<typeof expenseSchema> & { _id: mongoose.Types.ObjectId };
export const Expense = mongoose.model('Expense', expenseSchema);