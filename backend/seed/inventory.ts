import mongoose from 'mongoose';
import { env } from '../config/env';
import '../models';
import { Admin } from '../models/admin.model';
import { Khata } from '../models/khata.model';
import { Bill } from '../models/bill.model';
import { Payment } from '../models/payment.model';
import { Boss } from '../models/boss.model';
import { Staff } from '../models/staff.model';
import { Item } from '../models/item.model';
import { DailyConsumption } from '../models/dailyConsumption.model';
import { ConsumptionTransaction } from '../models/consumptionTransaction.model';
import { Expense } from '../models/expense.model';
import { ExpenseCategory } from '../models/expenseCategory.model';
import { InventoryItem } from '../models/inventoryItem.model';
import { StockMovement } from '../models/stockMovement.model';
import { AuditLog } from '../models/auditLog.model';
import { Counter } from '../models/counter.model';
import { CanteenProfile } from '../models/canteenProfile.model';

// A minimal structural view so the heterogeneous model array doesn't explode
// TypeScript's union-type depth (each model's full document type differs).
interface CountableModel {
  countDocuments(filter?: object): Promise<number>;
}

async function main(): Promise<void> {
  try {
    await mongoose.connect(env.mongodbUri);
    const db = mongoose.connection.db;
    const collections = await db!.listCollections().toArray();
    // eslint-disable-next-line no-console
    console.log('Database:', db!.databaseName);
    // eslint-disable-next-line no-console
    console.log('Collections:', collections.map((c) => c.name).join(', ') || '(none)');

    const models: Array<{ name: string; model: CountableModel }> = [
      { name: 'Admin (login accounts)', model: Admin },
      { name: 'Khata', model: Khata },
      { name: 'Bill', model: Bill },
      { name: 'Payment', model: Payment },
      { name: 'Boss', model: Boss },
      { name: 'Staff', model: Staff },
      { name: 'Item', model: Item },
      { name: 'DailyConsumption', model: DailyConsumption },
      { name: 'ConsumptionTransaction', model: ConsumptionTransaction },
      { name: 'Expense', model: Expense },
      { name: 'ExpenseCategory', model: ExpenseCategory },
      { name: 'InventoryItem', model: InventoryItem },
      { name: 'StockMovement', model: StockMovement },
      { name: 'AuditLog', model: AuditLog },
      { name: 'Counter', model: Counter },
      { name: 'CanteenProfile', model: CanteenProfile },
    ];

    let total = 0;
    for (const { name, model } of models) {
      const count = await model.countDocuments();
      total += count;
      // eslint-disable-next-line no-console
      console.log(`${name}: ${count}`);
    }
    // eslint-disable-next-line no-console
    console.log('TOTAL documents:', total);

    const admins = await Admin.find().select('email name').lean();
    if (admins.length > 0) {
      // eslint-disable-next-line no-console
      console.log('Admin accounts present:', admins.map((a) => a.email ?? a.name).join(', '));
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Inventory failed:', error);
  process.exitCode = 1;
});
