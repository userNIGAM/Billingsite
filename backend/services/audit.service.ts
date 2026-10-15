import { AuditLog } from '../models/auditLog.model';
import { logger } from '../utils/logger';

export interface AuditEntry {
  adminId?: string | null;
  adminNameSnapshot?: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  userId?: string;
}

/**
 * Writes an audit row for a financially meaningful action (§53).
 * Auditing deliberately runs in a fire-and-forget fashion (with a catch) so
 * a logging failure can never roll back the primary financial write.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      adminId: entry.adminId ?? null,
      adminNameSnapshot: entry.adminNameSnapshot ?? '',
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      ip: entry.ip ?? '',
      userAgent: entry.userAgent ?? '',
    });
  } catch (err) {
    logger.warn(`Failed to write audit log for ${entry.entity}/${entry.action}`, {
      detail: err instanceof Error ? { message: err.message } : String(err),
    });
  }
}

export async function findAuditLogs(
  filter: { entity?: string; entityId?: string; adminId?: string },
  page: number,
  limit: number
): Promise<{ logs: unknown[]; total: number }> {
  const query: Record<string, unknown> = {};
  if (filter.entity) query.entity = filter.entity;
  if (filter.entityId) query.entityId = filter.entityId;
  if (filter.adminId) query.adminId = filter.adminId;

  const [logs, total] = await Promise.all([
    AuditLog.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(query),
  ]);
  return { logs, total };
}