import { describe, expect, it } from 'vitest';

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
} from '../../../src/modules/inbound/providerParsers';

describe('parseTwilioInbound', () => {
  it('extracts From, Body, MessageSid', () => {
    const result = parseTwilioInbound({
      MessageSid: 'SM123abc',
      From: '+14155551234',
      Body: 'Hello from SMS',
      To: '+18005550000'
    });
    expect(result).toEqual({
      providerMessageId: 'SM123abc',
      senderAddress: '+14155551234',
      body: 'Hello from SMS'
    });
  });

  it('defaults Body to empty string', () => {
    const result = parseTwilioInbound({
      MessageSid: 'SM999',
      From: '+1234567890'
    });
    expect(result.body).toBe('');
  });

  it('rejects missing MessageSid', () => {
    expect(() => parseTwilioInbound({ From: '+1', Body: 'x' })).toThrow();
  });
});

describe('parseSendGridInbound', () => {
  it('extracts sender email and text body', () => {
    const result = parseSendGridInbound({
      from: 'Alice <alice@example.org>',
      text: 'Reply from email',
      subject: 'Re: Screening',
      envelope: JSON.stringify({ messageId: 'sg-msg-001' })
    });
    expect(result.providerMessageId).toBe('sg-msg-001');
    expect(result.senderAddress).toBe('alice@example.org');
    expect(result.body).toBe('Reply from email');
  });

  it('falls back to HTML when text is empty', () => {
    const result = parseSendGridInbound({
      from: 'bob@test.org',
      text: '',
      html: '<p>HTML reply</p>'
    });
    expect(result.body).toBe('HTML reply');
  });

  it('extracts bare email address', () => {
    const result = parseSendGridInbound({ from: 'plain@test.org', text: 'Hi' });
    expect(result.senderAddress).toBe('plain@test.org');
  });
});

describe('parse2ChatInbound', () => {
  it('extracts from_number and text', () => {
    const result = parse2ChatInbound({
      event: 'message.received',
      message: {
        id: 'wa-msg-001',
        from_number: '+5491155550000',
        text: 'WhatsApp reply',
        timestamp: 1700000000
      }
    });
    expect(result).toEqual({
      providerMessageId: 'wa-msg-001',
      senderAddress: '+5491155550000',
      body: 'WhatsApp reply'
    });
  });
});

describe('parseRespondioInbound', () => {
  it('extracts contact ID and message text', () => {
    const result = parseRespondioInbound({
      id: 'rio-evt-001',
      event: 'message.received',
      data: {
        messageId: 'rio-msg-001',
        contact: { id: 'contact-123' },
        message: { type: 'text', text: 'Respond.io reply' }
      }
    });
    expect(result).toEqual({
      providerMessageId: 'rio-msg-001',
      senderAddress: 'contact-123',
      body: 'Respond.io reply'
    });
  });
});

describe('parseTelegramInbound', () => {
  it('extracts user ID and text', () => {
    const result = parseTelegramInbound({
      update_id: 100,
      message: {
        message_id: 42,
        from: { id: 987654 },
        text: 'Telegram reply'
      }
    });
    expect(result).toEqual({
      providerMessageId: 'tg-100-42',
      senderAddress: '987654',
      body: 'Telegram reply'
    });
  });

  it('handles edited_message', () => {
    const result = parseTelegramInbound({
      update_id: 101,
      edited_message: {
        message_id: 43,
        from: { id: 111 },
        text: 'Edited text'
      }
    });
    expect(result.body).toBe('Edited text');
  });

  it('throws when no message', () => {
    expect(() => parseTelegramInbound({ update_id: 102 })).toThrow();
  });
});

describe('parseLineInbound', () => {
  it('extracts userId and message text', () => {
    const result = parseLineInbound({
      events: [
        {
          type: 'message',
          message: { id: 'line-msg-1', type: 'text', text: 'LINE reply' },
          source: { userId: 'U123' },
          replyToken: 'tok'
        }
      ]
    });
    expect(result).toEqual({
      providerMessageId: 'line-msg-1',
      senderAddress: 'U123',
      body: 'LINE reply'
    });
  });

  it('throws with empty events', () => {
    expect(() => parseLineInbound({ events: [] })).toThrow();
  });
});

describe('parseViberInbound', () => {
  it('extracts sender ID and text', () => {
    const result = parseViberInbound({
      event: 'message',
      message_token: 'vb-tok-1',
      sender: { id: 'viber-user-1' },
      message: { type: 'text', text: 'Viber reply' }
    });
    expect(result).toEqual({
      providerMessageId: 'vb-tok-1',
      senderAddress: 'viber-user-1',
      body: 'Viber reply'
    });
  });

  it('throws for non-message events', () => {
    expect(() =>
      parseViberInbound({ event: 'delivered', timestamp: 123 })
    ).toThrow('not a message');
  });
});

describe('parseKakaoInbound', () => {
  it('extracts user ID and utterance', () => {
    const result = parseKakaoInbound({
      intent: { id: 'intent-1', name: 'reply' },
      userRequest: {
        user: { id: 'kakao-user-1' },
        utterance: 'KakaoTalk reply'
      }
    });
    expect(result).toEqual({
      providerMessageId: 'intent-1',
      senderAddress: 'kakao-user-1',
      body: 'KakaoTalk reply'
    });
  });
});

describe('parseWeChatInbound', () => {
  it('extracts FromUserName and Content', () => {
    const result = parseWeChatInbound({
      ToUserName: 'gh_official',
      FromUserName: 'wx-user-1',
      MsgId: '10000001',
      MsgType: 'text',
      Content: 'WeChat reply'
    });
    expect(result).toEqual({
      providerMessageId: '10000001',
      senderAddress: 'wx-user-1',
      body: 'WeChat reply'
    });
  });
});
