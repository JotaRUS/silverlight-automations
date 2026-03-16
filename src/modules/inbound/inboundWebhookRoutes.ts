import express, { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../../core/errors/appError';
import type { RequestWithRawBody } from '../../core/http/rawBody';
import { getRequestContext } from '../../core/http/requestContext';
import { logger } from '../../core/logging/logger';
import { EVENT_CATEGORIES } from '../../core/logging/observability';
import { prisma } from '../../db/client';
import { ProcessedWebhookEventsRepository } from '../../db/repositories/processedWebhookEventsRepository';
import { ProviderAccountsService } from '../providers/providerAccountsService';

import { InboundMessageService, InboundResolutionError } from './inboundMessageService';
import {
  parse2ChatInbound,
  parseKakaoInbound,
  parseLineInbound,
  parseRespondioInbound,
  parseSendGridInbound,
  parseTelegramInbound,
  parseTwilioInbound,
  parseViberInbound,
  parseWeChatInbound
} from './providerParsers';
import {
  verify2ChatSignature,
  verifyKakaoAuth,
  verifyLineSignature,
  verifyRespondioAuth,
  verifySendGridAuth,
  verifyTelegramSecret,
  verifyTwilioSignature,
  verifyViberSignature,
  verifyWeChatSignature
} from './webhookVerifiers';

const processedEvents = new ProcessedWebhookEventsRepository(prisma);
const providerAccounts = new ProviderAccountsService(prisma);
const inboundService = new InboundMessageService(prisma);

const providerAccountIdSchema = z.object({
  providerAccountId: z.string().uuid()
});

export const inboundWebhookRoutes = Router();

function credentialString(creds: Record<string, unknown>, key: string): string {
  const val = creds[key];
  return typeof val === 'string' ? val : '';
}

async function dedup(eventId: string, payload: unknown): Promise<boolean> {
  try {
    await processedEvents.registerEventIfNew({ eventId, payload });
    return false;
  } catch (error) {
    if (error instanceof AppError && error.errorCode === 'duplicate_webhook_event') {
      return true;
    }
    throw error;
  }
}

function logAccepted(
  provider: string,
  eventId: string,
  result: { expertId: string; threadId: string; screeningResponseUpdated: boolean }
): void {
  logger.info(
    {
      category: EVENT_CATEGORIES.WEBHOOK,
      provider,
      correlationId: getRequestContext()?.correlationId,
      eventId,
      expertId: result.expertId,
      threadId: result.threadId,
      screeningResponseUpdated: result.screeningResponseUpdated
    },
    `${provider}-inbound-accepted`
  );
}

// ---------------------------------------------------------------------------
// Twilio  (SMS + Voicemail transcription)
// POST /webhooks/twilio/:providerAccountId
// Content-Type: application/x-www-form-urlencoded
// ---------------------------------------------------------------------------
inboundWebhookRoutes.post(
  '/twilio/:providerAccountId',
  express.urlencoded({ extended: false }),
  async (request, response, next) => {
    try {
      const params = providerAccountIdSchema.parse(request.params);
      const account = await providerAccounts.getActiveAccountOrThrow(params.providerAccountId, 'TWILIO');
      const credentials = await providerAccounts.getDecryptedCredentials(account.id, 'TWILIO');

      const fullUrl = `${request.protocol}://${request.get('host') ?? ''}${request.originalUrl}`;
      verifyTwilioSignature(
        fullUrl,
        request.body as Record<string, string>,
        request.header('x-twilio-signature'),
        credentialString(credentials, 'authToken')
      );

      const parsed = parseTwilioInbound(request.body);
      if (await dedup(parsed.providerMessageId, request.body)) {
        response.status(200).json({ accepted: false, reason: 'duplicate' });
        return;
      }

      const result = await inboundService.processInboundMessage({
        providerMessageId: parsed.providerMessageId,
        senderAddress: parsed.senderAddress,
        contactType: 'PHONE',
        channel: 'SMS',
        body: parsed.body,
        providerAccountId: account.id,
        rawPayload: request.body
      });

      logAccepted('twilio', parsed.providerMessageId, result);
      response.status(200).type('text/xml').send('<Response/>');
    } catch (error) {
      if (error instanceof InboundResolutionError) {
        logger.warn({ error: error.message }, 'twilio-inbound-unresolved');
        response.status(200).type('text/xml').send('<Response/>');
        return;
      }
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// SendGrid  Inbound Parse
// POST /webhooks/sendgrid/:providerAccountId
// Content-Type: application/x-www-form-urlencoded  or  application/json
// ---------------------------------------------------------------------------
inboundWebhookRoutes.post(
  '/sendgrid/:providerAccountId',
  express.urlencoded({ extended: false }),
  async (request, response, next) => {
    try {
      const params = providerAccountIdSchema.parse(request.params);
      const account = await providerAccounts.getActiveAccountOrThrow(params.providerAccountId, 'EMAIL_PROVIDER');
      const credentials = await providerAccounts.getDecryptedCredentials(account.id, 'EMAIL_PROVIDER');

      verifySendGridAuth(
        request.header('authorization'),
        credentialString(credentials, 'inboundParseVerificationKey')
      );

      const parsed = parseSendGridInbound(request.body);
      if (await dedup(parsed.providerMessageId, request.body)) {
        response.status(200).json({ accepted: false, reason: 'duplicate' });
        return;
      }

      const result = await inboundService.processInboundMessage({
        providerMessageId: parsed.providerMessageId,
        senderAddress: parsed.senderAddress,
        contactType: 'EMAIL',
        channel: 'EMAIL',
        body: parsed.body,
        providerAccountId: account.id,
        rawPayload: request.body
      });

      logAccepted('sendgrid', parsed.providerMessageId, result);
      response.status(200).json({ accepted: true });
    } catch (error) {
      if (error instanceof InboundResolutionError) {
        logger.warn({ error: error.message }, 'sendgrid-inbound-unresolved');
        response.status(200).json({ accepted: false, reason: 'unknown_sender' });
        return;
      }
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// 2Chat  (WhatsApp)
// POST /webhooks/2chat/:providerAccountId
// ---------------------------------------------------------------------------
inboundWebhookRoutes.post('/2chat/:providerAccountId', async (request, response, next) => {
  try {
    const params = providerAccountIdSchema.parse(request.params);
    const account = await providerAccounts.getActiveAccountOrThrow(params.providerAccountId, 'WHATSAPP_2CHAT');
    const credentials = await providerAccounts.getDecryptedCredentials(account.id, 'WHATSAPP_2CHAT');

    const secret = credentialString(credentials, 'webhookSecret') || credentialString(credentials, 'apiKey');
    verify2ChatSignature(request.header('x-user-api-key'), secret);

    const parsed = parse2ChatInbound(request.body);
    if (await dedup(parsed.providerMessageId, request.body)) {
      response.status(200).json({ accepted: false, reason: 'duplicate' });
      return;
    }

    const result = await inboundService.processInboundMessage({
      providerMessageId: parsed.providerMessageId,
      senderAddress: parsed.senderAddress,
      contactType: 'PHONE',
      channel: 'WHATSAPP',
      body: parsed.body,
      providerAccountId: account.id,
      rawPayload: request.body
    });

    logAccepted('2chat', parsed.providerMessageId, result);
    response.status(200).json({ accepted: true });
  } catch (error) {
    if (error instanceof InboundResolutionError) {
      logger.warn({ error: error.message }, '2chat-inbound-unresolved');
      response.status(200).json({ accepted: false, reason: 'unknown_sender' });
      return;
    }
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Respond.io
// POST /webhooks/respondio/:providerAccountId
// ---------------------------------------------------------------------------
inboundWebhookRoutes.post('/respondio/:providerAccountId', async (request, response, next) => {
  try {
    const params = providerAccountIdSchema.parse(request.params);
    const account = await providerAccounts.getActiveAccountOrThrow(params.providerAccountId, 'RESPONDIO');
    const credentials = await providerAccounts.getDecryptedCredentials(account.id, 'RESPONDIO');

    verifyRespondioAuth(request.header('authorization'), credentialString(credentials, 'apiKey'));

    const parsed = parseRespondioInbound(request.body);
    if (await dedup(parsed.providerMessageId, request.body)) {
      response.status(200).json({ accepted: false, reason: 'duplicate' });
      return;
    }

    const result = await inboundService.processInboundMessage({
      providerMessageId: parsed.providerMessageId,
      senderAddress: parsed.senderAddress,
      contactType: 'PHONE',
      channel: 'RESPONDIO',
      body: parsed.body,
      providerAccountId: account.id,
      rawPayload: request.body
    });

    logAccepted('respondio', parsed.providerMessageId, result);
    response.status(200).json({ accepted: true });
  } catch (error) {
    if (error instanceof InboundResolutionError) {
      logger.warn({ error: error.message }, 'respondio-inbound-unresolved');
      response.status(200).json({ accepted: false, reason: 'unknown_sender' });
      return;
    }
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Telegram
// POST /webhooks/telegram/:providerAccountId
// ---------------------------------------------------------------------------
inboundWebhookRoutes.post('/telegram/:providerAccountId', async (request, response, next) => {
  try {
    const params = providerAccountIdSchema.parse(request.params);
    const account = await providerAccounts.getActiveAccountOrThrow(params.providerAccountId, 'TELEGRAM');
    const credentials = await providerAccounts.getDecryptedCredentials(account.id, 'TELEGRAM');

    verifyTelegramSecret(
      request.header('x-telegram-bot-api-secret-token'),
      credentialString(credentials, 'webhookSecretToken')
    );

    const parsed = parseTelegramInbound(request.body);
    if (await dedup(parsed.providerMessageId, request.body)) {
      response.status(200).json({ accepted: false, reason: 'duplicate' });
      return;
    }

    const result = await inboundService.processInboundMessage({
      providerMessageId: parsed.providerMessageId,
      senderAddress: parsed.senderAddress,
      contactType: 'PHONE',
      channel: 'TELEGRAM',
      body: parsed.body,
      providerAccountId: account.id,
      rawPayload: request.body
    });

    logAccepted('telegram', parsed.providerMessageId, result);
    response.status(200).json({ accepted: true });
  } catch (error) {
    if (error instanceof InboundResolutionError) {
      logger.warn({ error: error.message }, 'telegram-inbound-unresolved');
      response.status(200).json({ accepted: false, reason: 'unknown_sender' });
      return;
    }
    next(error);
  }
});

// ---------------------------------------------------------------------------
// LINE
// POST /webhooks/line/:providerAccountId
// ---------------------------------------------------------------------------
inboundWebhookRoutes.post('/line/:providerAccountId', async (request, response, next) => {
  try {
    const params = providerAccountIdSchema.parse(request.params);
    const account = await providerAccounts.getActiveAccountOrThrow(params.providerAccountId, 'LINE');
    const credentials = await providerAccounts.getDecryptedCredentials(account.id, 'LINE');

    const rawBody = (request as RequestWithRawBody).rawBody ?? JSON.stringify(request.body);
    const channelSecret = credentialString(credentials, 'channelSecret');
    if (channelSecret) {
      verifyLineSignature(rawBody, request.header('x-line-signature'), channelSecret);
    }

    const parsed = parseLineInbound(request.body);
    if (await dedup(parsed.providerMessageId, request.body)) {
      response.status(200).json({ accepted: false, reason: 'duplicate' });
      return;
    }

    const result = await inboundService.processInboundMessage({
      providerMessageId: parsed.providerMessageId,
      senderAddress: parsed.senderAddress,
      contactType: 'PHONE',
      channel: 'LINE',
      body: parsed.body,
      providerAccountId: account.id,
      rawPayload: request.body
    });

    logAccepted('line', parsed.providerMessageId, result);
    response.status(200).json({ accepted: true });
  } catch (error) {
    if (error instanceof InboundResolutionError) {
      logger.warn({ error: error.message }, 'line-inbound-unresolved');
      response.status(200).json({ accepted: false, reason: 'unknown_sender' });
      return;
    }
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Viber
// POST /webhooks/viber/:providerAccountId
// ---------------------------------------------------------------------------
inboundWebhookRoutes.post('/viber/:providerAccountId', async (request, response, next) => {
  try {
    const params = providerAccountIdSchema.parse(request.params);
    const account = await providerAccounts.getActiveAccountOrThrow(params.providerAccountId, 'VIBER');
    const credentials = await providerAccounts.getDecryptedCredentials(account.id, 'VIBER');

    const rawBody = (request as RequestWithRawBody).rawBody ?? JSON.stringify(request.body);
    verifyViberSignature(rawBody, request.header('x-viber-content-signature'), credentialString(credentials, 'apiKey'));

    const parsed = parseViberInbound(request.body);
    if (await dedup(parsed.providerMessageId, request.body)) {
      response.status(200).json({ accepted: false, reason: 'duplicate' });
      return;
    }

    const result = await inboundService.processInboundMessage({
      providerMessageId: parsed.providerMessageId,
      senderAddress: parsed.senderAddress,
      contactType: 'PHONE',
      channel: 'VIBER',
      body: parsed.body,
      providerAccountId: account.id,
      rawPayload: request.body
    });

    logAccepted('viber', parsed.providerMessageId, result);
    response.status(200).json({ accepted: true });
  } catch (error) {
    if (error instanceof InboundResolutionError) {
      logger.warn({ error: error.message }, 'viber-inbound-unresolved');
      response.status(200).json({ accepted: false, reason: 'unknown_sender' });
      return;
    }
    next(error);
  }
});

// ---------------------------------------------------------------------------
// KakaoTalk
// POST /webhooks/kakaotalk/:providerAccountId
// ---------------------------------------------------------------------------
inboundWebhookRoutes.post('/kakaotalk/:providerAccountId', async (request, response, next) => {
  try {
    const params = providerAccountIdSchema.parse(request.params);
    const account = await providerAccounts.getActiveAccountOrThrow(params.providerAccountId, 'KAKAOTALK');
    const credentials = await providerAccounts.getDecryptedCredentials(account.id, 'KAKAOTALK');

    verifyKakaoAuth(request.header('authorization'), credentialString(credentials, 'apiKey'));

    const parsed = parseKakaoInbound(request.body);
    if (await dedup(parsed.providerMessageId, request.body)) {
      response.status(200).json({ accepted: false, reason: 'duplicate' });
      return;
    }

    const result = await inboundService.processInboundMessage({
      providerMessageId: parsed.providerMessageId,
      senderAddress: parsed.senderAddress,
      contactType: 'PHONE',
      channel: 'KAKAOTALK',
      body: parsed.body,
      providerAccountId: account.id,
      rawPayload: request.body
    });

    logAccepted('kakaotalk', parsed.providerMessageId, result);
    response.status(200).json({ accepted: true });
  } catch (error) {
    if (error instanceof InboundResolutionError) {
      logger.warn({ error: error.message }, 'kakaotalk-inbound-unresolved');
      response.status(200).json({ accepted: false, reason: 'unknown_sender' });
      return;
    }
    next(error);
  }
});

// ---------------------------------------------------------------------------
// WeChat
// POST /webhooks/wechat/:providerAccountId
// GET  /webhooks/wechat/:providerAccountId  (verification challenge)
// ---------------------------------------------------------------------------
inboundWebhookRoutes.get('/wechat/:providerAccountId', async (request, response, next) => {
  try {
    const params = providerAccountIdSchema.parse(request.params);
    const account = await providerAccounts.getActiveAccountOrThrow(params.providerAccountId, 'WECHAT');
    const credentials = await providerAccounts.getDecryptedCredentials(account.id, 'WECHAT');

    const query = request.query as Record<string, string | undefined>;
    const token = credentialString(credentials, 'verifyToken');
    if (token) {
      verifyWeChatSignature(query.signature, query.timestamp, query.nonce, token);
    }
    response.status(200).send(query.echostr ?? 'ok');
  } catch (error) {
    next(error);
  }
});

inboundWebhookRoutes.post('/wechat/:providerAccountId', async (request, response, next) => {
  try {
    const params = providerAccountIdSchema.parse(request.params);
    const account = await providerAccounts.getActiveAccountOrThrow(params.providerAccountId, 'WECHAT');
    const credentials = await providerAccounts.getDecryptedCredentials(account.id, 'WECHAT');

    const token = credentialString(credentials, 'verifyToken');
    if (token) {
      const q = request.query as Record<string, string | undefined>;
      verifyWeChatSignature(q.signature, q.timestamp, q.nonce, token);
    }

    const parsed = parseWeChatInbound(request.body);
    if (await dedup(parsed.providerMessageId, request.body)) {
      response.status(200).send('success');
      return;
    }

    const result = await inboundService.processInboundMessage({
      providerMessageId: parsed.providerMessageId,
      senderAddress: parsed.senderAddress,
      contactType: 'PHONE',
      channel: 'WECHAT',
      body: parsed.body,
      providerAccountId: account.id,
      rawPayload: request.body
    });

    logAccepted('wechat', parsed.providerMessageId, result);
    response.status(200).send('success');
  } catch (error) {
    if (error instanceof InboundResolutionError) {
      logger.warn({ error: error.message }, 'wechat-inbound-unresolved');
      response.status(200).send('success');
      return;
    }
    next(error);
  }
});
