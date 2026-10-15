import { Router } from 'express';
import { validate } from '../middleware/validate';
import { loginSchema, setupSchema } from '../validators/auth.validator';
import { loginLimiter } from '../middleware/rateLimit';
import { login, logout, me, setupAdmin } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/setup', validate({ body: setupSchema }), setupAdmin);
router.post('/login', loginLimiter, validate({ body: loginSchema }), login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;