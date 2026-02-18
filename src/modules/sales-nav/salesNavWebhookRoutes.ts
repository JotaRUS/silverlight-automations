import { Router } from 'express';

import { env } from '../../config/env';
import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';
import { enqueueWithContext } from '../../queues/producers/enqueueWithContext';
import { salesNavWebhookPayloadSchema } from './salesNavWebhookSchemas';

export const salesNavWebhookRoutes = Router();

salesNavWebhookRoutes.post('/', async (request, response, next) => {
  try {
    const secretHeader = request.header('x-sales-nav-secret');
    if (!secretHeader || secretHeader !== env.SALES_NAV_WEBHOOK_SECRET) {
      throw new AppError('Unauthorized sales navigator webhook', 401, 'sales_nav_webhook_unauthorized');
    }

    const parsed = salesNavWebhookPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid sales navigator payload', 400, 'invalid_payload', parsed.error.flatten());
    }

    const payload = parsed.data;
    const correlationId = getRequestContext()?.correlationId ?? 'system';
    await enqueueWithContext(getQueues().salesNavIngestionQueue, 'sales-nav.ingest', payload, {
      jobId: buildJobId('sales-nav', payload.projectId, payload.normalizedUrl, correlationId)
    });

    response.status(202).json({
      accepted: true
    });
  } catch (error) {
    next(error);
  }
});
