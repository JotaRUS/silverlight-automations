import type { PrismaClient } from '@prisma/client';

import { clock } from '../../core/time/clock';

export interface RankingInput {
  projectId: string;
  expertId: string;
  freshReplyBoost: boolean;
  signupChaseBoost: boolean;
  highValueRejectionBoost: boolean;
}

export class RankingService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  private async getProjectCompletionPenalty(projectId: string): Promise<number> {
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
    const completionDeficit = await this.getProjectCompletionPenalty(input.projectId);

    const tierBase = input.freshReplyBoost
      ? 75
      : input.signupChaseBoost
        ? 50
        : input.highValueRejectionBoost
          ? 25
          : 0;
    const score = Math.round((tierBase + (completionDeficit / 100) * 25) * 100) / 100;

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
          createdAt: clock.now().toISOString()
        }
      }
    });

    return score;
  }
}
