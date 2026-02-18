import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { RankingService } from '../../src/modules/ranking/rankingService';

function createPrismaStub(projectInput?: { targetThreshold: number; signedUpCount: number }): PrismaClient {
  return {
    project: {
      findUnique: vi.fn().mockResolvedValue(
        projectInput
          ? {
              id: 'project-1',
              ...projectInput
            }
          : null
      )
    },
    rankingSnapshot: {
      findFirst: vi.fn().mockResolvedValue({ rank: 3 }),
      create: vi.fn().mockResolvedValue({})
    }
  } as unknown as PrismaClient;
}

describe('RankingService', () => {
  it('computes weighted score with completion penalty and boosts', async () => {
    const prisma = createPrismaStub({ targetThreshold: 10, signedUpCount: 2 });
    const service = new RankingService(prisma);

    const score = await service.computeAndPersist({
      projectId: 'project-1',
      expertId: 'expert-1',
      freshReplyBoost: true,
      signupChaseBoost: true,
      highValueRejectionBoost: false
    });

    expect(score).toBe(1830);
  });

  it('returns zero penalty when project does not exist', async () => {
    const prisma = createPrismaStub();
    const service = new RankingService(prisma);

    const score = await service.computeAndPersist({
      projectId: 'project-2',
      expertId: 'expert-2',
      freshReplyBoost: false,
      signupChaseBoost: false,
      highValueRejectionBoost: false
    });

    expect(score).toBe(0);
  });
});
