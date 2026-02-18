import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { prisma } from '../../db/client';
import { callerCreateSchema, callerPathParamsSchema, callerUpdateSchema } from './callersSchemas';
import { CallersService } from './callersService';

const callersService = new CallersService(prisma);

function parseOrThrow<TOutput>(
  schema: z.ZodType<TOutput>,
  value: unknown
): TOutput {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('Invalid payload', 400, 'invalid_payload', parsed.error.flatten());
  }
  return parsed.data;
}

export const callersRoutes = Router();

callersRoutes.use(authenticate, authorize(['admin', 'ops']));

callersRoutes.post('/', async (request, response, next) => {
  try {
    const payload = parseOrThrow(callerCreateSchema, request.body);
    const caller = await callersService.createCaller(payload);
    response.status(201).json(caller);
  } catch (error) {
    next(error);
  }
});

callersRoutes.get('/:callerId', async (request, response, next) => {
  try {
    const params = parseOrThrow(callerPathParamsSchema, request.params);
    const caller = await callersService.getCaller(params.callerId);
    if (!caller) {
      throw new AppError('Caller not found', 404, 'caller_not_found');
    }
    response.status(200).json(caller);
  } catch (error) {
    next(error);
  }
});

callersRoutes.patch('/:callerId', async (request, response, next) => {
  try {
    const params = parseOrThrow(callerPathParamsSchema, request.params);
    const payload = parseOrThrow(callerUpdateSchema, request.body);
    const caller = await callersService.updateCaller(params.callerId, payload);
    response.status(200).json(caller);
  } catch (error) {
    next(error);
  }
});

callersRoutes.get('/:callerId/performance/latest', async (request, response, next) => {
  try {
    const params = parseOrThrow(callerPathParamsSchema, request.params);
    const performance = await callersService.getLatestPerformance(params.callerId);
    response.status(200).json(performance);
  } catch (error) {
    next(error);
  }
});
