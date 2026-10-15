import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import {
  salesReport,
  expenseReport,
  profitLossReport,
  customersReport,
  itemsReport,
  officesReport,
  collectionsReport,
} from '../services/report.service';

export const sales = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesReport({
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    groupBy: (req.query.groupBy as 'day' | 'item' | 'office') ?? 'day',
  });
  sendSuccess(res, data);
});

export const expenses = asyncHandler(async (req: Request, res: Response) => {
  const data = await expenseReport({
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
  });
  sendSuccess(res, data);
});

export const profitLoss = asyncHandler(async (req: Request, res: Response) => {
  const data = await profitLossReport({
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
  });
  sendSuccess(res, data);
});

export const customers = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await customersReport();
  sendSuccess(res, { rows });
});

export const items = asyncHandler(async (req: Request, res: Response) => {
  const rows = await itemsReport({
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
  });
  sendSuccess(res, { rows });
});

export const offices = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await officesReport();
  sendSuccess(res, { rows });
});

export const collections = asyncHandler(async (req: Request, res: Response) => {
  const data = await collectionsReport({
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
  });
  sendSuccess(res, data);
});