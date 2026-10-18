import mongoose from 'mongoose';
import { Boss } from '../models/boss.model';
import { Khata } from '../models/khata.model';
import { Staff } from '../models/staff.model';
import { Bill } from '../models/bill.model';
import { ConsumptionTransaction } from '../models/consumptionTransaction.model';
import { ApiError } from '../utils/ApiError';
import { validateDateStr, todayBusinessDate } from '../utils/date';
import { normalizeSearch, escapeRegex, buildPageMeta } from '../utils/pagination';
import { writeAuditLog } from './audit.service';
import { assertStaffOpening } from './opening.service';
import type { CurrentAdmin } from '../middleware/auth';

export interface CreateBossInput {
  khataId: string;
  name: string;
  phone?: string;
  address?: string;
  openingBalancePaisa?: number;
  startDate: string;
  notes?: string;
}

export interface UpdateBossInput {
  name?: string;
  phone?: string;
  address?: string;
  openingBalancePaisa?: number;
  startDate?: string;
  endDate?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
  notes?: string;
}

export interface CreateStaffInput {
  khataId: string;
  bossId?: string;
  name: string;
  billingResponsibility?: 'OFFICE' | 'SELF';
  openingBalancePaisa?: number;
  phone?: string;
  address?: string;
  startDate: string;
  notes?: string;
}

export interface UpdateStaffInput {
  name?: string;
  billingResponsibility?: 'OFFICE' | 'SELF';
  openingBalancePaisa?: number;
  phone?: string;
  address?: string;
  startDate?: string;
  endDate?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
  notes?: string;
}

async function assertOfficeKhata(khataId: string) {
  const khata = await Khata.findById(khataId);
  if (!khata) throw ApiError.notFound('Office khata not found.', 'KHATA_NOT_FOUND');
  if (khata.type !== 'OFFICE') {
    throw ApiError.conflict('NOT_AN_OFFICE', 'Bosses and staff can only be added to an OFFICE khata.');
  }
  return khata;
}

function validateCreateDates(startDate: string) {
  if (!validateDateStr(startDate)) {
    throw ApiError.validation('startDate must be a valid date in YYYY-MM-DD format.');
  }
}

// ---------------------------------------------------------------------------
// Bosses
// ---------------------------------------------------------------------------

export async function createBoss(input: CreateBossInput, admin: CurrentAdmin) {
  const khata = await assertOfficeKhata(input.khataId);
  if ((khata.billingMode ?? 'MIXED') === 'DIRECT') {
    throw ApiError.validation('A DIRECT office bills only the office itself and cannot have bosses. Change its billing mode first.');
  }
  validateCreateDates(input.startDate);

  const boss = await Boss.create({
    khataId: khata._id,
    name: input.name.trim(),
    searchName: normalizeSearch(input.name),
    phone: input.phone ?? '',
    address: input.address ?? '',
    openingBalancePaisa: input.openingBalancePaisa ?? 0,
    isDefault: false,
    status: 'ACTIVE',
    startDate: input.startDate,
    notes: input.notes ?? '',
  });

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'BOSS_CREATED',
    entity: 'Boss',
    entityId: String(boss._id),
    after: { khataId: String(khata._id), name: boss.name },
  });

  return boss;
}

export async function updateBoss(id: string, input: UpdateBossInput, admin: CurrentAdmin) {
  const boss = await Boss.findById(id);
  if (!boss) throw ApiError.notFound('Boss not found.', 'BOSS_NOT_FOUND');

  const before = {
    name: boss.name,
    phone: boss.phone,
    address: boss.address ?? '',
    openingBalancePaisa: boss.openingBalancePaisa ?? 0,
    startDate: boss.startDate,
    endDate: boss.endDate,
    status: boss.status,
    notes: boss.notes,
  };

  if (input.name !== undefined) {
    boss.name = input.name;
    boss.searchName = normalizeSearch(input.name);
  }
  if (input.phone !== undefined) boss.phone = input.phone;
  if (input.address !== undefined) boss.address = input.address;
  if (input.openingBalancePaisa !== undefined) boss.openingBalancePaisa = input.openingBalancePaisa;
  if (input.startDate !== undefined) {
    validateCreateDates(input.startDate);
    boss.startDate = input.startDate;
  }
  if (input.endDate !== undefined) boss.endDate = input.endDate || null;
  if (input.status !== undefined) boss.status = input.status;
  if (input.notes !== undefined) boss.notes = input.notes;

  await boss.save();

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'BOSS_UPDATED',
    entity: 'Boss',
    entityId: String(boss._id),
    before,
    after: {
      name: boss.name,
      phone: boss.phone,
      address: boss.address ?? '',
      openingBalancePaisa: boss.openingBalancePaisa ?? 0,
    },
  });

  return boss;
}

