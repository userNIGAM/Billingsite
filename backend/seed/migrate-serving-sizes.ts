/**
 * Backfills the half/full-plate serving fields on pre-existing data.
 *
 *   npm run migrate:serving-sizes
 *
 * Everything recorded before serving sizes existed was a full plate, so the
 * backfill is lossless: items become FULL_ONLY (no half price), and every
 * stored consumption transaction, daily-consumption cell and bill line item
 * becomes servingSize 'FULL'.
 *
 * The DailyConsumption unique index gained a servingSize component
 *   (consumerId, bossId, payerStaffId, businessDate, itemId, servingSize, unitPricePaisa)
 * so after the backfill the old index is dropped and the new one rebuilt with
 * syncIndexes(). Running this while the app is live is safe: the backfill only
 * sets fields to their previous implicit defaults and the index rebuild is a
 * no-op once the documents already carry servingSize.
 *
 * Idempotent: documents that already have the field are skipped.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import '../models';
import { Item } from '../models/item.model';
import { ConsumptionTransaction } from '../models/consumptionTransaction.model';
import { DailyConsumption } from '../models/dailyConsumption.model';
import { Bill } from '../models/bill.model';

async function main(): Promise<void> {
  await mongoose.connect(env.mongodbUri);
  try {
    // eslint-disable-next-line no-console
    console.log('Database:', mongoose.connection.db!.databaseName);

    const items = await Item.updateMany(
      { $or: [{ servingMode: { $exists: false } }, { servingMode: null }] },
      { $set: { servingMode: 'FULL_ONLY' } }
    );
    const itemPrices = await Item.updateMany(
      { halfPlatePricePaisa: { $exists: false } },
      { $set: { halfPlatePricePaisa: null } }
    );

    const txs = await ConsumptionTransaction.updateMany(
      { servingSize: { $exists: false } },
      { $set: { servingSize: 'FULL' } }
    );

    // Backfill BEFORE rebuilding the index so no two cells collide on the
    // newly-null servingSize component.
    const cells = await DailyConsumption.updateMany(
      { servingSize: { $exists: false } },
      { $set: { servingSize: 'FULL' } }
    );

    const bills = await Bill.updateMany(
      { 'lineItems.servingSize': { $exists: false } },
      { $set: { 'lineItems.$[el].servingSize': 'FULL' } },
      { arrayFilters: [{ 'el.servingSize': { $exists: false } }] }
    );

    // Rebuild indexes so the DailyConsumption unique key picks up servingSize
    // (drops the old 6-field index, builds the new 7-field one).
    const synced = await DailyConsumption.syncIndexes();

    // eslint-disable-next-line no-console
    console.log(
      `Backfilled: ${items.modifiedCount} item(s) (servingMode), ` +
        `${itemPrices.modifiedCount} item(s) (half price), ` +
        `${txs.modifiedCount} transaction(s), ` +
        `${cells.modifiedCount} daily cell(s), ` +
        `${bills.modifiedCount} bill(s).`
    );
    // eslint-disable-next-line no-console
    console.log(`DailyConsumption indexes synced: ${synced.length}.`);
    // eslint-disable-next-line no-console
    console.log('Done.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
