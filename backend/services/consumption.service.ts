import mongoose from 'mongoose';
import { ConsumptionTransaction, type ConsumptionTransactionDoc } from '../models/consumptionTransaction.model';
import { DailyConsumption } from '../models/dailyConsumption.model';
import { Item } from '../models/item.model';
import { Bill } from '../models/bill.model';
import { ApiError } from '../utils/ApiError';
import { todayBusinessDate, validateDateStr } from '../utils/date';
import { buildPageMeta } from '../utils/pagination';
import { multiplyPaisa } from '../utils/paisa';
import { runInTransaction } from '../utils/transaction';
import { nextTransactionCode } from './counter.service';
import { writeAuditLog } from './audit.service';
import { resolveConsumer, type ConsumerType } from './customer.service';
import type { CurrentAdmin } from '../middleware/auth';

export interface RecordConsumptionInput {
  consumerType: ConsumerType;
  consumerId: string;
  itemId: string;
  /** HALF or FULL; omitted by old clients and treated as FULL. */
  servingSize?: ServingSize;
  quantity: number;
  notes?: string;
  /** Business date for backdated seeding; defaults to today (Asia/Kathmandu). */
  businessDate?: string;
}

export type ServingSize = 'HALF' | 'FULL';

export interface ConsumerResolution {
  khataId: string;
  bossId: string | null;
  payerStaffId: string | null;
  consumerName: string;
  context: string;
  khata: { _id: unknown; status: string; type: string; displayName: string };
}

/**
 * Resolves the TRUSTED unit price for a serving size from the item's own
 * configuration. The client never submits a price — it only names the serving
 * size, and a HALF request against a FULL_ONLY item is rejected outright.
 */
export function resolveServing(
  item: { name: string; servingMode?: string | null; sellingPricePaisa: number; halfPlatePricePaisa?: number | null },
  requested: ServingSize
): { servingSize: ServingSize; unitPricePaisa: number } {
  const servingMode = item.servingMode ?? 'FULL_ONLY';
  if (requested === 'HALF') {
    if (servingMode !== 'HALF_AND_FULL' || item.halfPlatePricePaisa == null) {
      throw ApiError.conflict('SERVING_SIZE_NOT_AVAILABLE', `"${item.name}" is not available as a half plate.`);
    }
    return { servingSize: 'HALF', unitPricePaisa: item.halfPlatePricePaisa };
  }
  return { servingSize: 'FULL', unitPricePaisa: item.sellingPricePaisa };
}

function assertActiveKhata(consumer: ConsumerResolution) {
  if (consumer.khata.status !== 'ACTIVE') {
    throw ApiError.conflict(
      'KHATA_OFFLINE',
      `"${consumer.khata.displayName}" is offline and cannot receive new orders. Activate the khata first.`
    );
  }
}

/**
 * Records one order event and upserts the daily aggregation cell in a single
 * transaction (§8). The unique (consumerId, bossId, businessDate, itemId,
 * unitPricePaisa) index makes concurrent taps idempotent and atomic (E-1).
 */
