import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { getCanteenProfile, updateCanteenProfile } from '../services/settings.service';
import { findAuditLogs } from '../services/audit.service';
import { buildPageMeta } from '../utils/pagination';

export const getProfile = asyncHandler(async (_req: Request, res: Response) => {
  const profile = await getCanteenProfile();
  sendSuccess(res, { profile });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await updateCanteenProfile(req.body);
  sendSuccess(res, { profile });
});

export const auditLogs = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const { logs, total } = await findAuditLogs(
    {
      entity: req.query.entity as string | undefined,
      entityId: req.query.entityId as string | undefined,
      adminId: req.query.adminId as string | undefined,
    },
    page,
    limit
  );
  sendSuccess(res, logs, 200, buildPageMeta(total, page, limit));
});