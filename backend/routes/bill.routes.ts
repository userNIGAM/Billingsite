import { Router } from 'express';
import { validate } from '../middleware/validate';
import { generateBillSchema, billIdParamSchema, billListQuerySchema, voidBillSchema } from '../validators/bill.validator';
import { generate, list, detail, print, voidBillTx } from '../controllers/bill.controller';

const router = Router();

router.get('/', validate({ query: billListQuerySchema }), list);
router.post('/generate', validate({ body: generateBillSchema }), generate);
router.get('/:id', validate({ params: billIdParamSchema }), detail);
router.get('/:id/print', validate({ params: billIdParamSchema }), print);
router.post('/:id/void', validate({ params: billIdParamSchema, body: voidBillSchema }), voidBillTx);

export default router;