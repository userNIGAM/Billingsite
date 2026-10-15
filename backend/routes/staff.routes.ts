import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import {
  staffIdParamSchema,
  staffListQuerySchema,
  createStaffSchema,
  updateStaffSchema,
  transferStaffSchema,
} from '../validators/staff.validator';
import { create, list, update, transfer, changeStatus, summary } from '../controllers/staff.controller';

const staffStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

const router = Router();

router.get('/', validate({ query: staffListQuerySchema }), list);
router.post('/', validate({ body: createStaffSchema }), create);
router.get('/:id/summary', validate({ params: staffIdParamSchema }), summary);
router.patch('/:id', validate({ params: staffIdParamSchema, body: updateStaffSchema }), update);
// The plan documents PATCH; POST is what the tests exercise. Both mount the
// same handler so the two verbs cannot diverge.
router.patch('/:id/transfer', validate({ params: staffIdParamSchema, body: transferStaffSchema }), transfer);
router.post('/:id/transfer', validate({ params: staffIdParamSchema, body: transferStaffSchema }), transfer);
router.patch('/:id/status', validate({ params: staffIdParamSchema, body: staffStatusSchema }), changeStatus);

export default router;