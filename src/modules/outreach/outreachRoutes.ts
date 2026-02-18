import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';

const sendOutreachMessageSchema = z.object({
  projectId: z.string().uuid(),
  expertId: z.string().uuid(),
  channel: z.enum([
    'PHONE',
    'EMAIL',
    'LINKEDIN',
    'WHATSAPP',
    'RESPONDIO',
    'SMS',
    'IMESSAGE',
    'LINE',
    'WECHAT',
    'VIBER',
    'TELEGRAM',
    'KAKAOTALK',
    'VOICEMAIL'
  ]),
  recipient: z.string().min(1),
  body: z.string().min(1),
  overrideCooldown: z.boolean().default(false)
});

export const outreachRoutes = Router();

outreachRoutes.use(authenticate, authorize(['admin', 'ops']));

outreachRoutes.post('/send', async (request, response, next) => {
  try {
    const parsed = sendOutreachMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid outreach payload', 400, 'invalid_payload', parsed.error.flatten());
    }

    const correlationId = getRequestContext()?.correlationId ?? 'system';
    const jobId = buildJobId(
      'outreach',
      parsed.data.projectId,
      parsed.data.expertId,
      parsed.data.channel,
      correlationId
    );

    await getQueues().outreachQueue.add(
      'outreach.send-message',
      {
        correlationId,
        data: parsed.data
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
