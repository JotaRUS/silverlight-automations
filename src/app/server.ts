import { createServer } from 'node:http';

import { env } from '../config/env';
import { logger } from '../core/logging/logger';
import { installFatalProcessHandlers } from '../core/process/fatalHandlers';
import {
  attachRealtimeSocketServer,
  type RealtimeSocketRuntime
} from '../core/realtime/socketServer';
import { createApp } from './createApp';
import { gracefulShutdown } from './shutdown';

const app = createApp();
const server = createServer(app);
let realtimeRuntime: RealtimeSocketRuntime | null = null;

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'server started');
});

void attachRealtimeSocketServer(server)
  .then((runtime) => {
    realtimeRuntime = runtime;
    logger.info('realtime-socket-server-started');
  })
  .catch((error: unknown) => {
    logger.error({ err: error }, 'realtime-socket-server-start-failed');
  });

let shuttingDown = false;

async function onSignal(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, 'shutdown signal received');

  try {
    await gracefulShutdown(server, {
      onBeforeDisconnect: async () => {
        if (realtimeRuntime) {
          await realtimeRuntime.shutdown();
        }
      }
    });
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'failed during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void onSignal('SIGTERM');
});

process.on('SIGINT', () => {
  void onSignal('SIGINT');
});

installFatalProcessHandlers({
  logger,
  onFatalError: async () => {
    await gracefulShutdown(server, {
      onBeforeDisconnect: async () => {
        if (realtimeRuntime) {
          await realtimeRuntime.shutdown();
        }
      }
    });
  }
});
