export const CHANNELS = {
  PHONE: 'phone',
  EMAIL: 'email',
  LINKEDIN: 'linkedin',
  WHATSAPP: 'whatsapp',
  RESPOND_IO: 'respondio',
  SMS: 'sms',
  IMESSAGE: 'imessage',
  LINE: 'line',
  WECHAT: 'wechat',
  VIBER: 'viber',
  TELEGRAM: 'telegram',
  KAKAOTALK: 'kakaotalk',
  VOICEMAIL: 'voicemail'
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

export const CHANNEL_ALIASES: Partial<Record<string, Channel>> = {
  phone: CHANNELS.PHONE,
  email: CHANNELS.EMAIL,
  linkedin: CHANNELS.LINKEDIN,
  whatsapp: CHANNELS.WHATSAPP,
  respondio: CHANNELS.RESPOND_IO,
  'respond.io': CHANNELS.RESPOND_IO,
  sms: CHANNELS.SMS,
  imessage: CHANNELS.IMESSAGE,
  line: CHANNELS.LINE,
  wechat: CHANNELS.WECHAT,
  viber: CHANNELS.VIBER,
  telegram: CHANNELS.TELEGRAM,
  kakaotalk: CHANNELS.KAKAOTALK,
  kakao: CHANNELS.KAKAOTALK,
  kaokao: CHANNELS.KAKAOTALK,
  kalao: CHANNELS.KAKAOTALK,
  voicemail: CHANNELS.VOICEMAIL
};

export const CHANNEL_DISPLAY_LABELS: Record<Channel, string> = {
  phone: 'Phone',
  email: 'Email',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  respondio: 'respond.io',
  sms: 'SMS',
  imessage: 'iMessage',
  line: 'LINE',
  wechat: 'WeChat',
  viber: 'Viber',
  telegram: 'Telegram',
  kakaotalk: 'KakaoTalk',
  voicemail: 'Voicemail'
};

export function normalizeChannel(rawValue: string): Channel {
  const normalized = CHANNEL_ALIASES[rawValue.trim().toLowerCase()];
  if (!normalized) {
    throw new Error(`Unsupported channel value: ${rawValue}`);
  }

  return normalized;
}
