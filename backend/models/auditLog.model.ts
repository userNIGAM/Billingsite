import mongoose, { Schema, InferSchemaType } from 'mongoose';

/**
 * Append-only audit trail for every financially meaningful action (§53).
 * Storing `before`/`after` as Mixed keeps us honest about what changed
 * without forcing a rigid schema over hundreds of possible entity shapes.
 */
const auditLogSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    adminNameSnapshot: { type: String, default: '' },
    action: { type: String, required: true }, // 'KHATA_CREATED', 'CONSUMPTION_ORDERED', ...
    entity: { type: String, required: true }, // 'Khata', 'Bill', 'ConsumptionTransaction', ...
    entityId: { type: Schema.Types.ObjectId, required: true },
    before: { type: Schema.Types.Mixed, default: undefined },
    after: { type: Schema.Types.Mixed, default: undefined },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ adminId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema> & { _id: mongoose.Types.ObjectId };
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);