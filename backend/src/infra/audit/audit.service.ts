import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './audit.schema.js';
import { AuditEntry, RecordAuditEvent } from './audit.types.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
  ) {}

  /**
   * Record an auditable event.
   *
   * Deliberately never throws: an audit write failing must not take down
   * the action being audited (a patient shouldn't lose a booking because
   * logging hiccuped). Failures are logged loudly instead.
   */
  async record(event: RecordAuditEvent): Promise<void> {
    try {
      await this.auditModel.create(event);
    } catch (error) {
      this.logger.error(
        `Failed to write audit event ${event.eventType} for session ${event.sessionId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Trail for one session, oldest first.
   *
   * Bounded by default: this is the highest-volume collection in the
   * system and a long voice session can produce a lot of rows, so an
   * unbounded read is a latent memory problem.
   */
  async findBySession(sessionId: string, limit = 500): Promise<AuditEntry[]> {
    const docs = await this.auditModel
      .find({ sessionId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean()
      .exec();

    return docs.map((doc) => ({
      id: String(doc._id),
      sessionId: doc.sessionId,
      actor: doc.actor,
      eventType: doc.eventType,
      toolName: doc.toolName,
      toolArguments: doc.toolArguments,
      result: doc.result,
      fieldChanged: doc.fieldChanged,
      previousValue: doc.previousValue,
      newValue: doc.newValue,
      createdAt: doc.createdAt,
    }));
  }
}