export async function deactivateBoss(id: string, admin: CurrentAdmin, active = false) {
  const boss = await Boss.findById(id);
  if (!boss) throw ApiError.notFound('Boss not found.', 'BOSS_NOT_FOUND');

  if (!active && boss.isDefault) {
    throw ApiError.conflict('DEFAULT_BOSS', 'The default "Office Direct" boss cannot be deactivated.');
  }

  if (!active) {
    const activeStaff = await Staff.countDocuments({ bossId: boss._id, status: 'ACTIVE' });
    if (activeStaff > 0) {
      throw ApiError.conflict(
        'BOSS_HAS_STAFF',
        `Cannot deactivate "${boss.name}" — ${activeStaff} active staff member(s) still belong to this boss. Transfer or deactivate them first.`
      );
    }
  }

  const before = { status: boss.status, endDate: boss.endDate };
  boss.status = active ? 'ACTIVE' : 'INACTIVE';
  boss.endDate = active ? null : boss.endDate ?? todayBusinessDate();
  await boss.save();

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: active ? 'BOSS_ACTIVATED' : 'BOSS_DEACTIVATED',
    entity: 'Boss',
    entityId: String(boss._id),
    before,
    after: { status: boss.status, endDate: boss.endDate },
  });

  return boss;
}

export async function listBosses(params: { khataId?: string; status?: string }) {
  const filter: Record<string, unknown> = {};
  if (params.khataId) filter.khataId = params.khataId;
  if (params.status) filter.status = params.status;
  const bosses = await Boss.find(filter).sort({ isDefault: -1, name: 1 }).lean();
  const ids = bosses.map((b) => String(b._id));

  const [dues, staffCounts, billCounts] = await Promise.all([
    bossDueMap(ids),
    countStaffByBoss(ids),
    bossBillCountMap(ids),
  ]);

  return bosses.map((boss) => {
    const id = String(boss._id);
    // Show the boss's migrated opening balance as due only until their first
    // group bill exists (the opening is then carried by that bill).
    const openingShown = (billCounts.get(id) ?? 0) === 0 ? (boss.openingBalancePaisa ?? 0) : 0;
    return {
      _id: id,
      khataId: String(boss.khataId),
      name: boss.name,
      phone: boss.phone,
      address: boss.address ?? '',
      openingBalancePaisa: boss.openingBalancePaisa ?? 0,
      isDefault: boss.isDefault,
      status: boss.status,
      startDate: boss.startDate,
      endDate: boss.endDate,
      notes: boss.notes,
      duePaisa: (dues.get(id) ?? 0) + openingShown,
      staffCount: staffCounts.get(id) ?? 0,
    };
  });
}

export async function bossSummary(id: string) {
  const boss = await Boss.findById(id).lean();
  if (!boss) throw ApiError.notFound('Boss not found.', 'BOSS_NOT_FOUND');

  const [due, transactions, billCount] = await Promise.all([
    getBossDue(boss._id.toString()),
    ConsumptionTotal(boss._id.toString()),
    Bill.countDocuments({ bossId: boss._id, staffId: null, isVoided: false }),
  ]);

  const openingShown = billCount === 0 ? (boss.openingBalancePaisa ?? 0) : 0;

  return {
    boss: { ...boss, _id: String(boss._id), openingBalancePaisa: boss.openingBalancePaisa ?? 0, address: boss.address ?? '' },
    duePaisa: due + openingShown,
    consumptionTotalPaisa: transactions,
  };
}

