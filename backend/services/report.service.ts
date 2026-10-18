import mongoose from 'mongoose';
import { DailyConsumption } from '../models/dailyConsumption.model';
import { Bill } from '../models/bill.model';
import { Payment } from '../models/payment.model';
import { Expense } from '../models/expense.model';
import { Khata } from '../models/khata.model';
import { Boss } from '../models/boss.model';
import { Staff } from '../models/staff.model';
import { unbilledOpeningByKhata } from './opening.service';
import { ApiError } from '../utils/ApiError';
import { validateDateStr, isBeforeOrEqual } from '../utils/date';

function assertRange(from?: string, to?: string) {
  const f = from ?? '2000-01-01';
  const t = to ?? '2999-12-31';
  if (validateDateStr(f) === false || validateDateStr(t) === false) {
    throw ApiError.validation('from/to must be valid YYYY-MM-DD dates.');
  }
  if (isBeforeOrEqual(f, t) === false) {
    throw ApiError.validation('from must be on or before to.');
  }
  return { from: f, to: t };
}

/** §54 Sales report — totals plus optional grouping by day/item/office. */
export async function salesReport(input: { from?: string; to?: string; groupBy: 'day' | 'item' | 'office' }) {
  const { from, to } = assertRange(input.from, input.to);
  const match = { businessDate: { $gte: from, $lte: to }, quantity: { $gt: 0 } };

  const totals = await DailyConsumption.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$totalPaisa' } } },
  ]);

  let groups: unknown[] = [];
  if (input.groupBy === 'day') {
    groups = await DailyConsumption.aggregate([
      { $match: match },
      { $group: { _id: '$businessDate', date: { $first: '$businessDate' }, salesPaisa: { $sum: '$totalPaisa' } } },
      { $sort: { date: 1 } },
    ]);
  } else if (input.groupBy === 'item') {
    groups = await DailyConsumption.aggregate([
      { $match: match },
      {
        $group: {
          _id: { itemId: '$itemId', name: '$itemNameSnapshot' },
          itemName: { $first: '$itemNameSnapshot' },
          quantity: { $sum: '$quantity' },
          revenuePaisa: { $sum: '$totalPaisa' },
        },
      },
      { $sort: { revenuePaisa: -1 } },
    ]);
  } else {
    groups = await DailyConsumption.aggregate([
      { $match: match },
      { $group: { _id: '$khataId', revenuePaisa: { $sum: '$totalPaisa' } } },
      { $sort: { revenuePaisa: -1 } },
    ]);
  }

  return { from, to, totalSalesPaisa: totals[0]?.total ?? 0, groups };
}

export async function expenseReport(input: { from?: string; to?: string }) {
  const { from, to } = assertRange(input.from, input.to);
  const match = { businessDate: { $gte: from, $lte: to } };

  const [totals, byCategory, byDay] = await Promise.all([
    Expense.aggregate<{ total: number }>([{ $match: match }, { $group: { _id: null, total: { $sum: '$amountPaisa' } } }]),
    Expense.aggregate([
      { $match: match },
      {
        $lookup: { from: 'expensecategories', localField: 'categoryId', foreignField: '_id', as: 'cat' },
      },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { id: '$categoryId', name: { $ifNull: ['$cat.name', 'Unknown'] } },
          categoryName: { $first: { $ifNull: ['$cat.name', 'Unknown'] } },
          amountPaisa: { $sum: '$amountPaisa' },
        },
      },
      { $sort: { amountPaisa: -1 } },
    ]),
    Expense.aggregate([
      { $match: match },
      { $group: { _id: '$businessDate', date: { $first: '$businessDate' }, amountPaisa: { $sum: '$amountPaisa' } } },
      { $sort: { date: 1 } },
    ]),
  ]);

  return { from, to, totalExpensePaisa: totals[0]?.total ?? 0, byCategory, byDay };
}

