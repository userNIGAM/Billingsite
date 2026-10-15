import { Router } from 'express';
import { validate } from '../middleware/validate';
import {
  consumptionIdParamSchema,
  consumptionListQuerySchema,
  createConsumptionSchema,
  voidConsumptionSchema,
  dailyQuerySchema,
} from '../validators/consumption.validator';
import { create, list, voidTx, daily } from '../controllers/consumption.controller';

const router = Router();

router.get('/', validate({ query: consumptionListQuerySchema }), list);
router.post('/', validate({ body: createConsumptionSchema }), create);
router.get('/daily', validate({ query: dailyQuerySchema }), daily);
// The plan documents POST; PATCH is what the tests exercise. Same handler.
router.patch('/:id/void', validate({ params: consumptionIdParamSchema, body: voidConsumptionSchema }), voidTx);
router.post('/:id/void', validate({ params: consumptionIdParamSchema, body: voidConsumptionSchema }), voidTx);

export default router;