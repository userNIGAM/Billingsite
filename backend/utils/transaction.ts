import mongoose, { ClientSession } from 'mongoose';

/**
 * Cached result of the replica-set probe. Transaction support is a property of
 * the deployment, not of an individual request, so it is probed at most once
 * per process.
 */
let transactionsSupported: boolean | null = null;

/**
 * Multi-document transactions require a replica set or mongos; a standalone
 * mongod rejects them with code 20 ("Transaction numbers are only allowed on a
 * replica set member or mongos").
 *
 * This has to be an explicit `hello` probe. `session.startTransaction()` only
 * sets local driver state and never contacts the server, so a try/catch
 * wrapped around it always succeeds and the failure surfaces later on the
 * first real operation — where it can no longer be recovered.
 */
async function supportsTransactions(): Promise<boolean> {
  if (transactionsSupported !== null) return transactionsSupported;

  try {
    const db = mongoose.connection.db;
    if (!db || mongoose.connection.readyState !== 1) {
      transactionsSupported = false;
      return false;
    }
    const info = await db.admin().command({ hello: 1 });
    transactionsSupported = Boolean(info.setName) || info.msg === 'isdbgrid';
  } catch {
    transactionsSupported = false;
  }
  return transactionsSupported;
}

/**
 * Runs a callback inside a Mongo multi-document transaction when the server
 * supports it (Atlas, replica sets, mongodb-memory-server) and falls back to
 * running it without a session on standalone mongod instances where
 * transactions are unsupported.
 *
 * Safety in the fallback path comes from the UNIQUE compound indexes (e.g.
 * DailyConsumption's aggregation key) which make the critical upserts
 * concurrency-safe regardless of transactions.
 *
 * Expects `session` to be used as the `session` option on every write inside
 * the callback, e.g. `Model.create([...], { session })`.
 *
 * The session is always ended, including on the success path — after
 * `commitTransaction()` the session is no longer "in" a transaction, so
 * guarding `endSession()` on `inTransaction()` leaks a session per write.
 */
export async function runInTransaction<T>(
  fn: (session: ClientSession | null) => Promise<T>
): Promise<T> {
  if (!(await supportsTransactions())) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });

    try {
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (err) {
      await session.abortTransaction().catch(() => undefined);
      throw err;
    }
  } finally {
    await session.endSession().catch(() => undefined);
  }
}
