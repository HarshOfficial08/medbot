import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ScheduleEntity } from './schedules.schema.js';
import { SchedulesService } from './schedules.service.js';
import type { DayOfWeek } from './schedules.types.js';

interface ScheduleRow {
  /** Stands in for an ObjectId: only `toString()` is guaranteed. */
  _id: { toString(): string };
  doctorId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
}

function oid(value: string): { toString(): string } {
  return { toString: () => value };
}

const ROWS: ScheduleRow[] = [
  {
    _id: oid('sch-1'),
    doctorId: 'DOC001',
    dayOfWeek: 'MONDAY',
    startTime: '09:00',
    endTime: '12:00',
    slotDurationMinutes: 30,
  },
  {
    _id: oid('sch-2'),
    doctorId: 'DOC001',
    dayOfWeek: 'MONDAY',
    startTime: '14:00',
    endTime: '17:00',
    slotDurationMinutes: 30,
  },
  {
    _id: oid('sch-3'),
    doctorId: 'DOC001',
    dayOfWeek: 'TUESDAY',
    startTime: '09:00',
    endTime: '17:00',
    slotDurationMinutes: 20,
  },
  {
    _id: oid('sch-4'),
    doctorId: 'DOC002',
    dayOfWeek: 'MONDAY',
    startTime: '10:00',
    endTime: '13:00',
    slotDurationMinutes: 15,
  },
  {
    _id: oid('sch-5'),
    doctorId: 'DOC003',
    dayOfWeek: 'SATURDAY',
    startTime: '08:00',
    endTime: '11:00',
    slotDurationMinutes: 30,
  },
];

type FilterValue = string | { $in?: readonly unknown[] };

/** Minimal Mongo filter matcher: equality and `$in`, all the service emits. */
function matches(row: ScheduleRow, filter: Record<string, FilterValue>): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    const actual = row[key as keyof ScheduleRow];

    if (typeof condition === 'object' && condition !== null && '$in' in condition) {
      return (condition.$in ?? []).includes(actual);
    }

    return actual === condition;
  });
}

function createModel(rows: ScheduleRow[] = ROWS) {
  return {
    find: vi.fn((filter: Record<string, FilterValue> = {}) => ({
      sort: () => ({
        lean: () => ({ exec: async () => rows.filter((row) => matches(row, filter)) }),
      }),
    })),
    create: vi.fn(async (input: Record<string, unknown>) => ({
      toObject: () => ({ _id: oid('sch-new'), ...input }),
    })),
  };
}

async function createService(model: ReturnType<typeof createModel>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      SchedulesService,
      { provide: getModelToken(ScheduleEntity.name), useValue: model },
    ],
  }).compile();

  return moduleRef.get(SchedulesService);
}

describe('SchedulesService', () => {
  let model: ReturnType<typeof createModel>;
  let service: SchedulesService;

  beforeEach(async () => {
    model = createModel();
    service = await createService(model);
  });

  describe('findByDoctor', () => {
    it("returns only that doctor's windows", async () => {
      const schedules = await service.findByDoctor('DOC001');

      expect(schedules).toHaveLength(3);
      expect(schedules.every((schedule) => schedule.doctorId === 'DOC001')).toBe(true);
    });

    it('returns plain contracts with a string id, never Mongoose documents', async () => {
      const [schedule] = await service.findByDoctor('DOC002');

      expect(schedule).toEqual({
        id: 'sch-4',
        doctorId: 'DOC002',
        dayOfWeek: 'MONDAY',
        startTime: '10:00',
        endTime: '13:00',
        slotDurationMinutes: 15,
      });
      // The ObjectId is stringified at the boundary, so no caller needs
      // mongoose to read a schedule (CLAUDE.md architecture rule 4).
      expect(typeof schedule.id).toBe('string');
      expect(schedule).not.toHaveProperty('_id');
    });

    it('is empty for a doctor with no schedules, rather than throwing', async () => {
      await expect(service.findByDoctor('DOC404')).resolves.toEqual([]);
    });
  });

  describe('findByDoctorAndDay', () => {
    it('narrows to one weekday', async () => {
      const schedules = await service.findByDoctorAndDay('DOC001', 'MONDAY');

      expect(schedules.map((schedule) => schedule.id)).toEqual(['sch-1', 'sch-2']);
    });

    it('does not return another doctor working that day', async () => {
      const schedules = await service.findByDoctorAndDay('DOC001', 'MONDAY');

      expect(schedules.map((schedule) => schedule.id)).not.toContain('sch-4');
    });

    it('is empty on a day the doctor does not work', async () => {
      await expect(service.findByDoctorAndDay('DOC001', 'SUNDAY')).resolves.toEqual([]);
    });
  });

  describe('findByDoctorsAndDay', () => {
    it('fetches every candidate doctor in one query, not one per doctor', async () => {
      const schedules = await service.findByDoctorsAndDay(
        ['DOC001', 'DOC002', 'DOC003'],
        'MONDAY',
      );

      expect(schedules.map((schedule) => schedule.id)).toEqual([
        'sch-1',
        'sch-2',
        'sch-4',
      ]);
      // The reason this method exists: no N+1 from the availability engine.
      expect(model.find).toHaveBeenCalledTimes(1);
    });

    it('de-duplicates doctor ids', async () => {
      await service.findByDoctorsAndDay(['DOC001', 'DOC001'], 'MONDAY');

      expect(model.find).toHaveBeenCalledWith({
        doctorId: { $in: ['DOC001'] },
        dayOfWeek: 'MONDAY',
      });
    });

    it('skips the round trip entirely for an empty doctor list', async () => {
      await expect(service.findByDoctorsAndDay([], 'MONDAY')).resolves.toEqual([]);
      expect(model.find).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('persists the window and returns it as a contract', async () => {
      const created = await service.create({
        doctorId: 'DOC009',
        dayOfWeek: 'FRIDAY',
        startTime: '09:00',
        endTime: '17:00',
        slotDurationMinutes: 30,
      });

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: 'DOC009', dayOfWeek: 'FRIDAY' }),
      );
      expect(created).toEqual({
        id: 'sch-new',
        doctorId: 'DOC009',
        dayOfWeek: 'FRIDAY',
        startTime: '09:00',
        endTime: '17:00',
        slotDurationMinutes: 30,
      });
    });
  });
});
