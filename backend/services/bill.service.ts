import mongoose from 'mongoose';
import { Bill } from '../models/bill.model';
import { Khata } from '../models/khata.model';
import { Boss } from '../models/boss.model';
import { Staff } from '../models/staff.model';
import { DailyConsumption } from '../models/dailyConsumption.model';
import { Payment } from '../models/payment.model';
import { ApiError } from '../utils/ApiError';
import { validateDateStr, isBeforeOrEqual } from '../utils/date';
import { buildPageMeta } from '../utils/pagination';
import { runInTransaction } from '../utils/transaction';
import { nextBillNumber } from './counter.service';
import { writeAuditLog } from './audit.service';
import { periodContaining, type BillingPeriod } from './period.service';
import type { CurrentAdmin } from '../middleware/auth';

export interface GenerateBillInput {
  khataId: string;
  bossId?: string | null;
  staffId?: string | null;
  periodStart: string;
  periodEnd: string;
}

interface LineItemRow {
  businessDate: string;
  itemId: mongoose.Types.ObjectId;
  itemNameSnapshot: string;
  servingSize: 'HALF' | 'FULL';
  quantity: number;
  unitPricePaisa: number;
  totalPaisa: number;
}

interface PayerContext {
  khataId: mongoose.Types.ObjectId;
  bossId: mongoose.Types.ObjectId | null;
  staffId: mongoose.Types.ObjectId | null;
  scope: 'INDIVIDUAL' | 'BOSS_GROUP' | 'STAFF' | 'OFFICE';
  payerName: string;
  billingStartDay: number;
  khataStartDate: string;
  khataEndDate: string | null;
  openingBalancePaisa: number;
}

async function resolvePayerContext(
  khataId: string,
  bossId: string | null | undefined,
  staffId: string | null | undefined
): Promise<PayerContext> {
  const khata = await Khata.findById(khataId);
  if (!khata) throw ApiError.notFound('Khata not found.', 'KHATA_NOT_FOUND');

  const base = {
    khataId: khata._id,
    billingStartDay: khata.billingStartDay,
    khataStartDate: khata.startDate,
    khataEndDate: khata.endDate ?? null,
    openingBalancePaisa: khata.openingBalancePaisa,
  };

  if (khata.type === 'INDIVIDUAL') {
    if (bossId || staffId) throw ApiError.badRequest('INDIVIDUAL_HAS_NO_BOSS', 'Individual khatas have no office billing groups or staff ledgers.');
    return { ...base, bossId: null, staffId: null, scope: 'INDIVIDUAL', payerName: khata.displayName };
  }

  if (staffId) {
    const staff = await Staff.findOne({ _id: staffId, khataId: khata._id });
    if (!staff) throw ApiError.notFound('Staff member not found for this office.', 'STAFF_NOT_FOUND');
    if (bossId && String(staff.bossId) !== bossId) {
      throw ApiError.conflict('STAFF_BOSS_MISMATCH', 'Selected staff member does not belong to this billing group.');
    }
    const hasStaffLedger = (staff.billingResponsibility ?? 'OFFICE') === 'SELF'
      || await DailyConsumption.exists({ payerStaffId: staff._id });
    if (!hasStaffLedger) {
      throw ApiError.conflict('STAFF_NOT_SELF_BILLED', 'This staff member is billed to the office, not to a personal staff balance.');
    }
    return {
      ...base,
      // Null for office-pool staff (no boss) — the staff ledger is keyed on
      // staffId alone, so a missing boss never merges it into another group.
      bossId: staff.bossId ?? null,
      staffId: staff._id,
      scope: 'STAFF',
      payerName: `${khata.displayName} — ${staff.name}`,
      // A staff member's own migrated paper due is carried into their first
      // personal bill (they are billed directly, like an individual khata).
      openingBalancePaisa: staff.openingBalancePaisa ?? 0,
    };
  }

  if (bossId) {
    const boss = await Boss.findOne({ _id: bossId, khataId: khata._id });
    if (!boss) throw ApiError.notFound('Boss not found for this office.', 'BOSS_NOT_FOUND');
    return {
      ...base,
      bossId: boss._id,
      staffId: null,
      scope: 'BOSS_GROUP',
      payerName: `${khata.displayName} — ${boss.name}`,
      // A boss's own migrated paper due is carried into their first group bill.
      openingBalancePaisa: boss.openingBalancePaisa ?? 0,
    };
  }

  // No boss, no staff: the office's OWN ledger (DIRECT/MIXED billing modes).
  // A GROUPS office has no ledger of its own, so it still needs a boss.
  if (khata.billingMode === 'DIRECT' || khata.billingMode === 'MIXED') {
    return {
      ...base,
      bossId: null,
      staffId: null,
      scope: 'OFFICE',
      payerName: khata.displayName,
      // The office ledger's migrated due is carried into its first bill.
      openingBalancePaisa: khata.openingBalancePaisa ?? 0,
    };
  }

  throw ApiError.badRequest('BOSS_REQUIRED', 'An office khata needs a boss specified for bill generation.');
}

