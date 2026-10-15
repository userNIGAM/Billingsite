import { apiClient } from '../apiClient';
import { paged, unwrap, type ListResult } from './base';
import type { Expense, ExpenseCategory, PaymentMethod } from '../../types/api';

// ---- Expenses ----

export interface CreateExpenseInput {
  categoryId: string;
  itemName: string;
  amountPaisa: number;
  quantity?: number;
  unit?: string;
  supplier?: string;
  businessDate: string;
  paymentMethod?: PaymentMethod;
  note?: string;
}

export const expenseService = {
  async listCategories(signal?: AbortSignal): Promise<ExpenseCategory[]> {
    const data = await apiClient.get<{ categories: ExpenseCategory[] }>(
      '/expense-categories',
      undefined,
      signal
    );
    return data.categories ?? [];
  },

  async createCategory(name: string): Promise<ExpenseCategory> {
    const data = await apiClient.post<{ category: ExpenseCategory }>('/expense-categories', { name });
    return unwrap<ExpenseCategory>(data, 'category');
  },

  async list(
    params: { from?: string; to?: string; categoryId?: string; page?: number; limit?: number },
    signal?: AbortSignal
  ): Promise<ListResult<Expense>> {
    const { data, meta } = await apiClient.getWithMeta<{ rows: Expense[] }>(
      '/expenses',
      { ...params },
      signal
    );
    return paged(data, meta);
  },

  async create(input: CreateExpenseInput): Promise<Expense> {
    const data = await apiClient.post<{ expense: Expense }>('/expenses', input);
    return unwrap<Expense>(data, 'expense');
  },

  async update(id: string, input: Partial<CreateExpenseInput>): Promise<Expense> {
    const data = await apiClient.patch<{ expense: Expense }>(`/expenses/${id}`, input);
    return unwrap<Expense>(data, 'expense');
  },

  async remove(id: string): Promise<unknown> {
    return apiClient.delete(`/expenses/${id}`);
  },
};
