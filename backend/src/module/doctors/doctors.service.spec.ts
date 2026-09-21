import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { DoctorEntity } from './doctors.schema.js';
import { DoctorsService } from './doctors.service.js';
import type { DoctorStatus } from './doctors.types.js';

interface DoctorRow {
  _id: string;
  name: string;
  departmentId: string;
  specialization: string;
  status: DoctorStatus;
}

/** One doctor per status, plus a second department to leak from. */
const ROSTER: DoctorRow[] = [
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

type FilterValue = string | { $in?: readonly unknown[] };

/** Minimal Mongo filter matcher: equality and `$in`, which is all the service emits. */
function matches(row: DoctorRow, filter: Record<string, FilterValue>): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    const actual = row[key as keyof DoctorRow];

    if (typeof condition === 'object' && condition !== null && '$in' in condition) {
      return (condition.$in ?? []).includes(actual);
    }

    return actual === condition;
  });
}

/**
 * A fake model that actually applies the filter, so the tests assert the
 * observable outcome ("an ON_LEAVE doctor is not offered") rather than
 * the shape of a query object.
 */
function createModel(rows: DoctorRow[] = ROSTER) {
  return {
    find: vi.fn((filter: Record<string, FilterValue> = {}) => ({
      sort: () => ({
        lean: () => ({ exec: async () => rows.filter((row) => matches(row, filter)) }),
      }),
    })),
    findById: vi.fn((id: string) => ({
      lean: () => ({ exec: async () => rows.find((row) => row._id === id) ?? null }),
    })),
  };
}

async function createService(model: ReturnType<typeof createModel>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      DoctorsService,
      { provide: getModelToken(DoctorEntity.name), useValue: model },
    ],
  }).compile();

  return moduleRef.get(DoctorsService);
}

describe('DoctorsService', () => {
  let model: ReturnType<typeof createModel>;
  let service: DoctorsService;

  beforeEach(async () => {
    model = createModel();
    service = await createService(model);
  });

  describe('bookableOnly', () => {
    it('excludes an ON_LEAVE doctor', async () => {
      // The invariant this whole flag exists for: the agent must never
      // offer a slot with a doctor who is not there.
      const doctors = await service.find({ bookableOnly: true });

      expect(doctors.map((doctor) => doctor.id)).not.toContain('DOC002');
    });

    it('excludes BUSY and OFFLINE doctors too, leaving only ACTIVE', async () => {
      const doctors = await service.find({ bookableOnly: true });

      expect(doctors.map((doctor) => doctor.id).sort()).toEqual(['DOC001', 'DOC005']);
      expect(doctors.every((doctor) => doctor.status === 'ACTIVE')).toBe(true);
    });

    it('returns every status when the flag is absent or false', async () => {
      // Proves the exclusion above is the flag's doing, not the fixture's.
      await expect(service.find()).resolves.toHaveLength(ROSTER.length);
      await expect(service.find({ bookableOnly: false })).resolves.toHaveLength(
        ROSTER.length,
      );
    });

    it('returns nothing when bookableOnly contradicts an explicit status', async () => {
      // Fails closed: "bookable, but ON_LEAVE" is empty, never everyone.
      const doctors = await service.find({ bookableOnly: true, status: 'ON_LEAVE' });

      expect(doctors).toEqual([]);
    });
  });

  describe('departmentId', () => {
    it('does not leak doctors from another department', async () => {
      const doctors = await service.find({ departmentId: 'DENTAL' });

      expect(doctors).toHaveLength(4);
      expect(doctors.every((doctor) => doctor.departmentId === 'DENTAL')).toBe(true);
      expect(doctors.map((doctor) => doctor.id)).not.toContain('DOC005');
    });

    it('combines with bookableOnly rather than overriding it', async () => {
      const doctors = await service.find({ departmentId: 'DENTAL', bookableOnly: true });

      expect(doctors.map((doctor) => doctor.id)).toEqual(['DOC001']);
    });
  });

  it('filters by an explicit status', async () => {
    const doctors = await service.find({ status: 'ON_LEAVE' });

    expect(doctors.map((doctor) => doctor.id)).toEqual(['DOC002']);
  });

  it('returns plain contracts, never Mongoose documents', async () => {
    // CLAUDE.md architecture rule 4 — appointments consumes these.
    const [doctor] = await service.find({ departmentId: 'CARDIOLOGY' });

    expect(doctor).toEqual({
      id: 'DOC005',
      name: 'Dr. Eve Lindqvist',
      departmentId: 'CARDIOLOGY',
      specialization: 'Electrophysiology',
      status: 'ACTIVE',
    });
    expect(doctor).not.toHaveProperty('_id');
  });

  describe('findById', () => {
    it('maps _id onto id', async () => {
      const doctor = await service.findById('DOC001');

      expect(doctor?.id).toBe('DOC001');
      expect(doctor).not.toHaveProperty('_id');
    });

    it('returns null for an unknown doctor rather than throwing', async () => {
      await expect(service.findById('DOC404')).resolves.toBeNull();
    });
  });

  describe('findManyByIds', () => {
    it('resolves a whole slate in a single query, not one per doctor', async () => {
      const doctors = await service.findManyByIds(['DOC001', 'DOC002', 'DOC005']);

      expect(doctors.map((doctor) => doctor.id).sort()).toEqual([
        'DOC001',
        'DOC002',
        'DOC005',
      ]);
      // The point of the batch method: no N+1 from the availability engine.
      expect(model.find).toHaveBeenCalledTimes(1);
    });

    it('de-duplicates ids', async () => {
      const doctors = await service.findManyByIds(['DOC001', 'DOC001']);

      expect(doctors).toHaveLength(1);
      expect(model.find).toHaveBeenCalledWith({ _id: { $in: ['DOC001'] } });
    });

    it('skips the round trip entirely for an empty id list', async () => {
      await expect(service.findManyByIds([])).resolves.toEqual([]);
      expect(model.find).not.toHaveBeenCalled();
    });

    it('silently drops ids that do not exist', async () => {
      const doctors = await service.findManyByIds(['DOC001', 'DOC404']);

      expect(doctors.map((doctor) => doctor.id)).toEqual(['DOC001']);
    });
  });
});
