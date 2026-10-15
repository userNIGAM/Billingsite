import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { getProfile, updateProfile } from '../controllers/settings.controller';

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  billingNote: z.string().trim().max(300).optional(),
});

const router = Router();

router.get('/profile', getProfile);
router.patch('/profile', validate({ body: updateProfileSchema }), updateProfile);

export default router;