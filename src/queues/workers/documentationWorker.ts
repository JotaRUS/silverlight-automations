import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { DocumentationGeneratorService } from '../../modules/documentation-generator/documentationGeneratorService';
import {
  documentationGenerationJobSchema,
  type DocumentationGenerationJob
} from '../definitions/jobPayloadSchemas';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { registerDeadLetterHandler } from './withDeadLetter';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';

const documentationGeneratorService = new DocumentationGeneratorService(prisma);

export function createDocumentationWorker(): Worker<CorrelatedJobData<DocumentationGenerationJob>> {
  const worker = new Worker<CorrelatedJobData<DocumentationGenerationJob>>(
    QUEUE_NAMES.DOCUMENTATION,
    async (job) => {
      const jobLogger = createJobLogger(job);
      const payload = documentationGenerationJobSchema.parse(job.data.data);
      await documentationGeneratorService.generate();
      jobLogger.info(
        {
          requestedByUserId: payload.requestedByUserId
        },
        'documentation-generation-complete'
      );
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 2
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.DOCUMENTATION);
  return worker;
}
