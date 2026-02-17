import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/db/client';
import { RankingService } from '../../src/modules/ranking/rankingService';
import { cleanDatabase, disconnectDatabase } from './helpers/testDb';

describe('ranking integration', () => {
  const rankingService = new RankingService(prisma);

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('persists weighted ranking snapshot', async () => {
    const project = await prisma.project.create({
      data: {
        name: 'Ranking Project',
        targetThreshold: 20,
        signedUpCount: 3,
        geographyIsoCodes: ['US'],
        regionConfig: {}
      }
    });
    const expert = await prisma.expert.create({
      data: {
        fullName: 'Ranked Expert',
        languageCodes: ['en']
      }
    });

    const score = await rankingService.computeAndPersist({
      projectId: project.id,
      expertId: expert.id,
      freshReplyBoost: true,
      signupChaseBoost: true,
      highValueRejectionBoost: false
    });

    expect(score).toBeGreaterThan(0);

    const snapshots = await prisma.rankingSnapshot.findMany({
      where: {
        projectId: project.id,
        expertId: expert.id
      }
    });
    expect(snapshots.length).toBe(1);
    expect(snapshots[0]?.score.toNumber()).toBe(score);
  });
});

afterAll(async () => {
  await disconnectDatabase();
});
