import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import type { Model } from 'mongoose';
import request from 'supertest';
import { MongoTestHarness } from './support/mongo-test-harness.js';
import { AppointmentEntity } from '../src/module/appointments/appointments.schema.js';
import type { AppointmentDocument } from '../src/module/appointments/appointments.schema.js';
import { AppointmentsService } from '../src/module/appointments/appointments.service.js';
import { DoctorsService } from '../src/module/doctors/doctors.service.js';
import { SchedulesService } from '../src/module/schedules/schedules.service.js';
import type { Doctor, FindDoctorsQuery } from '../src/module/doctors/doctors.types.js';
import type { DayOfWeek, Schedule } from '../src/module/schedules/schedules.types.js';

/**
 * Appointments against a real MongoDB.
 *
 * Doctors and schedules are overridden with fixed reference data: this
 * suite is about the appointments collection and — above all — about the
 * partial unique index that is the actual double-booking guard. Reference
 * data coming from a sibling module would make the outcome depend on that
 * module's state rather than on this module's behaviour.
 */

/** 2026-09-21 is a Monday. */
const MONDAY = '2026-09-21';
const TUESDAY = '2026-09-22';

const DOCTORS: Doctor[] = [
  { id: 'DOC001', name: 'Dr Anita Rao', departmentId: 'DENTAL', specialization: 'Endodontics', status: 'ACTIVE' },
  { id: 'DOC002', name: 'Dr Sam Vale', departmentId: 'DENTAL', specialization: 'Orthodontics', status: 'ACTIVE' },
  { id: 'DOC003', name: 'Dr Lee Park', departmentId: 'DENTAL', specialization: 'Surgery', status: 'ON_LEAVE' },
];

const WORKING_DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY'];

function schedulesFor(doctorIds: string[], dayOfWeek: DayOfWeek): Schedule[] {
  if (!WORKING_DAYS.includes(dayOfWeek)) {
    return [];
  }
  return doctorIds.map((doctorId) => ({
    id: `SCH-${doctorId}-${dayOfWeek}`,
    doctorId,
    dayOfWeek,
    startTime: '09:00',
    endTime: '12:00',
    slotDurationMinutes: 30,
  }));
}

const doctorsStub = {
  find: async (query: FindDoctorsQuery): Promise<Doctor[]> =>
    DOCTORS.filter(
      (doctor) =>
        (!query.departmentId || doctor.departmentId === query.departmentId) &&
        (!query.bookableOnly || doctor.status === 'ACTIVE'),
    ),
  findById: async (id: string): Promise<Doctor | null> =>
    DOCTORS.find((doctor) => doctor.id === id) ?? null,
  findManyByIds: async (ids: string[]): Promise<Doctor[]> =>
    DOCTORS.filter((doctor) => ids.includes(doctor.id)),
};

const schedulesStub = {
  findByDoctorAndDay: async (doctorId: string, dayOfWeek: DayOfWeek): Promise<Schedule[]> =>
    schedulesFor([doctorId], dayOfWeek),
  findByDoctorsAndDay: async (doctorIds: string[], dayOfWeek: DayOfWeek): Promise<Schedule[]> =>
    schedulesFor(doctorIds, dayOfWeek),
};

