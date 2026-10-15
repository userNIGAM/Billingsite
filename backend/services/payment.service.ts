import mongoose from 'mongoose';
import { Payment } from '../models/payment.model';
import { Bill } from '../models/bill.model';
import { Khata } from '../models/khata.model';
import { Boss } from '../models/boss.model';
import { Staff } from '../models/staff.model';
import { ApiError } from '../utils/ApiError';
import { validateDateStr } from '../utils/date';
import { buildPageMeta } from '../utils/pagination';
import { runInTransaction } from '../utils/transaction';
import { nextPaymentCode } from './counter.service';
import { writeAuditLog } from './audit.service';
import type { CurrentAdmin } from '../middleware/auth';

export type PaymentMethod = 'CASH' | 'DIGITAL' | 'OTHER';
export type DigitalChannel = 'ESEWA' | 'KHALTI' | 'BANK' | 'QR';

export interface RecordPaymentInput {
  khataId: string;
  bossId?: string | null;
  staffId?: string | null;
  amountPaisa: number;
  method: PaymentMethod;
  digitalChannel?: DigitalChannel | null;
  paymentDate: string;
  reference?: string;
  note?: string;
}

function recalcStatus(bill: { paidPaisa: number; totalPayablePaisa: number }): 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID' {
  if (bill.paidPaisa === 0) return 'UNPAID';
  if (bill.paidPaisa < bill.totalPayablePaisa) return 'PARTIALLY_PAID';
  if (bill.paidPaisa === bill.totalPayablePaisa) return 'PAID';
  return 'OVERPAID';
}

/**
 * Records a payment and FIFO-allocates it to the payer-key's oldest unpaid
 * bills (§6). Anything left over becomes credit (unallocatedPaisa) that the
 * next bill generation consumes automatically (§28/§56/§82).
 */
