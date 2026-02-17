import { Router } from 'express';

import { AppError } from '../../core/errors/appError';
import { logger } from '../../core/logging/logger';
import { getRequestContext } from '../../core/http/requestContext';
import type { RequestWithRawBody } from '../../core/http/rawBody';
import { prisma } from '../../db/client';
import { CallLogRawRepository } from '../../db/repositories/callLogRawRepository';
import { ProcessedWebhookEventsRepository } from '../../db/repositories/processedWebhookEventsRepository';
import { getQueues } from '../../queues';
import { parseYayWebhookEvent } from '../../integrations/yay/eventParser';
import { verifyYayWebhookSignature } from '../../integrations/yay/webhookVerifier';
import { EVENT_CATEGORIES } from '../../core/logging/observability';

const callLogRawRepository = new CallLogRawRepository(prisma);
const processedWebhookEventsRepository = new ProcessedWebhookEventsRepository(prisma);

export const webhookRoutes = Router();

webhookRoutes.post('/yay', async (request, response, next) => {
  try {
    const requestWithRawBody = request as RequestWithRawBody;
    const rawBody = requestWithRawBody.rawBody ?? JSON.stringify(request.body);
    const verification = verifyYayWebhookSignature(
      {
        signature: request.header('x-yay-signature'),
        timestamp: request.header('x-yay-timestamp'),
        eventId: request.header('x-yay-event-id')
      },
      rawBody
    );
    const event = parseYayWebhookEvent(request.body);

    try {
      await processedWebhookEventsRepository.registerEventIfNew({
        eventId: verification.eventId,
        payload: request.body
      });
    } catch (error) {
      if (error instanceof AppError && error.errorCode === 'duplicate_webhook_event') {
        response.status(200).json({
          accepted: false,
          reason: 'duplicate'
        });
        return;
      }
      throw error;
    }

    const correlationId = getRequestContext()?.correlationId;
    await callLogRawRepository.store({
      eventId: event.event_id,
      eventType: event.event_type,
      accountId: event.account_id,
      payload: event,
      correlationId
    });

    await getQueues().yayCallEventsQueue.add(
      `yay-${event.event_type}`,
      {
        correlationId,
        data: event
      },
      {
        jobId: `yay:${event.event_id}`,
        removeOnFail: false
      }
    );

    logger.info(
      {
        category: EVENT_CATEGORIES.WEBHOOK,
        correlationId,
        eventId: event.event_id,
        eventType: event.event_type
      },
      'yay-webhook-accepted'
    );

    response.status(200).json({
      accepted: true
    });
  } catch (error) {
    next(error);
  }
});
