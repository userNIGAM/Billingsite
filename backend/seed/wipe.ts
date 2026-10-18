import mongoose from 'mongoose';
import { env } from '../config/env';
import '../models';
import { Khata } from '../models/khata.model';
import { Bill } from '../models/bill.model';
import { Payment } from '../models/payment.model';
import { Boss } from '../models/boss.model';
import { Staff } from '../models/staff.model';
import { Item } from '../models/item.model';
import { DailyConsumption } from '../models/dailyConsumption.model';
import { ConsumptionTransaction } from '../models/consumptionTransaction.model';
import { Expense } from '../models/expense.model';
import { InventoryItem } from '../models/inventoryItem.model';
import { StockMovement } from '../models/stockMovement.model';
import { AuditLog } from '../models/auditLog.model';
import { Counter } from '../models/counter.model';
import { Admin } from '../models/admin.model';
import { ExpenseCategory } from '../models/expenseCategory.model';
import { CanteenProfile } from '../models/canteenProfile.model';

// Business/transactional data is cleared. The admin login, expense categories
// and canteen profile are kept so the app stays usable after the wipe.
// A minimal structural view so the heterogeneous model array doesn't explode
// TypeScript's union-type depth (each model's full document type differs).
interface WipeableModel {
  countDocuments(filter?: object): Promise<number>;
  deleteMany(filter: object): Promise<{ deletedCount?: number }>;
}

const wipes: Array<{ name: string; model: WipeableModel }> = [
  { name: 'StockMovement', model: StockMovement },
  { name: 'InventoryItem', model: InventoryItem },
  { name: 'ConsumptionTransaction', model: ConsumptionTransaction },
  { name: 'DailyConsumption', model: DailyConsumption },
  { name: 'Payment', model: Payment },
  { name: 'Bill', model: Bill },
  { name: 'Staff', model: Staff },
  { name: 'Boss', model: Boss },
  { name: 'Khata', model: Khata },
  { name: 'Item', model: Item },
  { name: 'Expense', model: Expense },
  { name: 'AuditLog', model: AuditLog },
  { name: 'Counter', model: Counter },
];

async function main(): Promise<void> {
  try {
    await mongoose.connect(env.mongodbUri);
    // eslint-disable-next-line no-console
    console.log('Database:', mongoose.connection.db!.databaseName);
    // eslint-disable-next-line no-console
    console.log('--- Wiping business data ---');

    for (const { name, model } of wipes) {
      const before = await model.countDocuments();
      const res = await model.deleteMany({});
      // eslint-disable-next-line no-console
      console.log(`${name}: deleted ${res.deletedCount ?? 0} of ${before}`);
    }

    // eslint-disable-next-line no-console
    console.log('--- Kept ---');
    const kept: Array<{ name: string; model: WipeableModel }> = [
      { name: 'Admin', model: Admin },
      { name: 'ExpenseCategory', model: ExpenseCategory },
      { name: 'CanteenProfile', model: CanteenProfile },
    ];
    for (const { name, model } of kept) {
      const count = await model.countDocuments();
      // eslint-disable-next-line no-console
      console.log(`${name}: ${count} kept`);
    }

    // eslint-disable-next-line no-console
    console.log('Done.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Wipe failed:', error);
  process.exitCode = 1;
});
