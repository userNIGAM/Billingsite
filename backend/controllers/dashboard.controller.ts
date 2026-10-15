import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { dashboardSummary, outstandingRows } from '../services/dashboard.service';

export const overview = asyncHandler(async (_req: Request, res: Response) => {
  const data = await dashboardSummary();
  sendSuccess(res, data);
});

export const outstanding = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await outstandingRows();
  sendSuccess(res, { rows });
});

// Alias of `outstanding` for the documented GET /api/reports/outstanding path.
// Same handler, same body shape — not a second implementation to drift.
export const outstandingReport = outstanding;