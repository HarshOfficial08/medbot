import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { IntakeSessionEntity } from './intake.schema.js';
import { IntakeService } from './intake.service.js';
import type { IntakeFields, IntakeStatus, TranscriptTurn } from './intake.types.js';

interface StoredSession {
  _id: string;
  sessionId: string;
  departmentId?: string;
  fields: Record<string, unknown>;
  preference: Record<string, unknown>;
  status: IntakeStatus;
  transcript: TranscriptTurn[];
}

/**
 * A model fake that actually applies Mongo's update semantics (dotted
 * `$set` paths, `$push`, `$setOnInsert` + upsert) to an in-memory store.
 *
 * Deliberately not a bare `vi.fn()` returning canned documents: the
 * behaviour under test here is *merge*, and a stub that only records its
 * arguments would pass whether or not the service actually preserves
 * previously-collected answers. This way the invariant is proven end to
 * end, minus the network.
 */
class FakeIntakeModel {
  readonly store = new Map<string, StoredSession>();
  private nextId = 1;

  findOne = vi.fn((filter: { sessionId: string }) =>
    this.chain(() => this.store.get(filter.sessionId)),
  );

  findOneAndUpdate = vi.fn(
    (
      filter: { sessionId: string },
      update: Record<string, Record<string, unknown>>,
      options?: { upsert?: boolean },
    ) =>
      this.chain(() => {
        let doc = this.store.get(filter.sessionId);

        if (!doc) {
          if (!options?.upsert) return undefined;
          doc = {
            _id: `id-${this.nextId++}`,
            sessionId: filter.sessionId,
            // Schema defaults (setDefaultsOnInsert).
            fields: {},
            preference: {},
            status: 'collecting_information',
            transcript: [],
          };
          Object.assign(doc, update.$setOnInsert ?? {});
          this.store.set(filter.sessionId, doc);
        }

        for (const [path, value] of Object.entries(update.$set ?? {})) {
          this.setPath(doc, path, value);
        }
        for (const [path, value] of Object.entries(update.$push ?? {})) {
          const target = this.setPath(doc, path, undefined, true) as unknown[];
          target.push(value);
        }

        return doc;
      }),
  );

  /** Mirrors Mongo's dotted-path write. */
  private setPath(
    doc: StoredSession,
    path: string,
    value: unknown,
    readOnly = false,
  ): unknown {
    const segments = path.split('.');
    let cursor = doc as unknown as Record<string, unknown>;

    for (const segment of segments.slice(0, -1)) {
      cursor = cursor[segment] as Record<string, unknown>;
    }
    const last = segments[segments.length - 1]!;
    if (!readOnly) cursor[last] = value;
    return cursor[last];
  }

  private chain(read: () => StoredSession | undefined) {
    return {
      lean: () => ({
        // Structured clone so a test can never accidentally assert against
        // the same object the store holds.
        exec: async () => {
          const doc = read();
          return doc ? (JSON.parse(JSON.stringify(doc)) as StoredSession) : null;
        },
      }),
    };
  }
}

