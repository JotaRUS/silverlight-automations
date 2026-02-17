import { Router } from 'express';

import { authenticate, authorize } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import { getQueues } from '../../queues';
import { enqueueWithContext } from '../../queues/producers/enqueueWithContext';
import {
  jobTitleDiscoveryRequestSchema,
  type JobTitleDiscoveryRequest
} from './jobTitleDiscoverySchemas';

const JOB_NAME = 'job-title-discovery.run';

export const jobTitleDiscoveryRoutes = Router();

jobTitleDiscoveryRoutes.use(authenticate, authorize(['admin', 'ops']));

jobTitleDiscoveryRoutes.post('/trigger', async (request, response, next) => {
  try {
    const parsed = jobTitleDiscoveryRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid payload', 400, 'invalid_payload', parsed.error.flatten());
    }

    const payload: JobTitleDiscoveryRequest = parsed.data;
    const correlationId = getRequestContext()?.correlationId ?? 'system';
    await enqueueWithContext(
      getQueues().jobTitleDiscoveryQueue,
      JOB_NAME,
      payload,
      {
        jobId: `job-title-discovery:${payload.projectId}:${correlationId}`
      }
    );

    response.status(202).json({
      accepted: true
    });
  } catch (error) {
    next(error);
  }
});
