import { Request, Response } from 'express';
import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/response';
import { loginAdmin, setupFirstAdmin, getMe } from '../services/auth.service';
import { currentAdminInfo } from '../middleware/auth';

function setAuthCookie(res: Response, token: string): void {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, aligned with JWT_EXPIRES_IN default
  });
}

export const setupAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { setupToken, name, email, password } = req.body;
  const result = await setupFirstAdmin({ setupToken, name, email, password });
  if (!result) {
    sendSuccess(res, { message: 'Setup not required.' });
    return;
  }
  setAuthCookie(res, result.token);
  sendSuccess(res, { admin: result.admin }, 201);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await loginAdmin(email, password);
  setAuthCookie(res, result.token);
  sendSuccess(res, { admin: result.admin });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(env.cookieName, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    path: '/',
  });
  sendSuccess(res, { message: 'Logged out' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const admin = await getMe(currentAdminInfo(req).adminId);
  sendSuccess(res, { admin });
});