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
    }
  } as unknown as PrismaClient;
}

describe('OutreachService', () => {
  it('throws when cooldown is active', async () => {
    const prisma = createPrismaMock();
    const service = new OutreachService(prisma);
    (service as unknown as { cooldownService: { checkAndLog: () => Promise<{ allowed: boolean; expiresAt: Date }> } })
      .cooldownService = {
      checkAndLog: vi.fn().mockResolvedValue({
        allowed: false,
        expiresAt: new Date('2026-03-01T00:00:00.000Z')
      })
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
    (service as unknown as { cooldownService: { checkAndLog: () => Promise<{ allowed: boolean; expiresAt: Date }> } })
      .cooldownService = {
      checkAndLog: vi.fn().mockResolvedValue({
        allowed: true,
        expiresAt: new Date('2026-03-01T00:00:00.000Z')
      })
    };
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
  });
});
