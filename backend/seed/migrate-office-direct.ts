/**
 * Migrates legacy office khatas to the billingMode world.
 *
 *   npm run migrate:office-direct
 *
 * Before this change every OFFICE khata got an auto-created "Office Direct"
 * boss (isDefault: true) that carried the office's own direct due. Under the
 * 4-option system the office's own ledger lives on the khata itself
 * (Khata.openingBalancePaisa, billingMode DIRECT/MIXED), and no default boss
 * exists.
 *
 * For each legacy office this script:
 *   1. Sets billingMode when missing (DIRECT if the office has no bosses and
 *      no staff, MIXED otherwise, so the office ledger and groups coexist).
 *   2. Moves the default boss's opening balance onto the khata — but only
 *      when the default boss has no bills of its own yet. If it already has
 *      bills, the opening was (or will be) folded into those bills, so moving
 *      it to the khata too would double-count it; in that case the opening
 *      stays on the boss, which remains as a regular (isDefault) boss so old
 *      bills and payments keep resolving.
 *   3. Re-homes staff that sat under the default boss into the office pool
 *      (bossId = null) — their OFFICE-responsibility consumption then bills
 *      the office ledger, and their historical bills keep the old bossId.
 *
 * Idempotent: khatas that already have a billingMode are skipped, and the
 * default-boss moves only apply while a default boss exists.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import '../models';
import { Khata } from '../models/khata.model';
import { Boss } from '../models/boss.model';
import { Staff } from '../models/staff.model';
import { Bill } from '../models/bill.model';

async function main(): Promise<void> {
  await mongoose.connect(env.mongodbUri);
  try {
    // eslint-disable-next-line no-console
    console.log('Database:', mongoose.connection.db!.databaseName);

    // Offices created before billingMode existed (field absent or null).
    const legacy = await Khata.find({
      type: 'OFFICE',
      $or: [{ billingMode: { $exists: false } }, { billingMode: null }],
    }).lean();

    let migrated = 0;
    for (const khata of legacy) {
      const khataId = khata._id;
      const defaultBoss = await Boss.findOne({ khataId, isDefault: true }).lean();
      const [bossCount, staffCount] = await Promise.all([
        Boss.countDocuments({ khataId }),
        Staff.countDocuments({ khataId }),
      ]);

      // 1. billingMode: DIRECT only when the office has nothing but itself.
      const billingMode = bossCount === 0 && staffCount === 0 ? 'DIRECT' : 'MIXED';
      const update: Record<string, unknown> = { billingMode };

      // 2. Move the default boss's opening onto the khata when it has not
      //    been billed yet (no bills reference it).
      let movedOpening = 0;
      if (defaultBoss && (defaultBoss.openingBalancePaisa ?? 0) > 0) {
        const bossBills = await Bill.countDocuments({ bossId: defaultBoss._id });
        if (bossBills === 0) {
          movedOpening = defaultBoss.openingBalancePaisa ?? 0;
          update.openingBalancePaisa = (khata.openingBalancePaisa ?? 0) + movedOpening;
        } else {
          // eslint-disable-next-line no-console
          console.log(
            `  "${khata.displayName}": default boss already has ${bossBills} bill(s); its opening stays on the boss to avoid a double count.`
          );
        }
      }

      await Khata.updateOne({ _id: khataId }, { $set: update });

      // 3. Re-home staff that sat under the default boss into the office pool.
      let movedStaff = 0;
      if (defaultBoss) {
        const res = await Staff.updateMany(
          { khataId, bossId: defaultBoss._id },
          { $set: { bossId: null } }
        );
        movedStaff = res.modifiedCount ?? 0;

        // If the default boss has no bills and no staff left under it, remove
        // it entirely: nothing references it anymore, and it was only ever an
        // implementation detail of the old model.
        const bossBills = await Bill.countDocuments({ bossId: defaultBoss._id });
        const remainingStaff = await Staff.countDocuments({ bossId: defaultBoss._id });
        if (bossBills === 0 && remainingStaff === 0) {
          await Boss.deleteOne({ _id: defaultBoss._id });
          // eslint-disable-next-line no-console
          console.log(`  "${khata.displayName}": removed the empty default boss.`);
        }
      }

      migrated += 1;
      // eslint-disable-next-line no-console
      console.log(
        `  "${khata.displayName}": billingMode=${billingMode}` +
          (movedOpening ? `, moved opening ${movedOpening} paisa to the khata` : '') +
          (movedStaff ? `, moved ${movedStaff} staff to the office pool` : '')
      );
    }

    // eslint-disable-next-line no-console
    console.log(`Done: ${migrated} legacy office(s) migrated (${legacy.length} found).`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
