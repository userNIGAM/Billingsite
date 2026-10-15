import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { Admin } from '../models/admin.model';

export interface AuthPayload {
  sub: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: {
        _id: string;
        name: string;
        email: string;
        role: string;
      };
    }
  }
}

export interface CurrentAdmin {
  adminId: string;
  adminName: string;
  ip: string;
  userAgent: string;
}

function currentAdminInfo(req: Request): CurrentAdmin {
  return {
    adminId: req.admin?._id ?? '',
    adminName: req.admin?.name ?? '',
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '',
    userAgent: req.headers['user-agent'] ?? '',
  };
}

/**
 * Verifies the JWT cookie AND loads the admin from the DB, so a disabled or
 * deleted admin is rejected immediately rather than at token expiry (§64).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[env.cookieName] as string | undefined;
    if (!token) throw ApiError.unauthorized('Please log in to continue.');

    let payload: AuthPayload;
    try {
      payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    } catch {
      throw ApiError.unauthorized('Your session has expired. Please log in again.');
    }

    const admin = await Admin.findById(payload.sub).lean();
    if (!admin) throw ApiError.unauthorized('Account no longer exists. Please log in again.');
    if (!admin.isActive) throw ApiError.forbidden('This admin account is disabled.', 'ACCOUNT_DISABLED');

    req.admin = {
      _id: String(admin._id),
      name: admin.name,
      email: admin.email,
      role: admin.role,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(role: 'ADMIN') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.admin?.role !== role) {
      next(ApiError.forbidden('You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}

export { currentAdminInfo };