import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { AuditLog } from './audit.schema.js';
import { AuditService } from './audit.service.js';

describe('AuditService', () => {
  let service: AuditService;
  let model: { create: ReturnType<typeof vi.fn>; find: ReturnType<typeof vi.fn> };
  let limitSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    model = { create: vi.fn().mockResolvedValue({}), find: vi.fn() };
    limitSpy = vi.fn();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getModelToken(AuditLog.name), useValue: model },
      ],
    }).compile();

    service = moduleRef.get(AuditService);
  });

  it('writes the event it was given', async () => {
    await service.record({
      sessionId: 'SESSION001',
      actor: 'agent',
      eventType: 'tool_call',
      toolName: 'findAvailableSlots',
      toolArguments: { department: 'DENTAL' },
    });

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'SESSION001',
        actor: 'agent',
        toolName: 'findAvailableSlots',
      }),
    );
  });

  it('never throws when the audit write fails', async () => {
    // The invariant that matters: a patient must not lose a booking
    // because audit logging hiccuped.
    model.create.mockRejectedValue(new Error('mongo unreachable'));
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    await expect(
      service.record({ sessionId: 'S1', actor: 'system', eventType: 'booked' }),
    ).resolves.toBeUndefined();

    // ...but it must be loud about it, not silent.
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('returns a session trail oldest-first as plain contracts, not documents', async () => {
    const createdAt = new Date('2026-09-20T10:31:22Z');
    model.find.mockReturnValue({
      sort: () => ({
        limit: limitSpy,
      }),
    });
    limitSpy.mockReturnValue({
      lean: () => ({
        exec: async () => [
            {
              _id: 'abc123',
              sessionId: 'S1',
              actor: 'patient',
              eventType: 'utterance',
              createdAt,
            },
        ],
      }),
    });

    const trail = await service.findBySession("S1");

    expect(trail).toEqual([
      expect.objectContaining({ id: 'abc123', sessionId: 'S1', createdAt }),
    ]);
    // Nothing crosses a module boundary as a Mongoose document (CLAUDE.md).
    expect(trail[0]).not.toHaveProperty('_id');
  });
});

describe('AuditService bounds', () => {
  it('bounds the session trail by default and honours an explicit limit', async () => {
    const limitSpy = vi.fn().mockReturnValue({
      lean: () => ({ exec: async () => [] }),
    });
    const model = {
      create: vi.fn(),
      find: vi.fn().mockReturnValue({ sort: () => ({ limit: limitSpy }) }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getModelToken(AuditLog.name), useValue: model },
      ],
    }).compile();
    const service = moduleRef.get(AuditService);

    await service.findBySession('S1');
    // Unbounded reads on the highest-volume collection are a latent
    // memory problem, so there must always be a cap.
    expect(limitSpy).toHaveBeenCalledWith(500);

    await service.findBySession('S1', 10);
    expect(limitSpy).toHaveBeenCalledWith(10);
  });
});
