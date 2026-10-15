import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentAdminInfo } from '../middleware/auth';
import { createItem, listItems, getItem, updateItem, softDeleteItem } from '../services/item.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const item = await createItem(req.body, currentAdminInfo(req));
  sendSuccess(res, { item }, 201);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const result = await listItems({
    q: req.query.q as string | undefined,
    category: req.query.category as string | undefined,
    isActive: req.query.isActive as unknown as boolean | undefined,
    page,
    limit,
  });
  sendSuccess(res, result.rows, 200, result.meta);
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const item = await getItem(req.params.id);
  sendSuccess(res, { item });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const item = await updateItem(req.params.id, req.body, currentAdminInfo(req));
  sendSuccess(res, { item });
});

export const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const item = await softDeleteItem(req.params.id, currentAdminInfo(req));
  sendSuccess(res, { item });
});