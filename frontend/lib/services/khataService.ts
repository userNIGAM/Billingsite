import { apiClient } from '../apiClient';
import { paged, unwrap, type ListResult } from './base';
import type {
  Khata,
  KhataStatus,
  KhataType,
  Period,
  Boss,
  BossSummary,
  Staff,
  PayerRef,
} from '../../types/api';

export interface KhataListParams {
  q?: string;
  type?: KhataType;
  status?: KhataStatus;
  page?: number;
  limit?: number;
}

export interface KhataSummary {
  khataId: string;
  from: string;
  to: string;
  accruedSalesPaisa: number;
  collected: { cashPaisa: number; digitalPaisa: number; otherPaisa: number; totalPaisa: number };
  bills: { count: number; billedTotalPaisa: number; paidPaisa: number; outstandingPaisa: number };
  openingBalancePaisa: number;
  staffCount: number;
}

export interface KhataDetail {
  khata: Khata;
  duePaisa: number;
  currentPeriod: Period;
  bosses: Array<{
    _id: string;
    name: string;
    isDefault: boolean;
    status: string;
    duePaisa: number;
    staffCount: number;
  }>;
}

export interface CreateKhataInput {
  type: KhataType;
  displayName: string;
  phone?: string;
  address?: string;
  startDate: string;
  billingStartDay?: number;
  openingBalancePaisa?: number;
  notes?: string;
  defaultStaffBillingResponsibility?: 'OFFICE' | 'SELF';
  initialBoss?: { name: string; phone?: string };
  initialStaff?: Array<{ name: string; phone?: string; billingResponsibility?: 'OFFICE' | 'SELF' }>;
}

export interface CreateKhataResult {
  khata: Khata;
  defaultBossId: string | null;
  duePaisa: number;
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

export const khataService = {
  /** Paginated. */
  async list(params: KhataListParams, signal?: AbortSignal): Promise<ListResult<Khata>> {
    const { data, meta } = await apiClient.getWithMeta<{ rows: Khata[] }>(
      '/khatas',
      { ...params },
      signal
    );
    return paged(data, meta);
  },

  /** Unpaginated — used by pickers that need every row. */
  async listAll(params: Omit<KhataListParams, 'page' | 'limit'> = {}, signal?: AbortSignal): Promise<Khata[]> {
    const res = await this.list({ ...params, page: 1, limit: 100 }, signal);
    return res.rows;
  },

  async detail(id: string, signal?: AbortSignal): Promise<KhataDetail> {
    return apiClient.get<KhataDetail>(`/khatas/${id}`, undefined, signal);
  },

  async summary(id: string, range?: { from?: string; to?: string }, signal?: AbortSignal): Promise<KhataSummary> {
    return apiClient.get<KhataSummary>(`/khatas/${id}/summary`, range, signal);
  },

  async create(input: CreateKhataInput): Promise<CreateKhataResult> {
    return apiClient.post<CreateKhataResult>('/khatas', input);
  },

  async update(id: string, input: UpdateKhataInput): Promise<Khata> {
    const data = await apiClient.patch<{ khata: Khata }>(`/khatas/${id}`, input);
    return unwrap<Khata>(data, 'khata');
  },

  async changeStatus(id: string, status: KhataStatus): Promise<Khata> {
    const data = await apiClient.patch<{ khata: Khata }>(`/khatas/${id}/status`, { status });
    return unwrap<Khata>(data, 'khata');
  },

  async archive(id: string): Promise<Khata> {
    const data = await apiClient.post<{ khata: Khata }>(`/khatas/${id}/archive`);
    return unwrap<Khata>(data, 'khata');
  },

  // ---- Office / boss hierarchy ----

  async listBosses(khataId: string, signal?: AbortSignal): Promise<Boss[]> {
    const data = await apiClient.get<{ bosses: Boss[] }>(`/bosses/offices/${khataId}/bosses`, undefined, signal);
    return data.bosses ?? [];
  },

  async createBoss(
    khataId: string,
    input: { name: string; phone?: string; notes?: string; startDate?: string }
  ): Promise<Boss> {
    const data = await apiClient.post<{ boss: Boss }>(`/bosses/offices/${khataId}/bosses`, {
      khataId,
      ...input,
    });
    return unwrap<Boss>(data, 'boss');
  },

  async bossSummary(bossId: string, signal?: AbortSignal): Promise<BossSummary> {
    return apiClient.get<BossSummary>(`/bosses/${bossId}/summary`, undefined, signal);
  },

  async updateBoss(bossId: string, input: { name?: string; phone?: string; notes?: string }): Promise<Boss> {
    const data = await apiClient.patch<{ boss: Boss }>(`/bosses/${bossId}`, input);
    return unwrap<Boss>(data, 'boss');
  },

  /** Soft delete: deactivates, preserving history. */
  async deactivateBoss(bossId: string): Promise<Boss> {
    const data = await apiClient.patch<{ boss: Boss }>(`/bosses/${bossId}/deactivate`);
    return unwrap<Boss>(data, 'boss');
  },

  async activateBoss(bossId: string): Promise<Boss> {
    const data = await apiClient.patch<{ boss: Boss }>(`/bosses/${bossId}/activate`);
    return unwrap<Boss>(data, 'boss');
  },

  // ---- Staff ----

  async listStaff(
    params: { q?: string; khataId?: string; bossId?: string; status?: 'ACTIVE' | 'INACTIVE' },
    signal?: AbortSignal
  ): Promise<Staff[]> {
    const { data } = await apiClient.getWithMeta<{ rows: Staff[] } | Staff[]>(
      '/staff',
      { ...params, page: 1, limit: 100 },
      signal
    );
    return paged(data, undefined).rows;
  },

  async createStaff(input: {
    khataId: string;
    bossId?: string;
    name: string;
    billingResponsibility?: 'OFFICE' | 'SELF';
    phone?: string;
    startDate?: string;
    notes?: string;
  }): Promise<Staff> {
    const data = await apiClient.post<{ staff: Staff }>('/staff', input);
    return unwrap<Staff>(data, 'staff');
  },

  async updateStaff(
    staffId: string,
    input: { name?: string; phone?: string; notes?: string; billingResponsibility?: 'OFFICE' | 'SELF' }
  ): Promise<Staff> {
    const data = await apiClient.patch<{ staff: Staff }>(`/staff/${staffId}`, input);
    return unwrap<Staff>(data, 'staff');
  },

  /** Moves staff to a different boss; historical transactions keep their bossId. */
  async transferStaff(staffId: string, bossId: string): Promise<Staff> {
    const data = await apiClient.patch<{ staff: Staff }>(`/staff/${staffId}/transfer`, { bossId });
    return unwrap<Staff>(data, 'staff');
  },

  async setStaffStatus(staffId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<Staff> {
    const data = await apiClient.patch<{ staff: Staff }>(`/staff/${staffId}/status`, { status });
    return unwrap<Staff>(data, 'staff');
  },

  async staffSummary(staffId: string, signal?: AbortSignal): Promise<{ staff: Staff & { khataName: string; bossName: string }; duePaisa: number }> {
    return apiClient.get(`/staff/${staffId}/summary`, undefined, signal);
  },

  /** Resolves the payer key for a consumer, used before bill/payment creation. */
  payerRef(khataId: string, bossId: string | null = null): PayerRef {
    return { khataId, bossId };
  },
};
