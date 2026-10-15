import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentAdminInfo } from '../middleware/auth';
import { todayBusinessDate } from '../utils/date';
import { createStaff, updateStaff, transferStaff, setStaffStatus, listStaff, staffSummary } from '../services/office.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const staff = await createStaff(
    {
      ...req.body,
      startDate: req.body.startDate ?? todayBusinessDate(),
    },
    currentAdminInfo(req)
  );
  sendSuccess(res, { staff }, 201);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query.q as string | undefined;
  const khataId = req.query.khataId as string | undefined;
  const bossId = req.query.bossId as string | undefined;
  const status = req.query.status as string | undefined;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);

  const result = await listStaff({ q, khataId, bossId, status, page, limit });
  sendSuccess(res, { rows: result.rows }, 200, result.meta);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const staff = await updateStaff(req.params.id, req.body, currentAdminInfo(req));
  sendSuccess(res, { staff });
});

export const transfer = asyncHandler(async (req: Request, res: Response) => {
  const staff = await transferStaff(req.params.id, req.body.bossId, currentAdminInfo(req));
  sendSuccess(res, { staff });
});

export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const staff = await setStaffStatus(req.params.id, req.body.status, currentAdminInfo(req));
  sendSuccess(res, { staff });
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const result = await staffSummary(req.params.id);
  sendSuccess(res, result);
});