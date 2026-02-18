import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { prisma } from '../../db/client';
import { ScreeningService } from './screeningService';

const dispatchSchema = z.object({
  projectId: z.string().uuid(),
  expertId: z.string().uuid()
});

const responseSchema = z.object({
  projectId: z.string().uuid(),
  expertId: z.string().uuid(),
  questionId: z.string().uuid(),
  responseText: z.string().min(1)
});

const screeningService = new ScreeningService(prisma);

export const screeningRoutes = Router();

screeningRoutes.use(authenticate, authorize(['admin', 'ops']));

screeningRoutes.post('/dispatch', async (request, response, next) => {
  try {
    const parsed = dispatchSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid payload', 400, 'invalid_payload', parsed.error.flatten());
    }
    const sent = await screeningService.dispatchScreening(parsed.data);
    response.status(200).json({ sent });
  } catch (error) {
    next(error);
  }
});

screeningRoutes.post('/response', async (request, response, next) => {
  try {
    const parsed = responseSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid payload', 400, 'invalid_payload', parsed.error.flatten());
    }
    await screeningService.recordResponse(parsed.data);
    response.status(200).json({ accepted: true });
  } catch (error) {
    next(error);
  }
});
