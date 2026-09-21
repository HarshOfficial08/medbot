import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { AppointmentsService } from './appointments.service.js';
import { AppointmentEntity } from './appointments.schema.js';
import type { AppointmentDocument } from './appointments.schema.js';
import type { AppointmentStatus, BookAppointmentRequest } from './appointments.types.js';
import { DoctorsService } from '../doctors/doctors.service.js';
import { SchedulesService } from '../schedules/schedules.service.js';
import type { Doctor, FindDoctorsQuery } from '../doctors/doctors.types.js';
import type { DayOfWeek, Schedule } from '../schedules/schedules.types.js';

/**
 * Unit tests for the availability arithmetic and the booking guarantees.
 *
 * Doctors and schedules are mocked through their DI tokens — this suite
 * must never depend on a sibling module's data, or on Mongo. The double
 * booking guarantee itself is proved against a real database and a real
 * index in test/appointments.e2e-spec.ts; what is proved here is that the
 * service reacts correctly to the error that index produces.
 */

interface StoredAppointment {
  _id: string;
  patientId: string;
  doctorId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  idempotencyKey?: string;
}

interface ChainStub {
  select(): ChainStub;
  sort(): ChainStub;
  lean<R>(): { exec(): Promise<R> };
  exec(): Promise<unknown>;
}

function chain(value: unknown): ChainStub {
  const stub: ChainStub = {
    select: () => stub,
    sort: () => stub,
    lean: <R>() => ({ exec: (): Promise<R> => Promise.resolve(value as R) }),
    exec: () => Promise.resolve(value),
  };
  return stub;
}

type Condition = { $in?: unknown[]; $ne?: string | { toHexString(): string } };

/** ObjectId or string, compared the way Mongo would compare them. */
function idKey(value: string | { toHexString(): string }): string {
  return typeof value === 'string' ? value : value.toHexString();
}

function matchesFilter(doc: StoredAppointment, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([field, condition]) => {
    const value = (doc as unknown as Record<string, unknown>)[field];
    if (condition !== null && typeof condition === 'object') {
      const { $in, $ne } = condition as Condition;
      if ($in && !$in.map(String).includes(String(value))) {
        return false;
      }
      if ($ne !== undefined && idKey($ne) === String(value)) {
        return false;
      }
      return true;
    }
    return String(value) === String(condition);
  });
}

const BLOCKING: AppointmentStatus[] = ['HELD', 'PROPOSED', 'CONFIRMED'];

/** Duplicate-key error in the shape the MongoDB driver produces. */
function duplicateKeyError(keyPattern: Record<string, number>): Error {
  return Object.assign(new Error('E11000 duplicate key error collection'), {
    code: 11000,
    keyPattern,
  });
}

/**
 * In-memory stand-in for the model, including the two unique indexes the
 * real collection carries — so "the write was rejected by the index" is a
 * real code path here and not a hand-waved mock.
 */
class FakeAppointmentModel {
  readonly docs: StoredAppointment[] = [];

  seed(doc: Omit<StoredAppointment, '_id'> & { _id?: string }): StoredAppointment {
    const stored: StoredAppointment = { ...doc, _id: doc._id ?? new Types.ObjectId().toHexString() };
    this.docs.push(stored);
    return stored;
  }

  find = vi.fn((filter: Record<string, unknown>) =>
    chain(this.docs.filter((doc) => matchesFilter(doc, filter))),
  );

  findOne = vi.fn((filter: Record<string, unknown>) =>
    chain(this.docs.find((doc) => matchesFilter(doc, filter)) ?? null),
  );

  findById = vi.fn((id: string) => chain(this.docs.find((doc) => doc._id === String(id)) ?? null));

  create = vi.fn(async (doc: Omit<StoredAppointment, '_id'>): Promise<StoredAppointment> => {
    const blocksSlot =
      this.docs.some(
        (existing) =>
          existing.doctorId === doc.doctorId &&
          existing.date === doc.date &&
          existing.startTime === doc.startTime &&
          BLOCKING.includes(existing.status),
      ) && BLOCKING.includes(doc.status);
    if (blocksSlot) {
      throw duplicateKeyError({ doctorId: 1, date: 1, startTime: 1 });
    }
    if (doc.idempotencyKey && this.docs.some((e) => e.idempotencyKey === doc.idempotencyKey)) {
      throw duplicateKeyError({ idempotencyKey: 1 });
    }
    return this.seed(doc);
  });

