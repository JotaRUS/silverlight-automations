import type { PrismaClient } from '@prisma/client';

import { clock } from '../../core/time/clock';

export interface RankingInput {
  projectId: string;
  expertId: string;
  freshReplyBoost: boolean;
  signupChaseBoost: boolean;
  highValueRejectionBoost: boolean;
  verifiedContactCount: number;
  callAttemptCount: number;
}

export class RankingService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  private async getProjectCompletionDeficit(projectId: string): Promise<number> {
    const project = await this.prismaClient.project.findUnique({
      where: { id: projectId }
    });
    if (!project || project.targetThreshold <= 0) {
      return 0;
    }
    const completionRatio = project.signedUpCount / project.targetThreshold;
    return (1 - completionRatio) * 100;
  }

  public async computeAndPersist(input: RankingInput): Promise<number> {
    const completionDeficit = await this.getProjectCompletionDeficit(input.projectId);

    const tierBase = input.freshReplyBoost
      ? 75
      : input.signupChaseBoost
        ? 50
        : input.highValueRejectionBoost
          ? 25
          : 0;

    const deficitPoints = (completionDeficit / 100) * 17;
    const contactBonus = Math.min(input.verifiedContactCount, 4) / 4 * 5;
    const attemptPenalty = Math.min(input.callAttemptCount, 6) / 6 * 3;
    const microAdjust = contactBonus - attemptPenalty;

    const raw = tierBase + deficitPoints + Math.max(0, microAdjust);
    const score = Math.round(Math.min(100, Math.max(0, raw)) * 100) / 100;

    const latestRank = await this.prismaClient.rankingSnapshot.findFirst({
      orderBy: { rank: 'desc' }
    });
    const nextRank = (latestRank?.rank ?? 0) + 1;

    await this.prismaClient.rankingSnapshot.create({
      data: {
        projectId: input.projectId,
        expertId: input.expertId,
        score,
        rank: nextRank,
        reason: 'weighted_priority_formula',
        metadata: {
          freshReplyBoost: input.freshReplyBoost,
          signupChaseBoost: input.signupChaseBoost,
          highValueRejectionBoost: input.highValueRejectionBoost,
          completionDeficit,
          tierBase,
          verifiedContactCount: input.verifiedContactCount,
          callAttemptCount: input.callAttemptCount,
          createdAt: clock.now().toISOString()
        }
      }
    });

    return score;
  }
}
