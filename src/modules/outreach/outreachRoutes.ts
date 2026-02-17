import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize } from '../../core/auth/authMiddleware';
import { AppError } from '../../core/errors/appError';
import { prisma } from '../../db/client';
import { OutreachService } from './outreachService';

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

const outreachService = new OutreachService(prisma);

export const outreachRoutes = Router();

outreachRoutes.use(authenticate, authorize(['admin', 'ops']));

outreachRoutes.post('/send', async (request, response, next) => {
  try {
    const parsed = sendOutreachMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError('Invalid outreach payload', 400, 'invalid_payload', parsed.error.flatten());
    }
    const result = await outreachService.sendMessage(parsed.data);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
