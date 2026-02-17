import { prisma } from '../db/client';
import { logger } from '../core/logging/logger';
import { installFatalProcessHandlers } from '../core/process/fatalHandlers';
import { redisConnection } from '../queues/redis';
import { createDeadLetterWorker } from '../queues/workers/deadLetterWorker';
import { createEnrichmentWorker } from '../queues/workers/enrichmentWorker';
import { createGoogleSheetsSyncWorker } from '../queues/workers/googleSheetsSyncWorker';
import { createJobTitleDiscoveryWorker } from '../queues/workers/jobTitleDiscoveryWorker';
import { createLeadIngestionWorker } from '../queues/workers/leadIngestionWorker';
import { createPerformanceWorker } from '../queues/workers/performanceWorker';
import { createRankingWorker } from '../queues/workers/rankingWorker';
import { createSalesNavIngestionWorker } from '../queues/workers/salesNavIngestionWorker';
import { createScreeningWorker } from '../queues/workers/screeningWorker';
import { createYayCallEventsWorker } from '../queues/workers/yayCallEventsWorker';

const yayWorker = createYayCallEventsWorker();
const enrichmentWorker = createEnrichmentWorker();
const salesNavIngestionWorker = createSalesNavIngestionWorker();
const leadIngestionWorker = createLeadIngestionWorker();
const jobTitleDiscoveryWorker = createJobTitleDiscoveryWorker();
const rankingWorker = createRankingWorker();
const performanceWorker = createPerformanceWorker();
const googleSheetsSyncWorker = createGoogleSheetsSyncWorker();
const screeningWorker = createScreeningWorker();
const deadLetterWorker = createDeadLetterWorker();

let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info('worker shutdown initiated');

  await Promise.all([
    yayWorker.close(),
    enrichmentWorker.close(),
    salesNavIngestionWorker.close(),
    leadIngestionWorker.close(),
    jobTitleDiscoveryWorker.close(),
    rankingWorker.close(),
    performanceWorker.close(),
    googleSheetsSyncWorker.close(),
    screeningWorker.close(),
    deadLetterWorker.close()
  ]);
  await redisConnection.quit();
  await prisma.$disconnect();
  logger.info('worker shutdown completed');
}

process.on('SIGTERM', () => {
  void shutdown();
});

process.on('SIGINT', () => {
  void shutdown();
});

installFatalProcessHandlers({
  logger,
  onFatalError: async () => {
    await shutdown();
  }
});

logger.info('workers started');
