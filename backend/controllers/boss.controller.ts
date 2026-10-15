import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentAdminInfo } from '../middleware/auth';
import { todayBusinessDate } from '../utils/date';
import { ApiError } from '../utils/ApiError';
import {
  createBoss,
  updateBoss,
  deactivateBoss,
  listBosses,
  bossSummary,
} from '../services/office.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const khataId = (req.body.khataId as string | undefined) ?? req.params.khataId;
  if (!khataId) {
    throw ApiError.validation('khataId is required.');
  }
  const boss = await createBoss(
    {
      ...req.body,
      khataId,
      startDate: req.body.startDate ?? todayBusinessDate(),
    },
    currentAdminInfo(req)
  );
  sendSuccess(res, { boss }, 201);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const khataId = req.params.khataId as string | undefined;
  const status = req.query.status as string | undefined;
  const bosses = await listBosses({ khataId, status });
  sendSuccess(res, { bosses });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const boss = await updateBoss(req.params.id, req.body, currentAdminInfo(req));
  sendSuccess(res, { boss });
});

export const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const boss = await deactivateBoss(req.params.id, currentAdminInfo(req), false);
  sendSuccess(res, { boss });
});

export const activate = asyncHandler(async (req: Request, res: Response) => {
  const boss = await deactivateBoss(req.params.id, currentAdminInfo(req), true);
  sendSuccess(res, { boss });
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const result = await bossSummary(req.params.id);
  sendSuccess(res, result);
});