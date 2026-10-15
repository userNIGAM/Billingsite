import mongoose, { Schema, InferSchemaType } from 'mongoose';

/**
 * Atomic sequence counters for human-friendly codes (§3.12).
 * Unique keys per year avoid a shared sequence rolling over and producing
 * impenetrable numbers (e.g. bill-2026, bill-2027).
 */
const counterSchema = new Schema({
  _id: { type: String, required: true }, // e.g. 'khata', 'bill-2026', 'tx-2026', 'pay-2026'
  seq: { type: Number, required: true, default: 0 },
});

export type CounterDoc = InferSchemaType<typeof counterSchema>;
export const Counter = mongoose.model('Counter', counterSchema);