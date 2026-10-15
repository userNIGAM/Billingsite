import { Router } from 'express';
import { validate } from '../middleware/validate';
import { createPaymentSchema, paymentIdParamSchema, paymentListQuerySchema, voidPaymentSchema } from '../validators/payment.validator';
import { create, list, detail, voidPaymentTx } from '../controllers/payment.controller';

const router = Router();

router.get('/', validate({ query: paymentListQuerySchema }), list);
router.post('/', validate({ body: createPaymentSchema }), create);
router.get('/:id', validate({ params: paymentIdParamSchema }), detail);
router.post('/:id/void', validate({ params: paymentIdParamSchema, body: voidPaymentSchema }), voidPaymentTx);

export default router;