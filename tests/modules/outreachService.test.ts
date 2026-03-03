import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/core/errors/appError';
import { OutreachService } from '../../src/modules/outreach/outreachService';

function createPrismaMock(): PrismaClient {
  return {
    outreachThread: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn()
    },
    outreachMessage: {
      create: vi.fn()
    },
    expert: {
      findUnique: vi.fn()
    },
    expertContact: {
      findMany: vi.fn().mockResolvedValue([])
    }
  } as unknown as PrismaClient;
}

interface MockCooldownService {
  check: ReturnType<typeof vi.fn>;
  enforce: ReturnType<typeof vi.fn>;
}

function createCooldownMock(allowed: boolean): MockCooldownService {
  return {
    check: vi.fn().mockResolvedValue({
      allowed,
      expiresAt: new Date('2026-03-01T00:00:00.000Z')
    }),
    enforce: vi.fn().mockResolvedValue({
      expiresAt: new Date('2026-04-01T00:00:00.000Z')
    })
  };
}

describe('OutreachService', () => {
  it('throws when cooldown is active', async () => {
    const prisma = createPrismaMock();
    const service = new OutreachService(prisma);
    (service as unknown as { cooldownService: MockCooldownService }).cooldownService =
      createCooldownMock(false);

    await expect(
      service.sendMessage({
        projectId: 'project-1',
        expertId: 'expert-1',
        channel: 'EMAIL',
        recipient: 'expert@example.com',
        body: 'hello',
        overrideCooldown: false
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  it('creates thread and persists outbound message', async () => {
    const prisma = createPrismaMock();
    (prisma.outreachThread.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.outreachThread.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'thread-1'
    });
    (prisma.outreachMessage.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'message-1'
    });

    const service = new OutreachService(prisma);
    const cooldownMock = createCooldownMock(true);
    (service as unknown as { cooldownService: MockCooldownService }).cooldownService = cooldownMock;
    (service as unknown as { messagingClient: { sendMessage: () => Promise<{ providerMessageId: string }> } }).messagingClient =
      {
        sendMessage: vi.fn().mockResolvedValue({
          providerMessageId: 'provider-message-1'
        })
      };

    const result = await service.sendMessage({
      projectId: 'project-1',
      expertId: 'expert-1',
      channel: 'EMAIL',
      recipient: 'expert@example.com',
      body: 'hello',
      overrideCooldown: false
    });

    expect(result.threadId).toBe('thread-1');
    expect(result.messageId).toBe('message-1');
    expect(cooldownMock.enforce).toHaveBeenCalledTimes(1);
  });

  it('does not enforce cooldown when provider send fails', async () => {
    const prisma = createPrismaMock();
    (prisma.outreachThread.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.outreachThread.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'thread-1'
    });

    const service = new OutreachService(prisma);
    const cooldownMock = createCooldownMock(true);
    (service as unknown as { cooldownService: MockCooldownService }).cooldownService = cooldownMock;
    (service as unknown as { messagingClient: { sendMessage: () => Promise<never> } }).messagingClient =
      {
        sendMessage: vi.fn().mockRejectedValue(new AppError('No active provider accounts available', 409, 'provider_account_unavailable'))
      };

    await expect(
      service.sendMessage({
        projectId: 'project-1',
        expertId: 'expert-1',
        channel: 'EMAIL',
        recipient: 'expert@example.com',
        body: 'hello',
        overrideCooldown: false
      })
    ).rejects.toBeInstanceOf(AppError);

    expect(cooldownMock.check).toHaveBeenCalledTimes(1);
    expect(cooldownMock.enforce).not.toHaveBeenCalled();
  });
});
