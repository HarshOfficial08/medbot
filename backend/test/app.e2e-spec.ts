import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { MongoTestHarness } from './support/mongo-test-harness.js';

describe('AppController (e2e)', () => {
  const mongo = new MongoTestHarness();
  let app: INestApplication;

  beforeAll(async () => {
    await mongo.start();

    // Dynamic import after the harness sets env — see the note in
    // health.e2e-spec.ts for why a static import fails.
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

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });
});
