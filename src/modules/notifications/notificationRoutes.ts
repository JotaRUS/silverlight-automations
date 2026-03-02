import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize } from '../../core/auth/authMiddleware';
import { prisma } from '../../db/client';
import { NotificationService } from './notificationService';

const notificationService = new NotificationService(prisma);

export const notificationRoutes = Router();

notificationRoutes.use(authenticate, authorize(['admin', 'ops']));

notificationRoutes.get('/', async (request, response, next) => {
  try {
    const unreadOnly = request.query.unreadOnly === 'true';
    const limit = Math.min(Number(request.query.limit) || 50, 100);
    const offset = Number(request.query.offset) || 0;
    const notifications = await notificationService.list({ unreadOnly, limit, offset });
    response.status(200).json(notifications);
  } catch (error) {
    next(error);
  }
});

notificationRoutes.get('/unread-count', async (_request, response, next) => {
  try {
    const count = await notificationService.unreadCount();
    response.status(200).json({ count });
  } catch (error) {
    next(error);
  }
});

const markReadSchema = z.object({
  ids: z.array(z.string().uuid())
});

notificationRoutes.post('/mark-read', async (request, response, next) => {
  try {
    const { ids } = markReadSchema.parse(request.body);
    await notificationService.markRead(ids);
    response.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

notificationRoutes.post('/mark-all-read', async (_request, response, next) => {
  try {
    await notificationService.markAllRead();
    response.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});
