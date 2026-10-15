/**
 * Minimal structured logger. Kept dependency-free on purpose for Phase 1 —
 * swap for pino/winston later without touching call sites if the project
 * outgrows this.
 */
type LogMeta = Record<string, unknown> | undefined;

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info(message: string, meta?: LogMeta): void {
    // eslint-disable-next-line no-console
    console.log(`[${timestamp()}] INFO  ${message}`, meta ?? '');
  },
  warn(message: string, meta?: LogMeta): void {
    // eslint-disable-next-line no-console
    console.warn(`[${timestamp()}] WARN  ${message}`, meta ?? '');
  },
  error(message: string, err?: unknown): void {
    // eslint-disable-next-line no-console
    console.error(`[${timestamp()}] ERROR ${message}`, err ?? '');
  },
};
