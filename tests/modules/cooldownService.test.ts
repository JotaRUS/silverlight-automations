import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { CooldownService } from '../../src/modules/cooldown/cooldownService';

function createPrismaStub(existingExpiresAt?: Date): PrismaClient {
  return {
    cooldownLog: {
      findFirst: vi.fn().mockResolvedValue(
        existingExpiresAt
          ? {
              id: 'cooldown-1',
              expiresAt: existingExpiresAt
            }
          : null
      ),
      create: vi.fn().mockResolvedValue({})
    }
  } as unknown as PrismaClient;
}

describe('CooldownService', () => {
  it('blocks contact when cooldown exists and override is false', async () => {
    const existingExpiresAt = new Date('2026-03-01T00:00:00.000Z');
    const prisma = createPrismaStub(existingExpiresAt);
    const service = new CooldownService(prisma);

    const result = await service.checkAndLog({
      projectId: 'project-1',
      expertId: 'expert-1',
      channel: 'EMAIL',
      overrideCooldown: false
    });

    expect(result.allowed).toBe(false);
    expect(result.expiresAt.toISOString()).toBe(existingExpiresAt.toISOString());
  });

  it('allows contact when override is true', async () => {
    const existingExpiresAt = new Date('2026-03-01T00:00:00.000Z');
    const prisma = createPrismaStub(existingExpiresAt);
    const service = new CooldownService(prisma);

    const result = await service.checkAndLog({
      projectId: 'project-1',
      expertId: 'expert-1',
      channel: 'PHONE',
      overrideCooldown: true
    });

    expect(result.allowed).toBe(true);
    expect(result.expiresAt.toISOString()).toBe(existingExpiresAt.toISOString());
  });
});
