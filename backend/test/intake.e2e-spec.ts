import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { MongoTestHarness } from './support/mongo-test-harness.js';

describe('Intake (e2e)', () => {
  const mongo = new MongoTestHarness();
  let app: INestApplication;

  /** Each test gets its own session so the suite has no ordering coupling. */
  let counter = 0;
  const newSessionId = () => `SESSION-E2E-${Date.now()}-${counter++}`;

  const createSession = async (sessionId: string) => {
    await request(app.getHttpServer()).post('/intake').send({ sessionId }).expect(200);
    return sessionId;
  };

  beforeAll(async () => {
    await mongo.start();

    // Imported dynamically, *after* the harness has set MONGODB_URI:
    // AppModule runs ConfigModule's env validation at module-definition
    // time, so a static import would validate before the harness could
    // point it at the in-memory server and the suite would not boot.
    const { AppModule } = await import('../src/app.module.js');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // The same configuration production runs, so the global ValidationPipe
    // guarantees are exercised here rather than bypassed.
    const { configureApp } = await import('../src/bootstrap.js');
    configureApp(app);
    await app.init();
  }, 60_000);

  afterAll(async () => {
    // finally: if app.close() rejects, mongod must still be stopped or it
    // is orphaned and process.env stays mutated for later suites.
    try {
      await app?.close();
    } finally {
      await mongo.stop();
    }
  });

  describe('POST /intake', () => {
    it('opens a session and returns a plain contract', async () => {
      const sessionId = newSessionId();

      const response = await request(app.getHttpServer())
        .post('/intake')
        .send({ sessionId })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          sessionId,
          fields: {},
          preference: {},
          status: 'collecting_information',
          transcript: [],
        }),
      );
      expect(response.body.id).toBeTruthy();
      expect(response.body).not.toHaveProperty('_id');
    });

    it('is idempotent across requests', async () => {
      const sessionId = newSessionId();

      const first = await request(app.getHttpServer()).post('/intake').send({ sessionId });
      await request(app.getHttpServer())
        .patch(`/intake/${sessionId}`)
        .send({ fields: { complaint: 'tooth pain' } })
        .expect(200);
      const second = await request(app.getHttpServer()).post('/intake').send({ sessionId });

      expect(second.body.id).toBe(first.body.id);
      // Re-opening must not blank what the patient already told the agent.
      expect(second.body.fields).toEqual({ complaint: 'tooth pain' });
    });

    it('rejects an unexpected body field (global whitelist)', async () => {
      await request(app.getHttpServer())
        .post('/intake')
        .send({ sessionId: newSessionId(), diagnosis: 'pulpitis' })
        .expect(400);
    });

    it('rejects a malformed sessionId', async () => {
      await request(app.getHttpServer())
        .post('/intake')
        .send({ sessionId: 'not a valid id!' })
        .expect(400);
    });
  });

  describe('GET /intake/:sessionId', () => {
    it('reads a session back', async () => {
      const sessionId = await createSession(newSessionId());

      const response = await request(app.getHttpServer())
        .get(`/intake/${sessionId}`)
        .expect(200);

      expect(response.body.sessionId).toBe(sessionId);
      // Nothing is invented: unset optional properties are absent.
      expect(response.body).not.toHaveProperty('departmentId');
    });

    it('404s for a session that was never opened', async () => {
      await request(app.getHttpServer()).get('/intake/SESSION-NEVER-OPENED').expect(404);
    });
  });

  describe('PATCH /intake/:sessionId', () => {
    it('MERGES fields across requests instead of replacing them', async () => {
      const sessionId = await createSession(newSessionId());

      await request(app.getHttpServer())
        .patch(`/intake/${sessionId}`)
        .send({ departmentId: 'DENTAL', fields: { complaint: 'tooth pain', duration: '3 days' } })
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch(`/intake/${sessionId}`)
        .send({ fields: { severity: 7 } })
        .expect(200);

      expect(response.body.fields).toEqual({
        complaint: 'tooth pain',
        duration: '3 days',
        severity: 7,
      });
      expect(response.body.departmentId).toBe('DENTAL');
    });

    it('merges preferences and advances status', async () => {
      const sessionId = await createSession(newSessionId());

      await request(app.getHttpServer())
        .patch(`/intake/${sessionId}`)
        .send({ preference: { preferredDate: '2026-10-02' } })
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch(`/intake/${sessionId}`)
        .send({ preference: { earliestTime: '18:00' }, status: 'awaiting_confirmation' })
        .expect(200);

      expect(response.body.preference).toEqual({
        preferredDate: '2026-10-02',
        earliestTime: '18:00',
      });
      expect(response.body.status).toBe('awaiting_confirmation');
    });

    it('rejects an unknown key inside the nested preference object', async () => {
      const sessionId = await createSession(newSessionId());

      await request(app.getHttpServer())
        .patch(`/intake/${sessionId}`)
        .send({ preference: { preferredPlanet: 'mars' } })
        .expect(400);
    });

    it('rejects a field value that is not a supported intake type', async () => {
      const sessionId = await createSession(newSessionId());

      await request(app.getHttpServer())
        .patch(`/intake/${sessionId}`)
        .send({ fields: { history: { nested: 'object' } } })
        .expect(400);
    });

    it('rejects a status outside the state machine', async () => {
      const sessionId = await createSession(newSessionId());

      await request(app.getHttpServer())
        .patch(`/intake/${sessionId}`)
        .send({ status: 'diagnosed' })
        .expect(400);
    });

    it('rejects an empty body rather than silently doing nothing', async () => {
      const sessionId = await createSession(newSessionId());

      await request(app.getHttpServer()).patch(`/intake/${sessionId}`).send({}).expect(400);
    });

    it('404s on a session that does not exist', async () => {
      await request(app.getHttpServer())
        .patch('/intake/SESSION-NEVER-OPENED')
        .send({ fields: { complaint: 'x' } })
        .expect(404);
    });
  });

  describe('POST /intake/:sessionId/transcript', () => {
    it('appends turns in order', async () => {
      const sessionId = await createSession(newSessionId());

      await request(app.getHttpServer())
        .post(`/intake/${sessionId}/transcript`)
        .send({ speaker: 'patient', text: 'my tooth hurts' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`/intake/${sessionId}/transcript`)
        .send({ speaker: 'agent', text: 'how long has it been hurting?' })
        .expect(200);

      expect(response.body.transcript).toHaveLength(2);
      expect(response.body.transcript[0].speaker).toBe('patient');
      // Stamped server-side when the caller gives no time.
      expect(response.body.transcript[0].at).toBeTruthy();
    });

    it('rejects an unknown speaker', async () => {
      const sessionId = await createSession(newSessionId());

      await request(app.getHttpServer())
        .post(`/intake/${sessionId}/transcript`)
        .send({ speaker: 'doctor', text: 'hello' })
        .expect(400);
    });
  });

  describe('GET /intake/:sessionId/completeness', () => {
    it('reports what is still missing for DENTAL', async () => {
      const sessionId = await createSession(newSessionId());
      await request(app.getHttpServer())
        .patch(`/intake/${sessionId}`)
        .send({ departmentId: 'DENTAL', fields: { complaint: 'tooth pain' } })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/intake/${sessionId}/completeness`)
        .expect(200);

      expect(response.body.missingRequiredFields).toEqual(['duration', 'location']);
      expect(response.body.complete).toBe(false);
    });

    it('requires affectedEye for OPHTHALMOLOGY, and reports complete once given', async () => {
      const sessionId = await createSession(newSessionId());
      await request(app.getHttpServer())
        .patch(`/intake/${sessionId}`)
        .send({
          departmentId: 'OPHTHALMOLOGY',
          fields: { complaint: 'blurry vision', duration: '2 weeks' },
        })
        .expect(200);

      const before = await request(app.getHttpServer())
        .get(`/intake/${sessionId}/completeness`)
        .expect(200);
      expect(before.body.missingRequiredFields).toEqual(['affectedEye']);

      await request(app.getHttpServer())
        .patch(`/intake/${sessionId}`)
        .send({ fields: { affectedEye: 'left' } })
        .expect(200);

      const after = await request(app.getHttpServer())
        .get(`/intake/${sessionId}/completeness`)
        .expect(200);
      expect(after.body.missingRequiredFields).toEqual([]);
      expect(after.body.complete).toBe(true);
    });

    it('is not complete before a department has been chosen', async () => {
      const sessionId = await createSession(newSessionId());

      const response = await request(app.getHttpServer())
        .get(`/intake/${sessionId}/completeness`)
        .expect(200);

      expect(response.body.departmentConfigured).toBe(false);
      expect(response.body.complete).toBe(false);
    });
  });
});
