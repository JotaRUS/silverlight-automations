import type { Prisma, PrismaClient } from '@prisma/client';

import { getQueues } from '../../queues';
import type { SalesNavIngestionJob } from '../../queues/definitions/jobPayloadSchemas';
import { enqueueWithContext } from '../../queues/producers/enqueueWithContext';

export class SalesNavIngestionService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  private toJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  public async ingest(payload: SalesNavIngestionJob): Promise<number> {
    const search = await this.prismaClient.salesNavSearch.upsert({
      where: {
        projectId_normalizedUrl: {
          projectId: payload.projectId,
          normalizedUrl: payload.normalizedUrl
        }
      },
      create: {
        projectId: payload.projectId,
        sourceUrl: payload.sourceUrl,
        normalizedUrl: payload.normalizedUrl,
        metadata: this.toJsonValue(payload.metadata),
        paginationCursor: payload.pageCursor
      },
      update: {
        sourceUrl: payload.sourceUrl,
        metadata: this.toJsonValue(payload.metadata),
        paginationCursor: payload.pageCursor
      }
    });

    let enqueued = 0;
    for (let index = 0; index < payload.leads.length; index += 1) {
      const lead = payload.leads[index];
      await enqueueWithContext(getQueues().leadIngestionQueue, 'lead-ingestion.ingest', {
        projectId: payload.projectId,
        salesNavSearchId: search.id,
        lead
      }, {
        jobId: `lead-ingestion:${payload.projectId}:${search.id}:${String(index)}:${lead.linkedinUrl ?? lead.fullName ?? 'unknown'}`
      });
      enqueued += 1;
    }

    await this.prismaClient.systemEvent.create({
      data: {
        category: 'JOB',
        entityType: 'sales_nav_ingestion',
        entityId: search.id,
        message: 'sales_nav_payload_ingested',
        payload: {
          projectId: payload.projectId,
          leadsEnqueued: enqueued
        }
      }
    });

    return enqueued;
  }
}
