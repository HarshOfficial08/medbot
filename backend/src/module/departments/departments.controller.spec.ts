import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';
import type { Department } from './departments.types.js';

describe('DepartmentsController', () => {
  let controller: DepartmentsController;
  const service = {
    findAll: vi.fn(),
    findById: vi.fn(),
  };

  const dental: Department = { id: 'DENTAL', name: 'Dental', active: true };

  beforeEach(async () => {
    vi.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [DepartmentsController],
      providers: [{ provide: DepartmentsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(DepartmentsController);
  });

  it('defaults activeOnly to false when the query omits it', async () => {
    service.findAll.mockResolvedValue([dental]);

    await controller.findAll({});

    expect(service.findAll).toHaveBeenCalledWith(false);
  });

  it('passes activeOnly through', async () => {
    service.findAll.mockResolvedValue([dental]);

    await controller.findAll({ activeOnly: true });

    expect(service.findAll).toHaveBeenCalledWith(true);
  });

  it('translates a missing department into a 404', async () => {
    service.findById.mockResolvedValue(null);

    // The service reports null; the HTTP status is decided here, which
    // is the only layer that knows about HTTP.
    await expect(controller.findById('NOPE')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the department when it exists', async () => {
    service.findById.mockResolvedValue(dental);

    await expect(controller.findById('DENTAL')).resolves.toEqual(dental);
  });
});
