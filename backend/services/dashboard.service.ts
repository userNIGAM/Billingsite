import mongoose from 'mongoose';
import { DailyConsumption } from '../models/dailyConsumption.model';
import { Bill } from '../models/bill.model';
import { Payment } from '../models/payment.model';
import { Expense } from '../models/expense.model';
import { Khata } from '../models/khata.model';
import { unbilledOpeningByKhata } from './opening.service';
import { businessNow, startOfMonthDate, endOfMonthDate, todayBusinessDate, dateSeries } from '../utils/date';

function monthRange() {
  const now = businessNow();
  const key = now.format('YYYY-MM');
  return { from: startOfMonthDate(key), to: endOfMonthDate(key) };
}

async function sumDailyInRange(from: string, to: string): Promise<number> {
  const rows = await DailyConsumption.aggregate<{ total: number }>([
    { $match: { businessDate: { $gte: from, $lte: to }, quantity: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: '$totalPaisa' } } },
  ]);
  return rows[0]?.total ?? 0;
}

async function sumExpensesInRange(from: string, to: string): Promise<number> {
  const rows = await Expense.aggregate<{ total: number }>([
    { $match: { businessDate: { $gte: from, $lte: to } } },
    { $group: { _id: null, total: { $sum: '$amountPaisa' } } },
  ]);
  return rows[0]?.total ?? 0;
}

async function collectionsInRange(from: string, to: string) {
  const rows = await Payment.aggregate<{ _id: string; total: number }>([
    {
      $match: {
        paymentDate: { $gte: from, $lte: to },
        isVoided: false,
      },
    },
    { $group: { _id: '$method', total: { $sum: '$amountPaisa' } } },
  ]);
  const map = new Map(rows.map((r) => [r._id, r.total]));
  return {
    cash: map.get('CASH') ?? 0,
    digital: map.get('DIGITAL') ?? 0,
    other: map.get('OTHER') ?? 0,
    total: rows.reduce((a, r) => a + r.total, 0),
  };
}

async function seriesInRange(from: string, to: string): Promise<Array<{ date: string; salesPaisa: number; expensePaisa: number }>> {
  const [salesRows, expenseRows] = await Promise.all([
    DailyConsumption.aggregate<{ _id: string; total: number }>([
      { $match: { businessDate: { $gte: from, $lte: to }, quantity: { $gt: 0 } } },
      { $group: { _id: '$businessDate', total: { $sum: '$totalPaisa' } } },
    ]),
    Expense.aggregate<{ _id: string; total: number }>([
      { $match: { businessDate: { $gte: from, $lte: to } } },
      { $group: { _id: '$businessDate', total: { $sum: '$amountPaisa' } } },
    ]),
  ]);

  const sales = new Map(salesRows.map((r) => [r._id, r.total]));
  const expenses = new Map(expenseRows.map((r) => [r._id, r.total]));

  return dateSeries(from, to).map((date) => ({
    date,
    salesPaisa: sales.get(date) ?? 0,
    expensePaisa: expenses.get(date) ?? 0,
  }));
}

