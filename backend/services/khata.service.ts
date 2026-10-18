import mongoose from 'mongoose';
import { Khata } from '../models/khata.model';
import { Boss } from '../models/boss.model';
import { Bill } from '../models/bill.model';
import { DailyConsumption } from '../models/dailyConsumption.model';
import { Payment } from '../models/payment.model';
import { Staff } from '../models/staff.model';
import { ConsumptionTransaction } from '../models/consumptionTransaction.model';
import { ApiError } from '../utils/ApiError';
import { validateDateStr, todayBusinessDate } from '../utils/date';
import { normalizeSearch, escapeRegex, buildPageMeta } from '../utils/pagination';
import { runInTransaction } from '../utils/transaction';
import { nextKhataCode } from './counter.service';
import { writeAuditLog } from './audit.service';
import { periodContaining } from './period.service';
import { countStaffByBoss, setAllStaffByKhata } from './office.service';
import { assertStaffOpening, unbilledOpeningByKhata } from './opening.service';
import type { CurrentAdmin } from '../middleware/auth';

export interface CreateKhataInput {
  type: 'INDIVIDUAL' | 'OFFICE';
  displayName: string;
  phone?: string;
  address?: string;
  startDate: string;
  status?: 'ACTIVE' | 'OFFLINE';
  billingStartDay?: number;
  openingBalancePaisa?: number;
  notes?: string;
  // Office only. DIRECT = office's own ledger; GROUPS = bosses/staff only;
  // MIXED = both. Defaults to MIXED so every structure stays reachable.
  billingMode?: 'DIRECT' | 'GROUPS' | 'MIXED';
  defaultStaffBillingResponsibility?: 'OFFICE' | 'SELF';
  initialBoss?: { name: string; phone?: string; address?: string; openingBalancePaisa?: number };
  initialBosses?: Array<{ name: string; phone?: string; address?: string; openingBalancePaisa?: number }>;
  initialStaff?: Array<{
    name: string;
    phone?: string;
    address?: string;
    billingResponsibility?: 'OFFICE' | 'SELF';
    bossIndex?: number;
    openingBalancePaisa?: number;
  }>;
}

export interface UpdateKhataInput {
  displayName?: string;
  phone?: string;
  address?: string;
  startDate?: string;
  billingStartDay?: number;
  billingMode?: 'DIRECT' | 'GROUPS' | 'MIXED';
  openingBalancePaisa?: number;
  notes?: string;
}

export interface KhataWithDue {
  _id: string;
  khataCode: string;
  type: 'INDIVIDUAL' | 'OFFICE';
  displayName: string;
  phone: string;
  address: string;
  status: 'ACTIVE' | 'OFFLINE';
  startDate: string;
  endDate: string | null;
  billingStartDay: number;
  billingMode: 'DIRECT' | 'GROUPS' | 'MIXED' | null;
  defaultStaffBillingResponsibility: 'OFFICE' | 'SELF';
  openingBalancePaisa: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  duePaisa: number;
}

async function dueByKhata(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const rows = await Bill.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
    { $match: { khataId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) }, isVoided: false } },
    { $group: { _id: '$khataId', total: { $sum: '$duePaisa' } } },
  ]);
  for (const row of rows) {
    map.set(String(row._id), row.total);
  }
  return map;
}

