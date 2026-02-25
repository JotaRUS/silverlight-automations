import type { Server } from 'node:http';

import { logger } from '../core/logging/logger';
import { shutdownRealtimePubSub } from '../core/realtime/realtimePubSub';
import { prisma } from '../db/client';
import { closeQueues } from '../queues';
import { redisConnection } from '../queues/redis';

export async function gracefulShutdown(
  server: Server,
  options?: {
    onBeforeDisconnect?: () => Promise<void>;
  }
): Promise<void> {
  logger.info('starting graceful shutdown');

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  if (options?.onBeforeDisconnect) {
    await options.onBeforeDisconnect();
  }

  await shutdownRealtimePubSub();
  await closeQueues();
  await redisConnection.quit();
  await prisma.$disconnect();
  logger.info('graceful shutdown complete');
}
