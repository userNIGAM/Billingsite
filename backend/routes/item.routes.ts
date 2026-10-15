import { Router } from 'express';
import { validate } from '../middleware/validate';
import { itemIdParamSchema, itemListQuerySchema, createItemSchema, updateItemSchema } from '../validators/item.validator';
import { create, list, detail, update, deactivate } from '../controllers/item.controller';

const router = Router();

router.get('/', validate({ query: itemListQuerySchema }), list);
router.post('/', validate({ body: createItemSchema }), create);
router.get('/:id', validate({ params: itemIdParamSchema }), detail);
router.patch('/:id', validate({ params: itemIdParamSchema, body: updateItemSchema }), update);
router.post('/:id/deactivate', validate({ params: itemIdParamSchema }), deactivate);
// Soft delete, preserving history (PLAN §10).
router.delete('/:id', validate({ params: itemIdParamSchema }), deactivate);

export default router;