export async function recordConsumption(input: RecordConsumptionInput, admin: CurrentAdmin) {
  const consumer = await resolveConsumer(input.consumerType, input.consumerId);
  assertActiveKhata(consumer);

  const item = await Item.findById(input.itemId);
  if (!item) throw ApiError.notFound('Item not found.', 'ITEM_NOT_FOUND');
  if (!item.isActive) throw ApiError.conflict('ITEM_INACTIVE', `"${item.name}" is deactivated and cannot be ordered.`);

  const businessDate = input.businessDate ?? todayBusinessDate();
  if (input.businessDate && !validateDateStr(input.businessDate)) {
    throw ApiError.validation('businessDate must be a valid YYYY-MM-DD date.');
  }

  // E-9: the same protection a void gets. An order added to a period that has
  // already been billed would land in the read model but can never appear on
  // the issued invoice (the non-voided bill blocks regeneration), leaving the
  // ledger and the customer's copy permanently disagreeing.
  const finalized = await Bill.findOne({
    khataId: consumer.khataId,
    bossId: consumer.bossId ?? null,
    staffId: consumer.payerStaffId ?? null,
    isVoided: false,
    periodStart: { $lte: businessDate },
    periodEnd: { $gte: businessDate },
  })
    .select('billNumber')
    .lean();
  if (finalized) {
    throw ApiError.conflict(
      'BILL_FINALIZED',
      `Bill ${finalized.billNumber} already covers ${businessDate}. Void that bill first, then record the order and regenerate.`
    );
  }

  const transactionCode = await nextTransactionCode();
  // Server-side price. `input.servingSize` only selects WHICH configured price
  // applies; no client-supplied amount is ever trusted (PLAN §6).
  const { servingSize, unitPricePaisa } = resolveServing(item, input.servingSize ?? 'FULL');
  const totalPaisa = multiplyPaisa(unitPricePaisa, input.quantity);

  // Hoisted out of the transaction callback so the response can return the
  // document id (see the return below).
  let transaction!: ConsumptionTransactionDoc;

  await runInTransaction(async (session) => {
    [transaction] = await ConsumptionTransaction.create(
      [
        {
          transactionCode,
          khataId: consumer.khataId,
          bossId: consumer.bossId,
          payerStaffId: consumer.payerStaffId,
          consumerType: input.consumerType,
          consumerId: input.consumerId,
          consumerNameSnapshot: consumer.consumerName,
          consumerContextSnapshot: consumer.context,
          itemId: item._id,
          itemNameSnapshot: item.name,
          servingSize,
          unitPricePaisa,
          unitCostPaisa: item.costPricePaisa ?? null,
          quantity: input.quantity,
          totalPaisa,
          businessDate,
          entryType: 'ORDER',
          status: 'ACTIVE',
          notes: input.notes ?? '',
          createdBy: admin.adminId,
        },
      ],
      { session: session ?? undefined }
    );

    await DailyConsumption.updateOne(
      {
        consumerId: input.consumerId,
        bossId: consumer.bossId ?? null,
        payerStaffId: consumer.payerStaffId ?? null,
        businessDate,
        itemId: item._id,
        servingSize,
        unitPricePaisa,
      },
      {
        $inc: { quantity: input.quantity, totalPaisa },
        $setOnInsert: {
          khataId: consumer.khataId,
          consumerType: input.consumerType,
          payerStaffId: consumer.payerStaffId,
          consumerNameSnapshot: consumer.consumerName,
          consumerContextSnapshot: consumer.context,
          itemNameSnapshot: item.name,
          unitCostPaisa: item.costPricePaisa ?? null,
        },
        $set: { updatedAt: new Date() },
      },
      { upsert: true, session: session ?? undefined }
    );

    await writeAuditLog({
      adminId: admin.adminId,
      adminNameSnapshot: admin.adminName,
      action: 'CONSUMPTION_ORDERED',
      entity: 'ConsumptionTransaction',
      // AuditLog.entityId is an ObjectId. Passing the human-facing
      // transactionCode here threw a CastError that audit.service swallowed,
      // so no order was ever recorded in the audit trail.
      entityId: String(transaction._id),
      after: {
        transactionCode,
        consumerType: input.consumerType,
        consumerId: input.consumerId,
        consumerName: consumer.consumerName,
        item: item.name,
        servingSize,
        quantity: input.quantity,
        totalPaisa,
      },
    });
  });

  return {
    // `_id` is required by the caller: PATCH /consumption/:id/void takes the
    // document id, so without it a client that has just recorded an order has
    // no handle to correct it. `transactionCode` is the human-facing reference
    // for receipts and search.
    _id: String(transaction._id),
    transactionCode,
    consumerType: input.consumerType,
    consumerId: input.consumerId,
    consumerName: consumer.consumerName,
    context: consumer.context,
    itemName: item.name,
    servingSize,
    quantity: input.quantity,
    totalPaisa,
    businessDate,
  };
}

