import type { DeadLetterJob, Prisma, PrismaClient } from '@prisma/client';

import { clock } from '../../core/time/clock';

export interface CreateDeadLetterJobInput {
  queueName: string;
  jobId: string;
  payload: Prisma.InputJsonValue;
  errorMessage: string;
  stackTrace?: string;
  correlationId?: string;
}

export class DeadLetterJobRepository {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async create(input: CreateDeadLetterJobInput): Promise<DeadLetterJob> {
    return this.prismaClient.deadLetterJob.create({
      data: {
        queueName: input.queueName,
        jobId: input.jobId,
        payload: input.payload,
        errorMessage: input.errorMessage,
        stackTrace: input.stackTrace,
        correlationId: input.correlationId,
        failedAt: clock.now()
      }
    });
  }

  public async archiveOlderThan(cutoff: Date): Promise<number> {
    const result = await this.prismaClient.deadLetterJob.updateMany({
      where: {
        archivedAt: null,
        failedAt: {
          lt: cutoff
        }
      },
      data: {
        archivedAt: clock.now()
      }
    });
    return result.count;
  }

  public async listActive(limit: number): Promise<DeadLetterJob[]> {
    return this.prismaClient.deadLetterJob.findMany({
      where: {
        archivedAt: null
      },
      orderBy: {
        failedAt: 'desc'
      },
      take: limit
    });
  }
}
