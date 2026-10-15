import { Router } from 'express';
import { validate } from '../middleware/validate';
import {
  createKhataSchema,
  updateKhataSchema,
  statusChangeSchema,
  khataIdParamSchema,
  khataListQuerySchema,
  khataSummaryQuerySchema,
} from '../validators/khata.validator';
import {
  create,
  list,
  detail,
  update,
  changeStatus,
  archive,
  summary,
} from '../controllers/khata.controller';

const router = Router();

router.get('/', validate({ query: khataListQuerySchema }), list);
router.post('/', validate({ body: createKhataSchema }), create);
// Declared before `/:id` so the literal segment is never captured as an id.
router.get('/:id/summary', validate({ params: khataIdParamSchema, query: khataSummaryQuerySchema }), summary);
router.get('/:id', validate({ params: khataIdParamSchema }), detail);
router.patch('/:id', validate({ params: khataIdParamSchema, body: updateKhataSchema }), update);
router.patch('/:id/status', validate({ params: khataIdParamSchema, body: statusChangeSchema }), changeStatus);
router.post('/:id/archive', validate({ params: khataIdParamSchema }), archive);

export default router;