/**
 * Voids an ORDER by appending a REVERSAL row that negates it (§22/§53). The
 * original event stays in the log so the audit trail shows BOTH the mistake and
 * the correction; the daily cell nets to the correct total (§77, E-19).
 *
 * The ORDER is marked VOIDED, which is what makes a second void a 409 instead
 * of a second reversal. Without the status write the `tx.status !== 'ACTIVE'`
 * guard above could never fire, so the same order could be reversed any number
 * of times, driving the read model negative while the bill kept reporting the
 * pre-void total (reports filter `quantity: { $gt: 0 }`, so the corruption
 * stayed invisible).
 */
export async function voidConsumption(transactionId: string, reason: string, admin: CurrentAdmin) {
  const tx = await ConsumptionTransaction.findById(transactionId);
  if (!tx) throw ApiError.notFound('Transaction not found.', 'TRANSACTION_NOT_FOUND');
  if (tx.entryType !== 'ORDER') throw ApiError.conflict('NOT_AN_ORDER', 'Only order records can be voided.');
  if (tx.status !== 'ACTIVE') throw ApiError.conflict('ALREADY_VOIDED', 'This record has already been voided.');

  // E-9: a consumption inside a finalized bill period cannot be corrected
  // until that bill is voided first.
  const finalized = await Bill.exists({
    khataId: tx.khataId,
    bossId: tx.bossId ?? null,
    staffId: tx.payerStaffId ?? null,
    isVoided: false,
    periodStart: { $lte: tx.businessDate },
    periodEnd: { $gte: tx.businessDate },
  });
  if (finalized) {
    throw ApiError.conflict(
      'BILL_FINALIZED',
      'A bill has already been generated for this period. Void that bill first, then correct the record and regenerate.'
    );
  }

  const reversalQuantity = -tx.quantity;
  const reversalTotal = -multiplyPaisa(tx.unitPricePaisa, tx.quantity);
  const transactionCode = await nextTransactionCode();

  await runInTransaction(async (session) => {
    await ConsumptionTransaction.create(
      [
        {
          transactionCode,
          khataId: tx.khataId,
          bossId: tx.bossId,
          payerStaffId: tx.payerStaffId,
          consumerType: tx.consumerType,
          consumerId: tx.consumerId,
          consumerNameSnapshot: tx.consumerNameSnapshot,
          consumerContextSnapshot: tx.consumerContextSnapshot,
          itemId: tx.itemId,
          itemNameSnapshot: tx.itemNameSnapshot,
          servingSize: tx.servingSize ?? 'FULL',
          unitPricePaisa: tx.unitPricePaisa,
          unitCostPaisa: tx.unitCostPaisa,
          quantity: reversalQuantity,
          totalPaisa: reversalTotal,
          businessDate: tx.businessDate,
          entryType: 'REVERSAL',
          reversesTransactionId: tx._id,
          status: 'ACTIVE',
          voidReason: reason,
          createdBy: admin.adminId,
        },
      ],
      { session: session ?? undefined }
    );

    // The ORDER row is retained for the audit trail but is no longer ACTIVE.
    tx.status = 'VOIDED';
    tx.voidedBy = admin.adminId ? new mongoose.Types.ObjectId(admin.adminId) : null;
    tx.voidedAt = new Date();
    tx.voidReason = reason;
    await tx.save({ session: session ?? undefined });

    // bossId is part of the cell key, and it is the boss recorded on the order,
    // so this always nets the cell the original order was $inc'd into.
    await DailyConsumption.updateOne(
      {
        consumerId: tx.consumerId,
        bossId: tx.bossId ?? null,
        payerStaffId: tx.payerStaffId ?? null,
        businessDate: tx.businessDate,
        itemId: tx.itemId,
        servingSize: tx.servingSize ?? 'FULL',
        unitPricePaisa: tx.unitPricePaisa,
      },
      {
        $inc: { quantity: reversalQuantity, totalPaisa: reversalTotal },
        $set: { updatedAt: new Date() },
      },
      { upsert: true, session: session ?? undefined }
    );

    await writeAuditLog({
      adminId: admin.adminId,
      adminNameSnapshot: admin.adminName,
      action: 'CONSUMPTION_VOIDED',
      entity: 'ConsumptionTransaction',
      entityId: String(tx._id),
      before: {
        quantity: tx.quantity,
        itemName: tx.itemNameSnapshot,
        transactionCode: tx.transactionCode,
      },
      after: { reason, reversalCode: transactionCode },
    });
  });

  return {
    voidedTransactionId: String(tx._id),
    reversalTransactionCode: transactionCode,
    reversalTotal,
  };
}

