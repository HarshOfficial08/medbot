import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { MongoTestHarness } from './support/mongo-test-harness.js';

describe('Patients (e2e)', () => {
  const mongo = new MongoTestHarness();
  let app: INestApplication;

  beforeAll(async () => {
    await mongo.start();

    // Dynamic import, after the harness set MONGODB_URI — AppModule
    // validates env at module-definition time (see health.e2e-spec.ts).
    const { AppModule } = await import('../src/app.module.js');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const { configureApp } = await import('../src/bootstrap.js');
    configureApp(app);
    await app.init();
  }, 60_000);

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await mongo.stop();
    }
  });

  it('assigns readable sequential ids', async () => {
    const first = await request(app.getHttpServer())
      .post('/patients')
      .send({ name: 'Ada Lovelace', gender: 'female' })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/patients')
      .send({ name: 'George Byron', gender: 'male', phone: '+1 555 0134' })
      .expect(201);

    expect(first.body.id).toBe('PAT001');
    expect(second.body.id).toBe('PAT002');
  });

  it('leaves an unsupplied age or phone absent rather than defaulting it', async () => {
    const response = await request(app.getHttpServer())
      .post('/patients')
      .send({ name: 'Grace Hopper' })
      .expect(201);

    // "Never invent missing information" (plan section 42): absent is
    // absent, not null and not zero.
    expect(response.body).not.toHaveProperty('age');
    expect(response.body).not.toHaveProperty('phone');
    // ...but gender is required by the contract, so it carries the
    // explicit "we were not told" marker.
    expect(response.body.gender).toBe('unknown');
  });

  it('rejects an unexpected field in the body', async () => {
    // whitelist + forbidNonWhitelisted globally: an extra field is a
    // hard 400, so nothing unvetted reaches a patient record.
    const response = await request(app.getHttpServer())
      .post('/patients')
      .send({ name: 'Mallory', ssn: '000-00-0000' })
      .expect(400);

    expect(response.body.statusCode).toBe(400);
  });

  it('rejects a body missing the one required field', async () => {
    await request(app.getHttpServer()).post('/patients').send({}).expect(400);
  });

  it('rejects an implausible age instead of storing it', async () => {
    await request(app.getHttpServer())
      .post('/patients')
      .send({ name: 'Ada', age: -3 })
      .expect(400);
  });

  it('reads a patient back by id', async () => {
    const response = await request(app.getHttpServer())
      .get('/patients/PAT001')
      .expect(200);

    expect(response.body).toEqual({
      id: 'PAT001',
      name: 'Ada Lovelace',
      gender: 'female',
    });
  });

  it('answers 404 in the standard error shape for an unknown id', async () => {
    const response = await request(app.getHttpServer())
      .get('/patients/PAT999')
      .expect(404);

    expect(response.body.statusCode).toBe(404);
    expect(response.body.path).toBe('/patients/PAT999');
    expect(response.body.requestId).toBeTruthy();
  });

  it('finds patients by exact phone number', async () => {
    const response = await request(app.getHttpServer())
      .get('/patients')
      .query({ phone: '+1 555 0134' })
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe('PAT002');
  });

  it('returns an empty list, not a 404, when no one matches the number', async () => {
    const response = await request(app.getHttpServer())
      .get('/patients')
      .query({ phone: '+1 555 9999' })
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('refuses to list patients without a filter', async () => {
    // An unfiltered list would dump the whole collection, which is PHI.
    await request(app.getHttpServer()).get('/patients').expect(400);
  });

  it('updates only the fields supplied', async () => {
    const response = await request(app.getHttpServer())
      .patch('/patients/PAT001')
      .send({ age: 36 })
      .expect(200);

    expect(response.body).toEqual({
      id: 'PAT001',
      name: 'Ada Lovelace',
      gender: 'female',
      age: 36,
    });
  });

  it('rejects an unexpected field on update', async () => {
    await request(app.getHttpServer())
      .patch('/patients/PAT001')
      .send({ diagnosis: 'invented' })
      .expect(400);
  });

  it('answers 404 when updating a patient that does not exist', async () => {
    await request(app.getHttpServer())
      .patch('/patients/PAT999')
      .send({ age: 30 })
      .expect(404);
  });
});
