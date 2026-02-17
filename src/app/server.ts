import { createServer } from 'node:http';

import { env } from '../config/env';
import { logger } from '../core/logging/logger';
import { createApp } from './createApp';
import { gracefulShutdown } from './shutdown';

const app = createApp();
const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'server started');
});

let shuttingDown = false;

async function onSignal(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, 'shutdown signal received');

  try {
    await gracefulShutdown(server);
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