export async function recordPayment(input: RecordPaymentInput, admin: CurrentAdmin) {
  if (!validateDateStr(input.paymentDate)) {
    throw ApiError.validation('paymentDate must be a valid YYYY-MM-DD date.');
  }

  const khata = await Khata.findById(input.khataId);
  if (!khata) throw ApiError.notFound('Khata not found.', 'KHATA_NOT_FOUND');

  let bossId: mongoose.Types.ObjectId | null = null;
  let staffId: mongoose.Types.ObjectId | null = null;
  let payerNameSnapshot = khata.displayName;
  if (khata.type === 'OFFICE') {
    if (input.staffId) {
      const staff = await Staff.findOne({ _id: input.staffId, khataId: khata._id });
      if (!staff) throw ApiError.notFound('Staff member not found for this office.', 'STAFF_NOT_FOUND');
      if ((staff.billingResponsibility ?? 'OFFICE') !== 'SELF') {
        const hasOpenStaffLedger = await Bill.exists({
          staffId: staff._id,
          isVoided: false,
          duePaisa: { $gt: 0 },
        }) || await Payment.exists({
          staffId: staff._id,
          isVoided: false,
          unallocatedPaisa: { $gt: 0 },
        });
        if (!hasOpenStaffLedger) {
        throw ApiError.conflict('STAFF_NOT_SELF_BILLED', 'This staff member has no separate personal balance.');
        }
      }
      if (input.bossId && String(staff.bossId) !== input.bossId) {
        throw ApiError.conflict('STAFF_BOSS_MISMATCH', 'Selected staff member does not belong to this billing group.');
      }
      staffId = staff._id;
      bossId = staff.bossId;
      payerNameSnapshot = `${khata.displayName} — ${staff.name}`;
    } else {
    if (!input.bossId) {
      throw ApiError.badRequest('BOSS_REQUIRED', 'Payments for an office must specify the boss/billing group.');
    }
    const boss = await Boss.findOne({ _id: input.bossId, khataId: khata._id });
    if (!boss) throw ApiError.notFound('Boss not found for this office.', 'BOSS_NOT_FOUND');
    bossId = boss._id;
    payerNameSnapshot = `${khata.displayName} — ${boss.name}`;
    }
  } else if (input.staffId) {
    throw ApiError.badRequest('INDIVIDUAL_HAS_NO_STAFF', 'Individual khatas cannot use office staff balances.');
  } else if (input.bossId) {
    throw ApiError.badRequest('INDIVIDUAL_HAS_NO_BOSS', 'Individual khatas have no billing groups.');
  }

  const paymentCode = await nextPaymentCode();

  await runInTransaction(async (session) => {
    const bills = await Bill.find({
      khataId: khata._id,
      bossId: bossId ?? null,
      staffId: staffId ?? null,
      isVoided: false,
      status: { $in: ['UNPAID', 'PARTIALLY_PAID'] },
      duePaisa: { $gt: 0 },
    })
      .sort({ periodStart: 1, createdAt: 1 })
      .session(session ?? null);

    let remaining = input.amountPaisa;
    const allocations: Array<{
      billId: mongoose.Types.ObjectId;
      amountPaisa: number;
      kind: 'PAYMENT' | 'CREDIT';
    }> = [];

    for (const bill of bills) {
      if (remaining <= 0) break;
      const applied = Math.min(bill.duePaisa, remaining);
      bill.paidPaisa += applied;
      bill.duePaisa -= applied;
      bill.status = recalcStatus(bill);
      await bill.save({ session: session ?? undefined });
      allocations.push({ billId: bill._id, amountPaisa: applied, kind: 'PAYMENT' });
      remaining -= applied;
    }

    const [payment] = await Payment.create(
      [
        {
          paymentCode,
          khataId: khata._id,
          bossId: bossId ?? null,
          staffId: staffId ?? null,
          payerNameSnapshot,
          amountPaisa: input.amountPaisa,
          method: input.method,
          digitalChannel: input.digitalChannel ?? null,
          paymentDate: input.paymentDate,
          receivedAt: new Date(),
          reference: input.reference ?? '',
          note: input.note ?? '',
          allocations,
          unallocatedPaisa: remaining,
          isVoided: false,
          createdBy: admin.adminId ?? null,
        },
      ],
      { session: session ?? undefined }
    );

    await writeAuditLog({
      adminId: admin.adminId,
      adminNameSnapshot: admin.adminName,
      action: 'PAYMENT_RECORDED',
      entity: 'Payment',
      entityId: String(payment._id),
      after: {
        paymentCode,
        amountPaisa: input.amountPaisa,
        method: input.method,
        allocated: allocations.reduce((a, x) => a + x.amountPaisa, 0),
        unallocated: remaining,
        billIds: allocations.map((a) => String(a.billId)),
      },
    });
  });

  return getPaymentSnap(String(khata._id), paymentCode);
}

async function getPaymentSnap(khataId: string, paymentCode: string) {
  const payment = await Payment.findOne({ paymentCode }).lean();
  if (!payment) throw ApiError.internal('Payment created but could not be loaded.');
  const khata = await Khata.findById(khataId).select('displayName').lean();
  return {
    ...payment,
    _id: String(payment._id),
    khataId: String(payment.khataId),
    bossId: payment.bossId ? String(payment.bossId) : null,
    staffId: payment.staffId ? String(payment.staffId) : null,
    payerNameSnapshot: payment.payerNameSnapshot || khata?.displayName || '',
    khataName: khata?.displayName ?? '',
    paymentId: String(payment._id),
  };
}