export async function createKhata(input: CreateKhataInput, admin: CurrentAdmin) {
  if (!validateDateStr(input.startDate)) {
    throw ApiError.validation('startDate must be a valid date in YYYY-MM-DD format.');
  }

  const bossSpecs = [
    ...(input.initialBoss ? [input.initialBoss] : []),
    ...(input.initialBosses ?? []),
  ];
  if (input.type === 'OFFICE') {
    const mode = input.billingMode ?? 'MIXED';
    if (mode === 'DIRECT' && (bossSpecs.length > 0 || (input.initialStaff?.length ?? 0) > 0)) {
      throw ApiError.validation('A DIRECT office bills only the office itself and cannot create bosses or staff.');
    }
    if (mode === 'GROUPS' && (input.openingBalancePaisa ?? 0) > 0) {
      throw ApiError.validation('A GROUPS office has no ledger of its own — put the old dues on a boss instead.');
    }
  }

  const session = await runInTransaction(async (s) => {
    const khataCode = await nextKhataCode();
    const searchName = normalizeSearch(input.displayName);
    const [khata] = await Khata.create(
      [
        {
          khataCode,
          type: input.type,
          displayName: input.displayName.trim(),
          searchName,
          phone: input.phone ?? '',
          address: input.address ?? '',
          status: input.status ?? 'ACTIVE',
          startDate: input.startDate,
          billingStartDay: input.billingStartDay ?? 1,
          defaultStaffBillingResponsibility: input.type === 'OFFICE'
            ? input.defaultStaffBillingResponsibility ?? 'OFFICE'
            : undefined,
          // Offices: the office's OWN opening lives on the khata now (only
          // billed when billingMode is DIRECT or MIXED — GROUPS rejects a
          // non-zero value above). No hidden "Office Direct" boss carries it.
          billingMode: input.type === 'OFFICE' ? input.billingMode ?? 'MIXED' : undefined,
          openingBalancePaisa: input.openingBalancePaisa ?? 0,
          notes: input.notes ?? '',
          createdBy: admin.adminId ? new mongoose.Types.ObjectId(admin.adminId) : null,
        },
      ],
      { session: s ?? undefined }
    );

    if (input.type === 'OFFICE') {
      // Create every named boss the caller asked for (legacy single
      // `initialBoss` is treated as the first entry of `initialBosses`).
      const namedBossIds: string[] = [];
      for (const spec of bossSpecs) {
        const [namedBoss] = await Boss.create(
          [
            {
              khataId: khata._id,
              name: spec.name.trim(),
              searchName: normalizeSearch(spec.name),
              phone: spec.phone ?? '',
              address: spec.address ?? '',
              openingBalancePaisa: spec.openingBalancePaisa ?? 0,
              isDefault: false,
              status: 'ACTIVE',
              startDate: input.startDate,
            },
          ],
          { session: s ?? undefined }
        );
        namedBossIds.push(String(namedBoss._id));
      }

      for (const person of input.initialStaff ?? []) {
        assertStaffOpening(
          person.billingResponsibility ?? input.defaultStaffBillingResponsibility ?? 'OFFICE',
          person.openingBalancePaisa ?? 0
        );
        // No boss index resolved = office pool (bossId null, valid in MIXED).
        // In GROUPS mode a staff member must sit under a boss, so a missing
        // index is an error rather than a silent office-pool assignment.
        const bossId = person.bossIndex !== undefined ? (namedBossIds[person.bossIndex] ?? null) : null;
        if (!bossId && (input.billingMode ?? 'MIXED') === 'GROUPS') {
          throw ApiError.validation('Every staff member of a GROUPS office must belong to a boss (bossIndex out of range).');
        }
        await Staff.create(
          [
            {
              khataId: khata._id,
              bossId,
              name: person.name.trim(),
              searchName: normalizeSearch(person.name),
              phone: person.phone ?? '',
              address: person.address ?? '',
              billingResponsibility: person.billingResponsibility
                ?? input.defaultStaffBillingResponsibility
                ?? 'OFFICE',
              openingBalancePaisa: person.openingBalancePaisa ?? 0,
              status: 'ACTIVE',
              startDate: input.startDate,
            },
          ],
          { session: s ?? undefined }
        );
      }
    }

    await writeAuditLog({
      adminId: admin.adminId,
      adminNameSnapshot: admin.adminName,
      action: 'KHATA_CREATED',
      entity: 'Khata',
      entityId: String(khata._id),
      after: { type: input.type, displayName: khata.displayName, khataCode },
    });

    // `defaultBossId` is always null now (no hidden default boss is created),
    // but the field is kept in the response shape so existing clients don't
    // break while they migrate to billingMode.
    return { khata, defaultBossId: null as string | null };
  });

  return { ...session, duePaisa: await getCurrentDue(String(session.khata._id)) };
}

