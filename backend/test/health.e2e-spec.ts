import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { MongoTestHarness } from './support/mongo-test-harness.js';

describe('Health (e2e)', () => {
  const mongo = new MongoTestHarness();
  let app: INestApplication;

  beforeAll(async () => {
    await mongo.start();

    // Imported dynamically, *after* the harness has set MONGODB_URI:
    // AppModule calls ConfigModule.forRoot() at module-definition time,
    // so a static import would run env validation before the harness
    // could point it at the in-memory server. Every e2e suite must
    // follow this pattern.
    const { AppModule } = await import('../src/app.module.js');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same configuration production runs, so the mandatory ValidationPipe
    // guarantees are actually exercised by e2e rather than bypassed.
    const { configureApp } = await import("../src/bootstrap.js");
    configureApp(app);
    await app.init();
  }, 60_000);

  afterAll(async () => {
    // finally: if app.close() rejects, mongod must still be stopped, or
    // it is orphaned and process.env stays mutated for later suites.
    try {
      await app?.close();
    } finally {
      await mongo.stop();
    }
  });

  it('reports healthy when the database is reachable', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.status).toBe('ok');
    // The point of this check: it pinged a real connection, not just
    // confirmed the process is alive.
    expect(response.body.details.mongodb.status).toBe('up');
  });

  it('echoes a correlation id on every response', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('correlates errors on unmatched routes too', async () => {
    // Regression: request ids used to be assigned by an interceptor,
    // which never runs when no route matches — so 404s came back with
    // an empty requestId and could not be traced to their logs.
    const response = await request(app.getHttpServer())
      .get('/definitely-not-a-route')
      .expect(404);

    expect(response.body.requestId).toMatch(/[0-9a-f-]{36}/);
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
    expect(response.body.path).toBe('/definitely-not-a-route');
  });

  it('preserves a caller-supplied correlation id', async () => {
    const callerId = 'caller-supplied-id-123';

    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', callerId)
      .expect(200);

    expect(response.headers['x-request-id']).toBe(callerId);
  });
});
