import { Router } from 'express';
import { validate } from '../middleware/validate';
import { reportDateQuerySchema, auditQuerySchema } from '../validators/report.validator';
import { sales, expenses, profitLoss, customers, items, offices, collections } from '../controllers/report.controller';
import { outstandingReport } from '../controllers/dashboard.controller';
import { auditLogs } from '../controllers/settings.controller';

const router = Router();

router.get('/sales', validate({ query: reportDateQuerySchema }), sales);
router.get('/expenses', validate({ query: reportDateQuerySchema }), expenses);
router.get('/profit-loss', validate({ query: reportDateQuerySchema }), profitLoss);
router.get('/collections', validate({ query: reportDateQuerySchema }), collections);
router.get('/items', validate({ query: reportDateQuerySchema }), items);
router.get('/customers', customers);
router.get('/offices', offices);
// The plan documents this as a report; the implementation predates it as a
// dashboard view. Both paths serve the same rows.
router.get('/outstanding', outstandingReport);
router.get('/audit-logs', validate({ query: auditQuerySchema }), auditLogs);

export default router;