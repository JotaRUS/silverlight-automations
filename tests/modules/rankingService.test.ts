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
  it('computes score within 0-100 using tier + deficit + contacts - attempts', async () => {
    const prisma = createPrismaStub({ targetThreshold: 10, signedUpCount: 2 });
    const service = new RankingService(prisma);

    const score = await service.computeAndPersist({
      projectId: 'project-1',
      expertId: 'expert-1',
      freshReplyBoost: true,
      signupChaseBoost: true,
      highValueRejectionBoost: false,
      verifiedContactCount: 3,
      callAttemptCount: 1
    });

    // tierBase=75 (freshReply wins), deficit=80 → deficitPts=13.6, contactBonus=3.75, attemptPenalty=0.5
    // score = 75 + 13.6 + max(0, 3.75-0.5) = 75 + 13.6 + 3.25 = 91.85
    expect(score).toBeGreaterThanOrEqual(75);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns zero when project does not exist and no boosts', async () => {
    const prisma = createPrismaStub();
    const service = new RankingService(prisma);

    const score = await service.computeAndPersist({
      projectId: 'project-2',
      expertId: 'expert-2',
      freshReplyBoost: false,
      signupChaseBoost: false,
      highValueRejectionBoost: false,
      verifiedContactCount: 0,
      callAttemptCount: 0
    });

    expect(score).toBe(0);
  });

  it('gives higher score to expert with more contacts and fewer attempts', async () => {
    const prisma = createPrismaStub({ targetThreshold: 20, signedUpCount: 5 });
    const service = new RankingService(prisma);

    const scoreA = await service.computeAndPersist({
      projectId: 'project-1',
      expertId: 'expert-a',
      freshReplyBoost: false,
      signupChaseBoost: false,
      highValueRejectionBoost: false,
      verifiedContactCount: 4,
      callAttemptCount: 0
    });

    const scoreB = await service.computeAndPersist({
      projectId: 'project-1',
      expertId: 'expert-b',
      freshReplyBoost: false,
      signupChaseBoost: false,
      highValueRejectionBoost: false,
      verifiedContactCount: 1,
      callAttemptCount: 5
    });

    expect(scoreA).toBeGreaterThan(scoreB);
    expect(scoreA).toBeLessThanOrEqual(25);
    expect(scoreB).toBeGreaterThanOrEqual(0);
  });
});
