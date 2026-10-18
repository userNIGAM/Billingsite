import { Khata } from '../models/khata.model';
import { Boss } from '../models/boss.model';
import { Staff } from '../models/staff.model';
import { escapeRegex, normalizeSearch } from '../utils/pagination';
import { ApiError } from '../utils/ApiError';
import { objectId } from '../validators/common';

export type ConsumerType = 'INDIVIDUAL' | 'BOSS' | 'STAFF' | 'OFFICE';

export interface CustomerSearchResult {
  consumerType: ConsumerType;
  consumerId: string;
  name: string;
  context: string; // e.g. "ABC Office • Boss: Ram" | "Individual"
  khataId: string;
  bossId: string | null;
  khataName: string;
  isOfficeDirect: boolean;
  billingResponsibility?: 'OFFICE' | 'SELF';
  status: 'ACTIVE' | 'OFFLINE' | 'INACTIVE';
}

/**
 * Unified search across individuals, office bosses and staff (§40, E-11).
 * Offline/inactive accounts are excluded by default so the Khaja picker can
 * never accidentally charge someone who isn't ordering (E-7, Rule 1).
 */
export async function searchCustomers(q: string, includeOffline = false): Promise<CustomerSearchResult[]> {
  const term = q.trim();
  const safe = escapeRegex(normalizeSearch(term));

  const khataFilter: Record<string, unknown> = { type: 'INDIVIDUAL' };
  if (!includeOffline) khataFilter.status = 'ACTIVE';

  const [individuals, offices] = await Promise.all([
    Khata.find<{ _id: unknown; displayName: string; status: string }>(
      term ? { ...khataFilter, searchName: { $regex: safe } } : khataFilter
    )
      .select('displayName status')
      .limit(20)
      .lean(),
    // Every office matching the term (any billingMode): the ids also feed the
    // default-boss lookup below so legacy "Office Direct" bosses stay
    // searchable, while the OFFICE consumer rows are only emitted for
    // DIRECT/MIXED ledgers.
    term
      ? Khata.find<{ _id: unknown; displayName: string; status: string; billingMode: string | null }>({
          type: 'OFFICE',
          ...(includeOffline ? {} : { status: 'ACTIVE' }),
          searchName: { $regex: safe },
        })
          .select('displayName status billingMode')
          .limit(20)
          .lean()
      : Promise.resolve([]),
  ]);

  const [bosses, staffs] = await Promise.all([
    Boss.aggregate([
      {
        $match: term
          ? {
              $or: [
                { searchName: { $regex: safe } },
                ...(offices.length > 0
                  ? [{ khataId: { $in: offices.map((office) => office._id) }, isDefault: true }]
                  : []),
              ],
            }
          : {},
      },
      {
        $lookup: {
          from: 'khatas',
          localField: 'khataId',
          foreignField: '_id',
          as: 'khata',
        },
      },
      { $unwind: { path: '$khata', preserveNullAndEmptyArrays: false } },
      { $match: includeOffline ? {} : { 'khata.status': 'ACTIVE', status: 'ACTIVE' } },
      { $limit: 20 },
    ]).then((rows) =>
      rows.map((r) => ({
        _id: r._id,
        name: r.name,
        khataId: r.khataId,
        khataName: r.khata.displayName,
        isDefault: r.isDefault,
        status: r.status,
      }))
    ),

    Staff.aggregate([
      { $match: term ? { searchName: { $regex: safe } } : {} },
      {
        $lookup: {
          from: 'khatas',
          localField: 'khataId',
          foreignField: '_id',
          as: 'khata',
        },
      },
      { $unwind: { path: '$khata', preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: 'bosses',
          localField: 'bossId',
          foreignField: '_id',
          as: 'boss',
        },
      },
      // Boss-less staff (office pool) must stay searchable — the unwind used
      // to drop them before they could ever reach the picker.
      { $unwind: { path: '$boss', preserveNullAndEmptyArrays: true } },
      {
        $match: includeOffline
          ? {}
          : {
              'khata.status': 'ACTIVE',
              status: 'ACTIVE',
              $or: [{ boss: { $exists: false } }, { 'boss.status': 'ACTIVE' }],
            },
      },
      { $limit: 20 },
    ]).then((rows) =>
      rows.map((r) => ({
        _id: r._id,
        name: r.name,
        khataId: r.khataId,
        bossId: r.bossId ?? null,
        khataName: r.khata.displayName,
        bossName: r.boss?.name ?? null,
        billingResponsibility: r.billingResponsibility ?? 'OFFICE',
        status: r.status,
      }))
    ),
  ]);

  const results: CustomerSearchResult[] = [];

  for (const khata of individuals) {
    results.push({
      consumerType: 'INDIVIDUAL',
      consumerId: String(khata._id),
      name: khata.displayName,
      context: 'Individual',
      khataId: String(khata._id),
      bossId: null,
      khataName: khata.displayName,
      isOfficeDirect: false,
      status: khata.status as CustomerSearchResult['status'],
    });
  }

  // The office itself as payer, but only when its own ledger is active
  // (DIRECT/MIXED). A GROUPS-only office is never offered without a boss.
  for (const office of offices) {
    if (office.billingMode !== 'DIRECT' && office.billingMode !== 'MIXED') continue;
    results.push({
      consumerType: 'OFFICE',
      consumerId: String(office._id),
      name: office.displayName,
      context: 'Office account',
      khataId: String(office._id),
      bossId: null,
      khataName: office.displayName,
      isOfficeDirect: true,
      status: office.status as CustomerSearchResult['status'],
    });
  }

  for (const boss of bosses) {
    const isOfficeDirect = Boolean(boss.isDefault);
    results.push({
      consumerType: 'BOSS',
      consumerId: String(boss._id),
      name: isOfficeDirect ? String(boss.khataName) : String(boss.name),
      context: isOfficeDirect ? 'Office account' : String(boss.khataName),
      khataId: String(boss.khataId),
      bossId: String(boss._id),
      khataName: String(boss.khataName),
      isOfficeDirect,
      status: (boss.status as CustomerSearchResult['status']) ?? 'ACTIVE',
    });
  }

  for (const staff of staffs) {
    const group = staff.bossName ? `Boss: ${staff.bossName}` : 'Office pool';
    results.push({
      consumerType: 'STAFF',
      consumerId: String(staff._id),
      name: String(staff.name),
      context: `${staff.khataName} • ${group}${staff.billingResponsibility === 'SELF' ? ' • Pays personally' : ''}`,
      khataId: String(staff.khataId),
      bossId: staff.bossId ? String(staff.bossId) : null,
      khataName: String(staff.khataName),
      isOfficeDirect: false,
      billingResponsibility: staff.billingResponsibility as 'OFFICE' | 'SELF',
      status: (staff.status as CustomerSearchResult['status']) ?? 'ACTIVE',
    });
  }

  // Sort: exact name matches first, then alphabetical. Stable identity is the
  // consumerId — names are never the primary key (Rule 7).
  results.sort((a, b) => {
    const an = normalizeSearch(a.name);
    const bn = normalizeSearch(b.name);
    const at = an.startsWith(normalizeSearch(term)) ? 0 : 1;
    const bt = bn.startsWith(normalizeSearch(term)) ? 0 : 1;
    if (at !== bt) return at - bt;
    return an.localeCompare(bn);
  });

  return results;
}