export async function listConsumptions(params: {
  date?: string;
  khataId?: string;
  bossId?: string;
  consumerId?: string;
  itemId?: string;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {};
  if (params.date) filter.businessDate = params.date;
  if (params.khataId) filter.khataId = params.khataId;
  if (params.bossId) filter.bossId = params.bossId;
  if (params.consumerId) filter.consumerId = params.consumerId;
  if (params.itemId) filter.itemId = params.itemId;

  const [rows, total] = await Promise.all([
    ConsumptionTransaction.find(filter)
      .sort({ occurredAt: -1 })
      .skip((params.page - 1) * params.limit)
      .limit(params.limit)
      .lean(),
    ConsumptionTransaction.countDocuments(filter),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
    meta: buildPageMeta(total, params.page, params.limit),
  };
}

export interface DailyRow {
  _id: string;
  khataId: string;
  bossId: string | null;
  payerStaffId: string | null;
  consumerType: ConsumerType;
  consumerId: string;
  consumerName: string;
  consumerContext: string;
  itemId: string;
  itemName: string;
  servingSize: ServingSize;
  unitPricePaisa: number;
  quantity: number;
  totalPaisa: number;
}

/**
 * "Today's Records" (§21) — the aggregated view derived from the read model.
 * Rows with quantity <= 0 are filtered out (E-19: a reversal may transiently
 * zero a cell before the nightly cleanup).
 */
export async function getDailyConsumption(params: { date?: string; khataId?: string; bossId?: string }) {
  const businessDate = params.date ?? todayBusinessDate();
  const filter: Record<string, unknown> = {
    businessDate,
    quantity: { $gt: 0 },
  };
  if (params.khataId) filter.khataId = params.khataId;
  if (params.bossId) filter.bossId = params.bossId;

  const rows = await DailyConsumption.find(filter).sort({ consumerNameSnapshot: 1, itemNameSnapshot: 1 }).lean();
  return rows.map<DailyRow>((r) => ({
    _id: String(r._id),
    khataId: String(r.khataId),
    bossId: r.bossId ? String(r.bossId) : null,
    payerStaffId: r.payerStaffId ? String(r.payerStaffId) : null,
    consumerType: r.consumerType,
    consumerId: String(r.consumerId),
    consumerName: r.consumerNameSnapshot,
    consumerContext: r.consumerContextSnapshot,
    itemId: String(r.itemId),
    itemName: r.itemNameSnapshot,
    servingSize: (r.servingSize ?? 'FULL') as ServingSize,
    unitPricePaisa: r.unitPricePaisa,
    quantity: r.quantity,
    totalPaisa: r.totalPaisa,
  }));
}

export async function sumSalesInRange(from: string, to: string) {
  const rows = await DailyConsumption.aggregate<{ total: number }>([
    { $match: { businessDate: { $gte: from, $lte: to }, quantity: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: '$totalPaisa' } } },
  ]);
  return rows[0]?.total ?? 0;
}