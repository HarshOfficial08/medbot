import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { IntakeSessionEntity, IntakeSessionDocument } from './intake.schema.js';
import { DOMAIN_CONFIG, missingRequiredFields } from './intake.types.js';
import type {
  AppointmentPreference,
  IntakeCompleteness,
  IntakeFields,
  IntakeSession,
  IntakeStatus,
  TranscriptTurn,
} from './intake.types.js';

/**
 * Shape of a `.lean()` read. Declared locally because the service's whole
 * job at its boundary is to stop being Mongoose-shaped: everything
 * leaving this class is a plain contract (CLAUDE.md, architecture rule 4).
 */
interface LeanIntakeSession {
  _id: unknown;
  sessionId: string;
  patientId?: string;
  intent?: string;
  departmentId?: string;
  fields?: IntakeFields;
  preference?: AppointmentPreference;
  status: IntakeStatus;
  transcript?: TranscriptTurn[];
}

/** Mongo's duplicate-key error code. */
const DUPLICATE_KEY = 11000;

/**
 * Keys that would be interpreted by Mongo rather than stored: a dot makes
 * a `$set` path traverse into a sub-document, a leading `$` is an
 * operator, and the prototype names are the usual pollution vectors.
 */
const UNSAFE_KEY = /^\$|\.|^(?:__proto__|constructor|prototype)$/;

/**
 * Owns the structured state the voice agent builds up while talking to a
 * patient.
 *
 * PHI note (plan section 54): every value in `fields` and `transcript` is
 * the patient's own words about their symptoms. Nothing in this service
 * logs field contents or transcript text — ids and counts only.
 */
