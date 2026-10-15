import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { createBossSchema, updateBossSchema, bossIdParamSchema, listBossesQuerySchema } from '../validators/office.validator';
import { objectId } from '../validators/common';
import { create, list, update, deactivate, activate, summary } from '../controllers/boss.controller';

const khataIdParamSchema = z.object({ khataId: objectId });

const router = Router();

// NOTE: the documented `/api/offices/:khataId/bosses` spelling is served by
// routes/office.routes.ts, which mounts these same controller handlers.
router.get('/offices/:khataId/bosses', validate({ params: khataIdParamSchema, query: listBossesQuerySchema }), list);
router.post('/offices/:khataId/bosses', validate({ params: khataIdParamSchema, body: createBossSchema }), create);
// 2-segment path, so it cannot collide with the 1-segment `/:id` below.
router.get('/:id/summary', validate({ params: bossIdParamSchema }), summary);
router.get('/:id', validate({ params: bossIdParamSchema }), summary);
router.patch('/:id', validate({ params: bossIdParamSchema, body: updateBossSchema }), update);
router.patch('/:id/deactivate', validate({ params: bossIdParamSchema }), deactivate);
router.patch('/:id/activate', validate({ params: bossIdParamSchema }), activate);
// DELETE is the soft-delete verb the plan documents (PLAN §10); it deactivates
// rather than removing, so historical bills and staff stay intact.
router.delete('/:id', validate({ params: bossIdParamSchema }), deactivate);

export default router;