  findByIdAndUpdate = vi.fn((id: string, update: Partial<StoredAppointment>) => {
    const doc = this.docs.find((candidate) => candidate._id === String(id));
    if (doc) {
      Object.assign(doc, update);
    }
    return chain(doc ?? null);
  });

  findOneAndUpdate = vi.fn((filter: Record<string, unknown>, update: Partial<StoredAppointment>) => {
    const doc = this.docs.find((candidate) => matchesFilter(candidate, filter));
    if (doc) {
      Object.assign(doc, update);
    }
    return chain(doc ?? null);
  });
}

function doctor(overrides: Partial<Doctor> = {}): Doctor {
  return {
    id: 'DOC001',
    name: 'Dr Anita Rao',
    departmentId: 'DENTAL',
    specialization: 'Endodontics',
    status: 'ACTIVE',
    ...overrides,
  };
}

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'SCH1',
    doctorId: 'DOC001',
    dayOfWeek: 'MONDAY',
    startTime: '09:00',
    endTime: '12:00',
    slotDurationMinutes: 30,
    ...overrides,
  };
}

/** 2026-09-21 is a Monday; 2026-09-22 a Tuesday. */
const MONDAY = '2026-09-21';
const TUESDAY = '2026-09-22';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let model: FakeAppointmentModel;

  const doctors = {
    find: vi.fn(async (_query: FindDoctorsQuery): Promise<Doctor[]> => []),
    findById: vi.fn(async (_id: string): Promise<Doctor | null> => null),
    findManyByIds: vi.fn(async (_ids: string[]): Promise<Doctor[]> => []),
  };

  const schedules = {
    findByDoctorAndDay: vi.fn(async (_id: string, _day: DayOfWeek): Promise<Schedule[]> => []),
    findByDoctorsAndDay: vi.fn(async (_ids: string[], _day: DayOfWeek): Promise<Schedule[]> => []),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    model = new FakeAppointmentModel();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        // Mocked by DI token: a unit test never reaches a real Mongo
        // connection, nor a sibling module's collection.
        {
          provide: getModelToken(AppointmentEntity.name),
          useValue: model as unknown as Model<AppointmentDocument>,
        },
        { provide: DoctorsService, useValue: doctors },
        { provide: SchedulesService, useValue: schedules },
      ],
    }).compile();

    service = moduleRef.get(AppointmentsService);

    doctors.findById.mockResolvedValue(doctor());
    doctors.find.mockResolvedValue([doctor()]);
    schedules.findByDoctorAndDay.mockResolvedValue([schedule()]);
    schedules.findByDoctorsAndDay.mockResolvedValue([schedule()]);
  });

  describe('findAvailableSlots — slot generation', () => {
    it('divides the whole working window into slots', async () => {
      const slots = await service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY });

      expect(slots.map((slot) => slot.startTime)).toEqual([
        '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      ]);
      expect(slots[0]).toEqual({
        doctorId: 'DOC001',
        doctorName: 'Dr Anita Rao',
        departmentId: 'DENTAL',
        date: MONDAY,
        startTime: '09:00',
        endTime: '09:30',
      });
      // The 11:30 slot ends exactly on the window's end, and nothing runs past it.
      expect(slots.at(-1)?.endTime).toBe('12:00');
    });

    it('never emits a trailing slot that would run past the window', async () => {
      schedules.findByDoctorAndDay.mockResolvedValue([
        schedule({ startTime: '09:00', endTime: '09:50', slotDurationMinutes: 30 }),
      ]);

      const slots = await service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY });

      expect(slots.map((slot) => slot.startTime)).toEqual(['09:00']);
    });

    it('looks the schedule up for the weekday of the date asked for', async () => {
      await service.findAvailableSlots({ doctorId: 'DOC001', date: TUESDAY });

      expect(schedules.findByDoctorAndDay).toHaveBeenCalledWith('DOC001', 'TUESDAY');
    });

    it('returns nothing when the doctor does not work that day', async () => {
      schedules.findByDoctorAndDay.mockResolvedValue([]);

      await expect(
        service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY }),
      ).resolves.toEqual([]);
    });

    it('handles several windows in one day without offering an overlap twice', async () => {
      schedules.findByDoctorAndDay.mockResolvedValue([
        schedule({ id: 'SCH-AM', startTime: '09:00', endTime: '10:00' }),
        schedule({ id: 'SCH-PM', startTime: '09:30', endTime: '11:00' }),
      ]);

      const slots = await service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY });

      expect(slots.map((slot) => slot.startTime)).toEqual(['09:00', '09:30', '10:00', '10:30']);
    });

    it('skips a schedule with a nonsensical slot duration instead of looping forever', async () => {
      schedules.findByDoctorAndDay.mockResolvedValue([schedule({ slotDurationMinutes: 0 })]);

      await expect(
        service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY }),
      ).resolves.toEqual([]);
    });

    it('batches lookups across doctors rather than querying per doctor', async () => {
      const second = doctor({ id: 'DOC002', name: 'Dr Sam Vale' });
      doctors.find.mockResolvedValue([doctor(), second]);
      schedules.findByDoctorsAndDay.mockResolvedValue([
        schedule({ startTime: '09:00', endTime: '10:00' }),
        schedule({ id: 'SCH2', doctorId: 'DOC002', startTime: '09:00', endTime: '10:00' }),
      ]);

      const slots = await service.findAvailableSlots({ departmentId: 'DENTAL', date: MONDAY });

      expect(schedules.findByDoctorsAndDay).toHaveBeenCalledTimes(1);
      expect(schedules.findByDoctorsAndDay).toHaveBeenCalledWith(['DOC001', 'DOC002'], 'MONDAY');
      expect(schedules.findByDoctorAndDay).not.toHaveBeenCalled();
      // One appointments query for every candidate doctor, not one each.
      expect(model.find).toHaveBeenCalledTimes(1);
      // Sorted by time, then doctor, so the agent can offer the earliest first.
      expect(slots.map((slot) => `${slot.startTime} ${slot.doctorId}`)).toEqual([
        '09:00 DOC001', '09:00 DOC002', '09:30 DOC001', '09:30 DOC002',
      ]);
    });

    it('rejects a query that names neither a doctor nor a department', async () => {
      await expect(service.findAvailableSlots({ date: MONDAY })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a date that is not a real calendar date', async () => {
      await expect(
        service.findAvailableSlots({ doctorId: 'DOC001', date: '2026-02-30' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns nothing when the doctor is not in the department asked for', async () => {
      doctors.findById.mockResolvedValue(doctor({ departmentId: 'CARDIOLOGY' }));

      await expect(
        service.findAvailableSlots({ doctorId: 'DOC001', departmentId: 'DENTAL', date: MONDAY }),
      ).resolves.toEqual([]);
    });
  });

  describe('invariant: an ON_LEAVE doctor never appears in availability', () => {
    it('drops them even when asked for by id', async () => {
      doctors.findById.mockResolvedValue(doctor({ status: 'ON_LEAVE' }));

      const slots = await service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY });

      expect(slots).toEqual([]);
    });

    it('drops them even if the doctors module returns one for a bookable-only search', async () => {
      // Defence in depth: availability re-checks the status itself rather
      // than trusting `bookableOnly` to have been honoured.
      doctors.find.mockResolvedValue([doctor({ status: 'ON_LEAVE' }), doctor({ id: 'DOC002' })]);
      const bothWindows = [
        schedule({ startTime: '09:00', endTime: '10:00' }),
        schedule({ id: 'SCH2', doctorId: 'DOC002', startTime: '09:00', endTime: '10:00' }),
      ];
      schedules.findByDoctorsAndDay.mockResolvedValue(bothWindows);
      schedules.findByDoctorAndDay.mockResolvedValue(bothWindows);

      const slots = await service.findAvailableSlots({ departmentId: 'DENTAL', date: MONDAY });

      expect(doctors.find).toHaveBeenCalledWith({ departmentId: 'DENTAL', bookableOnly: true });
      expect(slots.every((slot) => slot.doctorId === 'DOC002')).toBe(true);
      expect(slots).toHaveLength(2);
    });
  });

  describe('invariant: a booked slot is excluded, a cancelled one is offered again', () => {
    it('excludes slots held by a blocking appointment', async () => {
      model.seed({
        patientId: 'PAT-1', doctorId: 'DOC001', date: MONDAY,
        startTime: '10:00', endTime: '10:30', status: 'CONFIRMED',
      });
      model.seed({
        patientId: 'PAT-2', doctorId: 'DOC001', date: MONDAY,
        startTime: '11:00', endTime: '11:30', status: 'HELD',
      });

      const slots = await service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY });

      expect(slots.map((slot) => slot.startTime)).toEqual(['09:00', '09:30', '10:30', '11:30']);
    });

    it('offers a cancelled or expired slot again', async () => {
      model.seed({
        patientId: 'PAT-1', doctorId: 'DOC001', date: MONDAY,
        startTime: '10:00', endTime: '10:30', status: 'CANCELLED',
      });
      model.seed({
        patientId: 'PAT-2', doctorId: 'DOC001', date: MONDAY,
        startTime: '11:00', endTime: '11:30', status: 'EXPIRED',
      });

      const slots = await service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY });

      expect(slots.map((slot) => slot.startTime)).toContain('10:00');
      expect(slots.map((slot) => slot.startTime)).toContain('11:00');
    });

    it('does not let another day or another doctor block the slot', async () => {
      model.seed({
        patientId: 'PAT-1', doctorId: 'DOC001', date: TUESDAY,
        startTime: '10:00', endTime: '10:30', status: 'CONFIRMED',
      });
      model.seed({
        patientId: 'PAT-2', doctorId: 'DOC002', date: MONDAY,
        startTime: '11:00', endTime: '11:30', status: 'CONFIRMED',
      });

      const slots = await service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY });

      expect(slots).toHaveLength(6);
    });
  });

  describe('after / before boundaries', () => {
    // Decision, exercised by these tests: `after` is inclusive and
    // `before` is exclusive, both compared against the slot's start time.
    // "From 10:00" has to include the 10:00 slot, and "before 11:00" has
    // to mean the patient is out by 11:00.
    it('includes a slot starting exactly at `after`', async () => {
      const slots = await service.findAvailableSlots({
        doctorId: 'DOC001', date: MONDAY, after: '10:00',
      });

      expect(slots.map((slot) => slot.startTime)).toEqual(['10:00', '10:30', '11:00', '11:30']);
    });

    it('excludes a slot starting exactly at `before`', async () => {
      const slots = await service.findAvailableSlots({
        doctorId: 'DOC001', date: MONDAY, before: '11:00',
      });

      expect(slots.map((slot) => slot.startTime)).toEqual(['09:00', '09:30', '10:00', '10:30']);
    });

    it('applies both bounds together', async () => {
      const slots = await service.findAvailableSlots({
        doctorId: 'DOC001', date: MONDAY, after: '10:00', before: '11:00',
      });

      expect(slots.map((slot) => slot.startTime)).toEqual(['10:00', '10:30']);
    });

    it('returns nothing when the bounds cross', async () => {
      await expect(
        service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY, after: '11:00', before: '10:00' }),
      ).resolves.toEqual([]);
    });

    it('rejects a malformed bound rather than silently ignoring it', async () => {
      await expect(
        service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY, after: '9am' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('book', () => {
    const request: BookAppointmentRequest = {
      patientId: 'PAT-1',
      doctorId: 'DOC001',
      date: MONDAY,
      startTime: '10:00',
      confirmed: true,
    };

    it('books a confirmed slot and stores the slot end from the schedule', async () => {
      const appointment = await service.book(request);

      expect(appointment).toMatchObject({
        patientId: 'PAT-1',
        doctorId: 'DOC001',
        date: MONDAY,
        startTime: '10:00',
        endTime: '10:30',
        status: 'CONFIRMED',
      });
      expect(appointment.id).toBeTruthy();
      // A contract object, never a Mongoose document.
      expect(appointment).not.toHaveProperty('_id');
    });

    it('invariant: rejects a booking that was not confirmed by the patient', async () => {
      await expect(service.book({ ...request, confirmed: false })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(model.create).not.toHaveBeenCalled();
    });

    it('re-checks availability at commit time and refuses a slot taken since it was offered', async () => {
      model.seed({
        patientId: 'PAT-9', doctorId: 'DOC001', date: MONDAY,
        startTime: '10:00', endTime: '10:30', status: 'CONFIRMED',
      });

      await expect(service.book(request)).rejects.toBeInstanceOf(ConflictException);
      expect(model.create).not.toHaveBeenCalled();
    });

    it('invariant: a slot taken between the re-check and the insert is a conflict, not a double booking', async () => {
      // The race the re-check cannot win: the competing booking lands
      // after this one read availability. The unique index rejects the
      // insert, and that rejection — not the stale read — is what decides.
      const taken = {
        patientId: 'PAT-9', doctorId: 'DOC001', date: MONDAY,
        startTime: '10:00', endTime: '10:30', status: 'CONFIRMED' as AppointmentStatus,
      };
      model.find.mockReturnValueOnce(chain([])); // stale availability read
      model.seed(taken);

      await expect(service.book(request)).rejects.toBeInstanceOf(ConflictException);
      expect(model.create).toHaveBeenCalledTimes(1);
      expect(model.docs.filter((doc) => doc.startTime === '10:00')).toHaveLength(1);
    });

    it('surfaces a conflict message the agent can act on', async () => {
      model.find.mockReturnValueOnce(chain([]));
      model.seed({
        patientId: 'PAT-9', doctorId: 'DOC001', date: MONDAY,
        startTime: '10:00', endTime: '10:30', status: 'CONFIRMED',
      });

      await expect(service.book(request)).rejects.toThrow(/taken while this booking was being confirmed/);
    });

    it('rejects a booking for an unknown doctor with a not-found, not a conflict', async () => {
      doctors.findById.mockResolvedValue(null);

      await expect(service.book(request)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('invariant: refuses to book an ON_LEAVE doctor even at commit time', async () => {
      doctors.findById.mockResolvedValue(doctor({ status: 'ON_LEAVE' }));

      await expect(service.book(request)).rejects.toBeInstanceOf(ConflictException);
      expect(model.create).not.toHaveBeenCalled();
    });

    it('refuses a time that is outside the doctor\'s schedule', async () => {
      await expect(service.book({ ...request, startTime: '15:00' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('invariant: the same idempotencyKey twice yields one appointment', async () => {
      const first = await service.book({ ...request, idempotencyKey: 'session-abc-1' });
      const second = await service.book({ ...request, idempotencyKey: 'session-abc-1' });

      expect(second).toEqual(first);
      expect(model.create).toHaveBeenCalledTimes(1);
      expect(model.docs).toHaveLength(1);
    });

    it('resolves a concurrent retry of the same key to the original appointment', async () => {
      // Both attempts read "no such key" before either inserted; the
      // unique index on idempotencyKey settles it, and the loser returns
      // the winner's appointment rather than an error.
      const first = await service.book({ ...request, idempotencyKey: 'session-abc-2' });
      // Both attempts saw an empty idempotency lookup and free availability
      // before either insert landed.
      model.findOne.mockReturnValueOnce(chain(null));
      model.find.mockReturnValueOnce(chain([]));

      const second = await service.book({ ...request, idempotencyKey: 'session-abc-2' });

      expect(second).toEqual(first);
      expect(model.docs).toHaveLength(1);
    });

    it('does not swallow an unrelated database failure as a conflict', async () => {
      model.create.mockRejectedValueOnce(new Error('connection reset'));

      await expect(service.book(request)).rejects.toThrow('connection reset');
    });
  });

  describe('findById / getById / findByDoctorAndDate', () => {
    it('maps _id to id and returns a plain contract object', async () => {
      const stored = model.seed({
        patientId: 'PAT-1', doctorId: 'DOC001', date: MONDAY,
        startTime: '09:00', endTime: '09:30', status: 'CONFIRMED',
      });

      await expect(service.findById(stored._id)).resolves.toEqual({
        id: stored._id,
        patientId: 'PAT-1',
        doctorId: 'DOC001',
        date: MONDAY,
        startTime: '09:00',
        endTime: '09:30',
        status: 'CONFIRMED',
      });
    });

    it('returns null for a malformed id instead of throwing a cast error', async () => {
      await expect(service.findById('not-an-id')).resolves.toBeNull();
      expect(model.findById).not.toHaveBeenCalled();
    });

    it('getById throws NotFound for an unknown appointment', async () => {
      await expect(service.getById(new Types.ObjectId().toHexString())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns a doctor\'s day earliest first, including cancelled rows', async () => {
      model.seed({
        patientId: 'PAT-2', doctorId: 'DOC001', date: MONDAY,
        startTime: '11:00', endTime: '11:30', status: 'CONFIRMED',
      });
      model.seed({
        patientId: 'PAT-1', doctorId: 'DOC001', date: MONDAY,
        startTime: '09:00', endTime: '09:30', status: 'CANCELLED',
      });
      model.seed({
        patientId: 'PAT-3', doctorId: 'DOC002', date: MONDAY,
        startTime: '10:00', endTime: '10:30', status: 'CONFIRMED',
      });

      const day = await service.findByDoctorAndDate('DOC001', MONDAY);

      expect(day.map((appointment) => appointment.patientId)).toEqual(['PAT-2', 'PAT-1']);
      expect(model.find).toHaveBeenCalledWith({ doctorId: 'DOC001', date: MONDAY });
    });
  });

  describe('cancel', () => {
    it('frees the slot, which then shows up in availability again', async () => {
      const booked = await service.book({
        patientId: 'PAT-1', doctorId: 'DOC001', date: MONDAY, startTime: '10:00', confirmed: true,
      });

      const cancelled = await service.cancel(booked.id);

      expect(cancelled.status).toBe('CANCELLED');
      const slots = await service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY });
      expect(slots.map((slot) => slot.startTime)).toContain('10:00');
    });

    it('is idempotent', async () => {
      const booked = await service.book({
        patientId: 'PAT-1', doctorId: 'DOC001', date: MONDAY, startTime: '10:00', confirmed: true,
      });
      await service.cancel(booked.id);
      model.findByIdAndUpdate.mockClear();

      await expect(service.cancel(booked.id)).resolves.toMatchObject({ status: 'CANCELLED' });
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses to cancel a completed appointment', async () => {
      const stored = model.seed({
        patientId: 'PAT-1', doctorId: 'DOC001', date: MONDAY,
        startTime: '09:00', endTime: '09:30', status: 'COMPLETED',
      });

      await expect(service.cancel(stored._id)).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFound for an unknown appointment', async () => {
      await expect(service.cancel(new Types.ObjectId().toHexString())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reschedule', () => {
    it('moves an appointment to a free slot and frees the old one', async () => {
      const booked = await service.book({
        patientId: 'PAT-1', doctorId: 'DOC001', date: MONDAY, startTime: '10:00', confirmed: true,
      });

      const moved = await service.reschedule(booked.id, MONDAY, '11:00');

      expect(moved).toMatchObject({ date: MONDAY, startTime: '11:00', endTime: '11:30' });
      const slots = await service.findAvailableSlots({ doctorId: 'DOC001', date: MONDAY });
      expect(slots.map((slot) => slot.startTime)).toEqual([
        '09:00', '09:30', '10:00', '10:30', '11:30',
      ]);
    });

    it('does not treat the appointment\'s own slot as taken', async () => {
      const booked = await service.book({
        patientId: 'PAT-1', doctorId: 'DOC001', date: MONDAY, startTime: '10:00', confirmed: true,
      });
      schedules.findByDoctorAndDay.mockResolvedValue([schedule({ dayOfWeek: 'TUESDAY' })]);

      // Same time, different day: the row being moved must not block itself.
      await expect(service.reschedule(booked.id, TUESDAY, '10:00')).resolves.toMatchObject({
        date: TUESDAY,
        startTime: '10:00',
      });
    });

    it('refuses to move onto a slot someone else holds', async () => {
      const booked = await service.book({
        patientId: 'PAT-1', doctorId: 'DOC001', date: MONDAY, startTime: '10:00', confirmed: true,
      });
      model.seed({
        patientId: 'PAT-2', doctorId: 'DOC001', date: MONDAY,
        startTime: '11:00', endTime: '11:30', status: 'CONFIRMED',
      });

      await expect(service.reschedule(booked.id, MONDAY, '11:00')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('is a no-op when the slot is unchanged', async () => {
      const booked = await service.book({
        patientId: 'PAT-1', doctorId: 'DOC001', date: MONDAY, startTime: '10:00', confirmed: true,
      });
      model.findOneAndUpdate.mockClear();

      await expect(service.reschedule(booked.id, MONDAY, '10:00')).resolves.toEqual(booked);
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses to reschedule a cancelled appointment', async () => {
      const booked = await service.book({
        patientId: 'PAT-1', doctorId: 'DOC001', date: MONDAY, startTime: '10:00', confirmed: true,
      });
      await service.cancel(booked.id);

      await expect(service.reschedule(booked.id, MONDAY, '11:00')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws NotFound for an unknown appointment', async () => {
      await expect(
        service.reschedule(new Types.ObjectId().toHexString(), MONDAY, '11:00'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
