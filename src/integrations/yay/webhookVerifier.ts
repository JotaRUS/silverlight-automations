import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '../../config/env';
import { YAY_WEBHOOK } from '../../config/constants';
import { AppError } from '../../core/errors/appError';
import { clock } from '../../core/time/clock';

export interface YayWebhookHeaders {
  signature?: string;
  timestamp?: string;
  eventId?: string;
}

export function verifyYayWebhookSignature(
  headers: YayWebhookHeaders,
  rawBody: string
): { eventId: string } {
  const signature = headers.signature;
  const timestamp = headers.timestamp;
  const eventId = headers.eventId;
  if (!signature || !timestamp || !eventId) {
    throw new AppError('Missing Yay webhook headers', 400, 'missing_webhook_headers');
  }
  if (!env.YAY_WEBHOOK_SECRET) {
    throw new AppError('Yay webhook secret is not configured', 500, 'yay_secret_missing');
  }

  const now = clock.now().getTime();
  const incomingTimestamp = new Date(timestamp).getTime();
  if (!Number.isFinite(incomingTimestamp)) {
    throw new AppError('Invalid webhook timestamp', 400, 'invalid_webhook_timestamp');
  }
  if (Math.abs(now - incomingTimestamp) > YAY_WEBHOOK.MAX_EVENT_AGE_MS) {
    throw new AppError('Stale webhook timestamp', 401, 'stale_webhook_timestamp');
  }

  const computedSignature = createHmac('sha256', env.YAY_WEBHOOK_SECRET)
    .update(timestamp + rawBody)
    .digest('hex');

  const incomingSignatureBuffer = Buffer.from(signature, 'hex');
  const computedSignatureBuffer = Buffer.from(computedSignature, 'hex');

  if (
    incomingSignatureBuffer.length !== computedSignatureBuffer.length ||
    !timingSafeEqual(incomingSignatureBuffer, computedSignatureBuffer)
  ) {
    throw new AppError('Invalid webhook signature', 401, 'invalid_webhook_signature');
  }

  return { eventId };
}
