import { apiClient } from '../apiClient';
import { paged, unwrap, type ListResult } from './base';
import type { CanteenProfile, CustomerSearchResult, PageMeta, ServingSize } from '../../types/api';

export interface OutstandingRow {
  khataId: string;
  khataName: string;
  type: string;
  status: string;
  duePaisa: number;
  openingBalancePaisa: number;
  lastPaymentDate: string | null;
}

export interface DashboardOverview {
  todaySalesPaisa: number;
  monthSalesPaisa: number;
  todayExpensesPaisa: number;
  monthExpensesPaisa: number;
  outstandingDuesPaisa: number;
  totalActiveKhatas: number;
  activeOffices: number;
  activeIndividuals: number;
  collectionsToday: { cash: number; digital: number; other: number; total: number };
  collectionsMonth: { cash: number; digital: number; other: number; total: number };
  profitLoss: {
    revenuePaisa: number;
    cogsPaisa: number;
    costCoveragePct: number;
    grossProfitEstimated: boolean;
    grossProfitPaisa: number;
    operatingExpensePaisa: number;
    netProfitPaisa: number;
    cashSurplusPaisa: number;
  };
  salesExpenseSeries: Array<{ date: string; salesPaisa: number; expensePaisa: number }>;
  topItems: Array<{ itemId: string; name: string; servingSize: ServingSize; quantity: number; revenuePaisa: number; costPaisa: number }>;
}

export const dashboardService = {
  async overview(signal?: AbortSignal): Promise<DashboardOverview> {
    return apiClient.get<DashboardOverview>('/dashboard/overview', undefined, signal);
  },

  async outstanding(signal?: AbortSignal): Promise<ListResult<OutstandingRow>> {
    const { data, meta } = await apiClient.getWithMeta<{ rows: OutstandingRow[] }>(
      '/dashboard/outstanding',
      undefined,
      signal
    );
    return paged(data, meta);
  },
};

export const customerService = {
  /**
   * Unified search across individuals, bosses, and staff. Offline consumers are
   * excluded unless `includeOffline` is set — they can't take new orders.
   */
  async search(q: string, includeOffline = false, signal?: AbortSignal): Promise<CustomerSearchResult[]> {
    const data = await apiClient.get<{ customers: CustomerSearchResult[] }>(
      '/customers/search',
      { q, includeOffline },
      signal
    );
    return data.customers ?? [];
  },
};

export const settingsService = {
  async getProfile(signal?: AbortSignal): Promise<CanteenProfile> {
    const data = await apiClient.get<{ profile: CanteenProfile }>('/settings/profile', undefined, signal);
    return unwrap<CanteenProfile>(data, 'profile');
  },

  async updateProfile(input: Partial<CanteenProfile>): Promise<CanteenProfile> {
    const data = await apiClient.patch<{ profile: CanteenProfile }>('/settings/profile', input);
    return unwrap<CanteenProfile>(data, 'profile');
  },
};

// ---- Reports ----

export type ReportGroup = 'day' | 'item' | 'office';

export interface SalesReport {
  from: string;
  to: string;
  totalSalesPaisa: number;
  groups: Array<{
    date?: string;
    itemName?: string;
    servingSize?: ServingSize;
    quantity?: number;
    revenuePaisa: number;
    _id?: unknown;
  }>;
}

export interface ExpenseReport {
  from: string;
  to: string;
  totalExpensePaisa: number;
  byCategory: Array<{ categoryName: string; amountPaisa: number }>;
  byDay: Array<{ date: string; amountPaisa: number }>;
}

export interface ProfitLossReport {
  from: string;
  to: string;
  revenue: number;
  cogs: number;
  costCoveragePct: number;
  grossProfitEstimated: boolean;
  grossProfit: number;
  operatingExpense: number;
  netProfit: number;
  cashSurplus: number;
  collected: number;
  outstanding: number;
}

export interface CollectionsReport {
  from: string;
  to: string;
  cashPaisa: number;
  cashCount: number;
  digitalPaisa: number;
  digitalCount: number;
  otherPaisa: number;
  otherCount: number;
  totalPaisa: number;
  byChannel: Array<{ channel: string; amountPaisa: number }>;
}

export interface ItemReportRow {
  itemName: string;
  servingSize: ServingSize;
  quantity: number;
  revenuePaisa: number;
  costPaisa: number;
}

export interface CustomerReportRow {
  khataId: string;
  khataName: string;
  type: string;
  status: string;
  consumptionTotalPaisa: number;
  billedPaisa: number;
  paidPaisa: number;
  outstandingPaisa: number;
}

export interface OfficeReportRow {
  khataId: string;
  officeName: string;
  status: string;
  staffCount: number;
  bossCount: number;
  consumptionTotalPaisa: number;
  billedPaisa: number;
  paidPaisa: number;
  outstandingPaisa: number;
}

export const reportService = {
  sales(params: { from?: string; to?: string; groupBy?: ReportGroup }, signal?: AbortSignal) {
    return apiClient.get<SalesReport>('/reports/sales', { ...params }, signal);
  },

  expenses(params: { from?: string; to?: string }, signal?: AbortSignal) {
    return apiClient.get<ExpenseReport>('/reports/expenses', { ...params }, signal);
  },

  profitLoss(params: { from?: string; to?: string }, signal?: AbortSignal) {
    return apiClient.get<ProfitLossReport>('/reports/profit-loss', { ...params }, signal);
  },

  collections(params: { from?: string; to?: string }, signal?: AbortSignal) {
    return apiClient.get<CollectionsReport>('/reports/collections', { ...params }, signal);
  },

  async items(params: { from?: string; to?: string }, signal?: AbortSignal): Promise<ItemReportRow[]> {
    const data = await apiClient.get<{ rows: ItemReportRow[] }>('/reports/items', { ...params }, signal);
    return data.rows ?? [];
  },

  async customers(signal?: AbortSignal): Promise<CustomerReportRow[]> {
    const data = await apiClient.get<{ rows: CustomerReportRow[] }>('/reports/customers', undefined, signal);
    return data.rows ?? [];
  },

  async offices(signal?: AbortSignal): Promise<OfficeReportRow[]> {
    const data = await apiClient.get<{ rows: OfficeReportRow[] }>('/reports/offices', undefined, signal);
    return data.rows ?? [];
  },

  outstanding(signal?: AbortSignal) {
    return apiClient.get<{ rows: OutstandingRow[] }>('/reports/outstanding', undefined, signal);
  },
};

export interface AuditLog {
  _id: string;
  adminId: string;
  adminNameSnapshot: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  createdAt: string;
}

export const auditService = {
  /** Returns `data` as a bare array (not `{ rows }`) — normalized by `paged`. */
  async list(
    params: { entity?: string; entityId?: string; adminId?: string; page?: number; limit?: number },
    signal?: AbortSignal
  ): Promise<ListResult<AuditLog>> {
    const { data, meta } = await apiClient.getWithMeta<AuditLog[]>(
      '/audit-logs',
      { ...params },
      signal
    );
    return paged(data, meta);
  },
};

export type { PageMeta };