/**
 * Clamps the requested window to the khata's own lifetime (PLAN §5 steps 1-2)
 * and rejects windows that are not a real billing period (step 3).
 *
 * Without this the caller fully controlled the window, so a khata billing on
 * day 10 could be invoiced for arbitrary fragments — a 2-day window, a window
 * before the khata existed, a single future day — fragmenting one billing
 * month across several invoices.
 *
 * Split into clamp/assert so `generateBill` can run its BILL_ALREADY_EXISTS
 * conflict check in between: the overlap query needs the clamped window, and
 * an overlapping sub-window must surface as 409 (it collides with a real
 * invoice) rather than 422 (it merely isn't a billing boundary).
 */
function clampBillWindow(
  periodStart: string,
  periodEnd: string,
  payer: PayerContext
): { periodStart: string; periodEnd: string } {
  let start = periodStart;
  let end = periodEnd;

  // 1. First period start = max(periodStart, khata.startDate).
  //    Clamp only when the caller asked for a window that BEGINS BEFORE the
  //    khata existed. `isBeforeOrEqual(a, b)` is `a <= b`, so a `=== false`
  //    test here inverts the branch and rewinds every normal later request to
  //    the khata's first day — which then collides with the first bill as
  //    BILL_ALREADY_EXISTS instead of billing the period that was asked for.
  if (isBeforeOrEqual(start, payer.khataStartDate)) {
    start = payer.khataStartDate;
  }
  // 2. Last period end = min(periodEnd, khata.endDate) when closed.
  if (payer.khataEndDate && isBeforeOrEqual(payer.khataEndDate, end)) {
    end = payer.khataEndDate;
  }

  if (isBeforeOrEqual(start, end) === false) {
    throw ApiError.validation(
      `This khata is not billable for ${periodStart} → ${periodEnd}; it is active from ${payer.khataStartDate}${
        payer.khataEndDate ? ` to ${payer.khataEndDate}` : ''
      }.`
    );
  }

  return { periodStart: start, periodEnd: end };
}

/** PLAN §5 step 3: the window must be a real billing period for this payer. */
function assertBillPeriodIsAligned(periodStart: string, periodEnd: string, payer: PayerContext): void {
  // Anchored on billingStartDay, unless clamped to the khata's own start/end
  // date (a legitimately partial first/last period, E-3/E-4).
  const anchored =
    Number(periodStart.slice(8, 10)) === payer.billingStartDay ||
    periodStart === payer.khataStartDate ||
    (payer.khataEndDate !== null && periodEnd === payer.khataEndDate);

  if (!anchored) {
    throw ApiError.validation(
      `Billing periods for this khata start on day ${payer.billingStartDay} of each month; ` +
        `${periodStart} → ${periodEnd} is not one.`
    );
  }
}

/** Convenience: compute the current open billing period for a payer. */
export async function currentPeriodForKhata(khataId: string, _bossId?: string | null): Promise<BillingPeriod | null> {
  const khata = await Khata.findById(khataId);
  if (!khata) return null;
  return periodContaining(khata.billingStartDay, khata.startDate, khata.endDate ?? null);
}

/**
 * Generates a bill for a payer-key over [periodStart, periodEnd].
 *
 * The bill FREEZES a snapshot of consumption line items; previous unpaid dues
 * carry forward; existing credit (advance payments) is applied automatically.
 * All writes happen in one transaction (E-10 / E-18 / §75).
 */
