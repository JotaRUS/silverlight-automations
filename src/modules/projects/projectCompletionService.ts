import type { PrismaClient } from '@prisma/client';

const PIPELINE_STAGE_WEIGHTS: Record<string, number> = {
  NEW: 1,
  ENRICHING: 2,
  ENRICHED: 3,
  OUTREACH_PENDING: 4,
  CONTACTED: 5,
  REPLIED: 6,
  CONVERTED: 7
};
const MAX_STAGE_WEIGHT = 7;

export class ProjectCompletionService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async recalculate(projectId: string): Promise<void> {
    const project = await this.prismaClient.project.findUnique({
      where: { id: projectId }
    });
    if (!project || project.targetThreshold <= 0) {
      return;
    }

    const leads = await this.prismaClient.lead.findMany({
      where: { projectId, deletedAt: null },
      select: { status: true }
    });

    let weightedSum = 0;
    let convertedCount = 0;
    for (const lead of leads) {
      const weight = PIPELINE_STAGE_WEIGHTS[lead.status] ?? 0;
      weightedSum += weight;
      if (lead.status === 'CONVERTED') {
        convertedCount += 1;
      }
    }

    const maxPossibleWeight = project.targetThreshold * MAX_STAGE_WEIGHT;
    const completionPercentage = Math.min(
      100,
      (weightedSum / maxPossibleWeight) * 100
    );
    const status = convertedCount >= project.targetThreshold ? 'COMPLETED' : 'ACTIVE';

    await this.prismaClient.project.update({
      where: { id: projectId },
      data: {
        signedUpCount: convertedCount,
        completionPercentage,
        status
      }
    });
  }
}
