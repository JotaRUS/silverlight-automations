import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { AppError } from '../../core/errors/appError';

const WEBHOOK_ERROR_CODE = 'invalid_webhook_signature';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Twilio — HMAC-SHA1 of (url + sorted params) using authToken
// https://www.twilio.com/docs/usage/security#validating-requests
// ---------------------------------------------------------------------------
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
  authToken: string
): void {
  if (!signature) {
    throw new AppError('Missing x-twilio-signature header', 400, WEBHOOK_ERROR_CODE);
  }

  const keys = Object.keys(params).sort();
  let data = url;
  for (const key of keys) {
    data += key + params[key];
  }

  const computed = createHmac('sha1', authToken).update(data).digest('base64');
  if (!safeCompare(computed, signature)) {
    throw new AppError('Invalid Twilio signature', 401, WEBHOOK_ERROR_CODE);
  }
}

// ---------------------------------------------------------------------------
// SendGrid Inbound Parse — basic-auth or verification key header
// ---------------------------------------------------------------------------
export function verifySendGridAuth(
  authHeader: string | undefined,
  verificationKey: string
): void {
  if (!verificationKey) return;

  if (!authHeader) {
    throw new AppError('Missing Authorization header for SendGrid', 401, WEBHOOK_ERROR_CODE);
  }

  const parts = authHeader.split(' ');
  const encoded = parts.length > 1 ? parts[1] : '';
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  const [, password] = decoded.split(':');

  if (!password || !safeCompare(password, verificationKey)) {
    throw new AppError('Invalid SendGrid credentials', 401, WEBHOOK_ERROR_CODE);
  }
}

// ---------------------------------------------------------------------------
// 2Chat — API key comparison via header
// ---------------------------------------------------------------------------
export function verify2ChatSignature(
  apiKeyHeader: string | undefined,
  apiKey: string
): void {
  if (!apiKeyHeader) {
    throw new AppError('Missing X-User-API-Key header for 2Chat', 400, WEBHOOK_ERROR_CODE);
  }
  if (!safeCompare(apiKeyHeader, apiKey)) {
    throw new AppError('Invalid 2Chat API key', 401, WEBHOOK_ERROR_CODE);
  }
}

// ---------------------------------------------------------------------------
// Respond.io — Bearer token in Authorization header
// ---------------------------------------------------------------------------
export function verifyRespondioAuth(
  authHeader: string | undefined,
  apiKey: string
): void {
  if (!authHeader) {
    throw new AppError('Missing Authorization header for Respond.io', 400, WEBHOOK_ERROR_CODE);
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!safeCompare(token, apiKey)) {
    throw new AppError('Invalid Respond.io token', 401, WEBHOOK_ERROR_CODE);
  }
}

// ---------------------------------------------------------------------------
// Telegram — X-Telegram-Bot-Api-Secret-Token header
// https://core.telegram.org/bots/api#setwebhook
// ---------------------------------------------------------------------------
export function verifyTelegramSecret(
  secretHeader: string | undefined,
  secretToken: string
): void {
  if (!secretToken) return;
  if (!secretHeader) {
    throw new AppError('Missing X-Telegram-Bot-Api-Secret-Token header', 400, WEBHOOK_ERROR_CODE);
  }
  if (!safeCompare(secretHeader, secretToken)) {
    throw new AppError('Invalid Telegram secret token', 401, WEBHOOK_ERROR_CODE);
  }
}

// ---------------------------------------------------------------------------
// LINE — HMAC-SHA256 of rawBody using channelSecret
// https://developers.line.biz/en/docs/messaging-api/receiving-messages/
// ---------------------------------------------------------------------------
export function verifyLineSignature(
  rawBody: string,
  signature: string | undefined,
  channelSecret: string
): void {
  if (!signature) {
    throw new AppError('Missing x-line-signature header', 400, WEBHOOK_ERROR_CODE);
  }
  const computed = createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  if (!safeCompare(computed, signature)) {
    throw new AppError('Invalid LINE signature', 401, WEBHOOK_ERROR_CODE);
  }
}

// ---------------------------------------------------------------------------
// Viber — HMAC-SHA256 of rawBody using auth token
// https://developers.viber.com/docs/api/rest-bot-api/#callbacks
// ---------------------------------------------------------------------------
export function verifyViberSignature(
  rawBody: string,
  signature: string | undefined,
  authToken: string
): void {
  if (!signature) {
    throw new AppError('Missing X-Viber-Content-Signature header', 400, WEBHOOK_ERROR_CODE);
  }
  const computed = createHmac('sha256', authToken).update(rawBody).digest('hex');
  if (!safeCompare(computed, signature)) {
    throw new AppError('Invalid Viber signature', 401, WEBHOOK_ERROR_CODE);
  }
}

// ---------------------------------------------------------------------------
// KakaoTalk — API key in Authorization header
// ---------------------------------------------------------------------------
export function verifyKakaoAuth(
  authHeader: string | undefined,
  apiKey: string
): void {
  if (!authHeader) {
    throw new AppError('Missing Authorization header for KakaoTalk', 400, WEBHOOK_ERROR_CODE);
  }
  const token = authHeader.replace(/^KakaoAK\s+/i, '').trim();
  if (!safeCompare(token, apiKey)) {
    throw new AppError('Invalid KakaoTalk API key', 401, WEBHOOK_ERROR_CODE);
  }
}

// ---------------------------------------------------------------------------
// WeChat — SHA1(sort(token, timestamp, nonce)) === signature
// https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Access_Overview.html
// ---------------------------------------------------------------------------
export function verifyWeChatSignature(
  signature: string | undefined,
  timestamp: string | undefined,
  nonce: string | undefined,
  token: string
): void {
  if (!signature || !timestamp || !nonce) {
    throw new AppError('Missing WeChat verification params', 400, WEBHOOK_ERROR_CODE);
  }
  const sorted = [token, timestamp, nonce].sort().join('');
  const computed = createHash('sha1').update(sorted).digest('hex');
  if (!safeCompare(computed, signature)) {
    throw new AppError('Invalid WeChat signature', 401, WEBHOOK_ERROR_CODE);
  }
}
