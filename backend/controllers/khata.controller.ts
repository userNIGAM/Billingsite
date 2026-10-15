import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentAdminInfo } from '../middleware/auth';
import {
  createKhata,
  listKhatas,
  getKhataDetail,
  updateKhata,
  changeKhataStatus,
  archiveKhata,
  khataSummary,
} from '../services/khata.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  // createKhata already returns { khata, defaultBossId, duePaisa } — wrapping it
  // again produced data.khata.khata instead of data.khata.
  const result = await createKhata(req.body, currentAdminInfo(req));
  sendSuccess(res, result, 201);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query.q as string | undefined;
  const type = req.query.type as string | undefined;
  const status = req.query.status as string | undefined;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);

  const result = await listKhatas({ q, type, status, page, limit });
  sendSuccess(res, result.rows, 200, result.meta);
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const result = await getKhataDetail(req.params.id);
  sendSuccess(res, result);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const khata = await updateKhata(req.params.id, req.body, currentAdminInfo(req));
  sendSuccess(res, { khata });
});

export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const khata = await changeKhataStatus(req.params.id, req.body.status, currentAdminInfo(req));
  sendSuccess(res, { khata });
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  const khata = await archiveKhata(req.params.id, currentAdminInfo(req));
  sendSuccess(res, { khata });
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const result = await khataSummary(req.params.id, req.query.from as string | undefined, req.query.to as string | undefined);
  sendSuccess(res, result);
});