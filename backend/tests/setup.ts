import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Ensure required env vars exist before config/env.ts is imported by
// anything under test, since it throws if they're missing.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.NODE_ENV = 'test';

let replset: MongoMemoryReplSet;

// Collections that must survive a reset.
const PRESERVED_COLLECTIONS = new Set(['admins']);

async function resetDatabase(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    if (PRESERVED_COLLECTIONS.has(key)) continue;
    await collections[key].deleteMany({});
  }
}

beforeAll(async () => {
  // A replica set is required: the money write paths (consumption, bills,
  // payments) run inside MongoDB transactions, and the driver rejects those
  // with code 20 ("Transaction numbers are only allowed on a replica set
  // member or mongos") on a standalone server. A single-node replset exercises
  // the same code path production uses.
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  process.env.MONGODB_URI = replset.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  await resetDatabase();
});

/**
 * The reset above runs in a root-level `beforeAll`, which Jest executes BEFORE
 * the test file's own hooks. That makes it a per-FILE reset.
 *
 * It must NOT be per-test: canteen.integration.test.ts is a sequential
 * end-to-end scenario that creates a khata in one `it()`, a boss under it in
 * the next, then staff, items, consumption, bills and payments. A per-test
 * wipe destroyed that state, so every downstream step failed — first as 401s
 * (wiping `admins` invalidated the long-lived agent's JWT, and `requireAuth`
 * re-loads the admin on every request), and once `admins` was exempted as 404
 * KHATA_NOT_FOUND. The result was 17 failures that hid every real product
 * defect behind auth and not-found errors.
 *
 * So each FILE gets a clean database and a scenario builds up across its own
 * steps. A test needing per-test isolation should create its own entities
 * rather than relying on a database reset.
 */

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});
