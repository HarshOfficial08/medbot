import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PatientsController } from './patients.controller.js';
import { PatientsService } from './patients.service.js';
import type { Patient } from './patients.types.js';

describe('PatientsController', () => {
  let controller: PatientsController;
  const service = {
    findById: vi.fn(),
    findByPhone: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };

  const ada: Patient = { id: 'PAT001', name: 'Ada Lovelace', gender: 'female' };

  beforeEach(async () => {
    vi.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [PatientsController],
      providers: [{ provide: PatientsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(PatientsController);
  });

  it('translates a missing patient into a 404 on read', async () => {
    service.findById.mockResolvedValue(null);

    await expect(controller.findById('PAT999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('translates a missing patient into a 404 on update', async () => {
    service.update.mockResolvedValue(null);

    await expect(controller.update('PAT999', { age: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('never quotes a stored field back in the error message', async () => {
    service.findById.mockResolvedValue(null);

    // The 404 body reaches logs and the audit trail; patient fields are
    // PHI, so only the id already present in the request path is echoed.
    await expect(controller.findById('PAT999')).rejects.toThrow(
      "Patient 'PAT999' not found.",
    );
  });

  it('looks patients up by the phone number in the query', async () => {
    service.findByPhone.mockResolvedValue([ada]);

    await expect(controller.findByPhone({ phone: '5550134' })).resolves.toEqual([
      ada,
    ]);
    expect(service.findByPhone).toHaveBeenCalledWith('5550134');
  });

  it('hands the validated body straight to the service on create', async () => {
    service.create.mockResolvedValue(ada);

    await expect(
      controller.create({ name: 'Ada Lovelace', gender: 'female' }),
    ).resolves.toEqual(ada);
    expect(service.create).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      gender: 'female',
    });
  });
});
