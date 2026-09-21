import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import request from 'supertest';
import { MongoTestHarness } from './support/mongo-test-harness.js';
import { DoctorEntity, DoctorDocument } from '../src/module/doctors/doctors.schema.js';

const ROSTER = [
  {
    _id: 'DOC001',
    name: 'Dr. Asha Menon',
    departmentId: 'DENTAL',
    specialization: 'Endodontics',
    status: 'ACTIVE',
  },
  {
    _id: 'DOC002',
    name: 'Dr. Ben Okafor',
    departmentId: 'DENTAL',
    specialization: 'Orthodontics',
    status: 'ON_LEAVE',
  },
  {
    _id: 'DOC003',
    name: 'Dr. Clara Ruiz',
    departmentId: 'DENTAL',
    specialization: 'Periodontics',
    status: 'BUSY',
  },
  {
    _id: 'DOC004',
    name: 'Dr. Dev Shah',
    departmentId: 'DENTAL',
    specialization: 'Oral surgery',
    status: 'OFFLINE',
  },
  {
    _id: 'DOC005',
    name: 'Dr. Eve Lindqvist',
    departmentId: 'CARDIOLOGY',
    specialization: 'Electrophysiology',
    status: 'ACTIVE',
  },
];

interface DoctorResponse {
  id: string;
  name: string;
  departmentId: string;
  specialization: string;
  status: string;
}

describe('Doctors (e2e)', () => {
  const mongo = new MongoTestHarness();
  let app: INestApplication;

  beforeAll(async () => {
    await mongo.start();

    // Dynamic, after the harness set MONGODB_URI: AppModule runs env
    // validation at module-definition time (see health.e2e-spec.ts).
    const { AppModule } = await import('../src/app.module.js');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same configuration production runs, so the global ValidationPipe's
    // guarantees are actually exercised here.
    const { configureApp } = await import('../src/bootstrap.js');
    configureApp(app);
    await app.init();

    const doctors = app.get<Model<DoctorDocument>>(getModelToken(DoctorEntity.name));
    await doctors.deleteMany({});
    await doctors.insertMany(ROSTER);
  }, 60_000);

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await mongo.stop();
    }
  });

  const ids = (body: DoctorResponse[]): string[] => body.map((doctor) => doctor.id).sort();

  it('lists every doctor by default', async () => {
    const response = await request(app.getHttpServer()).get('/doctors').expect(200);

    expect(ids(response.body)).toEqual([
      'DOC001',
      'DOC002',
      'DOC003',
      'DOC004',
      'DOC005',
    ]);
  });

  it('returns contracts, not stored documents', async () => {
    const response = await request(app.getHttpServer())
      .get('/doctors')
      .query({ departmentId: 'CARDIOLOGY' })
      .expect(200);

    // The exact wire shape the appointments module and the generated
    // frontend client depend on — no _id, no __v, no timestamps.
    expect(response.body).toEqual([
      {
        id: 'DOC005',
        name: 'Dr. Eve Lindqvist',
        departmentId: 'CARDIOLOGY',
        specialization: 'Electrophysiology',
        status: 'ACTIVE',
      },
    ]);
  });

  it('excludes ON_LEAVE, BUSY and OFFLINE doctors when bookableOnly=true', async () => {
    const response = await request(app.getHttpServer())
      .get('/doctors')
      .query({ bookableOnly: 'true' })
      .expect(200);

    // The invariant that keeps the agent from offering an absent doctor.
    expect(ids(response.body)).toEqual(['DOC001', 'DOC005']);
  });

  it('honours bookableOnly=false rather than treating the string as truthy', async () => {
    // A naive Boolean('false') is `true`; this asserts the opposite of
    // what was asked for cannot happen.
    const response = await request(app.getHttpServer())
      .get('/doctors')
      .query({ bookableOnly: 'false' })
      .expect(200);

    expect(response.body).toHaveLength(ROSTER.length);
  });

  it('does not leak doctors from another department', async () => {
    const response = await request(app.getHttpServer())
      .get('/doctors')
      .query({ departmentId: 'DENTAL' })
      .expect(200);

    expect(ids(response.body)).toEqual(['DOC001', 'DOC002', 'DOC003', 'DOC004']);
  });

  it('combines departmentId with bookableOnly', async () => {
    const response = await request(app.getHttpServer())
      .get('/doctors')
      .query({ departmentId: 'DENTAL', bookableOnly: 'true' })
      .expect(200);

    expect(ids(response.body)).toEqual(['DOC001']);
  });

  it('filters by an explicit status', async () => {
    const response = await request(app.getHttpServer())
      .get('/doctors')
      .query({ status: 'ON_LEAVE' })
      .expect(200);

    expect(ids(response.body)).toEqual(['DOC002']);
  });

  it('rejects an unknown status with a 400', async () => {
    const response = await request(app.getHttpServer())
      .get('/doctors')
      .query({ status: 'VACATIONING' })
      .expect(400);

    expect(String(response.body.message)).toContain('status');
  });

  it('rejects a non-boolean bookableOnly instead of guessing', async () => {
    await request(app.getHttpServer())
      .get('/doctors')
      .query({ bookableOnly: 'maybe' })
      .expect(400);
  });

  it('rejects an unexpected query parameter', async () => {
    // forbidNonWhitelisted: an unexpected field is a hard 400, not a
    // silently-dropped one (CLAUDE.md, Global setup).
    await request(app.getHttpServer())
      .get('/doctors')
      .query({ departmentId: 'DENTAL', sneaky: '1' })
      .expect(400);
  });

  it('returns one doctor by id', async () => {
    const response = await request(app.getHttpServer()).get('/doctors/DOC001').expect(200);

    expect(response.body.id).toBe('DOC001');
    expect(response.body).not.toHaveProperty('_id');
  });

  it('404s an unknown doctor, correlated by request id', async () => {
    const response = await request(app.getHttpServer()).get('/doctors/DOC404').expect(404);

    expect(response.body.message).toContain('DOC404');
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });
});
