import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { EnrichmentService } from '../../modules/enrichment/enrichmentService';
import { enrichmentJobSchema, type EnrichmentJob } from '../definitions/jobPayloadSchemas';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';

const enrichmentService = new EnrichmentService(prisma);

export function createEnrichmentWorker(): Worker<CorrelatedJobData<EnrichmentJob>> {
  return new Worker<CorrelatedJobData<EnrichmentJob>>(
    QUEUE_NAMES.ENRICHMENT,
    async (job) => {
      const jobLogger = createJobLogger(job);
      const payload = enrichmentJobSchema.parse(job.data.data);
      await enrichmentService.enrich(payload, job.data.correlationId);
      jobLogger.info({ leadId: payload.leadId }, 'enrichment-complete');
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 6
    }
  );
}
