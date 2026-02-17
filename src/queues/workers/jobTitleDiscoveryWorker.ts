import { Worker } from 'bullmq';

import { ApolloClient } from '../../integrations/apollo/apolloClient';
import { OpenAiClient } from '../../integrations/openai/openAiClient';
import { prisma } from '../../db/client';
import { env } from '../../config/env';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';
import { jobTitleDiscoveryJobSchema, type JobTitleDiscoveryJob } from '../definitions/jobPayloadSchemas';
import { JobTitleDiscoveryService } from '../../modules/job-title-engine/jobTitleDiscoveryService';
import { registerDeadLetterHandler } from './withDeadLetter';

const jobTitleDiscoveryService = new JobTitleDiscoveryService({
  prismaClient: prisma,
  apolloClient: new ApolloClient(),
  openAiClient: new OpenAiClient()
});

export function createJobTitleDiscoveryWorker(): Worker<CorrelatedJobData<JobTitleDiscoveryJob>> {
  const worker = new Worker<CorrelatedJobData<JobTitleDiscoveryJob>>(
    QUEUE_NAMES.JOB_TITLE_DISCOVERY,
    async (job) => {
      const jobLogger = createJobLogger(job);
      const payload = jobTitleDiscoveryJobSchema.parse(job.data.data);
      const persistedCount = await jobTitleDiscoveryService.discover(payload, job.data.correlationId);
      jobLogger.info({ persistedCount }, 'job-title-discovery-complete');
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 5
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.JOB_TITLE_DISCOVERY);
  return worker;
}
