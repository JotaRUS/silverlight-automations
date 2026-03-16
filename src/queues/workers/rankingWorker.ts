import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { publishRealtimeEvent } from '../../core/realtime/realtimePubSub';
import { prisma } from '../../db/client';
import { RankingService } from '../../modules/ranking/rankingService';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';
import { registerDeadLetterHandler } from './withDeadLetter';

interface RankingJobPayload {
  projectId: string;
  expertId: string;
  freshReplyBoost: boolean;
  signupChaseBoost: boolean;
  highValueRejectionBoost: boolean;
}

const rankingService = new RankingService(prisma);

export function createRankingWorker(): Worker<CorrelatedJobData<RankingJobPayload>> {
  const worker = new Worker<CorrelatedJobData<RankingJobPayload>>(
    QUEUE_NAMES.RANKING,
    async (job) => {
      const jobLogger = createJobLogger(job);
      const score = await rankingService.computeAndPersist(job.data.data);
      jobLogger.info({ score }, 'ranking-score-persisted');
      await publishRealtimeEvent({
        namespace: 'admin',
        event: 'ranking.updated',
        data: { projectId: job.data.data.projectId, expertId: job.data.data.expertId, score }
      });
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 5
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.RANKING);
  return worker;
}
