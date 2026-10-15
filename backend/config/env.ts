import dotenv from 'dotenv';
import path from 'path';

// Load .env before anything else reads process.env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    // Fail fast and loud at boot rather than at first use.
    // This is intentional: a missing secret should never silently
    // fall back to a default in a system that stores financial data.
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 5000),
  timezone: process.env.TZ ?? 'Asia/Kathmandu',

  mongodbUri: required('MONGODB_URI'),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  adminSetupToken: process.env.ADMIN_SETUP_TOKEN ?? '',

  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  cookieName: process.env.COOKIE_NAME ?? 'canteen_token',
};
