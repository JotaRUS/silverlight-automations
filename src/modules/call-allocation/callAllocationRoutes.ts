import { Router } from 'express';
import { z } from 'zod';

import { authenticate, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { prisma } from '../../db/client';
import { CallAllocationService } from './callAllocationService';

const callOutcomeSchema = z.object({
  outcome: z.enum(['INTERESTED_SIGNUP_LINK_SENT', 'RETRYABLE_REJECTION', 'NEVER_CONTACT_AGAIN'])
});

const taskParamsSchema = z.object({
  taskId: z.string().uuid()
});

const callAllocationService = new CallAllocationService(prisma);

export const callAllocationRoutes = Router();

callAllocationRoutes.use(authenticate);

callAllocationRoutes.get('/current', async (request, response, next) => {
  try {
    const auth = (request as RequestWithAuth).auth;
    if (!auth) {
      throw new AppError('Unauthorized', 401, 'unauthorized');
    }
    const currentTask = await callAllocationService.fetchOrAssignCurrentTask(auth.userId);
    response.status(200).json(currentTask);
  } catch (error) {
    next(error);
  }
});

callAllocationRoutes.post('/:taskId/outcome', async (request, response, next) => {
  try {
    const auth = (request as RequestWithAuth).auth;
    if (!auth) {
      throw new AppError('Unauthorized', 401, 'unauthorized');
    }
    const params = taskParamsSchema.parse(request.params);
    const payload = callOutcomeSchema.parse(request.body);
    await callAllocationService.submitCallOutcome(auth.userId, params.taskId, payload.outcome);
    response.status(200).json({
      accepted: true
    });
  } catch (error) {
    next(error);
  }
});