describe('IntakeService', () => {
  let service: IntakeService;
  let model: FakeIntakeModel;

  beforeEach(async () => {
    model = new FakeIntakeModel();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        IntakeService,
        { provide: getModelToken(IntakeSessionEntity.name), useValue: model },
      ],
    }).compile();

    service = moduleRef.get(IntakeService);
  });

  describe('createSession', () => {
    it('returns a plain contract, never a Mongoose document', async () => {
      const session = await service.createSession('S1');

      expect(session).toEqual(
        expect.objectContaining({
          id: 'id-1',
          sessionId: 'S1',
          fields: {},
          preference: {},
          status: 'collecting_information',
          transcript: [],
        }),
      );
      // CLAUDE.md architecture rule 4: nothing crosses a boundary as a document.
      expect(session).not.toHaveProperty('_id');
    });

    it('is idempotent: the same sessionId twice yields ONE session, not two', async () => {
      // A voice agent reconnecting mid-call must land back on the session
      // it already filled in, not strand it and start over.
      const first = await service.createSession('S1');
      const second = await service.createSession('S1');

      expect(model.store.size).toBe(1);
      expect(second.id).toBe(first.id);
    });

    it('preserves already-collected answers when called a second time', async () => {
      await service.createSession('S1');
      await service.updateFields('S1', { complaint: 'tooth pain' });

      const reopened = await service.createSession('S1');

      // $setOnInsert, not $set — re-creating must not blank the session.
      expect(reopened.fields).toEqual({ complaint: 'tooth pain' });
    });

    it('falls back to the winning session when two callers race the insert', async () => {
      await service.createSession('S1');
      model.findOneAndUpdate.mockImplementationOnce(() => {
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      });

      const session = await service.createSession('S1');

      expect(session.sessionId).toBe('S1');
      expect(model.store.size).toBe(1);
    });

    it('rethrows errors that are not duplicate-key races', async () => {
      model.findOneAndUpdate.mockImplementationOnce(() => {
        throw new Error('mongo unreachable');
      });

      await expect(service.createSession('S1')).rejects.toThrow('mongo unreachable');
    });
  });

  describe('updateFields', () => {
    it('MERGES: a later call naming one field preserves everything learned before', async () => {
      // The single most important behaviour in this module. The agent
      // learns facts one turn at a time; an update about `severity` must
      // not wipe the complaint the patient gave two turns ago.
      await service.createSession('S1');
      await service.updateFields('S1', { complaint: 'tooth pain', duration: '3 days' });

      const session = await service.updateFields('S1', { severity: 7 });

      expect(session.fields).toEqual({
        complaint: 'tooth pain',
        duration: '3 days',
        severity: 7,
      });
    });

    it('writes per-key paths rather than replacing the whole fields object', async () => {
      // This is *how* the merge is guaranteed — including when two tool
      // calls land concurrently.
      await service.createSession('S1');
      model.findOneAndUpdate.mockClear();

      await service.updateFields('S1', { severity: 7 });

      const [, update] = model.findOneAndUpdate.mock.calls[0]!;
      expect(update).toEqual({ $set: { 'fields.severity': 7 } });
    });

    it('overwrites a field the patient corrects', async () => {
      await service.createSession('S1');
      await service.updateFields('S1', { duration: '3 days' });

      const session = await service.updateFields('S1', { duration: '5 days' });

      expect(session.fields.duration).toBe('5 days');
    });

    it('leaves a field the caller never supplied ABSENT, not present-but-empty', async () => {
      await service.createSession('S1');

      const session = await service.updateFields('S1', { complaint: 'tooth pain' });

      // Never invent values (plan section 42): an unasked question has no
      // answer, not an empty one.
      expect(session.fields).not.toHaveProperty('severity');
      expect(Object.keys(session.fields)).toEqual(['complaint']);
    });

    it('does not store a key whose value was explicitly undefined', async () => {
      await service.createSession('S1');

      const session = await service.updateFields('S1', {
        complaint: 'tooth pain',
        severity: undefined as unknown as string,
      });

      expect(session.fields).not.toHaveProperty('severity');
    });

    it('accepts every value type the contract allows', async () => {
      await service.createSession('S1');

      const session = await service.updateFields('S1', {
        complaint: 'tooth pain',
        severity: 7,
        swelling: true,
        symptoms: ['throbbing', 'sensitivity to cold'],
      });

      expect(session.fields).toEqual({
        complaint: 'tooth pain',
        severity: 7,
        swelling: true,
        symptoms: ['throbbing', 'sensitivity to cold'],
      });
    });

    it('rejects a key that Mongo would interpret instead of storing', async () => {
      await service.createSession('S1');

      await expect(service.updateFields('S1', { 'a.b': 'x' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.updateFields('S1', { $set: 'x' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      // Built with JSON.parse because in an object literal `__proto__`
      // sets the prototype rather than becoming an own key — over HTTP it
      // arrives as a real key, which is the case worth guarding.
      const polluting = JSON.parse('{"__proto__": "x"}') as IntakeFields;
      await expect(service.updateFields('S1', polluting)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('is a no-op read when given nothing, rather than an empty write', async () => {
      await service.createSession('S1');
      await service.updateFields('S1', { complaint: 'tooth pain' });
      model.findOneAndUpdate.mockClear();

      const session = await service.updateFields('S1', {});

      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
      expect(session.fields).toEqual({ complaint: 'tooth pain' });
    });

    it('404s on a session that does not exist', async () => {
      await expect(service.updateFields('nope', { complaint: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setDepartment / setStatus', () => {
    it('routes a session to a department', async () => {
      await service.createSession('S1');

      const session = await service.setDepartment('S1', 'DENTAL');

      expect(session.departmentId).toBe('DENTAL');
    });

    it('advances status without touching collected fields', async () => {
      await service.createSession('S1');
      await service.updateFields('S1', { complaint: 'tooth pain' });

      const session = await service.setStatus('S1', 'awaiting_confirmation');

      expect(session.status).toBe('awaiting_confirmation');
      expect(session.fields).toEqual({ complaint: 'tooth pain' });
    });

    it('404s on an unknown session', async () => {
      await expect(service.setStatus('nope', 'booked')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setPreference', () => {
    it('MERGES preferences across turns', async () => {
      // "next Thursday" and "after 6" arrive in different sentences.
      await service.createSession('S1');
      await service.setPreference('S1', { preferredDate: '2026-10-02' });

      const session = await service.setPreference('S1', { earliestTime: '18:00' });

      expect(session.preference).toEqual({
        preferredDate: '2026-10-02',
        earliestTime: '18:00',
      });
    });

    it('leaves an unstated preference absent', async () => {
      await service.createSession('S1');

      const session = await service.setPreference('S1', { preferredTime: 'evening' });

      expect(session.preference).not.toHaveProperty('preferredDoctorId');
    });
  });

  describe('appendTranscript', () => {
    it('appends turns in order without rewriting earlier ones', async () => {
      await service.createSession('S1');
      await service.appendTranscript('S1', {
        speaker: 'patient',
        text: 'my tooth hurts',
        at: new Date('2026-09-21T10:00:00Z'),
      });

      const session = await service.appendTranscript('S1', {
        speaker: 'agent',
        text: 'how long has it been hurting?',
        at: new Date('2026-09-21T10:00:05Z'),
      });

      expect(session.transcript).toHaveLength(2);
      expect(session.transcript.map((turn) => turn.speaker)).toEqual(['patient', 'agent']);
      expect(session.transcript[0]!.text).toBe('my tooth hurts');
    });
  });

  describe('getCompleteness', () => {
    it('reports the DENTAL required fields that are still missing', async () => {
      await service.createSession('S1');
      await service.setDepartment('S1', 'DENTAL');
      await service.updateFields('S1', { complaint: 'tooth pain' });

      const completeness = await service.getCompleteness('S1');

      // DENTAL requires complaint/duration/location — the agent should ask
      // for the two it lacks, not re-ask the one it has.
      expect(completeness.missingRequiredFields).toEqual(['duration', 'location']);
      expect(completeness.requiredFields).toEqual(['complaint', 'duration', 'location']);
      expect(completeness.departmentConfigured).toBe(true);
      expect(completeness.complete).toBe(false);
    });

    it('reports OPHTHALMOLOGY affectedEye, which DENTAL does not require', async () => {
      await service.createSession('S2');
      await service.setDepartment('S2', 'OPHTHALMOLOGY');
      await service.updateFields('S2', { complaint: 'blurry vision', duration: '2 weeks' });

      const completeness = await service.getCompleteness('S2');

      expect(completeness.missingRequiredFields).toEqual(['affectedEye']);
      expect(completeness.complete).toBe(false);
    });

    it('is complete once every required field for the department is answered', async () => {
      await service.createSession('S3');
      await service.setDepartment('S3', 'CARDIOLOGY');
      await service.updateFields('S3', {
        reasonForVisit: 'chest tightness',
        duration: '1 week',
      });

      const completeness = await service.getCompleteness('S3');

      expect(completeness.missingRequiredFields).toEqual([]);
      expect(completeness.complete).toBe(true);
      expect(completeness.optionalFields).toContain('medications');
    });

    it('treats an empty-string answer as still missing', async () => {
      await service.createSession('S4');
      await service.setDepartment('S4', 'GENERAL_MEDICINE');
      await service.updateFields('S4', { complaint: '', duration: '2 days' });

      const completeness = await service.getCompleteness('S4');

      expect(completeness.missingRequiredFields).toEqual(['complaint']);
    });

    it('is NOT complete before a department is chosen', async () => {
      // missingRequiredFields() returns [] with no department, which on its
      // own reads as "done" for a session that has barely started.
      await service.createSession('S5');

      const completeness = await service.getCompleteness('S5');

      expect(completeness.departmentConfigured).toBe(false);
      expect(completeness.complete).toBe(false);
      expect(completeness.requiredFields).toEqual([]);
    });

    it('is NOT complete for a department with no DOMAIN_CONFIG entry', async () => {
      await service.createSession('S6');
      await service.setDepartment('S6', 'NEUROLOGY');

      const completeness = await service.getCompleteness('S6');

      expect(completeness.departmentId).toBe('NEUROLOGY');
      expect(completeness.departmentConfigured).toBe(false);
      expect(completeness.complete).toBe(false);
    });
  });

  describe('findBySessionId', () => {
    it('404s rather than returning null', async () => {
      await expect(service.findBySessionId('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('omits optional properties the session never had', async () => {
      await service.createSession('S1');

      const session = await service.findBySessionId('S1');

      expect(session).not.toHaveProperty('departmentId');
      expect(session).not.toHaveProperty('patientId');
      expect(session).not.toHaveProperty('intent');
    });
  });

  describe('PHI handling', () => {
    it('never writes field contents or transcript text to the log', async () => {
      // Plan section 54: this collection is PHI. Logs carry ids and counts.
      const written: string[] = [];
      const capture = (message: unknown) => {
        written.push(String(message));
      };
      const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(capture);
      const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(capture);

      await service.createSession('S1');
      await service.setDepartment('S1', 'DENTAL');
      await service.updateFields('S1', {
        complaint: 'abscess under a crown',
        severity: 9,
      });
      await service.appendTranscript('S1', {
        speaker: 'patient',
        text: 'the whole left side of my jaw is swollen',
        at: new Date(),
      });
      await service.setStatus('S1', 'validating');

      const allLogs = written.join('\n');
      expect(allLogs).not.toContain('abscess');
      expect(allLogs).not.toContain('swollen');
      expect(allLogs).not.toContain('complaint');
      // ...but the session must still be traceable.
      expect(allLogs).toContain('S1');

      log.mockRestore();
      debug.mockRestore();
    });
  });
});
