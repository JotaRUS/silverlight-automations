import { Router } from 'express';

import { prisma } from '../../db/client';
import { redisConnection } from '../../queues/redis';

export const systemRoutes = Router();

systemRoutes.get('/health', (_request, response) => {
  response.status(200).json({
    status: 'ok'
  });
});

systemRoutes.get('/ready', async (_request, response, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redisConnection.ping();
    response.status(200).json({
      status: 'ready'
    });
  } catch (error) {
    next(error);
  }
});
