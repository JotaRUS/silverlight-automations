import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { CallAllocationService } from '../../src/modules/call-allocation/callAllocationService';

function createPrismaMock(): PrismaClient {
  return {
    caller: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    callTask: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn()
    },
    expert: {
      update: vi.fn()
    },
    $transaction: vi.fn(async (handler: (tx: PrismaClient) => Promise<void>) => {
      await handler({
        callTask: {
          update: vi.fn(),
          create: vi.fn()
        },
        expert: {
          update: vi.fn()
        }
      } as unknown as PrismaClient);
    })
  } as unknown as PrismaClient;
}

describe('CallAllocationService', () => {
  it('returns null when caller is not in callable allocation states', async () => {
    const prisma = createPrismaMock();
    (prisma.caller.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'caller-1',
      allocationStatus: 'PAUSED_LOW_DIAL_RATE'
    });

    const service = new CallAllocationService(prisma);
    const result = await service.fetchOrAssignCurrentTask('caller-1');
    expect(result).toBeNull();
  });

  it('returns existing assigned task for caller', async () => {
    const prisma = createPrismaMock();
    (prisma.caller.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'caller-1',
      allocationStatus: 'ACTIVE',
      languageCodes: ['en'],
      regionIsoCodes: ['US'],
      timezone: 'America/New_York'
    });
    (prisma.callTask.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      status: 'ASSIGNED',
      callerId: 'caller-1'
    });

    const service = new CallAllocationService(prisma);
    const result = await service.fetchOrAssignCurrentTask('caller-1');

    expect(result?.id).toBe('task-1');
  });

  it('marks caller idle when no pending task is available', async () => {
    const prisma = createPrismaMock();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const callerUpdateMock = prisma.caller.update as unknown as ReturnType<typeof vi.fn>;
    (prisma.caller.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'caller-1',
      allocationStatus: 'ACTIVE',
      languageCodes: ['en'],
      regionIsoCodes: ['US'],
      timezone: 'America/New_York'
    });
    (prisma.callTask.findFirst as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    callerUpdateMock.mockResolvedValue({});

    const service = new CallAllocationService(prisma);
    const result = await service.fetchOrAssignCurrentTask('caller-1');

    expect(result).toBeNull();
    expect(callerUpdateMock).toHaveBeenCalled();
  });

  it('submits retryable outcome and creates re-queued task', async () => {
    const prisma = createPrismaMock();
    (prisma.callTask.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      projectId: 'project-1',
      expertId: 'expert-1',
      callerId: 'caller-1',
      status: 'DIALING',
      priorityScore: 100
    });

    const tx = {
      callTask: {
        update: vi.fn(),
        create: vi.fn()
      },
      expert: {
        update: vi.fn()
      }
    } as unknown as PrismaClient;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const txCallTaskUpdateMock = tx.callTask.update as unknown as ReturnType<typeof vi.fn>;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const txCallTaskCreateMock = tx.callTask.create as unknown as ReturnType<typeof vi.fn>;
    (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (handler: (input: PrismaClient) => Promise<void>) => {
        await handler(tx);
      }
    );

    const service = new CallAllocationService(prisma);
    await service.submitCallOutcome('caller-1', 'task-1', 'RETRYABLE_REJECTION');

    expect(txCallTaskUpdateMock).toHaveBeenCalled();
    expect(txCallTaskCreateMock).toHaveBeenCalled();
  });
});
