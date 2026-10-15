import { Router } from 'express';
import { validate } from '../middleware/validate';
import {
  expenseIdParamSchema,
  expenseListQuerySchema,
  createExpenseSchema,
  updateExpenseSchema,
} from '../validators/expense.validator';
import { create, list, update, remove } from '../controllers/expense.controller';

/**
 * Expense routes, mounted at /api/expenses. Expense CATEGORIES have their own
 * router (expenseCategory.routes.ts) mounted at /api/expense-categories.
 */
const router = Router();

router.get('/', validate({ query: expenseListQuerySchema }), list);
router.post('/', validate({ body: createExpenseSchema }), create);
router.patch('/:id', validate({ params: expenseIdParamSchema, body: updateExpenseSchema }), update);
router.delete('/:id', validate({ params: expenseIdParamSchema }), remove);

export default router;
