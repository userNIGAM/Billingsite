import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentAdminInfo } from '../middleware/auth';
import { recordPayment, listPayments, getPayment, voidPayment } from '../services/payment.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const payment = await recordPayment(req.body, currentAdminInfo(req));
  sendSuccess(res, { payment }, 201);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await listPayments({
    khataId: req.query.khataId as string | undefined,
    bossId: req.query.bossId as string | undefined,
    staffId: req.query.staffId as string | undefined,
    method: req.query.method as string | undefined,
    isVoided: req.query.isVoided === undefined ? undefined : req.query.isVoided === 'true',
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    page: Number(req.query.page ?? 1),
    limit: Number(req.query.limit ?? 20),
  });
  sendSuccess(res, result.rows, 200, result.meta);
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const payment = await getPayment(req.params.id);
  sendSuccess(res, { payment });
});

export const voidPaymentTx = asyncHandler(async (req: Request, res: Response) => {
  const result = await voidPayment(req.params.id, req.body.reason, currentAdminInfo(req));
  sendSuccess(res, result);
});