export async function profitLossReport(input: { from?: string; to?: string }) {
  const { from, to } = assertRange(input.from, input.to);
  const match = { businessDate: { $gte: from, $lte: to }, quantity: { $gt: 0 } };

  const [gross, expenses, collections, outstandingRows] = await Promise.all([
    DailyConsumption.aggregate<{ revenue: number; cost: number; revenueWithCost: number }>([
      { $match: match },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$totalPaisa' },
          cost: { $sum: { $multiply: [{ $ifNull: ['$unitCostPaisa', 0] }, '$quantity'] } },
          revenueWithCost: {
            $sum: {
              $cond: [{ $gte: [{ $type: '$unitCostPaisa' }, 'number'] }, '$totalPaisa', 0],
            },
          },
        },
      },
    ]),
    Expense.aggregate<{ total: number }>([
      { $match: { businessDate: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    Payment.aggregate<{ total: number }>([
      { $match: { paymentDate: { $gte: from, $lte: to }, isVoided: false } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
    ]),
    // Outstanding is a POINT-IN-TIME figure: it is the sum of what is still
    // owed on every non-voided bill regardless of the reporting window. It was
    // hardcoded to 0, so the financial summary understated dues by the entire
    // outstanding amount.
    Bill.aggregate<{ total: number }>([
      { $match: { isVoided: false } },
      { $group: { _id: null, total: { $sum: '$duePaisa' } } },
    ]),
  ]);

  const revenue = gross[0]?.revenue ?? 0;
  const cogs = gross[0]?.cost ?? 0;
  const revenueWithCost = gross[0]?.revenueWithCost ?? 0;
  const costCoveragePct = revenue > 0 ? Math.round((revenueWithCost / revenue) * 100) : 0;
  const operatingExpense = expenses[0]?.total ?? 0;
  const collected = collections[0]?.total ?? 0;

  return {
    from,
    to,
    revenue,
    cogs,
    costCoveragePct,
    grossProfitEstimated: costCoveragePct < 95,
    grossProfit: revenue - cogs,
    operatingExpense,
    netProfit: revenue - cogs - operatingExpense,
    cashSurplus: revenue - operatingExpense,
    collected,
    outstanding: outstandingRows[0]?.total ?? 0,
  };
}

export async function customersReport() {
  const [billAgg, paymentsAgg, consumptionAgg, khatas] = await Promise.all([
    Bill.aggregate<{ _id: mongoose.Types.ObjectId; billed: number; paid: number; due: number }>([
      { $match: { isVoided: false } },
      {
        $group: {
          _id: '$khataId',
          billed: { $sum: '$totalPayablePaisa' },
          paid: { $sum: '$paidPaisa' },
          due: { $sum: '$duePaisa' },
        },
      },
    ]),
    Payment.aggregate<{ _id: mongoose.Types.ObjectId; paid: number }>([
      { $match: { isVoided: false } },
      { $group: { _id: '$khataId', paid: { $sum: '$amountPaisa' } } },
    ]),
    DailyConsumption.aggregate<{ _id: mongoose.Types.ObjectId; consumed: number }>([
      { $match: { quantity: { $gt: 0 } } },
      { $group: { _id: '$khataId', consumed: { $sum: '$totalPaisa' } } },
    ]),
    Khata.find().select('displayName type status openingBalancePaisa').lean(),
  ]);

  const byId = <T>(rows: Array<{ _id: mongoose.Types.ObjectId } & T>) => new Map(rows.map((r) => [String(r._id), r]));
  const bills = byId(billAgg);
  const pays = byId(paymentsAgg);
  const cons = byId(consumptionAgg);

  const openings = await unbilledOpeningByKhata();

  return khatas
    .map((k) => {
      const id = String(k._id);
      const consumed = cons.get(id)?.consumed ?? 0;
      const billed = bills.get(id)?.billed ?? 0;
      const paidCash = pays.get(id)?.paid ?? 0;
      const due = (bills.get(id)?.due ?? 0) + (openings.get(id) ?? 0);
      return {
        khataId: id,
        khataName: k.displayName,
        type: k.type,
        status: k.status,
        consumptionTotalPaisa: consumed,
        billedPaisa: billed,
        paidPaisa: paidCash,
        outstandingPaisa: due,
      };
    })
    .sort((a, b) => b.consumptionTotalPaisa - a.consumptionTotalPaisa);
}

export async function itemsReport(input: { from?: string; to?: string }) {
  const { from, to } = assertRange(input.from, input.to);
  const match = { businessDate: { $gte: from, $lte: to }, quantity: { $gt: 0 } };

  return DailyConsumption.aggregate([
    { $match: match },
    {
      $group: {
        _id: { itemId: '$itemId', name: '$itemNameSnapshot' },
        itemName: { $first: '$itemNameSnapshot' },
        quantity: { $sum: '$quantity' },
        revenuePaisa: { $sum: '$totalPaisa' },
        costPaisa: { $sum: { $multiply: [{ $ifNull: ['$unitCostPaisa', 0] }, '$quantity'] } },
      },
    },
    { $sort: { revenuePaisa: -1 } },
  ]);
}

export async function officesReport() {
  const offices = await Khata.find({ type: 'OFFICE' }).lean();
  const [staffCounts, bossCounts, consAgg, billAgg, payAgg] = await Promise.all([
    Staff.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $group: { _id: '$khataId', count: { $sum: 1 } } },
    ]),
    Boss.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { status: 'ACTIVE', isDefault: { $in: [false, true] } } },
      { $group: { _id: '$khataId', count: { $sum: 1 } } },
    ]),
    DailyConsumption.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
      { $match: { quantity: { $gt: 0 } } },
      { $group: { _id: '$khataId', total: { $sum: '$totalPaisa' } } },
    ]),
    Bill.aggregate<{ _id: mongoose.Types.ObjectId; billed: number; due: number }>([
      { $match: { isVoided: false } },
      { $group: { _id: '$khataId', billed: { $sum: '$totalPayablePaisa' }, due: { $sum: '$duePaisa' } } },
    ]),
    Payment.aggregate<{ _id: mongoose.Types.ObjectId; paid: number }>([
      { $match: { isVoided: false } },
      { $group: { _id: '$khataId', paid: { $sum: '$amountPaisa' } } },
    ]),
  ]);

  const staffMap = new Map(staffCounts.map((r) => [String(r._id), r.count]));
  const bossMap = new Map(bossCounts.map((r) => [String(r._id), r.count]));
  const consMap = new Map(consAgg.map((r) => [String(r._id), r.total]));
  const billMap = new Map(billAgg.map((r) => [String(r._id), r]));
  const payMap = new Map(payAgg.map((r) => [String(r._id), r.paid]));
  const openings = await unbilledOpeningByKhata(offices.map((o) => o._id));

  return offices.map((o) => {
    const id = String(o._id);
    const bill = billMap.get(id);
    return {
      khataId: id,
      officeName: o.displayName,
      status: o.status,
      staffCount: staffMap.get(id) ?? 0,
      bossCount: bossMap.get(id) ?? 0,
      consumptionTotalPaisa: consMap.get(id) ?? 0,
      billedPaisa: bill?.billed ?? 0,
      paidPaisa: payMap.get(id) ?? 0,
      outstandingPaisa: (bill?.due ?? 0) + (openings.get(id) ?? 0),
    };
  });
}

