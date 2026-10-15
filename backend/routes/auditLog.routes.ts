import { Router } from 'express';
import { validate } from '../middleware/validate';
import { auditQuerySchema } from '../validators/report.validator';
import { auditLogs } from '../controllers/settings.controller';

/**
 * GET /api/audit-logs — the path documented in PLAN §10.
 *
 * The same controller is also reachable at /api/reports/audit-logs, which is
 * what the integration tests exercise. Both spellings share this one handler
 * so they cannot diverge.
 */
const router = Router();

router.get('/', validate({ query: auditQuerySchema }), auditLogs);

export default router;
