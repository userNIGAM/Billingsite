import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Admin } from '../models/admin.model';
import { ApiError } from '../utils/ApiError';
import { writeAuditLog } from './audit.service';

export interface LoginResult {
  admin: { _id: string; name: string; email: string; role: string };
  token: string;
}

function signToken(sub: string): string {
  return jwt.sign({ sub, role: 'ADMIN' }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export async function setupFirstAdmin(input: {
  setupToken: string;
  name: string;
  email: string;
  password: string;
}): Promise<LoginResult | null> {
  const existing = await Admin.countDocuments();
  if (existing > 0) {
    throw ApiError.conflict('SETUP_COMPLETE', 'An admin account already exists. Use /api/auth/login instead.');
  }
  if (!env.adminSetupToken || env.adminSetupToken.trim() === '') {
    throw ApiError.forbidden('Admin setup token is not configured.', 'SETUP_NOT_CONFIGURED');
  }
  if (input.setupToken !== env.adminSetupToken) {
    throw ApiError.forbidden('Setup token is invalid.', 'INVALID_SETUP_TOKEN');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const admin = await Admin.create({
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash,
    role: 'ADMIN',
    isActive: true,
  });

  await writeAuditLog({
    action: 'ADMIN_CREATED',
    entity: 'Admin',
    entityId: String(admin._id),
    after: { name: admin.name, email: admin.email },
  });

  return { admin: { _id: String(admin._id), name: admin.name, email: admin.email, role: admin.role }, token: signToken(String(admin._id)) };
}

export async function loginAdmin(email: string, password: string): Promise<LoginResult> {
  const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
  if (!admin) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  if (!admin.isActive) {
    throw ApiError.forbidden('This admin account is disabled.', 'ACCOUNT_DISABLED');
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  return {
    admin: { _id: String(admin._id), name: admin.name, email: admin.email, role: admin.role },
    token: signToken(String(admin._id)),
  };
}

export async function getMe(adminId: string) {
  const admin = await Admin.findById(adminId).lean();
  if (!admin) throw ApiError.unauthorized('Account not found.');
  return { _id: String(admin._id), name: admin.name, email: admin.email, role: admin.role };
}

export { signToken };