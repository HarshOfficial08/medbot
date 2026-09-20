import { AuditActor } from './audit.schema.js';

/**
 * What callers pass in. Deliberately a plain contract, not a Mongoose
 * document — per CLAUDE.md, nothing crosses a module boundary as a
 * document.
 */
export interface RecordAuditEvent {
  sessionId: string;
  actor: AuditActor;
  eventType: string;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  result?: Record<string, unknown>;
  fieldChanged?: string;
  previousValue?: unknown;
  newValue?: unknown;
}

/** What callers get back. */
export interface AuditEntry extends RecordAuditEvent {
  id: string;
  createdAt: Date;
}
