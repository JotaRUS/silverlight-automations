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
  describe('check()', () => {
    it('blocks contact when cooldown exists and override is false', async () => {
      const existingExpiresAt = new Date('2026-03-01T00:00:00.000Z');
      const prisma = createPrismaStub(existingExpiresAt);
      const service = new CooldownService(prisma);

      const result = await service.check({
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

      const result = await service.check({
        projectId: 'project-1',
        expertId: 'expert-1',
        channel: 'PHONE',
        overrideCooldown: true
      });

      expect(result.allowed).toBe(true);
      expect(result.expiresAt.toISOString()).toBe(existingExpiresAt.toISOString());
    });

    it('does not write a cooldown record', async () => {
      const prisma = createPrismaStub();
      const service = new CooldownService(prisma);

      await service.check({
        projectId: 'project-1',
        expertId: 'expert-1',
        channel: 'EMAIL',
        overrideCooldown: false
      });

      expect(prisma.cooldownLog.create).not.toHaveBeenCalled();
    });
  });

  describe('enforce()', () => {
    it('writes a cooldown record', async () => {
      const prisma = createPrismaStub();
      const service = new CooldownService(prisma);

      const result = await service.enforce({
        projectId: 'project-1',
        expertId: 'expert-1',
        channel: 'EMAIL',
        overrideCooldown: false,
        reason: 'outreach_message_sent'
      });

      expect(prisma.cooldownLog.create).toHaveBeenCalledTimes(1);
      expect(result.expiresAt).toBeDefined();
    });
  });

  describe('checkAndLog() (deprecated)', () => {
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
  });
});