export async function listPayments(params: {
  khataId?: string;
  bossId?: string;
  staffId?: string;
  method?: string;
  isVoided?: boolean;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {};
  if (params.khataId) filter.khataId = params.khataId;
  if (params.bossId) filter.bossId = params.bossId;
  if (params.staffId) filter.staffId = params.staffId;
  if (params.method) filter.method = params.method;
  if (params.isVoided !== undefined) filter.isVoided = params.isVoided;
  if (params.from || params.to) {
    filter.paymentDate = {
      ...(params.from ? { $gte: params.from } : {}),
      ...(params.to ? { $lte: params.to } : {}),
    };
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter).sort({ paymentDate: -1, createdAt: -1 }).skip((params.page - 1) * params.limit).limit(params.limit).lean(),
    Payment.countDocuments(filter),
  ]);

  const khataIds = [...new Set(payments.map((p) => String(p.khataId)))];
  const khatas = await Khata.find({ _id: { $in: khataIds } }).select('displayName').lean();
  const nameById = new Map(khatas.map((k) => [String(k._id), k.displayName]));

  return {
    rows: payments.map((p) => ({
      ...p,
      _id: String(p._id),
      khataId: String(p.khataId),
      bossId: p.bossId ? String(p.bossId) : null,
      staffId: p.staffId ? String(p.staffId) : null,
      payerNameSnapshot: p.payerNameSnapshot,
      khataName: nameById.get(String(p.khataId)) ?? '',
    })),
    meta: buildPageMeta(total, params.page, params.limit),
  };
}

export async function getPayment(id: string) {
  const payment = await Payment.findById(id).lean();
  if (!payment) throw ApiError.notFound('Payment not found.', 'PAYMENT_NOT_FOUND');
  return {
    ...payment,
    _id: String(payment._id),
    khataId: String(payment.khataId),
    bossId: payment.bossId ? String(payment.bossId) : null,
    staffId: payment.staffId ? String(payment.staffId) : null,
  };
}

/**
 * Voiding a payment undoes whatever it did to bills, and the two allocation
 * kinds need opposite corrections (E-14):
 *
 * - `PAYMENT` was cash FIFO-allocated against a due, so the due comes back.
 * - `CREDIT` was advance money consumed at bill generation. It was never
 *   `paidPaisa`, so subtracting it from `paidPaisa` was a no-op and the bill's
 *   due stayed clamped at its already-net-of-credit `totalPayablePaisa` —
 *   i.e. the real consumption silently stopped being collectible and the bill
 *   was left claiming UNPAID with a due of 0. Instead the credit is handed
 *   back: `creditAppliedPaisa` and `totalPayablePaisa` fall and `duePaisa`
 *   rises, which keeps the bill's invariants intact:
 *   totalPayable = consumptionTotal + previousDue - creditApplied
 *   due          = totalPayable - paid
 */
export async function voidPayment(id: string, reason: string, admin: CurrentAdmin) {
  const payment = await Payment.findById(id);
  if (!payment) throw ApiError.notFound('Payment not found.', 'PAYMENT_NOT_FOUND');
  if (payment.isVoided) throw ApiError.conflict('PAYMENT_ALREADY_VOIDED', 'This payment is already voided.');

  await runInTransaction(async (session) => {
    for (const alloc of payment.allocations) {
      const bill = await Bill.findById(alloc.billId).session(session ?? null);
      if (!bill) continue;

      if (alloc.kind === 'CREDIT') {
        bill.creditAppliedPaisa = Math.max(0, bill.creditAppliedPaisa - alloc.amountPaisa);
        bill.totalPayablePaisa += alloc.amountPaisa;
        bill.duePaisa += alloc.amountPaisa;
      } else {
        bill.paidPaisa = Math.max(0, bill.paidPaisa - alloc.amountPaisa);
        bill.duePaisa = Math.min(bill.totalPayablePaisa, bill.duePaisa + alloc.amountPaisa);
      }

      bill.status = recalcStatus(bill);
      await bill.save({ session: session ?? undefined });
    }

    payment.isVoided = true;
    payment.voidedBy = admin.adminId ? new mongoose.Types.ObjectId(admin.adminId) : null;
    payment.voidedAt = new Date();
    payment.voidReason = reason;
    payment.allocations.splice(0, payment.allocations.length);
    payment.unallocatedPaisa = 0;
    await payment.save({ session: session ?? undefined });

    await writeAuditLog({
      adminId: admin.adminId,
      adminNameSnapshot: admin.adminName,
      action: 'PAYMENT_VOIDED',
      entity: 'Payment',
      entityId: String(payment._id),
      before: { paymentCode: payment.paymentCode, amountPaisa: payment.amountPaisa },
      after: { reason },
    });
  });

  return { paymentCode: payment.paymentCode, voided: true };
}