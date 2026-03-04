import { createHmac, timingSafeEqual } from 'node:crypto';

export function computeLinkedInChallengeResponse(
  challengeCode: string,
  clientSecret: string
): string {
  return createHmac('sha256', clientSecret).update(challengeCode).digest('hex');
}

export function verifyLinkedInWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
  clientSecret: string
): boolean {
  const expected =
    'hmacsha256=' +
    createHmac('sha256', clientSecret).update(rawBody).digest('hex');

  if (expected.length !== signatureHeader.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
