import type { PrismaClient } from '@prisma/client';

export class ProjectCompletionService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async recalculate(projectId: string): Promise<void> {
    const project = await this.prismaClient.project.findUnique({
      where: { id: projectId }
    });
    if (!project) {
      return;
    }

    const completedExperts = await this.prismaClient.screeningResponse.groupBy({
      by: ['expertId'],
      where: {
        projectId,
        status: 'COMPLETE'
      }
    });
    const completedCount = completedExperts.length;
    const completionPercentage =
      project.targetThreshold > 0 ? (completedCount / project.targetThreshold) * 100 : 0;
    const status = completedCount >= project.targetThreshold ? 'COMPLETED' : 'ACTIVE';

    await this.prismaClient.project.update({
      where: { id: projectId },
      data: {
        signedUpCount: completedCount,
        completionPercentage,
        status
      }
    });
  }
}
