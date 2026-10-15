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
  defaultStaffBillingResponsibility?: 'OFFICE' | 'SELF';
  initialBoss?: { name: string; phone?: string };
  initialStaff?: Array<{ name: string; phone?: string; billingResponsibility?: 'OFFICE' | 'SELF' }>;
}

export interface UpdateKhataInput {
  displayName?: string;
  phone?: string;
  address?: string;
  startDate?: string;
  billingStartDay?: number;
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
          openingBalancePaisa: input.openingBalancePaisa ?? 0,
          notes: input.notes ?? '',
          createdBy: admin.adminId ? new mongoose.Types.ObjectId(admin.adminId) : null,
        },
      ],
      { session: s ?? undefined }
    );

    let defaultBossId: string | null = null;
    if (input.type === 'OFFICE') {
      const [boss] = await Boss.create(
        [
          {
            khataId: khata._id,
            name: 'Office Direct',
            searchName: 'office direct',
            isDefault: true,
            status: 'ACTIVE',
            startDate: input.startDate,
          },
        ],
        { session: s ?? undefined }
      );
      defaultBossId = String(boss._id);

      let staffBossId = defaultBossId;
      if (input.initialBoss) {
        const [initialBoss] = await Boss.create(
          [
            {
              khataId: khata._id,
              name: input.initialBoss.name.trim(),
              searchName: normalizeSearch(input.initialBoss.name),
              phone: input.initialBoss.phone ?? '',
              isDefault: false,
              status: 'ACTIVE',
              startDate: input.startDate,
            },
          ],
          { session: s ?? undefined }
        );
        staffBossId = String(initialBoss._id);
      }

      for (const person of input.initialStaff ?? []) {
        await Staff.create(
          [
            {
              khataId: khata._id,
              bossId: staffBossId,
              name: person.name.trim(),
              searchName: normalizeSearch(person.name),
              phone: person.phone ?? '',
              billingResponsibility: person.billingResponsibility
                ?? input.defaultStaffBillingResponsibility
                ?? 'OFFICE',
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

    return { khata, defaultBossId };
  });

  return { ...session, duePaisa: session.khata.openingBalancePaisa };
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

  const dues = await dueByKhata(khatas.map((k) => String(k._id)));

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
    defaultStaffBillingResponsibility: k.defaultStaffBillingResponsibility ?? 'OFFICE',
    openingBalancePaisa: k.openingBalancePaisa,
    notes: k.notes,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
    duePaisa: (dues.get(String(k._id)) ?? 0) + k.openingBalancePaisa,
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

  let bosses: Array<{ _id: string; name: string; isDefault: boolean; status: string; duePaisa: number; staffCount: number }> = [];
  if (khata.type === 'OFFICE') {
    const bossDocs = await Boss.find({ khataId: khata._id }).lean();
    const bossIds = bossDocs.map((b) => String(b._id));
    const [bossDues, staffCounts] = await Promise.all([
      getBossDueMap(bossIds),
      countStaffByBoss(bossIds),
    ]);
    bosses = bossDocs.map((b) => ({
      _id: String(b._id),
      name: b.name,
      isDefault: b.isDefault,
      status: b.status,
      duePaisa: bossDues.get(String(b._id)) ?? 0,
      staffCount: staffCounts.get(String(b._id)) ?? 0,
    }));
  }

  return {
    khata: { ...khata, _id: String(khata._id) },
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

export async function getCurrentDue(khataId: string): Promise<number> {
  const [rows, khata] = await Promise.all([
    Bill.aggregate<{ total: number }>([
      { $match: { khataId: new mongoose.Types.ObjectId(khataId), isVoided: false } },
      { $group: { _id: null, total: { $sum: '$duePaisa' } } },
    ]),
    Khata.findById(khataId).select('openingBalancePaisa').lean(),
  ]);
  const billDue = rows[0]?.total ?? 0;
  return billDue + (khata?.openingBalancePaisa ?? 0);
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

  const [salesAgg, billAgg, paymentAgg, staffCount] = await Promise.all([
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
  ]);

  const sales = salesAgg[0]?.total ?? 0;
  const bills = billAgg[0];
  const pay = paymentAgg[0];
  const cash = pay?.cash ?? 0;
  const digital = pay?.digital ?? 0;
  const other = pay?.other ?? 0;

  // Bill dues plus the migrated paper balance that never became a bill line.
  const outstanding = (bills?.due ?? 0) + khata.openingBalancePaisa;

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
  if (input.openingBalancePaisa !== undefined) khata.openingBalancePaisa = input.openingBalancePaisa;
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