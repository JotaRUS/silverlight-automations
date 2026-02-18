import { Router } from 'express';

import { authenticate, authorize, type RequestWithAuth } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';

export const documentationGeneratorRoutes = Router();

documentationGeneratorRoutes.use(authenticate, authorize(['admin', 'ops']));

documentationGeneratorRoutes.post('/generate', async (request, response, next) => {
  try {
    const auth = (request as RequestWithAuth).auth;
    if (!auth) {
      throw new AppError('Unauthorized', 401, 'unauthorized');
    }

    const correlationId = getRequestContext()?.correlationId ?? 'system';
    const jobId = buildJobId('documentation', auth.userId, correlationId);

    await getQueues().documentationQueue.add(
      'documentation.generate',
      {
        correlationId,
        data: {
          requestedByUserId: auth.userId
        }
      },
      {
        jobId
      }
    );

    response.status(202).json({
      accepted: true,
      jobId
    });
  } catch (error) {
    next(error);
  }
});
