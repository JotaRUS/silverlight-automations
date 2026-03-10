import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { SupabaseSyncService } from '../../modules/supabase-sync/supabaseSyncService';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';
import { registerDeadLetterHandler } from './withDeadLetter';

interface SupabaseSyncJobData {
  projectId: string;
  leadId: string;
}

const supabaseSyncService = new SupabaseSyncService(prisma);

export function createSupabaseSyncWorker(): Worker<CorrelatedJobData<SupabaseSyncJobData>> {
  const worker = new Worker<CorrelatedJobData<SupabaseSyncJobData>>(
    QUEUE_NAMES.SUPABASE_SYNC,
    async (job) => {
      const jobLogger = createJobLogger(job);
      await supabaseSyncService.syncLead(job.data.data);
      jobLogger.info({ leadId: job.data.data.leadId }, 'supabase-sync-complete');
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 4
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.SUPABASE_SYNC);
  return worker;
}
