import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { searchCustomers } from '../services/customer.service';

export const search = asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string | undefined) ?? '';
  // customerSearchQuerySchema already coerces includeOffline to a boolean.
  // Comparing it to the string 'true' made it permanently false, so offline
  // and inactive consumers could never be found through the API.
  const includeOffline = Boolean(req.query.includeOffline);
  const results = await searchCustomers(q, includeOffline);
  sendSuccess(res, { customers: results });
});