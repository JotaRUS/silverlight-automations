import { z } from 'zod';

/**
 * Normalized shape every provider parser returns.
 */
export interface ParsedInboundMessage {
  providerMessageId: string;
  senderAddress: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Twilio  (SMS / Voicemail transcription)
// Content-Type: application/x-www-form-urlencoded
// ---------------------------------------------------------------------------
const twilioInboundSchema = z.object({
  MessageSid: z.string().min(1),
  From: z.string().min(1),
  Body: z.string().default(''),
  To: z.string().optional(),
  NumMedia: z.string().optional()
});

export function parseTwilioInbound(body: unknown): ParsedInboundMessage {
  const parsed = twilioInboundSchema.parse(body);
  return {
    providerMessageId: parsed.MessageSid,
    senderAddress: parsed.From,
    body: parsed.Body
  };
}

// ---------------------------------------------------------------------------
// SendGrid  Inbound Parse
// Content-Type: application/json  (or multipart — we normalize upstream)
// ---------------------------------------------------------------------------
const sendgridInboundSchema = z.object({
  from: z.string().min(1),
  text: z.string().default(''),
  html: z.string().optional(),
  subject: z.string().optional(),
  headers: z.string().optional(),
  envelope: z.string().optional()
});

function extractEmailAddress(fromField: string): string {
  const match = /<([^>]+)>/.exec(fromField);
  return match ? match[1] : fromField.trim();
}

export function parseSendGridInbound(body: unknown): ParsedInboundMessage {
  const parsed = sendgridInboundSchema.parse(body);
  const envelope = parsed.envelope ? tryParseJson(parsed.envelope) : null;
  const rawId = envelope?.messageId;
  const messageId = typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId) : null;
  return {
    providerMessageId: messageId ?? `sgip-${String(Date.now())}`,
    senderAddress: extractEmailAddress(parsed.from),
    body: parsed.text || stripHtml(parsed.html ?? '')
  };
}

// ---------------------------------------------------------------------------
// 2Chat  (WhatsApp)
// ---------------------------------------------------------------------------
const twoChatInboundSchema = z.object({
  event: z.string().optional(),
  message: z.object({
    id: z.string().min(1),
    from_number: z.string().min(1),
    text: z.string().default(''),
    timestamp: z.union([z.string(), z.number()]).optional()
  })
});

export function parse2ChatInbound(body: unknown): ParsedInboundMessage {
  const parsed = twoChatInboundSchema.parse(body);
  return {
    providerMessageId: parsed.message.id,
    senderAddress: parsed.message.from_number,
    body: parsed.message.text
  };
}

// ---------------------------------------------------------------------------
// Respond.io
// ---------------------------------------------------------------------------
const respondioInboundSchema = z.object({
  id: z.string().optional(),
  event: z.string().optional(),
  data: z.object({
    messageId: z.string().optional(),
    contact: z.object({
      id: z.union([z.string(), z.number()])
    }),
    message: z.object({
      type: z.string().default('text'),
      text: z.string().default('')
    })
  })
});

export function parseRespondioInbound(body: unknown): ParsedInboundMessage {
  const parsed = respondioInboundSchema.parse(body);
  return {
    providerMessageId: parsed.data.messageId ?? parsed.id ?? `rio-${String(Date.now())}`,
    senderAddress: String(parsed.data.contact.id),
    body: parsed.data.message.text
  };
}

// ---------------------------------------------------------------------------
// Telegram  Bot API Webhook
// ---------------------------------------------------------------------------
const telegramInboundSchema = z.object({
  update_id: z.number(),
  message: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number()
    }),
    text: z.string().default('')
  }).optional(),
  edited_message: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number()
    }),
    text: z.string().default('')
  }).optional()
});

export function parseTelegramInbound(body: unknown): ParsedInboundMessage {
  const parsed = telegramInboundSchema.parse(body);
  const msg = parsed.message ?? parsed.edited_message;
  if (!msg) throw new Error('Telegram update contains no message');
  return {
    providerMessageId: `tg-${String(parsed.update_id)}-${String(msg.message_id)}`,
    senderAddress: String(msg.from.id),
    body: msg.text
  };
}

// ---------------------------------------------------------------------------
// LINE  Messaging API
// ---------------------------------------------------------------------------
const lineEventSchema = z.object({
  type: z.string(),
  message: z.object({
    id: z.string(),
    type: z.string(),
    text: z.string().default('')
  }).optional(),
  source: z.object({
    userId: z.string()
  }),
  replyToken: z.string().optional()
});

const lineInboundSchema = z.object({
  events: z.array(lineEventSchema).min(1)
});

export function parseLineInbound(body: unknown): ParsedInboundMessage {
  const parsed = lineInboundSchema.parse(body);
  const event = parsed.events.find((e) => e.type === 'message' && e.message);
  if (!event?.message) throw new Error('No message event in LINE webhook');
  return {
    providerMessageId: event.message.id,
    senderAddress: event.source.userId,
    body: event.message.text
  };
}

// ---------------------------------------------------------------------------
// Viber  Bot API
// ---------------------------------------------------------------------------
const viberInboundSchema = z.object({
  event: z.string(),
  timestamp: z.number().optional(),
  message_token: z.union([z.string(), z.number()]).optional(),
  sender: z.object({
    id: z.string()
  }).optional(),
  message: z.object({
    type: z.string(),
    text: z.string().default('')
  }).optional()
});

export function parseViberInbound(body: unknown): ParsedInboundMessage {
  const parsed = viberInboundSchema.parse(body);
  if (parsed.event !== 'message' || !parsed.sender || !parsed.message) {
    throw new Error(`Viber event type "${parsed.event}" is not a message`);
  }
  return {
    providerMessageId: parsed.message_token ? String(parsed.message_token) : `vb-${String(Date.now())}`,
    senderAddress: parsed.sender.id,
    body: parsed.message.text
  };
}

// ---------------------------------------------------------------------------
// KakaoTalk  (Chatbot Skill)
// ---------------------------------------------------------------------------
const kakaoInboundSchema = z.object({
  intent: z.object({
    id: z.string().optional(),
    name: z.string().optional()
  }).optional(),
  userRequest: z.object({
    user: z.object({
      id: z.string()
    }),
    utterance: z.string().default('')
  })
});

export function parseKakaoInbound(body: unknown): ParsedInboundMessage {
  const parsed = kakaoInboundSchema.parse(body);
  return {
    providerMessageId: parsed.intent?.id ?? `kakao-${String(Date.now())}`,
    senderAddress: parsed.userRequest.user.id,
    body: parsed.userRequest.utterance
  };
}

// ---------------------------------------------------------------------------
// WeChat  Official Account (XML → JSON pre-parsed)
// ---------------------------------------------------------------------------
const wechatInboundSchema = z.object({
  ToUserName: z.string(),
  FromUserName: z.string().min(1),
  MsgId: z.union([z.string(), z.number()]).optional(),
  MsgType: z.string().default('text'),
  Content: z.string().default('')
});

export function parseWeChatInbound(body: unknown): ParsedInboundMessage {
  const parsed = wechatInboundSchema.parse(body);
  return {
    providerMessageId: parsed.MsgId ? String(parsed.MsgId) : `wx-${String(Date.now())}`,
    senderAddress: parsed.FromUserName,
    body: parsed.Content
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function tryParseJson(str: string): Record<string, unknown> | null {
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}
