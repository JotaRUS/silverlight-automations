import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { prisma } from '../../db/client';
import { CallAllocationService } from './callAllocationService';

const callOutcomeSchema = z.object({
  outcome: z.enum(['INTERESTED_SIGNUP_LINK_SENT', 'RETRYABLE_REJECTION', 'NEVER_CONTACT_AGAIN'])
});

const taskParamsSchema = z.object({
  taskId: z.string().uuid()
});

const operatorTaskQuerySchema = z.object({
  status: z.enum(['PENDING', 'ASSIGNED', 'DIALING', 'COMPLETED']).optional(),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const operatorRequeueSchema = z.object({
  reason: z.string().max(500).optional()
});

const callAllocationService = new CallAllocationService(prisma);

export const callAllocationRoutes = Router();

callAllocationRoutes.use(authenticate);

callAllocationRoutes.get('/current', authorize(['caller']), async (request, response, next) => {
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

callAllocationRoutes.post('/:taskId/outcome', authorize(['caller']), async (request, response, next) => {
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

callAllocationRoutes.get('/operator/tasks', authorize(['admin', 'ops']), async (request, response, next) => {
  try {
    const query = operatorTaskQuerySchema.parse(request.query);
    const tasks = await callAllocationService.listOperatorTasks(query);
    response.status(200).json(tasks);
  } catch (error) {
    next(error);
  }
});

callAllocationRoutes.post(
  '/operator/tasks/:taskId/requeue',
  authorize(['admin', 'ops']),
  async (request, response, next) => {
    try {
      const auth = (request as RequestWithAuth).auth;
      if (!auth) {
        throw new AppError('Unauthorized', 401, 'unauthorized');
      }
      const params = taskParamsSchema.parse(request.params);
      const payload = operatorRequeueSchema.parse(request.body);
      await callAllocationService.requeueTaskByOperator(params.taskId, auth.userId, payload.reason);
      response.status(200).json({
        accepted: true
      });
    } catch (error) {
      next(error);
    }
  }
);
