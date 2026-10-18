import { apiClient } from '../apiClient';
import { paged, unwrap, type ListResult } from './base';
import type {
  Bill,
  BillStatus,
  ConsumptionTransaction,
  ConsumerType,
  DailyConsumptionRow,
  Item,
  PayerRef,
  Payment,
  ServingMode,
  ServingSize,
} from '../../types/api';

// ---- Items ----

export interface CreateItemInput {
  name: string;
  category: string;
  servingMode?: ServingMode;
  sellingPricePaisa: number;
  halfPlatePricePaisa?: number | null;
  costPricePaisa?: number | null;
  unit?: string;
  description?: string;
}

export const itemService = {
  async list(
    params: { q?: string; category?: string; isActive?: boolean; page?: number; limit?: number },
    signal?: AbortSignal
  ): Promise<ListResult<Item>> {
    const { data, meta } = await apiClient.getWithMeta<{ rows: Item[] }>(
      '/items',
      { ...params },
      signal
    );
    return paged(data, meta);
  },

  async detail(id: string, signal?: AbortSignal): Promise<Item> {
    const data = await apiClient.get<{ item: Item }>(`/items/${id}`, undefined, signal);
    return unwrap<Item>(data, 'item');
  },

  async create(input: CreateItemInput): Promise<Item> {
    const data = await apiClient.post<{ item: Item }>('/items', input);
    return unwrap<Item>(data, 'item');
  },

  async update(id: string, input: Partial<CreateItemInput>): Promise<Item> {
    const data = await apiClient.patch<{ item: Item }>(`/items/${id}`, input);
    return unwrap<Item>(data, 'item');
  },

  /** Soft delete — history keeps referencing the item. */
  async deactivate(id: string): Promise<Item> {
    const data = await apiClient.post<{ item: Item }>(`/items/${id}/deactivate`);
    return unwrap<Item>(data, 'item');
  },

  /** Active items only — the set the Khaja Record screen offers. */
  async listActive(signal?: AbortSignal): Promise<Item[]> {
    const res = await this.list({ isActive: true, }, signal);
    return res.rows;
  },
};

// ---- Consumption (Khaja Record) ----

export interface RecordConsumptionInput {
  consumerType: ConsumerType;
  consumerId: string;
  itemId: string;
  servingSize?: ServingSize;
  quantity: number;
  businessDate?: string;
  notes?: string;
}

export interface RecordConsumptionResult {
  _id: string;
  transactionCode: string;
  consumerType: ConsumerType;
  consumerId: string;
  consumerName: string;
  context: string;
  itemName: string;
  servingSize: ServingSize;
  quantity: number;
  totalPaisa: number;
  businessDate: string;
}

export const consumptionService = {
  async record(input: RecordConsumptionInput): Promise<RecordConsumptionResult> {
    const data = await apiClient.post<{ transaction: RecordConsumptionResult }>('/consumption', input);
    return unwrap<RecordConsumptionResult>(data, 'transaction');
  },

  async list(
    params: {
      date?: string;
      khataId?: string;
      bossId?: string;
      consumerId?: string;
      itemId?: string;
      page?: number;
      limit?: number;
    },
    signal?: AbortSignal
  ): Promise<ListResult<ConsumptionTransaction>> {
    const { data, meta } = await apiClient.getWithMeta<{ rows: ConsumptionTransaction[] }>(
      '/consumption',
      { ...params },
      signal
    );
    return paged(data, meta);
  },

  /** Aggregated by (consumer, date, item, price) — one row per item, not per tap. */
  async daily(
    params: { date?: string; khataId?: string; bossId?: string },
    signal?: AbortSignal
  ): Promise<DailyConsumptionRow[]> {
    const data = await apiClient.get<{ rows: DailyConsumptionRow[] }>('/consumption/daily', { ...params }, signal);
    return data.rows ?? [];
  },

  /** Writes a signed REVERSAL row; never edits in place. */
  async voidTx(id: string, reason: string): Promise<ConsumptionTransaction> {
    const data = await apiClient.patch<{ transaction: ConsumptionTransaction }>(
      `/consumption/${id}/void`,
      { reason }
    );
    return unwrap<ConsumptionTransaction>(data, 'transaction');
  },
};

