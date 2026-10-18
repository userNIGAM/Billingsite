/**
 * Seeds the real office + individual khatas migrated from the paper ledger.
 *
 *   npm run seed:khatas
 *
 * Replaces ALL khatas, bosses and staff. It refuses to run once any bill,
 * payment or order exists, so it can only ever be used on a fresh ledger.
 *
 * Amounts below are in RUPEES; they are stored as paisa (× 100).
 *
 * Where each opening balance lives (see services/opening.service.ts):
 *   - individual            → Khata.openingBalancePaisa
 *   - office's own due      → Khata.openingBalancePaisa (billingMode DIRECT/MIXED)
 *   - named boss            → Boss.openingBalancePaisa
 *   - staff who pay alone   → Staff.openingBalancePaisa (SELF, office pool)
 *   - staff the boss pays   → folded into that boss's opening (OFFICE)
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import '../models';
import { Khata } from '../models/khata.model';
import { Boss } from '../models/boss.model';
import { Staff } from '../models/staff.model';
import { Bill } from '../models/bill.model';
import { Payment } from '../models/payment.model';
import { ConsumptionTransaction } from '../models/consumptionTransaction.model';
import { Counter } from '../models/counter.model';
import { nextKhataCode } from '../services/counter.service';
import { normalizeSearch } from '../utils/pagination';
import { todayBusinessDate } from '../utils/date';

const ADDRESS = 'Birtamode';
const PHONE = '9800000000';

interface StaffSpec {
  name: string;
  opening: number;
  /** Name of the boss who pays for this staff member; omitted = pays alone. */
  paidBy?: string;
  /** Boss this staff member sits under while still paying personally (SELF). */
  under?: string;
}

interface OfficeSpec {
  name: string;
  /** Due the office owes directly, with no boss. */
  direct?: number;
  bosses?: Array<{ name: string; opening: number }>;
  staff?: StaffSpec[];
  notes?: string;
}

