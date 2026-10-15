// Jest `setupFiles` — runs before ANY test module is required, so the env
// vars that config/env.ts requires at import time exist before the app
// is pulled in. The real memory-server URI is injected in tests/setup.ts.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/canteen-khata-test';
process.env.ADMIN_SETUP_TOKEN = process.env.ADMIN_SETUP_TOKEN ?? 'test-setup-token';