export async function generateBill(input: GenerateBillInput, admin: CurrentAdmin) {
  if (!validateDateStr(input.periodStart) || !validateDateStr(input.periodEnd)) {
    throw ApiError.validation('periodStart and periodEnd must be valid YYYY-MM-DD dates.');
  }
  if (isBeforeOrEqual(input.periodStart, input.periodEnd) === false) {
    throw ApiError.validation('periodStart must be on or before periodEnd.');
  }

  const payer = await resolvePayerContext(input.khataId, input.bossId, input.staffId);
  const window = clampBillWindow(input.periodStart, input.periodEnd, payer);
  input = { ...input, periodStart: window.periodStart, periodEnd: window.periodEnd };

  // E-10: reject an overlapping non-voided bill for the same payer.
  //
  // Checked BEFORE the billing-boundary assertion: a window that overlaps a
  // real invoice is a conflict (409) whether or not it also lands on a billing
  // boundary. Reporting 422 "not a billing period" there would hide the actual
  // problem — that money has already been invoiced.
  const overlap = await Bill.findOne({
    khataId: payer.khataId,
    bossId: payer.bossId ?? null,
    staffId: payer.staffId ?? null,
    isVoided: false,
    $or: [
      { periodStart: { $lte: input.periodEnd }, periodEnd: { $gte: input.periodStart } },
    ],
  });
  if (overlap) {
    throw ApiError.conflict(
      'BILL_ALREADY_EXISTS',
      `A bill (${overlap.billNumber}) already exists for ${overlap.periodStart} → ${overlap.periodEnd}. Void it first to regenerate.`
    );
  }

  assertBillPeriodIsAligned(input.periodStart, input.periodEnd, payer);

  // 1. Consumption line items from the read model (frozen snapshot).
  const lineRows = await DailyConsumption.aggregate<LineItemRow>([
    {
      $match: {
        khataId: payer.khataId,
        bossId: payer.bossId ?? { $in: [null] },
        payerStaffId: payer.staffId ?? { $in: [null] },
        businessDate: { $gte: input.periodStart, $lte: input.periodEnd },
        quantity: { $gt: 0 },
      },
    },
    {
      $group: {
        _id: {
          businessDate: '$businessDate',
          itemId: '$itemId',
          servingSize: '$servingSize',
          unitPricePaisa: '$unitPricePaisa',
        },
        businessDate: { $first: '$businessDate' },
        itemId: { $first: '$itemId' },
        itemNameSnapshot: { $first: '$itemNameSnapshot' },
        servingSize: { $first: { $ifNull: ['$servingSize', 'FULL'] } },
        quantity: { $sum: '$quantity' },
        unitPricePaisa: { $first: '$unitPricePaisa' },
        totalPaisa: { $sum: '$totalPaisa' },
      },
    },
    { $sort: { businessDate: 1, itemNameSnapshot: 1 } },
  ]);

  const consumptionTotal = lineRows.reduce((acc, r) => acc + r.totalPaisa, 0);

  // 2. Previous unpaid dues (excluding this period's bill).
  const preMaster = await Bill.aggregate<{ total: number; count: number }>([
    {
      $match: {
        khataId: payer.khataId,
        bossId: payer.bossId ?? null,
        staffId: payer.staffId ?? null,
        isVoided: false,
      },
    },
    { $group: { _id: null, total: { $sum: '$duePaisa' }, count: { $sum: 1 } } },
  ]);
  const carriedDue = preMaster[0]?.total ?? 0;

  // 2b. Migrated paper dues must land on a bill or they are uncollectable:
  //     payments allocate FIFO across BILLS, so a balance that never reaches an
  //     invoice stays "outstanding" forever even though the ledger's due
  //     correctly included it.
  //
  //     `payer.openingBalancePaisa` is that LEDGER's own opening: the khata's
  //     for INDIVIDUAL and for the office's own OFFICE ledger, the staff
  //     member's for STAFF, the boss's for BOSS_GROUP.
  //     It is added to the payer's FIRST bill only — adding it to every bill
  //     would re-charge the same opening each period. (Each ledger carries its
  //     own opening, so folding it into that ledger's bill is not a double
  //     count against the office total.)
  const isFirstBillForPayer = (preMaster[0]?.count ?? 0) === 0;
  const openingBalance = isFirstBillForPayer ? payer.openingBalancePaisa : 0;
  const previousDue = carriedDue + openingBalance;

  // 3. Available credit from advance/overpayments, oldest first.
  const creditPayments = await Payment.find({
    khataId: payer.khataId,
    bossId: payer.bossId ?? null,
    staffId: payer.staffId ?? null,
    isVoided: false,
    unallocatedPaisa: { $gt: 0 },
  })
    .sort({ paymentDate: 1, createdAt: 1 })
    .lean();

  // 4/5/6. Apply credit up to (consumption + previousDue).
  let creditApplied = 0;
  const creditDetail: Array<{ paymentId: string; amount: number }> = [];
  for (const payment of creditPayments) {
    const take = Math.min(payment.unallocatedPaisa, consumptionTotal + previousDue - creditApplied);
    if (take <= 0) break;
    creditApplied += take;
    creditDetail.push({ paymentId: String(payment._id), amount: take });
  }

  const totalPayable = consumptionTotal + previousDue - creditApplied;
  const status = totalPayable === 0 ? 'PAID' : 'UNPAID';
  const billNumber = await nextBillNumber();

  await runInTransaction(async (session) => {
    const [bill] = await Bill.create(
      [
        {
          billNumber,
          khataId: payer.khataId,
          bossId: payer.bossId,
          staffId: payer.staffId,
          scope: payer.scope,
          payerNameSnapshot: payer.payerName,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          generatedAt: new Date(),
          lineItems: lineRows.map((r) => ({
            businessDate: r.businessDate,
            itemId: r.itemId,
            itemNameSnapshot: r.itemNameSnapshot,
            servingSize: r.servingSize ?? 'FULL',
            quantity: r.quantity,
            unitPricePaisa: r.unitPricePaisa,
            totalPaisa: r.totalPaisa,
          })),
          consumptionTotalPaisa: consumptionTotal,
          previousDuePaisa: previousDue,
          creditAppliedPaisa: creditApplied,
          totalPayablePaisa: totalPayable,
          paidPaisa: 0,
          duePaisa: totalPayable,
          status,
          isVoided: false,
          createdBy: admin.adminId,
        },
      ],
      { session: session ?? undefined }
    );

    // 7. Consume the applied credit on those payments. These are tagged CREDIT
    //    (not PAYMENT) because this money was received earlier — it is not a
    //    payment of this bill's due, and voiding it must hand the credit back
    //    rather than restore paidPaisa.
    for (const detail of creditDetail) {
      await Payment.updateOne(
        { _id: detail.paymentId },
        {
          $inc: { unallocatedPaisa: -detail.amount },
          $push: {
            allocations: { billId: bill._id, amountPaisa: detail.amount, kind: 'CREDIT' },
          },
        },
        { session: session ?? undefined }
      );
    }

    await writeAuditLog({
      adminId: admin.adminId,
      adminNameSnapshot: admin.adminName,
      action: 'BILL_GENERATED',
      entity: 'Bill',
      entityId: String(bill._id),
      after: {
        billNumber,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        consumptionTotal,
        previousDue,
        openingBalanceCarried: openingBalance,
        creditApplied,
        totalPayable,
      },
    });
  });

  return getBillForResponse(String(billNumber), payer);
}