async function ConsumptionTotal(bossId: string) {
  const rows = await ConsumptionTransaction.aggregate<{ total: number }>([
    {
      $match: {
        bossId: new mongoose.Types.ObjectId(bossId),
        payerStaffId: null,
        entryType: 'ORDER',
        status: 'ACTIVE',
      },
    },
    { $group: { _id: null, total: { $sum: '$totalPaisa' } } },
  ]);
  return rows[0]?.total ?? 0;
}

export async function getBossDue(bossId: string): Promise<number> {
  const rows = await Bill.aggregate<{ total: number }>([
    { $match: { bossId: new mongoose.Types.ObjectId(bossId), staffId: null, isVoided: false } },
    { $group: { _id: null, total: { $sum: '$duePaisa' } } },
  ]);
  return rows[0]?.total ?? 0;
}

export async function bossDueMap(bossIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (bossIds.length === 0) return map;
  const rows = await Bill.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
    { $match: { bossId: { $in: bossIds.map((id) => new mongoose.Types.ObjectId(id)) }, staffId: null, isVoided: false } },
    { $group: { _id: '$bossId', total: { $sum: '$duePaisa' } } },
  ]);
  for (const row of rows) map.set(String(row._id), row.total);
  return map;
}

async function bossBillCountMap(bossIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (bossIds.length === 0) return map;
  const rows = await Bill.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { bossId: { $in: bossIds.map((id) => new mongoose.Types.ObjectId(id)) }, staffId: null, isVoided: false } },
    { $group: { _id: '$bossId', count: { $sum: 1 } } },
  ]);
  for (const row of rows) map.set(String(row._id), row.count);
  return map;
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function createStaff(input: CreateStaffInput, admin: CurrentAdmin) {
  const khata = await assertOfficeKhata(input.khataId);
  validateCreateDates(input.startDate);

  const mode = khata.billingMode ?? 'MIXED';
  const bossId: string | null = input.bossId ?? null;
  if (bossId) {
    const boss = await Boss.findOne({ _id: bossId, khataId: khata._id });
    if (!boss) throw ApiError.notFound('Boss not found for this office.', 'BOSS_NOT_FOUND');
  } else if (mode === 'DIRECT') {
    throw ApiError.validation('A DIRECT office has no staff. Change its billing mode to MIXED or GROUPS first.');
  } else if (mode === 'GROUPS') {
    // GROUPS offices have no office ledger to absorb OFFICE-responsibility
    // staff, so a boss-less staff member would have nowhere to bill.
    throw ApiError.validation('Every staff member of a GROUPS office must belong to a boss (bossId is required).');
  }

  const billingResponsibility = input.billingResponsibility ?? khata.defaultStaffBillingResponsibility ?? 'OFFICE';
  assertStaffOpening(billingResponsibility, input.openingBalancePaisa ?? 0);

  const staff = await Staff.create({
    khataId: khata._id,
    bossId,
    name: input.name.trim(),
    searchName: normalizeSearch(input.name),
    phone: input.phone ?? '',
    address: input.address ?? '',
    billingResponsibility,
    openingBalancePaisa: input.openingBalancePaisa ?? 0,
    status: 'ACTIVE',
    startDate: input.startDate,
    notes: input.notes ?? '',
  });

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'STAFF_CREATED',
    entity: 'Staff',
    entityId: String(staff._id),
    after: { khataId: String(khata._id), bossId, name: staff.name },
  });

  return staff;
}

export async function updateStaff(id: string, input: UpdateStaffInput, admin: CurrentAdmin) {
  const staff = await Staff.findById(id);
  if (!staff) throw ApiError.notFound('Staff member not found.', 'STAFF_NOT_FOUND');

  const before = {
    name: staff.name,
    phone: staff.phone,
    address: staff.address ?? '',
    startDate: staff.startDate,
    endDate: staff.endDate,
    status: staff.status,
    notes: staff.notes,
    billingResponsibility: staff.billingResponsibility ?? 'OFFICE',
    openingBalancePaisa: staff.openingBalancePaisa ?? 0,
  };

  if (input.name !== undefined) {
    staff.name = input.name;
    staff.searchName = normalizeSearch(input.name);
  }
  if (input.phone !== undefined) staff.phone = input.phone;
  if (input.address !== undefined) staff.address = input.address;
  if (input.billingResponsibility !== undefined) staff.billingResponsibility = input.billingResponsibility;
  if (input.openingBalancePaisa !== undefined) staff.openingBalancePaisa = input.openingBalancePaisa;
  if (input.startDate !== undefined) {
    validateCreateDates(input.startDate);
    staff.startDate = input.startDate;
  }
  if (input.endDate !== undefined) staff.endDate = input.endDate || null;
  if (input.status !== undefined) staff.status = input.status;
  if (input.notes !== undefined) staff.notes = input.notes;
  assertStaffOpening(staff.billingResponsibility ?? 'OFFICE', staff.openingBalancePaisa ?? 0);

  await staff.save();

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'STAFF_UPDATED',
    entity: 'Staff',
    entityId: String(staff._id),
    before,
    after: {
      name: staff.name,
      phone: staff.phone,
      address: staff.address ?? '',
      status: staff.status,
      billingResponsibility: staff.billingResponsibility ?? 'OFFICE',
    },
  });

  return staff;
}

