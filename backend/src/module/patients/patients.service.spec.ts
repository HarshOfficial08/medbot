import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PatientEntity } from './patients.schema.js';
import { PatientsService } from './patients.service.js';

interface Row {
  _id: string;
  name: string;
  gender: string;
  age?: number;
  phone?: string;
}

/** A duplicate-key error the way the driver raises it. */
function duplicateKeyError(): Error & { code: number } {
  return Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
}

describe('PatientsService', () => {
  let service: PatientsService;
  let model: {
    findById: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findByIdAndUpdate: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };

  /** Highest existing sequence number, as the $max aggregation reports it. */
  function existingMaxSequence(maxSequence: number | null): void {
    model.aggregate.mockReturnValue({
      exec: vi
        .fn()
        .mockResolvedValue(maxSequence === null ? [] : [{ maxSequence }]),
    });
  }

  /** `create` echoes what it was given back as a document. */
  function createEchoes(): void {
    model.create.mockImplementation(async (write: Row) => ({
      toObject: () => ({ ...write }),
    }));
  }

  beforeEach(async () => {
    model = {
      findById: vi.fn(),
      find: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: getModelToken(PatientEntity.name), useValue: model },
      ],
    }).compile();

    service = moduleRef.get(PatientsService);
  });

  describe('findById', () => {
    it('maps _id to id and returns a plain contract', async () => {
      model.findById.mockReturnValue({
        lean: () => ({
          exec: async (): Promise<Row> => ({
            _id: 'PAT001',
            name: 'Ada Lovelace',
            gender: 'female',
            age: 36,
          }),
        }),
      });

      const patient = await service.findById('PAT001');

      expect(patient).toEqual({
        id: 'PAT001',
        name: 'Ada Lovelace',
        gender: 'female',
        age: 36,
      });
      // Architecture rule 4 — no document ever leaves this module.
      expect(patient).not.toHaveProperty('_id');
    });

    it('answers null for an unknown id rather than throwing', async () => {
      model.findById.mockReturnValue({
        lean: () => ({ exec: async () => null }),
      });

      await expect(service.findById('PAT999')).resolves.toBeNull();
    });
  });

  describe('findByPhone', () => {
    it('returns every patient on the number, not just the first', async () => {
      const sort = vi.fn().mockReturnValue({
        lean: () => ({
          exec: async (): Promise<Row[]> => [
            { _id: 'PAT001', name: 'Ada', gender: 'female', phone: '5550134' },
            { _id: 'PAT002', name: 'Byron', gender: 'male', phone: '5550134' },
          ],
        }),
      });
      model.find.mockReturnValue({ sort });

      const patients = await service.findByPhone('5550134');

      expect(model.find).toHaveBeenCalledWith({ phone: '5550134' });
      // A household can share a number; collapsing to one match would
      // make the agent assume the wrong caller.
      expect(patients.map((patient) => patient.id)).toEqual(['PAT001', 'PAT002']);
    });
  });

  describe('create', () => {
    it('starts at PAT001 on an empty collection', async () => {
      existingMaxSequence(null);
      createEchoes();

      const patient = await service.create({ name: 'Ada Lovelace' });

      expect(patient.id).toBe('PAT001');
    });

    it('continues the sequence from the highest existing id', async () => {
      existingMaxSequence(3);
      createEchoes();

      const patient = await service.create({ name: 'Ada Lovelace' });

      expect(patient.id).toBe('PAT004');
    });

    it('keeps growing past the zero-padded width', async () => {
      // The reason the id is computed numerically: as strings "PAT999"
      // sorts above "PAT1000", so a lexicographic max would reissue
      // taken ids here.
      existingMaxSequence(999);
      createEchoes();

      const patient = await service.create({ name: 'Ada Lovelace' });

      expect(patient.id).toBe('PAT1000');
    });

    it('never invents an age or a phone that was not supplied', async () => {
      existingMaxSequence(null);
      createEchoes();

      const patient = await service.create({ name: 'Ada Lovelace' });

      // Absent must stay absent — not null, not zero, not an empty
      // string (plan section 42).
      const written = model.create.mock.calls[0][0] as Record<string, unknown>;
      expect(written).not.toHaveProperty('age');
      expect(written).not.toHaveProperty('phone');
      expect(patient).not.toHaveProperty('age');
      expect(patient).not.toHaveProperty('phone');
    });

    it("records gender as 'unknown' when it was not given", async () => {
      existingMaxSequence(null);
      createEchoes();

      const patient = await service.create({ name: 'Ada Lovelace' });

      // 'unknown' is the contract's explicit "we were not told" marker,
      // which is not the same as guessing a value.
      expect(patient.gender).toBe('unknown');
    });

    it('persists the optional fields that were supplied', async () => {
      existingMaxSequence(null);
      createEchoes();

      const patient = await service.create({
        name: 'Ada Lovelace',
        age: 36,
        gender: 'female',
        phone: '+1 555 0134',
      });

      expect(patient).toEqual({
        id: 'PAT001',
        name: 'Ada Lovelace',
        age: 36,
        gender: 'female',
        phone: '+1 555 0134',
      });
    });

    it('retries with a fresh id when it loses the race for one', async () => {
      // Two writers can generate the same id concurrently; the loser
      // must recompute rather than fail the patient's registration.
      existingMaxSequence(1);
      model.create
        .mockRejectedValueOnce(duplicateKeyError())
        .mockImplementationOnce(async (write: Row) => ({
          toObject: () => ({ ...write }),
        }));

      const patient = await service.create({ name: 'Ada Lovelace' });

      expect(model.create).toHaveBeenCalledTimes(2);
      expect(patient.id).toBe('PAT002');
    });

    it('rethrows anything that is not a duplicate id', async () => {
      existingMaxSequence(null);
      model.create.mockRejectedValue(new Error('mongo unreachable'));

      await expect(service.create({ name: 'Ada' })).rejects.toThrow(
        'mongo unreachable',
      );
      expect(model.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('sets only the fields supplied', async () => {
      model.findByIdAndUpdate.mockReturnValue({
        lean: () => ({
          exec: async (): Promise<Row> => ({
            _id: 'PAT001',
            name: 'Ada Lovelace',
            gender: 'female',
            age: 37,
          }),
        }),
      });

      const patient = await service.update('PAT001', { age: 37 });

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'PAT001',
        { $set: { age: 37 } },
        expect.objectContaining({ returnDocument: 'after' }),
      );
      expect(patient?.age).toBe(37);
    });

    it('does not write at all when there is nothing to change', async () => {
      model.findById.mockReturnValue({
        lean: () => ({
          exec: async (): Promise<Row> => ({
            _id: 'PAT001',
            name: 'Ada',
            gender: 'unknown',
          }),
        }),
      });

      await service.update('PAT001', {});

      // A no-op write would only bump updatedAt and read as a real edit
      // in the audit trail.
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('answers null when the patient does not exist', async () => {
      model.findByIdAndUpdate.mockReturnValue({
        lean: () => ({ exec: async () => null }),
      });

      await expect(service.update('PAT999', { age: 1 })).resolves.toBeNull();
    });
  });
});
