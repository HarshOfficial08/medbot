import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { DepartmentEntity } from './departments.schema.js';
import { DepartmentsService } from './departments.service.js';

type Row = { _id: string; name: string; active: boolean };

/** Stands in for the `find(...).sort(...).lean().exec()` chain. */
function findChain(rows: Row[]) {
  return {
    sort: vi.fn().mockReturnValue({
      lean: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(rows) }),
    }),
  };
}

function findByIdChain(row: Row | null) {
  return {
    lean: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(row) }),
  };
}

describe('DepartmentsService', () => {
  let service: DepartmentsService;
  let model: { find: ReturnType<typeof vi.fn>; findById: ReturnType<typeof vi.fn> };

  const dental: Row = { _id: 'DENTAL', name: 'Dental', active: true };
  const retired: Row = { _id: 'PODIATRY', name: 'Podiatry', active: false };

  beforeEach(async () => {
    model = { find: vi.fn(), findById: vi.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        { provide: getModelToken(DepartmentEntity.name), useValue: model },
      ],
    }).compile();

    service = moduleRef.get(DepartmentsService);
  });

  it('returns every department by default', async () => {
    model.find.mockReturnValue(findChain([dental, retired]));

    const departments = await service.findAll();

    expect(model.find).toHaveBeenCalledWith({});
    expect(departments).toEqual([
      { id: 'DENTAL', name: 'Dental', active: true },
      { id: 'PODIATRY', name: 'Podiatry', active: false },
    ]);
  });

  it('filters to active departments when asked', async () => {
    model.find.mockReturnValue(findChain([dental]));

    const departments = await service.findAll(true);

    // The filter must reach Mongo, not be applied in memory after
    // reading the whole collection.
    expect(model.find).toHaveBeenCalledWith({ active: true });
    expect(departments).toHaveLength(1);
  });

  it('returns plain contracts, never Mongoose documents', async () => {
    model.findById.mockReturnValue(findByIdChain(dental));

    const department = await service.findById('DENTAL');

    // Architecture rule 4: nothing crosses a module boundary as a
    // document, so `_id` must have become `id`.
    expect(department).toEqual({ id: 'DENTAL', name: 'Dental', active: true });
    expect(department).not.toHaveProperty('_id');
  });

  it('answers null for an unknown id rather than throwing', async () => {
    model.findById.mockReturnValue(findByIdChain(null));

    // "Missing" is an ordinary answer here; only the controller turns it
    // into a 404.
    await expect(service.findById('NOPE')).resolves.toBeNull();
  });

  it('sorts by id so repeated reads are stable', async () => {
    const chain = findChain([dental]);
    model.find.mockReturnValue(chain);

    await service.findAll();

    expect(chain.sort).toHaveBeenCalledWith({ _id: 1 });
  });
});
