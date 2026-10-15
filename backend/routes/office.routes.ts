import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { createBossSchema, listBossesQuerySchema } from '../validators/office.validator';
import { objectId } from '../validators/common';
import { list, create } from '../controllers/boss.controller';

const khataIdParamSchema = z.object({ khataId: objectId });

/**
 * The documented office-scoped spelling (PLAN §10):
 *   GET/POST /api/offices/:khataId/bosses
 *
 * These mount the *same* controller actions as the equivalent
 * /api/bosses/offices/:khataId/bosses routes in boss.routes.ts, so the two
 * paths cannot drift in behaviour. `list` reads `req.params.khataId`, which
 * Express populates identically for either mount point.
 */
const router = Router();

router.get('/:khataId/bosses', validate({ params: khataIdParamSchema, query: listBossesQuerySchema }), list);
router.post('/:khataId/bosses', validate({ params: khataIdParamSchema, body: createBossSchema }), create);

export default router;
