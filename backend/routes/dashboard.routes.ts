import { Router } from 'express';
import { overview, outstanding } from '../controllers/dashboard.controller';

const router = Router();

router.get('/overview', overview);
// The plan documents a bare GET /api/dashboard; the implementation uses
// /overview. Same handler, so both spellings stay equivalent.
router.get('/', overview);
router.get('/outstanding', outstanding);

export default router;