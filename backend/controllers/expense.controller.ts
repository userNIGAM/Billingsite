import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentAdminInfo } from '../middleware/auth';
import {
  listCategories,
  createCategory,
  createExpense,
  listExpenses,
  updateExpense,
  deleteExpense,
} from '../services/expense.service';

export const listCategoriesCtrl = asyncHandler(async (req: Request, res: Response) => {
  const categories = await listCategories(req.query.includeInactive === 'true');
  sendSuccess(res, { categories });
});

export const createCategoryCtrl = asyncHandler(async (req: Request, res: Response) => {
  const category = await createCategory(req.body.name, currentAdminInfo(req));
  sendSuccess(res, { category }, 201);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const expense = await createExpense(req.body, currentAdminInfo(req));
  sendSuccess(res, { expense }, 201);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await listExpenses({
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    categoryId: req.query.categoryId as string | undefined,
    page: Number(req.query.page ?? 1),
    limit: Number(req.query.limit ?? 20),
  });
  // `data.rows`, not a bare array: the frontend apiClient unwraps `data`
  // uniformly, so every paginated list must expose its array under the same
  // key. Matches reports (`/reports/customers` → data.rows).
  sendSuccess(res, { rows: result.rows }, 200, result.meta);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const expense = await updateExpense(req.params.id, req.body, currentAdminInfo(req));
  sendSuccess(res, { expense });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await deleteExpense(req.params.id, currentAdminInfo(req));
  sendSuccess(res, result);
});