/**
 * Moves a staff member to another boss's billing group, or into the office
 * pool (newBossId null, valid in MIXED offices). Only Staff.bossId changes —
 * historical transactions keep their original bossId, so each group's old
 * billing remains correct (E-5).
 */
export async function transferStaff(id: string, newBossId: string | null, admin: CurrentAdmin) {
  const staff = await Staff.findById(id);
  if (!staff) throw ApiError.notFound('Staff member not found.', 'STAFF_NOT_FOUND');

  const before = { bossId: staff.bossId ? String(staff.bossId) : null };
  if (newBossId === null || newBossId === undefined || newBossId === '') {
    const khata = await Khata.findById(staff.khataId).select('billingMode').lean();
    const mode = khata?.billingMode ?? 'MIXED';
    if (mode === 'DIRECT') {
      throw ApiError.validation('A DIRECT office has no staff groups — change the billing mode first.');
    }
    if (mode === 'GROUPS') {
      throw ApiError.validation('A GROUPS office has no office pool — move this staff member to a boss instead.');
    }
    staff.bossId = null;
    await staff.save();
    await writeAuditLog({
      adminId: admin.adminId,
      adminNameSnapshot: admin.adminName,
      action: 'STAFF_TRANSFERRED',
      entity: 'Staff',
      entityId: String(staff._id),
      before,
      after: { bossId: null, newBossName: 'Office pool' },
    });
    return staff;
  }

  const newBoss = await Boss.findOne({ _id: newBossId, khataId: staff.khataId });
  if (!newBoss) throw ApiError.conflict('INVALID_BOSS', 'The target boss does not belong to this staff member\'s office.');

  staff.bossId = newBoss._id;
  await staff.save();

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'STAFF_TRANSFERRED',
    entity: 'Staff',
    entityId: String(staff._id),
    before,
    after: { bossId: String(newBoss._id), newBossName: newBoss.name },
  });

  return staff;
}

export async function setStaffStatus(id: string, status: 'ACTIVE' | 'INACTIVE', admin: CurrentAdmin) {
  const staff = await Staff.findById(id);
  if (!staff) throw ApiError.notFound('Staff member not found.', 'STAFF_NOT_FOUND');

  const before = { status: staff.status, endDate: staff.endDate };
  staff.status = status;
  staff.endDate = status === 'INACTIVE' ? staff.endDate ?? todayBusinessDate() : null;
  await staff.save();

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: status === 'INACTIVE' ? 'STAFF_DEACTIVATED' : 'STAFF_ACTIVATED',
    entity: 'Staff',
    entityId: String(staff._id),
    before,
    after: { status: staff.status, endDate: staff.endDate },
  });

  return staff;
}

