/**
 * API types shared by the whole frontend, mirroring the backend's
 * `backend/models` + response envelope. Money is ALWAYS integer paisa
 * (1 NPR = 100 paisa); never a float. Use `utils/money.ts` to format.
 */

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type KhataType = 'INDIVIDUAL' | 'OFFICE';
export type KhataStatus = 'ACTIVE' | 'OFFLINE';
/**
 * Office-only. DIRECT = the office itself is the payer (no bosses/staff);
 * GROUPS = bosses and their staff only (the office has no ledger);
 * MIXED = office ledger + bosses + staff coexist. Null for individuals and
 * for offices created before this field existed (treat as MIXED).
 */
export type BillingMode = 'DIRECT' | 'GROUPS' | 'MIXED';
export type BossStatus = 'ACTIVE' | 'INACTIVE';
export type ConsumerType = 'INDIVIDUAL' | 'BOSS' | 'STAFF' | 'OFFICE';
export type PaymentMethod = 'CASH' | 'DIGITAL' | 'OTHER';
export type DigitalChannel = 'ESEWA' | 'KHALTI' | 'BANK' | 'QR' | null;
export type BillStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID';
export type BillScope = 'INDIVIDUAL' | 'BOSS_GROUP' | 'STAFF' | 'OFFICE';
export type EntryType = 'ORDER' | 'REVERSAL';

export interface Khata {
  _id: string;
  khataCode: string;
  type: KhataType;
  displayName: string;
  phone: string;
  address: string;
  status: KhataStatus;
  startDate: string;
  endDate: string | null;
  billingStartDay: number;
  /** Offices only; null for individuals. */
  billingMode?: BillingMode | null;
  defaultStaffBillingResponsibility?: 'OFFICE' | 'SELF';
  openingBalancePaisa: number;
  notes: string;
  bossCount?: number;
  staffCount?: number;
  duePaisa?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Period {
  periodStart: string;
  periodEnd: string;
}

export interface Boss {
  _id: string;
  khataId: string;
  name: string;
  phone: string;
  address: string;
  openingBalancePaisa: number;
  isDefault: boolean;
  status: BossStatus;
  startDate: string;
  endDate: string | null;
  notes: string;
  duePaisa?: number;
  staffCount?: number;
}

export interface BossSummary {
  boss: Boss;
  staff: Staff[];
  duePaisa: number;
  bills?: Bill[];
  payments?: Payment[];
  consumption?: DailyConsumptionRow[];
}

export interface Staff {
  _id: string;
  khataId: string;
  bossId: string | null;
  billingResponsibility: 'OFFICE' | 'SELF';
  openingBalancePaisa: number;
  duePaisa?: number;
  bossName?: string;
  name: string;
  phone: string;
  address: string;
  status: BossStatus;
  startDate: string;
  endDate: string | null;
  notes: string;
}

export interface Item {
  _id: string;
  name: string;
  category: string;
  sellingPricePaisa: number;
  costPricePaisa: number | null;
  unit: string;
  isActive: boolean;
  description: string;
}

export interface ConsumptionTransaction {
  _id: string;
  transactionCode: string;
  khataId: string;
  bossId: string | null;
  payerStaffId?: string | null;
  consumerType: ConsumerType;
  consumerId: string;
  consumerNameSnapshot: string;
  consumerContextSnapshot: string;
  itemId: string;
  itemNameSnapshot: string;
  unitPricePaisa: number;
  unitCostPaisa: number | null;
  quantity: number;
  totalPaisa: number;
  businessDate: string;
  entryType: EntryType;
  reversesTransactionId: string | null;
  status: 'ACTIVE' | 'VOIDED';
  voidReason?: string;
  notes: string;
  createdAt?: string;
}

export interface DailyConsumptionRow {
  _id?: string;
  khataId: string;
  bossId: string | null;
  payerStaffId?: string | null;
  consumerType: ConsumerType;
  consumerId: string;
  consumerName: string;
  consumerContext: string;
  itemId: string;
  itemName: string;
  unitPricePaisa: number;
  unitCostPaisa: number | null;
  businessDate: string;
  quantity: number;
  totalPaisa: number;
}

export interface BillLineItem {
  businessDate: string;
  itemId: string;
  itemNameSnapshot: string;
  quantity: number;
  unitPricePaisa: number;
  totalPaisa: number;
}

export interface Bill {
  _id: string;
  billNumber: string;
  khataId: string;
  bossId: string | null;
  staffId?: string | null;
  scope: BillScope;
  payerNameSnapshot: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  lineItems: BillLineItem[];
  consumptionTotalPaisa: number;
  previousDuePaisa: number;
  creditAppliedPaisa: number;
  totalPayablePaisa: number;
  paidPaisa: number;
  duePaisa: number;
  status: BillStatus;
  isVoided: boolean;
  voidReason?: string;
  voidedAt?: string;
}

export interface PaymentAllocation {
  billId: string;
  amountPaisa: number;
}

export interface Payment {
  _id: string;
  paymentCode: string;
  khataId: string;
  bossId: string | null;
  staffId?: string | null;
  payerNameSnapshot?: string;
  khataName?: string;
  amountPaisa: number;
  method: PaymentMethod;
  digitalChannel: DigitalChannel;
  paymentDate: string;
  receivedAt: string;
  reference: string;
  note: string;
  allocations: PaymentAllocation[];
  unallocatedPaisa: number;
  isVoided: boolean;
  voidReason?: string;
}

export interface ExpenseCategory {
  _id: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
}

export interface Expense {
  _id: string;
  categoryId: string;
  categoryName?: string;
  itemName: string;
  quantity: number;
  unit: string;
  amountPaisa: number;
  supplier: string;
  businessDate: string;
  receivedAt: string;
  paymentMethod: PaymentMethod;
  note: string;
}

export interface CanteenProfile {
  name: string;
  address: string;
  phone: string;
  panNumber: string;
  billingNote: string;
}

export interface CustomerSearchResult {
  consumerType: ConsumerType;
  consumerId: string;
  name: string;
  context: string;
  khataId: string;
  khataName: string;
  bossId: string | null;
  isOfficeDirect: boolean;
  billingResponsibility?: 'OFFICE' | 'SELF';
  status: 'ACTIVE' | 'OFFLINE' | 'INACTIVE';
}

export interface Admin {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string | null;
}

/** Payer key — PLAN §2. */
export interface PayerRef {
  khataId: string;
  bossId: string | null;
}
