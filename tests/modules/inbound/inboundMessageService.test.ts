import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { InboundMessageService, InboundResolutionError } from '../../../src/modules/inbound/inboundMessageService';

vi.mock('../../../src/core/realtime/realtimePubSub', () => ({
  publishRealtimeEvent: vi.fn()
}));

vi.mock('../../../src/core/time/clock', () => ({
  clock: { now: () => new Date('2025-01-15T12:00:00Z') }
}));

function createPrismaMock(overrides: Partial<Record<string, Record<string, unknown>>> = {}): PrismaClient {
  return {
    expertContact: {
      findFirst: vi.fn().mockResolvedValue(null),
      ...overrides.expertContact
    },
    outreachThread: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      ...overrides.outreachThread
    },
    outreachMessage: {
      create: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      ...overrides.outreachMessage
    },
    expert: {
      findUnique: vi.fn().mockResolvedValue({ id: 'exp-1', preferredChannel: 'EMAIL' }),
      update: vi.fn(),
      ...overrides.expert
    },
    lead: {
      updateMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      ...overrides.lead
    },
    project: {
      findUnique: vi.fn().mockResolvedValue({ id: 'proj-1', name: 'Test', targetThreshold: 10 }),
      update: vi.fn(),
      ...overrides.project
    },
    screeningResponse: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      ...overrides.screeningResponse
    },
    screeningQuestion: {
      findMany: vi.fn().mockResolvedValue([])
    },
    systemEvent: {
      create: vi.fn()
    }
  } as unknown as PrismaClient;
}

describe('InboundMessageService', () => {
  it('throws InboundResolutionError when expert contact not found', async () => {
    const prisma = createPrismaMock();
    const service = new InboundMessageService(prisma);

    await expect(
      service.processInboundMessage({
        providerMessageId: 'msg-1',
        senderAddress: 'unknown@acmecorp.com',
        contactType: 'EMAIL',
        channel: 'EMAIL',
        body: 'Hello',
        providerAccountId: 'pa-1',
        rawPayload: {}
      })
    ).rejects.toBeInstanceOf(InboundResolutionError);
  });

  it('throws InboundResolutionError when no outreach thread found', async () => {
    const prisma = createPrismaMock({
      expertContact: {
        findFirst: vi.fn().mockResolvedValue({
          expertId: 'exp-1',
          type: 'EMAIL',
          valueNormalized: 'alice@acmecorp.com'
        })
      }
    });
    const service = new InboundMessageService(prisma);

    await expect(
      service.processInboundMessage({
        providerMessageId: 'msg-1',
        senderAddress: 'alice@acmecorp.com',
        contactType: 'EMAIL',
        channel: 'EMAIL',
        body: 'Reply text',
        providerAccountId: 'pa-1',
        rawPayload: {}
      })
    ).rejects.toThrow('No outreach thread found');
  });

  it('processes inbound message and returns result', async () => {
    const prisma = createPrismaMock({
      expertContact: {
        findFirst: vi.fn().mockResolvedValue({
          expertId: 'exp-1',
          type: 'PHONE',
          valueNormalized: '+14155551234'
        })
      },
      outreachThread: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'thread-1',
          projectId: 'proj-1',
          expertId: 'exp-1',
          channel: 'SMS',
          replied: false
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'thread-1',
          projectId: 'proj-1',
          expertId: 'exp-1',
          channel: 'SMS'
        }),
        update: vi.fn()
      }
    });
    const service = new InboundMessageService(prisma);

    const result = await service.processInboundMessage({
      providerMessageId: 'SM123',
      senderAddress: '+14155551234',
      contactType: 'PHONE',
      channel: 'SMS',
      body: 'Yes I am interested',
      providerAccountId: 'pa-1',
      rawPayload: {}
    });

    expect(result.expertId).toBe('exp-1');
    expect(result.threadId).toBe('thread-1');
    expect(result.messageId).toBe('msg-1');
  });

  it('auto-matches pending screening response', async () => {
    const prisma = createPrismaMock({
      expertContact: {
        findFirst: vi.fn().mockResolvedValue({
          expertId: 'exp-1',
          type: 'PHONE',
          valueNormalized: '+14155551234'
        })
      },
      outreachThread: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'thread-1',
          projectId: 'proj-1',
          expertId: 'exp-1',
          channel: 'SMS',
          replied: false
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'thread-1',
          projectId: 'proj-1',
          expertId: 'exp-1',
          channel: 'SMS'
        }),
        update: vi.fn()
      },
      screeningResponse: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'sr-1',
          projectId: 'proj-1',
          expertId: 'exp-1',
          questionId: 'q-1',
          status: 'PENDING',
          question: { id: 'q-1', prompt: 'What is your name?', displayOrder: 1 }
        }),
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0)
      }
    });

    const service = new InboundMessageService(prisma);
    const result = await service.processInboundMessage({
      providerMessageId: 'SM456',
      senderAddress: '+14155551234',
      contactType: 'PHONE',
      channel: 'SMS',
      body: 'John Doe',
      providerAccountId: 'pa-1',
      rawPayload: {}
    });

    expect(result.screeningResponseUpdated).toBe(true);
    expect(prisma.screeningResponse.updateMany).toHaveBeenCalled();
  });
});
