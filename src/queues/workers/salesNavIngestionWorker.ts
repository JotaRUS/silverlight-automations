import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { SalesNavIngestionService } from '../../modules/sales-nav/salesNavIngestionService';
import { salesNavIngestionJobSchema, type SalesNavIngestionJob } from '../definitions/jobPayloadSchemas';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';

const salesNavIngestionService = new SalesNavIngestionService(prisma);

export function createSalesNavIngestionWorker(): Worker<CorrelatedJobData<SalesNavIngestionJob>> {
  return new Worker<CorrelatedJobData<SalesNavIngestionJob>>(
    QUEUE_NAMES.SALES_NAV_INGESTION,
    async (job) => {
      const jobLogger = createJobLogger(job);
      const payload = salesNavIngestionJobSchema.parse(job.data.data);
      const enqueued = await salesNavIngestionService.ingest(payload);
      jobLogger.info({ enqueued }, 'sales-nav-ingestion-complete');
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 5
    }
  );
}
