import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { GoogleSheetsSyncService } from '../../modules/google-sheets-sync/googleSheetsSyncService';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { bullMqConnection } from '../redis';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';

interface GoogleSheetsSyncJobData {
  projectId?: string;
  tabName: string;
  entityType: string;
  entityId: string;
  rowData: string[];
}

const googleSheetsSyncService = new GoogleSheetsSyncService(prisma);

export function createGoogleSheetsSyncWorker(): Worker<CorrelatedJobData<GoogleSheetsSyncJobData>> {
  return new Worker<CorrelatedJobData<GoogleSheetsSyncJobData>>(
    QUEUE_NAMES.GOOGLE_SHEETS_SYNC,
    async (job) => {
      const jobLogger = createJobLogger(job);
      await googleSheetsSyncService.syncRow(job.data.data);
      jobLogger.info({ entityId: job.data.data.entityId }, 'google-sheets-sync-complete');
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 4
    }
  );
}
