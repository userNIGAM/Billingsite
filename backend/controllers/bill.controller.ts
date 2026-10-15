import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { currentAdminInfo } from '../middleware/auth';
import { generateBill, listBills, getBill, voidBill } from '../services/bill.service';

export const generate = asyncHandler(async (req: Request, res: Response) => {
  const bill = await generateBill(req.body, currentAdminInfo(req));
  sendSuccess(res, { bill }, 201);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await listBills({
    khataId: req.query.khataId as string | undefined,
    bossId: req.query.bossId as string | undefined,
    staffId: req.query.staffId as string | undefined,
    status: req.query.status as string | undefined,
    // billListQuerySchema already coerces isVoided to a real boolean. Comparing
    // it to the string 'true' again always failed, so the filter was dropped
    // and voided bills were mixed into every list.
    isVoided: req.query.isVoided as boolean | undefined,
    page: Number(req.query.page ?? 1),
    limit: Number(req.query.limit ?? 20),
  });
  sendSuccess(res, result.rows, 200, result.meta);
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const bill = await getBill(req.params.id, req.query.include === 'khata');
  sendSuccess(res, { bill });
});

export const print = asyncHandler(async (req: Request, res: Response) => {
  const bill = await getBill(req.params.id, true);
  sendSuccess(res, { bill });
});

export const voidBillTx = asyncHandler(async (req: Request, res: Response) => {
  const result = await voidBill(req.params.id, req.body.reason, currentAdminInfo(req));
  sendSuccess(res, result);
});