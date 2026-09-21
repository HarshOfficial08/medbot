import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import request from 'supertest';
import { MongoTestHarness } from './support/mongo-test-harness.js';
import {
  ScheduleEntity,
  ScheduleDocument,
} from '../src/module/schedules/schedules.schema.js';

interface ScheduleResponse {
  id: string;
  doctorId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
}

const WINDOWS = [
  {
    doctorId: 'DOC001',
    dayOfWeek: 'MONDAY',
    startTime: '09:00',
    endTime: '12:00',
    slotDurationMinutes: 30,
  },
  {
    doctorId: 'DOC001',
    dayOfWeek: 'MONDAY',
    startTime: '14:00',
    endTime: '17:00',
    slotDurationMinutes: 30,
  },
  {
    doctorId: 'DOC001',
    dayOfWeek: 'TUESDAY',
    startTime: '09:00',
    endTime: '17:00',
    slotDurationMinutes: 20,
  },
  {
    doctorId: 'DOC002',
    dayOfWeek: 'MONDAY',
    startTime: '10:00',
    endTime: '13:00',
    slotDurationMinutes: 15,
  },
];

describe('Schedules (e2e)', () => {
  const mongo = new MongoTestHarness();
  let app: INestApplication;

  beforeAll(async () => {
    await mongo.start();

    // Dynamic, after the harness set MONGODB_URI (see health.e2e-spec.ts).
    const { AppModule } = await import('../src/app.module.js');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const { configureApp } = await import('../src/bootstrap.js');
    configureApp(app);
    await app.init();

    const schedules = app.get<Model<ScheduleDocument>>(
      getModelToken(ScheduleEntity.name),
    );
    await schedules.deleteMany({});
    await schedules.insertMany(WINDOWS);
  }, 60_000);

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await mongo.stop();
    }
  });

  describe('GET /schedules', () => {
    it("returns a doctor's whole week", async () => {
      const response = await request(app.getHttpServer())
        .get('/schedules')
        .query({ doctorId: 'DOC001' })
        .expect(200);

      expect(response.body).toHaveLength(3);
      expect(
        response.body.every(
          (schedule: ScheduleResponse) => schedule.doctorId === 'DOC001',
        ),
      ).toBe(true);
    });

    it('returns contracts, not stored documents', async () => {
      const response = await request(app.getHttpServer())
        .get('/schedules')
        .query({ doctorId: 'DOC002' })
        .expect(200);

      const [schedule] = response.body as ScheduleResponse[];
      expect(Object.keys(schedule).sort()).toEqual([
        'dayOfWeek',
        'doctorId',
        'endTime',
        'id',
        'slotDurationMinutes',
        'startTime',
      ]);
      // The ObjectId is stringified at the boundary — no _id, no __v.
      expect(typeof schedule.id).toBe('string');
    });

    it('filters by dayOfWeek', async () => {
      const response = await request(app.getHttpServer())
        .get('/schedules')
        .query({ doctorId: 'DOC001', dayOfWeek: 'MONDAY' })
        .expect(200);

      expect(
        response.body.map((schedule: ScheduleResponse) => schedule.startTime),
      ).toEqual(['09:00', '14:00']);
    });

    it('does not return another doctor working the same day', async () => {
      const response = await request(app.getHttpServer())
        .get('/schedules')
        .query({ doctorId: 'DOC001', dayOfWeek: 'MONDAY' })
        .expect(200);

      expect(
        response.body.some(
          (schedule: ScheduleResponse) => schedule.doctorId === 'DOC002',
        ),
      ).toBe(false);
    });

    it('is empty for a day the doctor does not work', async () => {
      const response = await request(app.getHttpServer())
        .get('/schedules')
        .query({ doctorId: 'DOC001', dayOfWeek: 'SUNDAY' })
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('requires a doctorId rather than dumping the whole collection', async () => {
      await request(app.getHttpServer())
        .get('/schedules')
        .query({ dayOfWeek: 'MONDAY' })
        .expect(400);
    });

    it('rejects an unknown weekday', async () => {
      const response = await request(app.getHttpServer())
        .get('/schedules')
        .query({ doctorId: 'DOC001', dayOfWeek: 'FUNDAY' })
        .expect(400);

      expect(String(response.body.message)).toContain('dayOfWeek');
    });
  });

  describe('POST /schedules', () => {
    it('creates a working window', async () => {
      const response = await request(app.getHttpServer())
        .post('/schedules')
        .send({
          doctorId: 'DOC003',
          dayOfWeek: 'FRIDAY',
          startTime: '08:30',
          endTime: '11:30',
          slotDurationMinutes: 15,
        })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(String),
        doctorId: 'DOC003',
        dayOfWeek: 'FRIDAY',
        startTime: '08:30',
        endTime: '11:30',
        slotDurationMinutes: 15,
      });

      const readBack = await request(app.getHttpServer())
        .get('/schedules')
        .query({ doctorId: 'DOC003' })
        .expect(200);
      expect(readBack.body).toHaveLength(1);
    });

    it('rejects a time that is not "HH:mm"', async () => {
      for (const bad of ['9:00', '24:00', '09:60', 'morning']) {
        const response = await request(app.getHttpServer())
          .post('/schedules')
          .send({
            doctorId: 'DOC009',
            dayOfWeek: 'MONDAY',
            startTime: bad,
            endTime: '17:00',
          })
          .expect(400);

        expect(String(response.body.message)).toContain('startTime');
      }
    });

    it('rejects an endTime that is not after startTime', async () => {
      // Such a window yields zero slots silently: the doctor would look
      // fully booked with nothing in the logs to explain it.
      const response = await request(app.getHttpServer())
        .post('/schedules')
        .send({
          doctorId: 'DOC009',
          dayOfWeek: 'MONDAY',
          startTime: '17:00',
          endTime: '09:00',
        })
        .expect(400);

      expect(String(response.body.message)).toContain(
        'endTime must be later than startTime',
      );
    });

    it('rejects an equal start and end time', async () => {
      await request(app.getHttpServer())
        .post('/schedules')
        .send({
          doctorId: 'DOC009',
          dayOfWeek: 'MONDAY',
          startTime: '09:00',
          endTime: '09:00',
        })
        .expect(400);
    });

    it('rejects an unexpected field', async () => {
      await request(app.getHttpServer())
        .post('/schedules')
        .send({
          doctorId: 'DOC009',
          dayOfWeek: 'MONDAY',
          startTime: '09:00',
          endTime: '17:00',
          isSuperDoctor: true,
        })
        .expect(400);
    });

    it('defaults slotDurationMinutes to 30', async () => {
      const response = await request(app.getHttpServer())
        .post('/schedules')
        .send({
          doctorId: 'DOC010',
          dayOfWeek: 'THURSDAY',
          startTime: '09:00',
          endTime: '17:00',
        })
        .expect(201);

      expect(response.body.slotDurationMinutes).toBe(30);
    });
  });
});
