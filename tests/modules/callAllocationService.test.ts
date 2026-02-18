import type { Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { CallAllocationService } from '../../src/modules/call-allocation/callAllocationService';

vi.mock('../../src/db/transactions/withSerializableTransaction', () => ({
  withSerializableTransaction: async (
    prismaClient: PrismaClient,
    callback: (tx: Prisma.TransactionClient) => Promise<unknown>
  ): Promise<unknown> => {
    return prismaClient.$transaction(async (tx) => callback(tx));
  }
}));

interface MockBundle {
  prisma: PrismaClient;
  tx: {
    caller: { update: ReturnType<typeof vi.fn> };
    callTask: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    expert: { update: ReturnType<typeof vi.fn> };
  };
}

function createPrismaMock(): MockBundle {
  const tx = {
    caller: { update: vi.fn() },
    callTask: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    expert: { update: vi.fn() }
  };

  const prisma = {
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
    $transaction: vi.fn(
      async (handler: (t: unknown) => Promise<unknown>) => handler(tx)
    )
  } as unknown as PrismaClient;

  return { prisma, tx };
}

describe('CallAllocationService', () => {
  it('returns null when caller is not in callable allocation states', async () => {
    const { prisma } = createPrismaMock();
    (prisma.caller.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'caller-1',
      allocationStatus: 'PAUSED_LOW_DIAL_RATE'
    });

    const service = new CallAllocationService(prisma);
    const result = await service.fetchOrAssignCurrentTask('caller-1');
    expect(result).toBeNull();
  });

  it('returns existing assigned task for caller', async () => {
    const { prisma, tx } = createPrismaMock();
    (prisma.caller.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'caller-1',
      allocationStatus: 'ACTIVE',
      languageCodes: ['en'],
      regionIsoCodes: ['US'],
      timezone: 'America/New_York'
    });
    tx.callTask.findFirst.mockResolvedValue({
      id: 'task-1',
      status: 'ASSIGNED',
      callerId: 'caller-1'
    });

    const service = new CallAllocationService(prisma);
    const result = await service.fetchOrAssignCurrentTask('caller-1');

    expect(result?.id).toBe('task-1');
  });

  it('marks caller idle when no pending task is available', async () => {
    const { prisma, tx } = createPrismaMock();
    (prisma.caller.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'caller-1',
      allocationStatus: 'ACTIVE',
      languageCodes: ['en'],
      regionIsoCodes: ['US'],
      timezone: 'America/New_York'
    });
    tx.callTask.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    tx.caller.update.mockResolvedValue({});

    const service = new CallAllocationService(prisma);
    const result = await service.fetchOrAssignCurrentTask('caller-1');

    expect(result).toBeNull();
    expect(tx.caller.update).toHaveBeenCalled();
  });

  it('submits retryable outcome and creates re-queued task', async () => {
    const { prisma } = createPrismaMock();
    (prisma.callTask.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      projectId: 'project-1',
      expertId: 'expert-1',
      callerId: 'caller-1',
      status: 'DIALING',
      priorityScore: 100
    });

    const outcomeTx = {
      callTask: {
        update: vi.fn(),
        create: vi.fn()
      },
      expert: {
        update: vi.fn()
      }
    } as unknown as PrismaClient;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const txCallTaskUpdateMock = outcomeTx.callTask.update as unknown as ReturnType<typeof vi.fn>;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const txCallTaskCreateMock = outcomeTx.callTask.create as unknown as ReturnType<typeof vi.fn>;
    (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (handler: (input: PrismaClient) => Promise<void>) => {
        await handler(outcomeTx);
      }
    );

    const service = new CallAllocationService(prisma);
    await service.submitCallOutcome('caller-1', 'task-1', 'RETRYABLE_REJECTION');

    expect(txCallTaskUpdateMock).toHaveBeenCalled();
    expect(txCallTaskCreateMock).toHaveBeenCalled();
  });
});
