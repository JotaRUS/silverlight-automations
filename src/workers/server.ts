import { prisma } from '../db/client';
import { logger } from '../core/logging/logger';
import { redisConnection } from '../queues/redis';
import { createEnrichmentWorker } from '../queues/workers/enrichmentWorker';
import { createJobTitleDiscoveryWorker } from '../queues/workers/jobTitleDiscoveryWorker';
import { createLeadIngestionWorker } from '../queues/workers/leadIngestionWorker';
import { createSalesNavIngestionWorker } from '../queues/workers/salesNavIngestionWorker';
import { createYayCallEventsWorker } from '../queues/workers/yayCallEventsWorker';

const yayWorker = createYayCallEventsWorker();
const enrichmentWorker = createEnrichmentWorker();
const salesNavIngestionWorker = createSalesNavIngestionWorker();
const leadIngestionWorker = createLeadIngestionWorker();
const jobTitleDiscoveryWorker = createJobTitleDiscoveryWorker();

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
    jobTitleDiscoveryWorker.close()
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

logger.info('yay call events worker started');
