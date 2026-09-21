import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { MongoTestHarness } from './support/mongo-test-harness.js';
import { DepartmentEntity } from '../src/module/departments/departments.schema.js';
import type { DepartmentDocument } from '../src/module/departments/departments.schema.js';

describe('Departments (e2e)', () => {
  const mongo = new MongoTestHarness();
  let app: INestApplication;

  beforeAll(async () => {
    await mongo.start();

    // Imported dynamically, *after* the harness has set MONGODB_URI:
    // AppModule runs ConfigModule env validation at module-definition
    // time, so a static import would validate before the harness could
    // point it at the in-memory server.
    const { AppModule } = await import('../src/app.module.js');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same configuration production runs, so the global ValidationPipe
    // is actually exercised rather than bypassed.
    const { configureApp } = await import('../src/bootstrap.js');
    configureApp(app);
    await app.init();

    const departments = app.get<Model<DepartmentDocument>>(
      getModelToken(DepartmentEntity.name),
    );
    await departments.create([
      { _id: 'DENTAL', name: 'Dental', active: true },
      { _id: 'CARDIOLOGY', name: 'Cardiology', active: true },
      { _id: 'PODIATRY', name: 'Podiatry', active: false },
    ]);
  }, 60_000);

  afterAll(async () => {
    // finally: if app.close() rejects, mongod must still be stopped or
    // it is orphaned and process.env stays mutated for later suites.
    try {
      await app?.close();
    } finally {
      await mongo.stop();
    }
  });

  it('lists every department as a plain contract', async () => {
    const response = await request(app.getHttpServer()).get('/departments').expect(200);

    expect(response.body).toHaveLength(3);
    expect(response.body[0]).toEqual({
      id: 'CARDIOLOGY',
      name: 'Cardiology',
      active: true,
    });
    // Architecture rule 4: the storage shape never reaches the wire.
    expect(response.body[0]).not.toHaveProperty('_id');
  });

  it('filters to active departments on request', async () => {
    const response = await request(app.getHttpServer())
      .get('/departments?activeOnly=true')
      .expect(200);

    expect(response.body.map((d: { id: string }) => d.id)).toEqual([
      'CARDIOLOGY',
      'DENTAL',
    ]);
  });

  it('treats activeOnly=false as false, not as a truthy string', async () => {
    // Regression: the global ValidationPipe runs with
    // enableImplicitConversion, whose Boolean conversion is a bare
    // `Boolean(value)` — so "false" would otherwise arrive as `true` and
    // silently hide the inactive departments.
    const response = await request(app.getHttpServer())
      .get('/departments?activeOnly=false')
      .expect(200);

    expect(response.body).toHaveLength(3);
  });

  it('rejects a non-boolean activeOnly instead of guessing', async () => {
    await request(app.getHttpServer()).get('/departments?activeOnly=maybe').expect(400);
  });

  it('rejects an unexpected query parameter', async () => {
    // whitelist + forbidNonWhitelisted are on globally: an unknown field
    // is a hard 400, not a silently-dropped one.
    await request(app.getHttpServer()).get('/departments?nope=1').expect(400);
  });

  it('returns one department by id', async () => {
    const response = await request(app.getHttpServer())
      .get('/departments/DENTAL')
      .expect(200);

    expect(response.body).toEqual({ id: 'DENTAL', name: 'Dental', active: true });
  });

  it('answers 404 in the standard error shape for an unknown id', async () => {
    const response = await request(app.getHttpServer())
      .get('/departments/NOT_A_DEPARTMENT')
      .expect(404);

    expect(response.body.statusCode).toBe(404);
    expect(response.body.path).toBe('/departments/NOT_A_DEPARTMENT');
    // Correlatable to its log line, like every other error response.
    expect(response.body.requestId).toBeTruthy();
  });
});
