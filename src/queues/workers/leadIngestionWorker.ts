import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { LeadIngestionService } from '../../modules/lead-ingestion/leadIngestionService';
import { leadIngestionJobSchema, type LeadIngestionJob } from '../definitions/jobPayloadSchemas';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';
import { registerDeadLetterHandler } from './withDeadLetter';

const leadIngestionService = new LeadIngestionService(prisma);

export function createLeadIngestionWorker(): Worker<CorrelatedJobData<LeadIngestionJob>> {
  const worker = new Worker<CorrelatedJobData<LeadIngestionJob>>(
    QUEUE_NAMES.LEAD_INGESTION,
    async (job) => {
      const jobLogger = createJobLogger(job);
      const payload = leadIngestionJobSchema.parse(job.data.data);
      const lead = await leadIngestionService.ingest(payload);
      jobLogger.info({ leadId: lead.id }, 'lead-ingestion-complete');
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 10
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.LEAD_INGESTION);
  return worker;
}
