import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(120),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
});

export const setupSchema = z.object({
  setupToken: z.string().min(8, 'Setup token is required'),
  name: z.string().trim().min(2, 'Name is required').max(80),
  email: z.string().trim().email('Enter a valid email').max(120),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});