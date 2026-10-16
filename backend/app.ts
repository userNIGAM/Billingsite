import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from './config/env';
import { isOriginAllowed } from './config/origins';
import routes from './routes';
import { apiLimiter, writeLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  // Trust proxy is needed in production (Render/Railway/etc sit behind a
  // reverse proxy) so req.secure and rate-limit IP detection work correctly.
  if (env.isProduction) {
    app.set('trust proxy', 1);
  }

  // ---- Security headers ----
  // This service only ever returns JSON, so the Content-Security-Policy can be
  // locked to 'none' — there is no HTML, script or style to permit. The UI's
  // own (much richer) CSP is set by the Next.js app. `helmet()` supplies the
  // remaining defaults (HSTS, X-Content-Type-Options, etc.).
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
        },
      },
    })
  );

  // ---- CORS ----
  // credentials: true is required because the frontend sends the auth
  // cookie via `credentials: 'include'`. Origin is restricted to the
  // configured allowlist and local-network hosts so the app still works on a
  // LAN without requiring a browser-specific proxy.
  app.use(
    cors({
      origin: (origin, callback) => {
        // No Origin (curl, same-origin, server-to-server) is allowed through;
        // browsers always send one on credentialed cross-origin requests, so
        // this does not open a CSRF hole (the CSRF guard covers that).
        if (!origin || isOriginAllowed(origin)) {
          callback(null, true);
          return;
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
  // apiLimiter caps all API traffic per IP; writeLimiter adds a tighter cap on
  // mutations. Both skip themselves under NODE_ENV=test.
  app.use('/api', apiLimiter, writeLimiter, routes);

  // ---- 404 + error handling (must be last) ----
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