// Helper kept simple: re-fetch so the response is a joined, page-friendly shape.
async function getBillForResponse(billNumber: string, payer: PayerContext) {
  const bill = await Bill.findOne({ billNumber }).lean();
  if (!bill) throw ApiError.internal('Bill was created but could not be loaded.');
  return {
    ...bill,
    _id: String(bill._id),
    khataId: String(bill.khataId),
    bossId: bill.bossId ? String(bill.bossId) : null,
    staffId: bill.staffId ? String(bill.staffId) : null,
    khataName: payer.payerName,
  };
}

export async function listBills(params: {
  khataId?: string;
  bossId?: string;
  staffId?: string;
  status?: string;
  isVoided?: boolean;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {};
  if (params.khataId) filter.khataId = params.khataId;
  if (params.bossId) filter.bossId = params.bossId;
  if (params.staffId) filter.staffId = params.staffId;
  if (params.status) filter.status = params.status;
  if (params.isVoided !== undefined) filter.isVoided = params.isVoided;

  const [bills, total] = await Promise.all([
    Bill.find(filter).sort({ periodStart: -1, createdAt: -1 }).skip((params.page - 1) * params.limit).limit(params.limit).lean(),
    Bill.countDocuments(filter),
  ]);

  return {
    rows: bills.map((b) => ({
      ...b,
      _id: String(b._id),
      khataId: String(b.khataId),
      bossId: b.bossId ? String(b.bossId) : null,
      staffId: b.staffId ? String(b.staffId) : null,
    })),
    meta: buildPageMeta(total, params.page, params.limit),
  };
}

export async function getBill(id: string, withKhata = false) {
  const bill = await Bill.findById(id).lean();
  if (!bill) throw ApiError.notFound('Bill not found.', 'BILL_NOT_FOUND');

  const row: Record<string, unknown> = {
    ...bill,
    _id: String(bill._id),
    khataId: String(bill.khataId),
    bossId: bill.bossId ? String(bill.bossId) : null,
    staffId: bill.staffId ? String(bill.staffId) : null,
  };
  if (withKhata) {
    const khata = await Khata.findById(bill.khataId).select('displayName address phone').lean();
    if (khata) {
      row.khata = { displayName: khata.displayName, address: khata.address, phone: khata.phone };
    }
  }
  return row;
}

/**
 * Voids a bill and releases every payment allocation that pointed at it back
 * to the payments' unallocated credit (E-14), then a fresh bill can be
 * regenerated for the same period with a new number.
 */
export async function voidBill(id: string, reason: string, admin: CurrentAdmin) {
  const bill = await Bill.findById(id);
  if (!bill) throw ApiError.notFound('Bill not found.', 'BILL_NOT_FOUND');
  if (bill.isVoided) throw ApiError.conflict('BILL_ALREADY_VOIDED', 'This bill is already voided.');

  let released = 0;

  await runInTransaction(async (session) => {
    // The allocation read MUST happen inside the transaction and in the same
    // session as the write. Read outside it, a payment allocated between the
    // read and the write is missing from the release and its credit is lost.
    const payments = await Payment.find({ 'allocations.billId': bill._id })
      .session(session ?? null)
      .lean();

    // Release PER PAYMENT, never via `Payment.updateMany`. `released` below is
    // the sum across all of them, so a single `$inc` in an updateMany credits
    // that total to EVERY matched payment — a Rs 3000 bill paid by two people
    // would return Rs 3000 to each, inventing Rs 3000 of credit out of
    // nothing. Each payment is only owed what it actually allocated here.
    let totalReleased = 0;
    for (const payment of payments) {
      const forThisBill = payment.allocations
        .filter((a) => String(a.billId) === String(bill._id))
        .reduce((sum, a) => sum + a.amountPaisa, 0);
      if (forThisBill <= 0) continue;

      totalReleased += forThisBill;
      await Payment.updateOne(
        { _id: payment._id },
        {
          $pull: { allocations: { billId: bill._id } },
          $inc: { unallocatedPaisa: forThisBill },
        },
        { session: session ?? undefined }
      );
    }
    released = totalReleased;

    bill.isVoided = true;
    bill.voidedBy = admin.adminId ? new mongoose.Types.ObjectId(admin.adminId) : null;
    bill.voidedAt = new Date();
    bill.voidReason = reason;
    await bill.save({ session: session ?? undefined });

    await writeAuditLog({
      adminId: admin.adminId,
      adminNameSnapshot: admin.adminName,
      action: 'BILL_VOIDED',
      entity: 'Bill',
      entityId: String(bill._id),
      before: { billNumber: bill.billNumber, duePaisa: bill.duePaisa, paidPaisa: bill.paidPaisa },
      after: { reason, releasedCredit: released },
    });
  });

  return { billNumber: bill.billNumber, voided: true, releasedCreditPaisa: released };
}