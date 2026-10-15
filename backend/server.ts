import { env } from './config/env';
import { connectDB, disconnectDB } from './config/db';
import { createApp } from './app';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  await connectDB();

  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info(`Canteen Khata API listening on port ${env.port} [${env.nodeEnv}]`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      logger.info('Shutdown complete');
      process.exit(0);
    });
    // Force-exit if graceful shutdown hangs
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err);
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});