async function topItems(from: string, to: string, limit = 5) {
  const rows = await DailyConsumption.aggregate([
    { $match: { businessDate: { $gte: from, $lte: to }, quantity: { $gt: 0 } } },
    {
      $group: {
        _id: { itemId: '$itemId', itemName: '$itemNameSnapshot', servingSize: { $ifNull: ['$servingSize', 'FULL'] } },
        name: { $first: '$itemNameSnapshot' },
        servingSize: { $first: { $ifNull: ['$servingSize', 'FULL'] } },
        quantity: { $sum: '$quantity' },
        revenue: { $sum: '$totalPaisa' },
        cost: { $sum: { $multiply: [{ $ifNull: ['$unitCostPaisa', 0] }, '$quantity'] } },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);
  return rows;
}

export async function dashboardSummary() {
  const today = todayBusinessDate();
  const { from, to } = monthRange();
  const weekStart = businessNow().subtract(6, 'day').format('YYYY-MM-DD');

  const [
    todaySales,
    monthSales,
    todayExpenses,
    monthExpenses,
    collectionsToday,
    collectionsMonth,
    series,
    items,
    totalBillDueRows,
    totalOpeningRows,
    khataCounts,
    grossRows,
  ] = await Promise.all([
    sumDailyInRange(today, today),
    sumDailyInRange(from, to),
    sumExpensesInRange(today, today),
    sumExpensesInRange(from, to),
    collectionsInRange(today, today),
    collectionsInRange(from, to),
    seriesInRange(weekStart, today),
    topItems(from, to),
    Bill.aggregate<{ total: number }>([
      { $match: { isVoided: false } },
      { $group: { _id: null, total: { $sum: '$duePaisa' } } },
    ]),
    unbilledOpeningByKhata(),
    Promise.all([
      Khata.countDocuments({ status: 'ACTIVE' }),
      Khata.countDocuments({ type: 'OFFICE', status: 'ACTIVE' }),
      Khata.countDocuments({ type: 'INDIVIDUAL', status: 'ACTIVE' }),
    ]),
    DailyConsumption.aggregate<{ total: number; cost: number; revenueWithCost: number }>([
      { $match: { businessDate: { $gte: from, $lte: to }, quantity: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalPaisa' },
          cost: { $sum: { $multiply: [{ $ifNull: ['$unitCostPaisa', 0] }, '$quantity'] } },
          revenueWithCost: { $sum: { $cond: [{ $ifNull: ['$unitCostPaisa', null] }, '$totalPaisa', 0] } },
        },
      },
    ]),
  ]);

  const totalBillDue = totalBillDueRows[0]?.total ?? 0;
  const totalOpening = [...totalOpeningRows.values()].reduce((sum, v) => sum + v, 0);
  const outstanding = totalBillDue + totalOpening;

  const [totalActiveKhatas, activeOffices, activeIndividuals] = khataCounts;

  const gross = grossRows[0];
  const revenue = gross?.total ?? 0;
  const cogs = gross?.cost ?? 0;
  const costCoveragePct = revenue > 0 ? Math.round(((gross?.revenueWithCost ?? 0) / revenue) * 100) : 0;
  const grossProfit = revenue - cogs;
  const operatingExpense = monthExpenses;
  const netProfit = grossProfit - operatingExpense;
  const cashSurplus = revenue - operatingExpense;

  return {
    todaySalesPaisa: todaySales,
    monthSalesPaisa: monthSales,
    todayExpensesPaisa: todayExpenses,
    monthExpensesPaisa: monthExpenses,
    outstandingDuesPaisa: outstanding,
    totalActiveKhatas,
    activeOffices,
    activeIndividuals,
    collectionsToday,
    collectionsMonth,
    profitLoss: {
      revenuePaisa: revenue,
      cogsPaisa: cogs,
      costCoveragePct,
      grossProfitEstimated: revenue > 0 && costCoveragePct < 95,
      grossProfitPaisa: grossProfit,
      operatingExpensePaisa: operatingExpense,
      netProfitPaisa: netProfit,
      cashSurplusPaisa: cashSurplus,
    },
    salesExpenseSeries: series,
    topItems: items.map((i) => ({
      itemId: String(i._id.itemId),
      name: i.name,
      servingSize: (i.servingSize ?? 'FULL') as 'HALF' | 'FULL',
      quantity: i.quantity,
      revenuePaisa: i.revenue,
      costPaisa: i.cost,
    })),
  };
}

export interface OutstandingRow {
  khataId: string;
  khataName: string;
  type: string;
  status: string;
  duePaisa: number;
  openingBalancePaisa: number;
  lastPaymentDate: string | null;
}

export async function outstandingRows(): Promise<OutstandingRow[]> {
  const [billAgg, khatas, lastPayments] = await Promise.all([
    Bill.aggregate<{ _id: mongoose.Types.ObjectId; due: number }>([
      { $match: { isVoided: false } },
      { $group: { _id: '$khataId', due: { $sum: '$duePaisa' } } },
    ]),
    Khata.find().select('displayName type status openingBalancePaisa').lean(),
    Payment.aggregate([
      { $match: { isVoided: false } },
      { $sort: { paymentDate: -1, createdAt: -1 } },
      { $group: { _id: '$khataId', lastDate: { $first: '$paymentDate' } } },
    ]),
  ]);

  const billDue = new Map(billAgg.map((r) => [String(r._id), r.due]));
  const lastPay = new Map(lastPayments.map((r) => [String(r._id), r.lastDate as string]));
  const openings = await unbilledOpeningByKhata();

  return khatas
    .map((k) => ({
      khataId: String(k._id),
      khataName: k.displayName,
      type: k.type,
      status: k.status,
      openingBalancePaisa: openings.get(String(k._id)) ?? 0,
      duePaisa: (billDue.get(String(k._id)) ?? 0) + (openings.get(String(k._id)) ?? 0),
      lastPaymentDate: lastPay.get(String(k._id)) ?? null,
    }))
    .filter((r) => r.duePaisa > 0)
    .sort((a, b) => b.duePaisa - a.duePaisa);
}