const offices: OfficeSpec[] = [
  { name: 'Frontlines', direct: 240, notes: 'All bills are paid by the office.' },
  { name: 'NB', bosses: [{ name: 'Manoj', opening: 16415 }, { name: 'Rita', opening: 21020 }] },
  { name: 'HR', bosses: [{ name: 'Suman Katwal', opening: 3675 }] },
  {
    name: 'Soundlince',
    bosses: [{ name: 'Raju Sir', opening: 155 }],
    staff: [
      { name: 'Nishant Dahal', opening: 5835 },
      { name: 'Dipak Sir', opening: 1230 },
      { name: 'Samikshya', opening: 280 },
      { name: 'Kishor Sir', opening: 510 },
      { name: 'Lila Sir', opening: 2350 },
      { name: 'Hem Sir', opening: 100, paidBy: 'Raju Sir' },
      { name: 'Bhawani Sir', opening: 330, paidBy: 'Raju Sir' },
      { name: 'Krishna Sir', opening: 0, paidBy: 'Raju Sir' },
      { name: 'Sabin Sir', opening: 320, paidBy: 'Raju Sir' },
    ],
  },
  { name: 'Alliance', bosses: [{ name: 'Santosh Dhakal', opening: 1525 }], notes: 'The office and its boss are the same; the due is on the boss.' },
  { name: 'D Proton', direct: 940 },
  {
    name: 'Suva Laxmi Diagnostic',
    bosses: [{ name: 'Lab Ko Sir', opening: 60 }],
    staff: [
      { name: 'Amita', opening: 0, paidBy: 'Lab Ko Sir' },
      { name: 'Rojina Bhattarai', opening: 0, paidBy: 'Lab Ko Sir' },
    ],
  },
  { name: 'Siddha Global', bosses: [{ name: 'Santosh', opening: 1760 }] },
  {
    name: 'Habtoor',
    bosses: [{ name: 'Habtoor', opening: 0 }],
    staff: [
      { name: 'Neha', opening: 0, paidBy: 'Habtoor' },
      { name: 'Samjhana', opening: 0, paidBy: 'Habtoor' },
      { name: 'Anita Adhikari', opening: 0, paidBy: 'Habtoor' },
      { name: 'Champa Pokhrel', opening: 130, paidBy: 'Habtoor' },
    ],
  },
  {
    name: 'National Exports',
    bosses: [
      { name: 'Prakash', opening: 23055 },
      { name: 'Mohan Dahal', opening: 1295 },
      { name: 'Suraj Kamati', opening: 5580 },
    ],
  },
  { name: 'AlNasar Manpower', bosses: [{ name: 'Roshan Upreti', opening: 3790 }] },
  {
    name: 'Sharon',
    staff: [{ name: 'Asmit', opening: 0 }, { name: 'Kritika', opening: 0 }, { name: 'Yogesh', opening: 2520 }],
  },
  { name: 'Honesty', direct: 3530, notes: 'All orders go directly to the office.' },
  { name: 'Manaslu', direct: 1440 },
  { name: 'Sunlight', bosses: [{ name: 'Srijana Mam', opening: 2305 }] },
  { name: 'Royal and Partner', direct: 730 },
  { name: 'Rhythm', direct: 3120 },
  { name: 'Inter', direct: 440, staff: [{ name: 'Staff', opening: 0 }] },
  { name: 'Bon Manpower', direct: 6920 },
  { name: 'Rajdhani Manpower', direct: 200 },
  { name: 'AS', bosses: [{ name: 'Pawan Bhai', opening: 210 }] },
  {
    name: 'Grand Suite',
    bosses: [{ name: 'Sandesh Sir', opening: 0 }],
    staff: [{ name: 'Suzu', opening: 4830, under: 'Sandesh Sir' }],
    notes: 'Suzu orders under Sandesh Sir but pays for her own bills.',
  },
  {
    name: 'HK Manpower',
    bosses: [{ name: 'Kedar Sir', opening: 150 }],
    staff: [
      { name: 'Anita', opening: 0, paidBy: 'Kedar Sir' },
      { name: 'Rostika', opening: 0, paidBy: 'Kedar Sir' },
    ],
  },
  { name: 'Golf Star', staff: [{ name: 'Susmita', opening: 0 }] },
  { name: 'Asia Orentitation', staff: [{ name: 'Rita', opening: 0 }] },
  { name: 'World Ways', staff: [{ name: 'Mohin', opening: 1510 }] },
  {
    name: 'Grand',
    direct: 0,
    notes: 'The office pays its own bill every week; staff pay their own bills monthly, after salary.',
    staff: [
      { name: 'Anuja Grand', opening: 0 },
      { name: 'Pren Grand', opening: 560 },
      { name: 'Tika Grand', opening: 650 },
      { name: 'Santosh Grand', opening: 630 },
      { name: 'Arjun Grand', opening: 690 },
      { name: 'Rebecca Grand', opening: 1930 },
      { name: 'Ranju Grand', opening: 2730 },
    ],
  },
];

const individuals: Array<[name: string, opening: number]> = [
  ['Kushal Rai', 1785],
  ['Arjun Dai', 1495],
  ['Khem Dulal', 1545],
  ['Chandra Budathoki', 80],
  ['Bibek Bhai', 1235],
  ['Chandra DD', 1355],
  ['Manisha Worldways', 440],
  ['Prashant Bhattarai', 910],
  ['Suraj Sir', 7575],
  ['Dipak Tiwari', 770],
  ['Global', 1000],
  ['Umesh Subedi', 6890],
  ['Bipana Rai (HR)', 1240],
  ['Manish Adhikari', 3115],
  ['Khagendra Rijal', 1465],
  ['Bhupal Bhattarai', 320],
  ['Khem Nepal', 5195],
  ['Anmol', 930],
  ['CN Bhandari', 440],
  ['Diwash Shrestha', 905],
  ['Sound System', 1050],
  ['Ram Budathoki', 1345],
  ['Sunkoshi Sir', 850],
  ['Guransh', 160],
  ['Safa Garney Buini', 60],
  ['Sound System Driver', 280],
  ['Sushil Bhattarai', 270],
  ['Dawa Tamanag', 3260],
];

const paisa = (rupees: number) => Math.round(rupees * 100);

function person(name: string) {
  return { name, searchName: normalizeSearch(name), phone: PHONE, address: ADDRESS };
}