describe('Appointments (e2e)', () => {
  const mongo = new MongoTestHarness();
  let app: INestApplication;
  let appointmentModel: Model<AppointmentDocument>;
  let appointments: AppointmentsService;

  beforeAll(async () => {
    await mongo.start();

    // Dynamic, after the harness set MONGODB_URI: AppModule runs env
    // validation at module-definition time (see health.e2e-spec.ts).
    const { AppModule } = await import('../src/app.module.js');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DoctorsService)
      .useValue(doctorsStub)
      .overrideProvider(SchedulesService)
      .useValue(schedulesStub)
      .compile();

    app = moduleFixture.createNestApplication();
    const { configureApp } = await import('../src/bootstrap.js');
    configureApp(app);
    await app.init();

    appointmentModel = app.get<Model<AppointmentDocument>>(getModelToken(AppointmentEntity.name));
    appointments = app.get(AppointmentsService);

    // The whole point of the concurrency test below is the partial unique
    // index. Without this the collection might have no index yet and the
    // test would pass for the wrong reason.
    await appointmentModel.syncIndexes();
  }, 120_000);

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await mongo.stop();
    }
  });

  beforeEach(async () => {
    await appointmentModel.deleteMany({});
  });

  const booking = (overrides: Record<string, unknown> = {}) => ({
    patientId: 'PAT-0042',
    doctorId: 'DOC001',
    date: MONDAY,
    startTime: '10:00',
    confirmed: true,
    ...overrides,
  });

  describe('the double-booking guard', () => {
    it('really exists in this database, as a unique partial index', async () => {
      const indexes = await appointmentModel.collection.indexes();
      const guard = indexes.find(
        (index) =>
          JSON.stringify(index.key) === JSON.stringify({ doctorId: 1, date: 1, startTime: 1 }) &&
          index.unique === true,
      );

      expect(guard).toBeDefined();
      expect(guard?.partialFilterExpression).toEqual({
        status: { $in: ['HELD', 'PROPOSED', 'CONFIRMED'] },
      });
    });

    it('lets exactly one of two simultaneous bookings for the same slot win', async () => {
      // The single most important test in this module: both calls read
      // availability before either insert lands, so only the database can
      // separate them. One appointment, one conflict — never two rows.
      const results = await Promise.allSettled([
        appointments.book(booking({ patientId: 'PAT-A' })),
        appointments.book(booking({ patientId: 'PAT-B' })),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const loser = (rejected[0] as PromiseRejectedResult).reason;
      expect(loser).toMatchObject({ status: 409 });
      // This exact wording only comes from the duplicate-key branch, so it
      // proves the *index* rejected the write — not the availability
      // re-check, which both callers passed.
      expect(loser.message).toMatch(/taken while this booking was being confirmed/);

      const stored = await appointmentModel
        .find({ doctorId: 'DOC001', date: MONDAY, startTime: '10:00' })
        .lean()
        .exec();
      expect(stored).toHaveLength(1);
    });

    it('holds over ten simultaneous attempts', async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, index) =>
          appointments.book(booking({ patientId: `PAT-${index}`, startTime: '11:00' })),
        ),
      );

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(
        results
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .every((result) => result.reason.status === 409),
      ).toBe(true);
      expect(await appointmentModel.countDocuments({ startTime: '11:00' })).toBe(1);
    });

    it('frees the slot again once the winner cancels', async () => {
      const first = await appointments.book(booking());
      await appointments.cancel(first.id);

      const second = await appointments.book(booking({ patientId: 'PAT-B' }));

      expect(second.startTime).toBe('10:00');
      // Two rows now share the slot — legally, because only one blocks it.
      expect(await appointmentModel.countDocuments({ startTime: '10:00' })).toBe(2);
    });
  });

  describe('GET /appointments/availability', () => {
    it('returns every bookable doctor\'s slots for the day', async () => {
      const response = await request(app.getHttpServer())
        .get('/appointments/availability')
        .query({ departmentId: 'DENTAL', date: MONDAY })
        .expect(200);

      // Two bookable doctors, six slots each in a 09:00-12:00 window.
      expect(response.body).toHaveLength(12);
      expect(response.body[0]).toEqual({
        doctorId: 'DOC001',
        doctorName: 'Dr Anita Rao',
        departmentId: 'DENTAL',
        date: MONDAY,
        startTime: '09:00',
        endTime: '09:30',
      });
    });

    it('never offers a slot for the ON_LEAVE doctor', async () => {
      const department = await request(app.getHttpServer())
        .get('/appointments/availability')
        .query({ departmentId: 'DENTAL', date: MONDAY })
        .expect(200);
      const direct = await request(app.getHttpServer())
        .get('/appointments/availability')
        .query({ doctorId: 'DOC003', date: MONDAY })
        .expect(200);

      expect(department.body.some((slot: { doctorId: string }) => slot.doctorId === 'DOC003')).toBe(
        false,
      );
      expect(direct.body).toEqual([]);
    });

    it('drops a slot once it is booked and offers it again after a cancel', async () => {
      const booked = await appointments.book(booking());

      const afterBooking = await request(app.getHttpServer())
        .get('/appointments/availability')
        .query({ doctorId: 'DOC001', date: MONDAY })
        .expect(200);
      expect(afterBooking.body.map((slot: { startTime: string }) => slot.startTime)).not.toContain(
        '10:00',
      );

      await request(app.getHttpServer()).post(`/appointments/${booked.id}/cancel`).expect(200);

      const afterCancel = await request(app.getHttpServer())
        .get('/appointments/availability')
        .query({ doctorId: 'DOC001', date: MONDAY })
        .expect(200);
      expect(afterCancel.body.map((slot: { startTime: string }) => slot.startTime)).toContain('10:00');
    });

    it('applies after inclusively and before exclusively', async () => {
      const response = await request(app.getHttpServer())
        .get('/appointments/availability')
        .query({ doctorId: 'DOC001', date: MONDAY, after: '10:00', before: '11:00' })
        .expect(200);

      expect(response.body.map((slot: { startTime: string }) => slot.startTime)).toEqual([
        '10:00',
        '10:30',
      ]);
    });

    it('returns nothing for a day the doctor does not work', async () => {
      await request(app.getHttpServer())
        .get('/appointments/availability')
        .query({ doctorId: 'DOC001', date: '2026-09-26' })
        .expect(200)
        .expect([]);
    });

    it('rejects a malformed date, a missing target and an unknown field', async () => {
      await request(app.getHttpServer())
        .get('/appointments/availability')
        .query({ doctorId: 'DOC001', date: '21-09-2026' })
        .expect(400);

      await request(app.getHttpServer())
        .get('/appointments/availability')
        .query({ date: MONDAY })
        .expect(400);

      // whitelist + forbidNonWhitelisted from the global ValidationPipe.
      await request(app.getHttpServer())
        .get('/appointments/availability')
        .query({ doctorId: 'DOC001', date: MONDAY, limit: '5' })
        .expect(400);
    });
  });

  describe('POST /appointments', () => {
    it('books a confirmed slot', async () => {
      const response = await request(app.getHttpServer())
        .post('/appointments')
        .send(booking())
        .expect(201);

      expect(response.body).toMatchObject({
        patientId: 'PAT-0042',
        doctorId: 'DOC001',
        date: MONDAY,
        startTime: '10:00',
        endTime: '10:30',
        status: 'CONFIRMED',
      });
      expect(response.body.id).toBeTruthy();
      expect(response.body._id).toBeUndefined();
    });

    it('invariant: refuses to book without confirmation', async () => {
      await request(app.getHttpServer())
        .post('/appointments')
        .send(booking({ confirmed: false }))
        .expect(403);

      // And a string that merely looks like a boolean must not sneak past
      // the pipe's implicit conversion into a confirmed booking.
      await request(app.getHttpServer())
        .post('/appointments')
        .send(booking({ confirmed: 'false' }))
        .expect(403);

      expect(await appointmentModel.countDocuments({})).toBe(0);
    });

    it('invariant: the same idempotencyKey twice yields one appointment', async () => {
      const first = await request(app.getHttpServer())
        .post('/appointments')
        .send(booking({ idempotencyKey: 'session-xyz-1' }))
        .expect(201);
      const second = await request(app.getHttpServer())
        .post('/appointments')
        .send(booking({ idempotencyKey: 'session-xyz-1' }))
        .expect(201);

      expect(second.body.id).toBe(first.body.id);
      expect(await appointmentModel.countDocuments({})).toBe(1);
    });

    it('returns 409 for a slot that is already taken', async () => {
      await appointments.book(booking());

      await request(app.getHttpServer())
        .post('/appointments')
        .send(booking({ patientId: 'PAT-B' }))
        .expect(409);
    });

    it('returns 404 for an unknown doctor and 400 for a malformed body', async () => {
      await request(app.getHttpServer())
        .post('/appointments')
        .send(booking({ doctorId: 'NOPE' }))
        .expect(404);

      await request(app.getHttpServer())
        .post('/appointments')
        .send(booking({ startTime: '25:00' }))
        .expect(400);
    });
  });

  describe('GET /appointments/:id', () => {
    it('reads a booking back', async () => {
      const booked = await appointments.book(booking());

      const response = await request(app.getHttpServer())
        .get(`/appointments/${booked.id}`)
        .expect(200);

      expect(response.body).toEqual(booked);
    });

    it('404s for an unknown or malformed id, and is not shadowed by /availability', async () => {
      await request(app.getHttpServer())
        .get('/appointments/507f1f77bcf86cd799439011')
        .expect(404);
      await request(app.getHttpServer()).get('/appointments/not-an-id').expect(404);
      // The literal route must still win over the parametric one.
      await request(app.getHttpServer())
        .get('/appointments/availability')
        .query({ doctorId: 'DOC001', date: MONDAY })
        .expect(200);
    });
  });

  describe('POST /appointments/:id/cancel and /reschedule', () => {
    it('cancels, then refuses to reschedule the cancelled appointment', async () => {
      const booked = await appointments.book(booking());

      const cancelled = await request(app.getHttpServer())
        .post(`/appointments/${booked.id}/cancel`)
        .expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');

      await request(app.getHttpServer())
        .post(`/appointments/${booked.id}/reschedule`)
        .send({ date: MONDAY, startTime: '11:00' })
        .expect(409);
    });

    it('moves an appointment to a free slot, in a way availability reflects', async () => {
      const booked = await appointments.book(booking());

      const moved = await request(app.getHttpServer())
        .post(`/appointments/${booked.id}/reschedule`)
        .send({ date: TUESDAY, startTime: '09:30' })
        .expect(200);

      expect(moved.body).toMatchObject({
        id: booked.id,
        date: TUESDAY,
        startTime: '09:30',
        endTime: '10:00',
        status: 'CONFIRMED',
      });
      expect(await appointmentModel.countDocuments({})).toBe(1);

      const monday = await request(app.getHttpServer())
        .get('/appointments/availability')
        .query({ doctorId: 'DOC001', date: MONDAY })
        .expect(200);
      expect(monday.body.map((slot: { startTime: string }) => slot.startTime)).toContain('10:00');
    });

    it('refuses to move onto a slot someone else holds', async () => {
      const booked = await appointments.book(booking());
      await appointments.book(booking({ patientId: 'PAT-B', startTime: '11:00' }));

      await request(app.getHttpServer())
        .post(`/appointments/${booked.id}/reschedule`)
        .send({ date: MONDAY, startTime: '11:00' })
        .expect(409);

      // Nothing moved.
      await expect(appointments.getById(booked.id)).resolves.toMatchObject({ startTime: '10:00' });
    });

    it('rejects a malformed reschedule body', async () => {
      const booked = await appointments.book(booking());

      await request(app.getHttpServer())
        .post(`/appointments/${booked.id}/reschedule`)
        .send({ date: MONDAY, startTime: 'noon' })
        .expect(400);
    });
  });

  describe('the doctor dashboard query', () => {
    it('returns one doctor\'s day, earliest first', async () => {
      await appointments.book(booking({ startTime: '11:00' }));
      await appointments.book(booking({ startTime: '09:00', patientId: 'PAT-B' }));
      await appointments.book(booking({ doctorId: 'DOC002', startTime: '10:00' }));

      const day = await appointments.findByDoctorAndDate('DOC001', MONDAY);

      expect(day.map((appointment) => appointment.startTime)).toEqual(['09:00', '11:00']);
      expect(day.every((appointment) => appointment.doctorId === 'DOC001')).toBe(true);
    });
  });
});