// ---- Bills ----

export interface GenerateBillInput {
  khataId: string;
  bossId?: string | null;
  staffId?: string | null;
  periodStart: string;
  periodEnd: string;
}

export interface GenerateBillResult {
  bill: Bill;
  paymentCreditAppliedPaisa?: number;
}

export const billService = {
  async generate(input: GenerateBillInput): Promise<GenerateBillResult> {
    return apiClient.post<GenerateBillResult>('/bills/generate', {
      khataId: input.khataId,
      ...(input.bossId ? { bossId: input.bossId } : {}),
      ...(input.staffId ? { staffId: input.staffId } : {}),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
  },

  async list(
    params: {
      khataId?: string;
      bossId?: string;
      staffId?: string;
      status?: BillStatus;
      page?: number;
      limit?: number;
    },
    signal?: AbortSignal
  ): Promise<ListResult<Bill>> {
    const { data, meta } = await apiClient.getWithMeta<{ rows: Bill[] }>('/bills', { ...params }, signal);
    return paged(data, meta);
  },

  async detail(id: string, signal?: AbortSignal): Promise<Bill> {
    const data = await apiClient.get<{ bill: Bill }>(`/bills/${id}`, undefined, signal);
    return unwrap<Bill>(data, 'bill');
  },

  /** Print view — same payload as detail, rendered for paper. */
  async printView(id: string, signal?: AbortSignal): Promise<Bill> {
    const data = await apiClient.get<{ bill: Bill }>(`/bills/${id}/print`, undefined, signal);
    return unwrap<Bill>(data, 'bill');
  },

  /** Releases each payment's allocation back as credit. */
  async voidBill(id: string, reason: string): Promise<{ releasedCreditPaisa: number; bill: Bill }> {
    return apiClient.post<{ releasedCreditPaisa: number; bill: Bill }>(`/bills/${id}/void`, { reason });
  },
};

// ---- Payments ----

export interface RecordPaymentInput {
  khataId: string;
  bossId?: string | null;
  staffId?: string | null;
  amountPaisa: number;
  method: 'CASH' | 'DIGITAL' | 'OTHER';
  digitalChannel?: 'ESEWA' | 'KHALTI' | 'BANK' | 'QR' | null;
  paymentDate: string;
  reference?: string;
  note?: string;
}

export const paymentService = {
  /** Allocates FIFO across the payer's open bills; the remainder becomes credit. */
  async record(input: RecordPaymentInput): Promise<Payment> {
    const data = await apiClient.post<{ payment: Payment }>('/payments', {
      khataId: input.khataId,
      ...(input.bossId ? { bossId: input.bossId } : {}),
      ...(input.staffId ? { staffId: input.staffId } : {}),
      amountPaisa: input.amountPaisa,
      method: input.method,
      ...(input.digitalChannel ? { digitalChannel: input.digitalChannel } : {}),
      paymentDate: input.paymentDate,
      ...(input.reference ? { reference: input.reference } : {}),
      ...(input.note ? { note: input.note } : {}),
    });
    return unwrap<Payment>(data, 'payment');
  },

  async list(
    params: {
      khataId?: string;
      bossId?: string;
      staffId?: string;
      method?: 'CASH' | 'DIGITAL' | 'OTHER';
      isVoided?: boolean;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
    signal?: AbortSignal
  ): Promise<ListResult<Payment>> {
    const { data, meta } = await apiClient.getWithMeta<{ rows: Payment[] }>(
      '/payments',
      { ...params },
      signal
    );
    return paged(data, meta);
  },

  async detail(id: string, signal?: AbortSignal): Promise<Payment> {
    const data = await apiClient.get<{ payment: Payment }>(`/payments/${id}`, undefined, signal);
    return unwrap<Payment>(data, 'payment');
  },

  async voidPayment(id: string, reason: string): Promise<Payment> {
    const data = await apiClient.post<{ payment: Payment }>(`/payments/${id}/void`, { reason });
    return unwrap<Payment>(data, 'payment');
  },
};

export type { PayerRef };