export async function resolveConsumer(consumerType: ConsumerType, consumerId: string) {
  if (!objectId.safeParse(consumerId).success) {
    throw ApiError.badRequest('INVALID_ID', 'Customer id is invalid.');
  }

  if (consumerType === 'INDIVIDUAL') {
    const khata = await Khata.findById(consumerId);
    if (!khata) throw ApiError.notFound('Customer not found.', 'CUSTOMER_NOT_FOUND');
    if (khata.type !== 'INDIVIDUAL') {
      throw ApiError.conflict('WRONG_CONSUMER_TYPE', 'This id belongs to an office, not an individual.');
    }
    return {
      khataId: consumerId,
      bossId: null,
      payerStaffId: null,
      consumerName: khata.displayName,
      context: 'Individual',
      khata,
    };
  }

  if (consumerType === 'OFFICE') {
    // The office khata's own direct ledger (DIRECT/MIXED). Payer key is
    // (khataId, null, null) — same shape as an individual, scope OFFICE.
    const khata = await Khata.findById(consumerId);
    if (!khata) throw ApiError.notFound('Customer not found.', 'CUSTOMER_NOT_FOUND');
    if (khata.type !== 'OFFICE') {
      throw ApiError.conflict('WRONG_CONSUMER_TYPE', 'This id belongs to an individual, not an office.');
    }
    if (khata.billingMode !== 'DIRECT' && khata.billingMode !== 'MIXED') {
      throw ApiError.conflict(
        'OFFICE_LEDGER_DISABLED',
        'This office bills only through its bosses and staff. Change its billing mode to DIRECT or MIXED to bill the office itself.'
      );
    }
    return {
      khataId: consumerId,
      bossId: null,
      payerStaffId: null,
      consumerName: khata.displayName,
      context: 'Office account',
      khata,
    };
  }

  if (consumerType === 'BOSS') {
    const boss = await Boss.findById(consumerId);
    if (!boss) throw ApiError.notFound('Boss not found.', 'CUSTOMER_NOT_FOUND');
    const khata = await Khata.findById(boss.khataId);
    if (!khata || khata.type !== 'OFFICE') {
      throw ApiError.conflict('INVALID_OFFICE', 'This boss does not belong to a valid office.');
    }
    return {
      khataId: String(khata._id),
      bossId: String(boss._id),
      payerStaffId: null,
      consumerName: boss.name,
      context: khata.displayName + ' • Boss',
      khata,
    };
  }

  // STAFF
  const staff = await Staff.findById(consumerId);
  if (!staff) throw ApiError.notFound('Staff member not found.', 'CUSTOMER_NOT_FOUND');
  const [khata, boss] = await Promise.all([
    Khata.findById(staff.khataId),
    staff.bossId ? Boss.findById(staff.bossId) : Promise.resolve(null),
  ]);
  if (!khata || khata.type !== 'OFFICE') {
    throw ApiError.conflict('INVALID_OFFICE', 'This staff member does not belong to a valid office.');
  }
  // A boss-less staff member is in the office pool: their OFFICE-responsible
  // consumption bills the office ledger itself, their SELF consumption bills
  // their own staff ledger. Both are valid without a boss.
  if (staff.bossId && !boss) throw ApiError.conflict('INVALID_BOSS', 'This staff member does not have a valid billing group.');
  return {
    khataId: String(khata._id),
    bossId: staff.bossId ? String(staff.bossId) : null,
    payerStaffId: staff.billingResponsibility === 'SELF' ? String(staff._id) : null,
    consumerName: staff.name,
    context: boss ? `${khata.displayName} • Boss: ${boss.name}` : `${khata.displayName} • Office pool`,
    khata,
    staff,
    boss,
  };
}