export async function listKhatas(params: {
  q?: string;
  type?: string;
  status?: string;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {};
  if (params.type) filter.type = params.type;
  if (params.status) filter.status = params.status;
  if (params.q && params.q.trim() !== '') {
    const safe = escapeRegex(normalizeSearch(params.q));
    filter.searchName = { $regex: safe };
  }

  const [khatas, total] = await Promise.all([
    Khata.find(filter)
      .sort({ createdAt: -1 })
      .skip((params.page - 1) * params.limit)
      .limit(params.limit)
      .lean(),
    Khata.countDocuments(filter),
  ]);

  const ids = khatas.map((k) => String(k._id));
  const [dues, openings] = await Promise.all([dueByKhata(ids), unbilledOpeningByKhata(ids)]);

  const rows: KhataWithDue[] = khatas.map((k) => ({
    _id: String(k._id),
    khataCode: k.khataCode,
    type: k.type,
    displayName: k.displayName,
    phone: k.phone,
    address: k.address,
    status: k.status,
    startDate: k.startDate,
    endDate: k.endDate ?? null,
    billingStartDay: k.billingStartDay,
    billingMode: k.type === 'OFFICE' ? k.billingMode ?? 'MIXED' : null,
    defaultStaffBillingResponsibility: k.defaultStaffBillingResponsibility ?? 'OFFICE',
    openingBalancePaisa: k.openingBalancePaisa,
    notes: k.notes,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
    duePaisa: (dues.get(String(k._id)) ?? 0) + (openings.get(String(k._id)) ?? 0),
  }));

  return { rows, meta: buildPageMeta(total, params.page, params.limit) };
}

export async function getKhataDetail(id: string) {
  const khata = await Khata.findById(id).lean();
  if (!khata) throw ApiError.notFound('Khata not found.', 'KHATA_NOT_FOUND');

  const due = await getCurrentDue(String(khata._id));
  const currentPeriod = periodContaining(
    khata.billingStartDay,
    khata.startDate,
    khata.endDate ?? null
  );

  let bosses: Array<{ _id: string; name: string; phone: string; address: string; openingBalancePaisa: number; isDefault: boolean; status: string; duePaisa: number; staffCount: number }> = [];
  if (khata.type === 'OFFICE') {
    const bossDocs = await Boss.find({ khataId: khata._id }).lean();
    const bossIds = bossDocs.map((b) => String(b._id));
    const [bossDues, staffCounts, bossBillCounts] = await Promise.all([
      getBossDueMap(bossIds),
      countStaffByBoss(bossIds),
      bossBillCountMap(bossIds),
    ]);
    bosses = bossDocs.map((b) => {
      const id = String(b._id);
      // Boss opening shows as due only until their first group bill exists.
      const openingShown = (bossBillCounts.get(id) ?? 0) === 0 ? (b.openingBalancePaisa ?? 0) : 0;
      return {
        _id: id,
        name: b.name,
        phone: b.phone,
        address: b.address ?? '',
        openingBalancePaisa: b.openingBalancePaisa ?? 0,
        isDefault: b.isDefault,
        status: b.status,
        duePaisa: (bossDues.get(id) ?? 0) + openingShown,
        staffCount: staffCounts.get(id) ?? 0,
      };
    });
  }

  // An office's own opening lives on the khata itself now. Legacy offices
  // created before billingMode existed may still carry it on an old default
  // "Office Direct" boss — surface that value until the migration moves it.
  const openingBalancePaisa = khata.type === 'OFFICE' && (khata.openingBalancePaisa ?? 0) === 0
    ? bosses.find((b) => b.isDefault)?.openingBalancePaisa ?? 0
    : khata.openingBalancePaisa;

  return {
    khata: { ...khata, _id: String(khata._id), openingBalancePaisa },
    duePaisa: due,
    currentPeriod,
    bosses,
  };
}

export async function getBossDueMap(bossIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (bossIds.length === 0) return map;
  const rows = await Bill.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
    { $match: { bossId: { $in: bossIds.map((id) => new mongoose.Types.ObjectId(id)) }, staffId: null, isVoided: false } },
    { $group: { _id: '$bossId', total: { $sum: '$duePaisa' } } },
  ]);
  for (const row of rows) {
    map.set(String(row._id), row.total);
  }
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

export async function getCurrentDue(khataId: string): Promise<number> {
  const [rows, openings] = await Promise.all([
    Bill.aggregate<{ total: number }>([
      { $match: { khataId: new mongoose.Types.ObjectId(khataId), isVoided: false } },
      { $group: { _id: null, total: { $sum: '$duePaisa' } } },
    ]),
    unbilledOpeningByKhata([khataId]),
  ]);
  const billDue = rows[0]?.total ?? 0;
  return billDue + (openings.get(khataId) ?? 0);
}

