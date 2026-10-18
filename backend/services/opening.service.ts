import mongoose from 'mongoose';
import { Khata } from '../models/khata.model';
import { Boss } from '../models/boss.model';
import { Staff } from '../models/staff.model';
import { Bill } from '../models/bill.model';
import { ApiError } from '../utils/ApiError';

/**
 * Only a SELF-billed staff member has a personal ledger to carry an opening
 * balance; an office-paid staff member's old due belongs on their boss.
 */
export function assertStaffOpening(billingResponsibility: 'OFFICE' | 'SELF', openingBalancePaisa: number) {
  if (billingResponsibility !== 'SELF' && openingBalancePaisa > 0) {
    throw ApiError.validation('Only staff who pay for themselves can have an opening balance. Add an office-paid staff member\'s old due to their boss instead.');
  }
}

/**
 * Migrated paper dues that have NOT yet been carried onto a bill, per khata.
 *
 * Every opening balance belongs to exactly one billing ledger, and
 * bill.service folds it into that ledger's FIRST bill:
 *   - INDIVIDUAL khata → Khata.openingBalancePaisa (bossId/staffId null)
 *   - office khata, DIRECT/MIXED ledger → Khata.openingBalancePaisa
 *     (bossId/staffId null, scope OFFICE)
 *   - office boss group → Boss.openingBalancePaisa
 *   - SELF-billed staff → Staff.openingBalancePaisa
 *
 * So a khata's outstanding due is `sum(bill.duePaisa) + this value`. Adding
 * the raw opening on top of bill dues double-counts it once the first bill
 * exists. Legacy offices that still carry their direct due on an "Office
 * Direct" default boss keep working: that boss's opening is counted through
 * the Boss query below, exactly as before.
 */
export async function unbilledOpeningByKhata(khataIds?: Array<string | mongoose.Types.ObjectId>): Promise<Map<string, number>> {
  const scope = khataIds ? { khataId: { $in: khataIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } : {};
  const khataScope = khataIds ? { _id: scope.khataId } : {};

  const [khataLedgers, bosses, staff] = await Promise.all([
    // Individual khatas plus office khatas whose own OFFICE ledger is active
    // (DIRECT/MIXED) and carries a migrated balance.
    Khata.find({
      ...khataScope,
      $or: [
        { type: 'INDIVIDUAL', openingBalancePaisa: { $gt: 0 } },
        { type: 'OFFICE', billingMode: { $in: ['DIRECT', 'MIXED'] }, openingBalancePaisa: { $gt: 0 } },
      ],
    })
      .select('type openingBalancePaisa')
      .lean(),
    Boss.find({ ...scope, openingBalancePaisa: { $gt: 0 } }).select('khataId openingBalancePaisa').lean(),
    Staff.find({ ...scope, billingResponsibility: 'SELF', openingBalancePaisa: { $gt: 0 } }).select('khataId openingBalancePaisa').lean(),
  ]);

  const map = new Map<string, number>();
  if (khataLedgers.length + bosses.length + staff.length === 0) return map;

  const ledgerKhataIds = [
    ...khataLedgers.map((k) => k._id),
    ...bosses.map((b) => b.khataId),
    ...staff.map((s) => s.khataId),
  ];
  const billed = await Bill.aggregate<{ _id: { khataId: mongoose.Types.ObjectId; bossId: mongoose.Types.ObjectId | null; staffId: mongoose.Types.ObjectId | null } }>([
    { $match: { khataId: { $in: ledgerKhataIds }, isVoided: false } },
    { $group: { _id: { khataId: '$khataId', bossId: '$bossId', staffId: '$staffId' } } },
  ]);
  const billedIndividuals = new Set<string>();
  const billedBosses = new Set<string>();
  const billedStaff = new Set<string>();
  for (const { _id } of billed) {
    if (_id.staffId) billedStaff.add(String(_id.staffId));
    else if (_id.bossId) billedBosses.add(String(_id.bossId));
    else billedIndividuals.add(String(_id.khataId));
  }

  const add = (khataId: unknown, amount: number) => {
    const key = String(khataId);
    map.set(key, (map.get(key) ?? 0) + amount);
  };
  // A khata-level ledger (individual OR office OFFICE-ledger) is billed when a
  // bill exists with bossId/staffId both null — the same payer key.
  for (const k of khataLedgers) if (!billedIndividuals.has(String(k._id))) add(k._id, k.openingBalancePaisa);
  for (const b of bosses) if (!billedBosses.has(String(b._id))) add(b.khataId, b.openingBalancePaisa ?? 0);
  for (const s of staff) if (!billedStaff.has(String(s._id))) add(s.khataId, s.openingBalancePaisa ?? 0);
  return map;
}
