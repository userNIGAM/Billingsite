import { Counter } from '../models/counter.model';
import { businessNow } from '../utils/date';

async function nextSequence(key: string): Promise<number> {
  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter?.seq ?? 1;
}

export function nextKhataCode(): Promise<string> {
  return nextSequence('khata').then((seq) => `KH-${String(seq).padStart(6, '0')}`);
}

export function nextTransactionCode(): Promise<string> {
  const year = businessNow().year();
  return nextSequence(`tx-${year}`).then(
    (seq) => `TX-${year}-${String(seq).padStart(6, '0')}`
  );
}

export function nextBillNumber(): Promise<string> {
  const year = businessNow().year();
  return nextSequence(`bill-${year}`).then(
    (seq) => `INV-${year}-${String(seq).padStart(6, '0')}`
  );
}

export function nextPaymentCode(): Promise<string> {
  const year = businessNow().year();
  return nextSequence(`pay-${year}`).then(
    (seq) => `PAY-${year}-${String(seq).padStart(6, '0')}`
  );
}