/**
 * The financial rollup for one khata, over an optional date window
 * (defaults to the khata's whole lifetime). Powers the Khata Overview screen.
 *
 * Every paisa figure is reported separately rather than summed into one
 * "total" so the UI can never accidentally present revenue as collected cash
 * (PLAN §9 — the three figures are deliberately never conflated).
 */
export async function khataSummary(id: string, from?: string, to?: string) {
  const khata = await Khata.findById(id).lean();
  if (!khata) throw ApiError.notFound('Khata not found.', 'KHATA_NOT_FOUND');

  const khataId = new mongoose.Types.ObjectId(String(khata._id));
  const range = { $gte: from ?? khata.startDate, $lte: to ?? todayBusinessDate() };

  const [salesAgg, billAgg, paymentAgg, staffCount, openings] = await Promise.all([
    // Accrual sales: the read model, not the event log, so same-day duplicates
    // collapse into one figure per item.
    DailyConsumption.aggregate<{ total: number }>([
      { $match: { khataId, businessDate: range, quantity: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$totalPaisa' } } },
    ]),
    Bill.aggregate<{ due: number; paid: number; total: number; count: number }>([
      { $match: { khataId, isVoided: false } },
      {
        $group: {
          _id: null,
          due: { $sum: '$duePaisa' },
          paid: { $sum: '$paidPaisa' },
          total: { $sum: '$totalPayablePaisa' },
          count: { $sum: 1 },
        },
      },
    ]),
    Payment.aggregate<{ cash: number; digital: number; other: number }>([
      { $match: { khataId, isVoided: false, paymentDate: range } },
      {
        $group: {
          _id: null,
          cash: { $sum: { $cond: [{ $eq: ['$method', 'CASH'] }, '$amountPaisa', 0] } },
          digital: { $sum: { $cond: [{ $eq: ['$method', 'DIGITAL'] }, '$amountPaisa', 0] } },
          other: { $sum: { $cond: [{ $eq: ['$method', 'OTHER'] }, '$amountPaisa', 0] } },
        },
      },
    ]),
    // Expenses are canteen-wide, not khata-scoped (PLAN §4), so this summary
    // deliberately has no expense figure rather than a fabricated one.
    khata.type === 'OFFICE' ? Staff.countDocuments({ khataId }) : Promise.resolve(0),
    unbilledOpeningByKhata([khataId]),
  ]);

  const sales = salesAgg[0]?.total ?? 0;
  const bills = billAgg[0];
  const pay = paymentAgg[0];
  const cash = pay?.cash ?? 0;
  const digital = pay?.digital ?? 0;
  const other = pay?.other ?? 0;

  // Bill dues plus migrated paper balances not yet carried onto a bill.
  const outstanding = (bills?.due ?? 0) + (openings.get(String(khata._id)) ?? 0);

  return {
    khataId: String(khata._id),
    from: range.$gte,
    to: range.$lte,
    accruedSalesPaisa: sales,
    collected: {
      cashPaisa: cash,
      digitalPaisa: digital,
      otherPaisa: other,
      totalPaisa: cash + digital + other,
    },
    bills: {
      count: bills?.count ?? 0,
      billedTotalPaisa: bills?.total ?? 0,
      paidPaisa: bills?.paid ?? 0,
      outstandingPaisa: outstanding,
    },
    openingBalancePaisa: khata.openingBalancePaisa,
    staffCount,
  };
}

export async function updateKhata(id: string, input: UpdateKhataInput, admin: CurrentAdmin) {
  const khata = await Khata.findById(id);
  if (!khata) throw ApiError.notFound('Khata not found.', 'KHATA_NOT_FOUND');

  const before = {
    displayName: khata.displayName,
    phone: khata.phone,
    address: khata.address,
    startDate: khata.startDate,
    billingStartDay: khata.billingStartDay,
    billingMode: khata.billingMode ?? null,
    openingBalancePaisa: khata.openingBalancePaisa,
    notes: khata.notes,
  };

  if (input.displayName !== undefined) khata.displayName = input.displayName;
  if (input.phone !== undefined) khata.phone = input.phone;
  if (input.address !== undefined) khata.address = input.address;
  if (input.startDate !== undefined) {
    if (!validateDateStr(input.startDate)) throw ApiError.validation('startDate must be valid.');
    khata.startDate = input.startDate;
  }
  if (input.billingStartDay !== undefined) khata.billingStartDay = input.billingStartDay;
  if (input.billingMode !== undefined) {
    if (khata.type !== 'OFFICE') throw ApiError.validation('billingMode only applies to office khatas.');
    if (input.billingMode === khata.billingMode) {
      // no-op
    } else if (input.billingMode === 'DIRECT') {
      const [bossCount, staffCount] = await Promise.all([
        Boss.countDocuments({ khataId: khata._id }),
        Staff.countDocuments({ khataId: khata._id }),
      ]);
      if (bossCount > 0 || staffCount > 0) {
        throw ApiError.validation('Cannot switch to DIRECT: this office still has bosses or staff. Remove them first.');
      }
    } else if (input.billingMode === 'GROUPS' && (input.openingBalancePaisa ?? khata.openingBalancePaisa ?? 0) > 0) {
      throw ApiError.validation('Cannot switch to GROUPS while the office itself carries an opening balance.');
    }
    khata.billingMode = input.billingMode;
  }
  if (input.openingBalancePaisa !== undefined) {
    if (khata.type === 'OFFICE') {
      // Legacy offices (no billingMode yet, pre-migration) may still store
      // the opening on an old default "Office Direct" boss — keep writing
      // there until the migration moves it to the khata.
      const legacyDefault = await Boss.findOne({ khataId: khata._id, isDefault: true });
      if (legacyDefault) {
        legacyDefault.openingBalancePaisa = input.openingBalancePaisa;
        await legacyDefault.save();
      } else {
        if (input.openingBalancePaisa > 0 && (khata.billingMode ?? 'MIXED') === 'GROUPS') {
          throw ApiError.validation('A GROUPS office has no ledger of its own — put the dues on a boss instead.');
        }
        khata.openingBalancePaisa = input.openingBalancePaisa;
      }
    } else {
      khata.openingBalancePaisa = input.openingBalancePaisa;
    }
  }
  if (input.notes !== undefined) khata.notes = input.notes;

  khata.searchName = normalizeSearch(khata.displayName);
  await khata.save();

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'KHATA_UPDATED',
    entity: 'Khata',
    entityId: String(khata._id),
    before,
    after: {
      displayName: khata.displayName,
      phone: khata.phone,
      address: khata.address,
      startDate: khata.startDate,
      billingStartDay: khata.billingStartDay,
      billingMode: khata.billingMode ?? null,
      openingBalancePaisa: khata.openingBalancePaisa,
      notes: khata.notes,
    },
  });

  return khata;
}

