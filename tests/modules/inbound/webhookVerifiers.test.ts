import { createHash, createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

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
} from '../../../src/modules/inbound/webhookVerifiers';

describe('verifyTwilioSignature', () => {
  const authToken = 'test-auth-token';
  const url = 'https://example.com/webhooks/twilio/abc';
  const params = { Body: 'Hello', From: '+1234', MessageSid: 'SM1' };

  function computeSignature(): string {
    const keys = Object.keys(params).sort();
    let data = url;
    for (const key of keys) {
      data += key + params[key as keyof typeof params];
    }
    return createHmac('sha1', authToken).update(data).digest('base64');
  }

  it('accepts valid signature', () => {
    expect(() =>
      verifyTwilioSignature(url, params, computeSignature(), authToken)
    ).not.toThrow();
  });

  it('rejects invalid signature', () => {
    expect(() =>
      verifyTwilioSignature(url, params, 'bad-sig', authToken)
    ).toThrow('Invalid Twilio signature');
  });

  it('rejects missing signature', () => {
    expect(() =>
      verifyTwilioSignature(url, params, undefined, authToken)
    ).toThrow('Missing x-twilio-signature');
  });
});

describe('verifySendGridAuth', () => {
  it('accepts valid basic auth', () => {
    const key = 'my-verification-key';
    const encoded = Buffer.from(`user:${key}`).toString('base64');
    expect(() =>
      verifySendGridAuth(`Basic ${encoded}`, key)
    ).not.toThrow();
  });

  it('rejects wrong password', () => {
    const encoded = Buffer.from('user:wrong').toString('base64');
    expect(() =>
      verifySendGridAuth(`Basic ${encoded}`, 'correct')
    ).toThrow('Invalid SendGrid credentials');
  });

  it('skips when no verification key configured', () => {
    expect(() => verifySendGridAuth(undefined, '')).not.toThrow();
  });
});

describe('verify2ChatSignature', () => {
  it('accepts matching API key', () => {
    expect(() => verify2ChatSignature('my-key', 'my-key')).not.toThrow();
  });

  it('rejects mismatched key', () => {
    expect(() => verify2ChatSignature('wrong', 'correct')).toThrow('Invalid 2Chat API key');
  });

  it('rejects missing header', () => {
    expect(() => verify2ChatSignature(undefined, 'key')).toThrow('Missing X-User-API-Key');
  });
});

describe('verifyRespondioAuth', () => {
  it('accepts valid bearer token', () => {
    expect(() => verifyRespondioAuth('Bearer my-token', 'my-token')).not.toThrow();
  });

  it('rejects wrong token', () => {
    expect(() => verifyRespondioAuth('Bearer wrong', 'correct')).toThrow('Invalid Respond.io token');
  });
});

describe('verifyTelegramSecret', () => {
  it('accepts matching secret', () => {
    expect(() => verifyTelegramSecret('abc123', 'abc123')).not.toThrow();
  });

  it('rejects mismatched secret', () => {
    expect(() => verifyTelegramSecret('wrong', 'correct')).toThrow('Invalid Telegram secret');
  });

  it('skips when no secret configured', () => {
    expect(() => verifyTelegramSecret(undefined, '')).not.toThrow();
  });
});

describe('verifyLineSignature', () => {
  const channelSecret = 'line-secret';
  const body = '{"events":[]}';

  it('accepts valid HMAC', () => {
    const sig = createHmac('sha256', channelSecret).update(body).digest('base64');
    expect(() => verifyLineSignature(body, sig, channelSecret)).not.toThrow();
  });

  it('rejects invalid HMAC', () => {
    expect(() => verifyLineSignature(body, 'bad', channelSecret)).toThrow('Invalid LINE signature');
  });
});

describe('verifyViberSignature', () => {
  const authToken = 'viber-token';
  const body = '{"event":"message"}';

  it('accepts valid HMAC', () => {
    const sig = createHmac('sha256', authToken).update(body).digest('hex');
    expect(() => verifyViberSignature(body, sig, authToken)).not.toThrow();
  });

  it('rejects invalid HMAC', () => {
    expect(() => verifyViberSignature(body, 'bad', authToken)).toThrow('Invalid Viber signature');
  });
});

describe('verifyKakaoAuth', () => {
  it('accepts KakaoAK header', () => {
    expect(() => verifyKakaoAuth('KakaoAK my-key', 'my-key')).not.toThrow();
  });

  it('rejects mismatched key', () => {
    expect(() => verifyKakaoAuth('KakaoAK wrong', 'correct')).toThrow('Invalid KakaoTalk API key');
  });
});

describe('verifyWeChatSignature', () => {
  const token = 'wechat-token';
  const timestamp = '1700000000';
  const nonce = 'abc123';

  function computeSignature(): string {
    const sorted = [token, timestamp, nonce].sort().join('');
    return createHash('sha1').update(sorted).digest('hex');
  }

  it('accepts valid signature', () => {
    expect(() =>
      verifyWeChatSignature(computeSignature(), timestamp, nonce, token)
    ).not.toThrow();
  });

  it('rejects invalid signature', () => {
    expect(() =>
      verifyWeChatSignature('bad', timestamp, nonce, token)
    ).toThrow('Invalid WeChat signature');
  });

  it('rejects missing params', () => {
    expect(() =>
      verifyWeChatSignature(undefined, timestamp, nonce, token)
    ).toThrow('Missing WeChat verification');
  });
});
