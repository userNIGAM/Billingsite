import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentAdminInfo } from '../middleware/auth';
import {
  recordConsumption,
  voidConsumption,
  listConsumptions,
  getDailyConsumption,
} from '../services/consumption.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await recordConsumption(req.body, currentAdminInfo(req));
  sendSuccess(res, { transaction: result }, 201);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await listConsumptions({
    date: req.query.date as string | undefined,
    khataId: req.query.khataId as string | undefined,
    bossId: req.query.bossId as string | undefined,
    consumerId: req.query.consumerId as string | undefined,
    itemId: req.query.itemId as string | undefined,
    page: Number(req.query.page ?? 1),
    limit: Number(req.query.limit ?? 20),
  });
  sendSuccess(res, result.rows, 200, result.meta);
});

export const voidTx = asyncHandler(async (req: Request, res: Response) => {
  const result = await voidConsumption(req.params.id, req.body.reason, currentAdminInfo(req));
  sendSuccess(res, result);
});

export const daily = asyncHandler(async (req: Request, res: Response) => {
  const rows = await getDailyConsumption({
    date: req.query.date as string | undefined,
    khataId: req.query.khataId as string | undefined,
    bossId: req.query.bossId as string | undefined,
  });
  sendSuccess(res, { rows });
});