export async function collectionsReport(input: { from?: string; to?: string }) {
  const { from, to } = assertRange(input.from, input.to);
  const rows = await Payment.aggregate([
    { $match: { paymentDate: { $gte: from, $lte: to }, isVoided: false } },
    {
      $group: {
        _id: '$method',
        method: { $first: '$method' },
        amountPaisa: { $sum: '$amountPaisa' },
        count: { $sum: 1 },
      },
    },
    { $sort: { amountPaisa: -1 } },
  ]);

  const map = new Map(rows.map((r) => [r._id, r]));
  const cash = map.get('CASH');
  const digital = map.get('DIGITAL');
  const other = map.get('OTHER');

  const byChannel = await Payment.aggregate([
    { $match: { paymentDate: { $gte: from, $lte: to }, isVoided: false, method: 'DIGITAL', digitalChannel: { $ne: null } } },
    {
      $group: {
        _id: '$digitalChannel',
        channel: { $first: '$digitalChannel' },
        amountPaisa: { $sum: '$amountPaisa' },
      },
    },
    { $sort: { amountPaisa: -1 } },
  ]);

  return {
    from,
    to,
    cashPaisa: cash?.amountPaisa ?? 0,
    cashCount: cash?.count ?? 0,
    digitalPaisa: digital?.amountPaisa ?? 0,
    digitalCount: digital?.count ?? 0,
    otherPaisa: other?.amountPaisa ?? 0,
    otherCount: other?.count ?? 0,
    totalPaisa: rows.reduce((a, r) => a + r.amountPaisa, 0),
    byChannel,
  };
}