@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);

  constructor(
    @InjectModel(IntakeSessionEntity.name)
    private readonly intakeModel: Model<IntakeSessionDocument>,
  ) {}

  /**
   * Start (or re-attach to) a session.
   *
   * Idempotent on purpose: a voice agent reconnecting mid-call, or
   * retrying a dropped tool call, must land back on the *same* session
   * rather than creating a second one and stranding everything collected
   * so far. `$setOnInsert` + `upsert` makes that a single atomic write;
   * the duplicate-key catch covers two callers racing the same insert.
   */
  async createSession(sessionId: string): Promise<IntakeSession> {
    try {
      const doc = await this.intakeModel
        .findOneAndUpdate(
          { sessionId },
          { $setOnInsert: { sessionId } },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
        )
        .lean()
        .exec();

      return this.toContract(doc as LeanIntakeSession | null, sessionId);
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        // Another caller won the insert race — theirs is the session.
        this.logger.debug(`Intake session ${sessionId} already existed; reusing it`);
        return await this.findBySessionId(sessionId);
      }
      throw error;
    }
  }

  async findBySessionId(sessionId: string): Promise<IntakeSession> {
    const doc = await this.intakeModel.findOne({ sessionId }).lean().exec();

    return this.toContract(doc as LeanIntakeSession | null, sessionId);
  }

  /**
   * Merge newly-learned answers into the session — never replace them.
   *
   * This is the single most important behaviour in the module. The agent
   * learns facts one at a time ("it's been three days", then later "the
   * left side"), so an update mentioning only `severity` must leave
   * `complaint` exactly as it was. Writing per-key `fields.<name>` paths
   * rather than `fields` wholesale is what guarantees that, atomically,
   * even if two tool calls land at once.
   *
   * A key the caller did not supply is simply not written, so it stays
   * absent rather than becoming present-but-empty — the agent must never
   * be able to read back a value the patient never gave (plan section 42).
   */
  async updateFields(sessionId: string, fields: IntakeFields): Promise<IntakeSession> {
    const set: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(fields)) {
      // Nothing is invented here: an explicitly-undefined value is a
      // value the patient did not give, so it is not stored at all.
      if (value === undefined) continue;
      this.assertSafeKey(key, 'fields');
      set[`fields.${key}`] = value;
    }

    if (Object.keys(set).length === 0) {
      return await this.findBySessionId(sessionId);
    }

    // Count, not contents — these values are PHI.
    this.logger.log(
      `Merging ${Object.keys(set).length} intake field(s) into session ${sessionId}`,
    );

    return await this.applyUpdate(sessionId, { $set: set });
  }

  async setDepartment(sessionId: string, departmentId: string): Promise<IntakeSession> {
    this.logger.log(`Session ${sessionId} routed to department ${departmentId}`);

    return await this.applyUpdate(sessionId, { $set: { departmentId } });
  }

  /**
   * Merge scheduling preferences, for the same reason `updateFields`
   * merges: "next Tuesday" and "after 6pm" arrive in different turns.
   */
  async setPreference(
    sessionId: string,
    preference: AppointmentPreference,
  ): Promise<IntakeSession> {
    const set: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(preference)) {
      if (value === undefined) continue;
      this.assertSafeKey(key, 'preference');
      set[`preference.${key}`] = value;
    }

    if (Object.keys(set).length === 0) {
      return await this.findBySessionId(sessionId);
    }

    return await this.applyUpdate(sessionId, { $set: set });
  }

  /** Append one conversation turn. Never logs the turn's text. */
  async appendTranscript(sessionId: string, turn: TranscriptTurn): Promise<IntakeSession> {
    return await this.applyUpdate(sessionId, { $push: { transcript: turn } });
  }

  async setStatus(sessionId: string, status: IntakeStatus): Promise<IntakeSession> {
    this.logger.log(`Session ${sessionId} status -> ${status}`);

    return await this.applyUpdate(sessionId, { $set: { status } });
  }

  /**
   * What is still missing before this session can be acted on.
   *
   * This is what lets the agent ask the next *useful* question instead of
   * reading a fixed questionnaire: it answers "what don't I know yet for
   * this department", derived from DOMAIN_CONFIG rather than from prompt
   * text.
   */
  async getCompleteness(sessionId: string): Promise<IntakeCompleteness> {
    const session = await this.findBySessionId(sessionId);
    const config = session.departmentId ? DOMAIN_CONFIG[session.departmentId] : undefined;
    const missing = missingRequiredFields(session.departmentId, session.fields);

    const completeness: IntakeCompleteness = {
      sessionId: session.sessionId,
      departmentConfigured: config !== undefined,
      requiredFields: config?.requiredFields ?? [],
      optionalFields: config?.optionalFields ?? [],
      missingRequiredFields: missing,
      // Deliberately not just `missing.length === 0`: with no department
      // (or no config for it) there is nothing to check, and an empty
      // list there means "unknown", not "done".
      complete: config !== undefined && missing.length === 0,
    };

    if (session.departmentId !== undefined) {
      completeness.departmentId = session.departmentId;
    }

    return completeness;
  }

  /** Run an update against an existing session, or 404. */
  private async applyUpdate(
    sessionId: string,
    update: UpdateQuery<IntakeSessionDocument>,
  ): Promise<IntakeSession> {
    const doc = await this.intakeModel
      .findOneAndUpdate({ sessionId }, update, { returnDocument: 'after' })
      .lean()
      .exec();

    return this.toContract(doc as LeanIntakeSession | null, sessionId);
  }

  private assertSafeKey(key: string, container: string): void {
    if (key.length === 0 || UNSAFE_KEY.test(key)) {
      // The key is a structural name, not patient content, so it is safe
      // to echo back.
      throw new BadRequestException(`Invalid ${container} key: ${key}`);
    }
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === DUPLICATE_KEY
    );
  }

  /**
   * Mongoose document -> plain contract. Optional properties are only set
   * when the stored session actually has them, so a value the patient
   * never gave stays absent rather than surfacing as `undefined`.
   */
  private toContract(doc: LeanIntakeSession | null, sessionId: string): IntakeSession {
    if (!doc) {
      throw new NotFoundException(`Intake session ${sessionId} not found`);
    }

    const session: IntakeSession = {
      id: String(doc._id),
      sessionId: doc.sessionId,
      fields: doc.fields ?? {},
      preference: doc.preference ?? {},
      status: doc.status,
      transcript: doc.transcript ?? [],
    };

    if (doc.patientId !== undefined) session.patientId = doc.patientId;
    if (doc.intent !== undefined) session.intent = doc.intent;
    if (doc.departmentId !== undefined) session.departmentId = doc.departmentId;

    return session;
  }
}
