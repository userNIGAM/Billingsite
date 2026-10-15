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
import type { CurrentAdmin } from '../middleware/auth';

export interface CreateBossInput {
  khataId: string;
  name: string;
  phone?: string;
  startDate: string;
  notes?: string;
}

export interface UpdateBossInput {
  name?: string;
  phone?: string;
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
  phone?: string;
  startDate: string;
  notes?: string;
}

export interface UpdateStaffInput {
  name?: string;
  billingResponsibility?: 'OFFICE' | 'SELF';
  phone?: string;
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
  validateCreateDates(input.startDate);

  const boss = await Boss.create({
    khataId: khata._id,
    name: input.name.trim(),
    searchName: normalizeSearch(input.name),
    phone: input.phone ?? '',
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
    after: { name: boss.name, phone: boss.phone },
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

  const [dues, staffCounts] = await Promise.all([bossDueMap(ids), countStaffByBoss(ids)]);

  return bosses.map((boss) => ({
    _id: String(boss._id),
    khataId: String(boss.khataId),
    name: boss.name,
    phone: boss.phone,
    isDefault: boss.isDefault,
    status: boss.status,
    startDate: boss.startDate,
    endDate: boss.endDate,
    notes: boss.notes,
    duePaisa: dues.get(String(boss._id)) ?? 0,
    staffCount: staffCounts.get(String(boss._id)) ?? 0,
  }));
}

export async function bossSummary(id: string) {
  const boss = await Boss.findById(id).lean();
  if (!boss) throw ApiError.notFound('Boss not found.', 'BOSS_NOT_FOUND');

  const [due, transactions] = await Promise.all([
    getBossDue(boss._id.toString()),
    ConsumptionTotal(boss._id.toString()),
  ]);

  return { boss: { ...boss, _id: String(boss._id) }, duePaisa: due, consumptionTotalPaisa: transactions };
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

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

async function resolveDefaultBoss(khataId: string) {
  const defaultBoss = await Boss.findOne({ khataId, isDefault: true }).lean();
  if (!defaultBoss) throw ApiError.internal('Office has no default billing group configured.');
  return defaultBoss;
}

export async function createStaff(input: CreateStaffInput, admin: CurrentAdmin) {
  const khata = await assertOfficeKhata(input.khataId);
  validateCreateDates(input.startDate);

  let bossId = input.bossId;
  if (!bossId) {
    const defaultBoss = await resolveDefaultBoss(khata._id.toString());
    bossId = String(defaultBoss._id);
  } else {
    const boss = await Boss.findOne({ _id: bossId, khataId: khata._id });
    if (!boss) throw ApiError.notFound('Boss not found for this office.', 'BOSS_NOT_FOUND');
  }

  const staff = await Staff.create({
    khataId: khata._id,
    bossId,
    name: input.name.trim(),
    searchName: normalizeSearch(input.name),
    phone: input.phone ?? '',
    billingResponsibility: input.billingResponsibility ?? khata.defaultStaffBillingResponsibility ?? 'OFFICE',
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
    startDate: staff.startDate,
    endDate: staff.endDate,
    status: staff.status,
    notes: staff.notes,
    billingResponsibility: staff.billingResponsibility ?? 'OFFICE',
  };

  if (input.name !== undefined) {
    staff.name = input.name;
    staff.searchName = normalizeSearch(input.name);
  }
  if (input.phone !== undefined) staff.phone = input.phone;
  if (input.billingResponsibility !== undefined) staff.billingResponsibility = input.billingResponsibility;
  if (input.startDate !== undefined) {
    validateCreateDates(input.startDate);
    staff.startDate = input.startDate;
  }
  if (input.endDate !== undefined) staff.endDate = input.endDate || null;
  if (input.status !== undefined) staff.status = input.status;
  if (input.notes !== undefined) staff.notes = input.notes;

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
      status: staff.status,
      billingResponsibility: staff.billingResponsibility ?? 'OFFICE',
    },
  });

  return staff;
}

/**
 * Moves a staff member to another boss's billing group. Only Staff.bossId
 * changes — historical transactions keep their original bossId, so each
 * group's old billing remains correct (E-5).
 */
export async function transferStaff(id: string, newBossId: string, admin: CurrentAdmin) {
  const staff = await Staff.findById(id);
  if (!staff) throw ApiError.notFound('Staff member not found.', 'STAFF_NOT_FOUND');

  const newBoss = await Boss.findOne({ _id: newBossId, khataId: staff.khataId });
  if (!newBoss) throw ApiError.conflict('INVALID_BOSS', 'The target boss does not belong to this staff member\'s office.');

  const before = { bossId: String(staff.bossId) };
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

  const [bossDocs, staffDueRows] = await Promise.all([
    Boss.find({ _id: { $in: staffs.map((s) => s.bossId) } }).lean(),
    Bill.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
      { $match: { staffId: { $in: staffs.map((s) => s._id) }, isVoided: false } },
      { $group: { _id: '$staffId', total: { $sum: '$duePaisa' } } },
    ]),
  ]);
  const bossNames = new Map(bossDocs.map((boss) => [String(boss._id), boss.name]));
  const staffDues = new Map(staffDueRows.map((row) => [String(row._id), row.total]));

  return {
    rows: staffs.map((s) => ({
      _id: String(s._id),
      khataId: String(s.khataId),
      bossId: String(s.bossId),
      bossName: bossNames.get(String(s.bossId)) ?? '',
      billingResponsibility: s.billingResponsibility ?? 'OFFICE',
      duePaisa: staffDues.get(String(s._id)) ?? 0,
      name: s.name,
      phone: s.phone,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
      notes: s.notes,
    })),
    meta: buildPageMeta(total, params.page, params.limit),
  };
}

export async function staffSummary(id: string) {
  const staff = await Staff.findById(id).lean();
  if (!staff) throw ApiError.notFound('Staff member not found.', 'STAFF_NOT_FOUND');
  const rows = await Bill.aggregate<{ total: number }>([
    { $match: { staffId: staff._id, isVoided: false } },
    { $group: { _id: null, total: { $sum: '$duePaisa' } } },
  ]);
  const khata = await Khata.findById(staff.khataId).select('displayName').lean();
  const boss = await Boss.findById(staff.bossId).select('name').lean();
  return {
    staff: {
      ...staff,
      _id: String(staff._id),
      khataId: String(staff.khataId),
      bossId: String(staff.bossId),
      billingResponsibility: staff.billingResponsibility ?? 'OFFICE',
      khataName: khata?.displayName ?? '',
      bossName: boss?.name ?? '',
    },
    duePaisa: rows[0]?.total ?? 0,
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