import { Router } from 'express';
import { validate } from '../middleware/validate';
import { createExpenseCategorySchema } from '../validators/expense.validator';
import { listCategoriesCtrl, createCategoryCtrl } from '../controllers/expense.controller';

/**
 * Expense CATEGORY routes, mounted at /api/expense-categories.
 *
 * These live in their own router rather than sharing one with expenses: the
 * same router mounted at both /expenses and /expense-categories made
 * `POST /api/expense-categories` resolve to the router's `/` handler, which
 * created an *expense* (and 422'd, since a category body has no amountPaisa).
 * Splitting makes each prefix serve only its own resource.
 */
const router = Router();

router.get('/', listCategoriesCtrl);
router.post('/', validate({ body: createExpenseCategorySchema }), createCategoryCtrl);

export default router;