export async function listStaff(params: {
  q?: string;
  khataId?: string;
  bossId?: string;
  status?: string;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {};
  if (params.khataId) filter.khataId = params.khataId;
  if (params.bossId) filter.bossId = params.bossId;
  if (params.status) filter.status = params.status;
  if (params.q && params.q.trim() !== '') {
    filter.searchName = { $regex: escapeRegex(normalizeSearch(params.q)) };
  }

  const [staffs, total] = await Promise.all([
    Staff.find(filter)
      .sort({ createdAt: -1 })
      .skip((params.page - 1) * params.limit)
      .limit(params.limit)
      .lean(),
    Staff.countDocuments(filter),
  ]);

  const bossIds = staffs.map((s) => s.bossId).filter((id): id is mongoose.Types.ObjectId => !!id);
  const [bossDocs, staffDueRows] = await Promise.all([
    bossIds.length > 0 ? Boss.find({ _id: { $in: bossIds } }).lean() : Promise.resolve([]),
    Bill.aggregate<{ _id: mongoose.Types.ObjectId; total: number; count: number }>([
      { $match: { staffId: { $in: staffs.map((s) => s._id) }, isVoided: false } },
      { $group: { _id: '$staffId', total: { $sum: '$duePaisa' }, count: { $sum: 1 } } },
    ]),
  ]);
  const bossNames = new Map(bossDocs.map((boss) => [String(boss._id), boss.name]));
  const staffDues = new Map(staffDueRows.map((row) => [String(row._id), row.total]));
  const staffBillCounts = new Map(staffDueRows.map((row) => [String(row._id), row.count]));

  return {
    rows: staffs.map((s) => {
      const isSelf = (s.billingResponsibility ?? 'OFFICE') === 'SELF';
      // The migrated opening balance is only shown until the staff member's
      // first bill exists — after that it lives inside that bill's due
      // (bill.service folds it into the first bill), so adding it here too
      // would double-count it.
      const openingShown = isSelf && (staffBillCounts.get(String(s._id)) ?? 0) === 0
        ? (s.openingBalancePaisa ?? 0)
        : 0;
      return {
        _id: String(s._id),
        khataId: String(s.khataId),
        bossId: s.bossId ? String(s.bossId) : null,
        // Null bossName = office pool (boss-less staff member).
        bossName: s.bossId ? bossNames.get(String(s.bossId)) ?? '' : '',
        billingResponsibility: s.billingResponsibility ?? 'OFFICE',
        openingBalancePaisa: s.openingBalancePaisa ?? 0,
        duePaisa: (staffDues.get(String(s._id)) ?? 0) + openingShown,
        name: s.name,
        phone: s.phone,
        address: s.address ?? '',
        status: s.status,
        startDate: s.startDate,
        endDate: s.endDate,
        notes: s.notes,
      };
    }),
    meta: buildPageMeta(total, params.page, params.limit),
  };
}

export async function staffSummary(id: string) {
  const staff = await Staff.findById(id).lean();
  if (!staff) throw ApiError.notFound('Staff member not found.', 'STAFF_NOT_FOUND');
  const rows = await Bill.aggregate<{ total: number; count: number }>([
    { $match: { staffId: staff._id, isVoided: false } },
    { $group: { _id: null, total: { $sum: '$duePaisa' }, count: { $sum: 1 } } },
  ]);
  const khata = await Khata.findById(staff.khataId).select('displayName').lean();
  const boss = staff.bossId ? await Boss.findById(staff.bossId).select('name').lean() : null;
  const billingResponsibility = staff.billingResponsibility ?? 'OFFICE';
  const openingShown =
    billingResponsibility === 'SELF' && (rows[0]?.count ?? 0) === 0
      ? (staff.openingBalancePaisa ?? 0)
      : 0;
  return {
    staff: {
      ...staff,
      _id: String(staff._id),
      khataId: String(staff.khataId),
      bossId: staff.bossId ? String(staff.bossId) : null,
      billingResponsibility,
      openingBalancePaisa: staff.openingBalancePaisa ?? 0,
      khataName: khata?.displayName ?? '',
      bossName: boss?.name ?? '',
    },
    duePaisa: (rows[0]?.total ?? 0) + openingShown,
  };
}

export async function countStaffByBoss(bossIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (bossIds.length === 0) return map;
  const rows = await Staff.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { bossId: { $in: bossIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: 'ACTIVE' } },
    { $group: { _id: '$bossId', count: { $sum: 1 } } },
  ]);
  for (const row of rows) map.set(String(row._id), row.count);
  return map;
}

export async function setAllStaffByKhata(khataId: string, status: 'ACTIVE' | 'INACTIVE') {
  await Staff.updateMany({ khataId }, { $set: { status, ...(status === 'INACTIVE' ? { endDate: todayBusinessDate() } : { endDate: null }) } });
}