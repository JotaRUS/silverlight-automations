import { prisma } from '../db/client';
import { logger } from '../core/logging/logger';
import { redisConnection } from '../queues/redis';
import { createYayCallEventsWorker } from '../queues/workers/yayCallEventsWorker';

const yayWorker = createYayCallEventsWorker();

let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info('worker shutdown initiated');

  await yayWorker.close();
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
