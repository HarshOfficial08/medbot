import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

/** Who or what caused the event. */
export type AuditActor = 'patient' | 'agent' | 'system' | 'staff';

/**
 * Audit trail shape from plan section 41.
 *
 * NOTE (plan section 54): once real PHI is in scope, this collection
 * holds patient information. Do not pipe these rows into any
 * third-party logging/error-tracking service that has not signed a BAA.
 */
@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  // Not index:true — the { sessionId, createdAt } compound index below
  // already serves sessionId-prefixed lookups, and a second index would
  // just double the write cost on every audit insert.
  @Prop({ required: true })
  sessionId!: string;

  @Prop({ required: true, type: String })
  actor!: AuditActor;

  @Prop({ required: true, index: true })
  eventType!: string;

  @Prop()
  toolName?: string;

  @Prop({ type: Object })
  toolArguments?: Record<string, unknown>;

  @Prop({ type: Object })
  result?: Record<string, unknown>;

  @Prop()
  fieldChanged?: string;

  @Prop({ type: Object })
  previousValue?: unknown;

  @Prop({ type: Object })
  newValue?: unknown;

  // Managed by `timestamps: true`; declared so they are typed on reads.
  createdAt!: Date;
  updatedAt!: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Audit reads are almost always "this session, in order".
AuditLogSchema.index({ sessionId: 1, createdAt: 1 });