export async function changeKhataStatus(id: string, status: 'ACTIVE' | 'OFFLINE', admin: CurrentAdmin) {
  const khata = await Khata.findById(id);
  if (!khata) throw ApiError.notFound('Khata not found.', 'KHATA_NOT_FOUND');

  const before = { status: khata.status, endDate: khata.endDate };
  khata.status = status;
  if (status === 'OFFLINE' && !khata.endDate) {
    khata.endDate = todayBusinessDate();
  }
  if (status === 'ACTIVE' && khata.endDate) {
    khata.endDate = null;
  }
  await khata.save();

  // Cascade to bosses + staff when deactivating an office (never on activate).
  if (khata.type === 'OFFICE' && status === 'OFFLINE') {
    await Boss.updateMany({ khataId: khata._id, status: 'ACTIVE' }, { $set: { status: 'INACTIVE' } });
    await setAllStaffByKhata(khata._id.toString(), 'INACTIVE');
  }

  await writeAuditLog({
    adminId: admin.adminId,
    adminNameSnapshot: admin.adminName,
    action: 'KHATA_STATUS_CHANGED',
    entity: 'Khata',
    entityId: String(khata._id),
    before,
    after: { status: khata.status, endDate: khata.endDate },
  });

  return khata;
}

export async function archiveKhata(id: string, admin: CurrentAdmin) {
  return changeKhataStatus(id, 'OFFLINE', admin);
}

export async function recentConsumptionNames(khataId: string, limit = 12) {
  const rows = await ConsumptionTransaction.find({ khataId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('consumerNameSnapshot consumerType consumerId itemNameSnapshot businessDate totalPaisa')
    .lean();
  return rows;
}