async function seedOffice(spec: OfficeSpec, startDate: string) {
  const staff = spec.staff ?? [];
  const selfPaying = staff.some((s) => !s.paidBy);
  const directPaisa = paisa(spec.direct ?? 0);
  const bossCount = spec.bosses?.length ?? 0;
  // Staff that sit in the office pool (no boss at all) need the MIXED office
  // pool; GROUPS reserves staff for named bosses only.
  const officePoolStaff = staff.filter((s) => !s.paidBy && !s.under);

  // DIRECT = office's own ledger only; GROUPS = bosses + their staff, no
  // office ledger; MIXED = office ledger and/or office-pool staff coexist
  // with bosses. Pick the narrowest mode that fits.
  const billingMode = bossCount === 0 && officePoolStaff.length === 0 && staff.length === 0 && directPaisa > 0
    ? 'DIRECT'
    : directPaisa === 0 && officePoolStaff.length === 0
      ? 'GROUPS'
      : 'MIXED';

  const khata = await Khata.create({
    khataCode: await nextKhataCode(),
    type: 'OFFICE',
    displayName: spec.name,
    searchName: normalizeSearch(spec.name),
    phone: PHONE,
    address: ADDRESS,
    startDate,
    billingStartDay: 1,
    billingMode,
    defaultStaffBillingResponsibility: selfPaying ? 'SELF' : 'OFFICE',
    // The office's own migrated due lives on the khata itself now — no
    // hidden "Office Direct" boss carries it.
    openingBalancePaisa: directPaisa,
    notes: spec.notes ?? '',
  });

  const bossIds = new Map<string, mongoose.Types.ObjectId>();
  for (const b of spec.bosses ?? []) {
    // Old dues of the staff this boss pays for are part of the boss's bill.
    const paidFor = staff.filter((s) => s.paidBy === b.name);
    const total = b.opening + paidFor.reduce((sum, s) => sum + s.opening, 0);
    const breakdown = paidFor.length
      ? `Opening ${total} = own ${b.opening} + ${paidFor.map((s) => `${s.name} ${s.opening}`).join(' + ')}.`
      : '';
    const boss = await Boss.create({
      khataId: khata._id,
      ...person(b.name),
      openingBalancePaisa: paisa(total),
      startDate,
      notes: breakdown,
    });
    bossIds.set(b.name, boss._id);
  }

  for (const s of staff) {
    // paidBy → under that boss, boss pays (OFFICE); under → under that boss
    // but pays personally (SELF, keeps own opening); otherwise office pool
    // (bossId null) with a personal SELF ledger.
    const anchor = s.paidBy ?? s.under;
    const bossId = anchor ? bossIds.get(anchor) ?? null : null;
    if (anchor && !bossId) throw new Error(`${spec.name}: unknown boss "${anchor}" for ${s.name}`);
    const paysPersonally = !s.paidBy;
    await Staff.create({
      khataId: khata._id,
      bossId,
      ...person(s.name),
      billingResponsibility: paysPersonally ? 'SELF' : 'OFFICE',
      openingBalancePaisa: paysPersonally ? paisa(s.opening) : 0,
      startDate,
      notes: s.paidBy && s.opening > 0 ? `Old due Rs ${s.opening} is included in ${s.paidBy}'s opening balance.` : '',
    });
  }
}

async function main(): Promise<void> {
  await mongoose.connect(env.mongodbUri);
  try {
    const [bills, payments, orders] = await Promise.all([
      Bill.countDocuments(),
      Payment.countDocuments(),
      ConsumptionTransaction.countDocuments(),
    ]);
    if (bills + payments + orders > 0) {
      throw new Error(`Refusing to reseed: ${bills} bills, ${payments} payments and ${orders} orders already exist.`);
    }

    await Promise.all([Staff.deleteMany({}), Boss.deleteMany({}), Khata.deleteMany({})]);
    await Counter.deleteOne({ _id: 'khata' });

    const startDate = todayBusinessDate();
    for (const office of offices) await seedOffice(office, startDate);
    for (const [name, opening] of individuals) {
      await Khata.create({
        khataCode: await nextKhataCode(),
        type: 'INDIVIDUAL',
        displayName: name,
        searchName: normalizeSearch(name),
        phone: PHONE,
        address: ADDRESS,
        startDate,
        billingStartDay: 1,
        openingBalancePaisa: paisa(opening),
      });
    }

    const [k, b, s] = await Promise.all([Khata.countDocuments(), Boss.countDocuments({ isDefault: false }), Staff.countDocuments()]);
    console.log(`Seeded ${offices.length} offices + ${individuals.length} individuals (${k} khatas), ${b} named bosses, ${s} staff.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
