import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { ScreeningService } from '../../src/modules/screening/screeningService';

function createPrismaMock(): PrismaClient {
  return {
    screeningQuestion: {
      findMany: vi.fn()
    },
    expert: {
      findUnique: vi.fn()
    },
    screeningResponse: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn()
    },
    expertContact: {
      findFirst: vi.fn()
    },
    systemEvent: {
      create: vi.fn()
    }
  } as unknown as PrismaClient;
}

describe('ScreeningService', () => {
  it('dispatches screening questions and creates pending responses', async () => {
    const prisma = createPrismaMock();
    const screeningResponseCreateMock = vi.fn();
    (prisma.screeningQuestion.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'q1',
        displayOrder: 1,
        prompt: 'Question 1'
      },
      {
        id: 'q2',
        displayOrder: 2,
        prompt: 'Question 2'
      }
    ]);
    (prisma.expert.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'expert-1',
      preferredChannel: 'EMAIL'
    });
    (prisma.screeningResponse.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.screeningResponse.create as unknown as ReturnType<typeof vi.fn>) =
      screeningResponseCreateMock;
    screeningResponseCreateMock.mockResolvedValue({});
    (prisma.expertContact.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      value: 'expert@example.com'
    });

    const service = new ScreeningService(prisma);
    (service as unknown as { outreachService: { sendMessage: () => Promise<void> } }).outreachService = {
      sendMessage: vi.fn().mockResolvedValue(undefined)
    };

    const sentCount = await service.dispatchScreening({
      projectId: 'project-1',
      expertId: 'expert-1'
    });
    expect(sentCount).toBe(2);
    expect(screeningResponseCreateMock).toHaveBeenCalledTimes(2);
  });

  it('records response and triggers project completion recalculation', async () => {
    const prisma = createPrismaMock();
    const systemEventCreateMock = vi.fn();
    (prisma.screeningResponse.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.screeningResponse.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.systemEvent.create as unknown as ReturnType<typeof vi.fn>) = systemEventCreateMock;
    systemEventCreateMock.mockResolvedValue({});

    const service = new ScreeningService(prisma);
    const recalculate = vi.fn().mockResolvedValue(undefined);
    (service as unknown as { projectCompletionService: { recalculate: (projectId: string) => Promise<void> } })
      .projectCompletionService = {
      recalculate
    };

    await service.recordResponse({
      projectId: 'project-1',
      expertId: 'expert-1',
      questionId: 'q1',
      responseText: 'Answer'
    });

    expect(systemEventCreateMock).toHaveBeenCalled();
    expect(recalculate).toHaveBeenCalledWith('project-1');
  });
});
