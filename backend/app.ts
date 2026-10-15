import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from './config/env';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

function isPrivateNetworkHost(hostname: string): boolean {
  if (!hostname) return false;

  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized.endsWith('.localhost')) {
    return true;
  }

  if (normalized.startsWith('10.') || normalized.startsWith('192.168.') || normalized.startsWith('172.')) {
    const parts = normalized.split('.');
    if (parts.length === 4) {
      const second = Number(parts[1]);
      if (normalized.startsWith('172.')) {
        return second >= 16 && second <= 31;
      }
      return true;
    }
  }

  if (normalized.startsWith('::ffff:')) {
    return isPrivateNetworkHost(normalized.replace('::ffff:', ''));
  }

  return false;
}

export function createApp(): Express {
  const app = express();

  // Trust proxy is needed in production (Render/Railway/etc sit behind a
  // reverse proxy) so req.secure and rate-limit IP detection work correctly.
  if (env.isProduction) {
    app.set('trust proxy', 1);
  }

  // ---- Security headers ----
  app.use(helmet());

  // ---- CORS ----
  // credentials: true is required because the frontend sends the auth
  // cookie via `credentials: 'include'`. Origin is restricted to the
  // configured allowlist and local-network hosts so the app still works on a
  // LAN without requiring a browser-specific proxy.
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        try {
          const { hostname } = new URL(origin);
          if (isPrivateNetworkHost(hostname)) {
            callback(null, true);
            return;
          }
        } catch {
          // fall through to reject below
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    })
  );

  // ---- Body parsing ----
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // ---- Sanitization against Mongo operator injection ($gt, $where, etc) ----
  app.use(mongoSanitize());

  // ---- Request logging ----
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  // ---- Routes ----
  app.use('/api', routes);

  // ---- 404 + error handling (must be last) ----
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
