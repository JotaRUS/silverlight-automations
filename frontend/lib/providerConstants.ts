import type { ProviderType } from '@/types/provider';

export const PROVIDER_DISPLAY_NAMES: Record<ProviderType, string> = {
  APOLLO: 'Apollo',
  SALES_NAV_WEBHOOK: 'Sales Navigator',
  LEADMAGIC: 'LeadMagic',
  PROSPEO: 'Prospeo',
  EXA: 'Exa.ai',
  ROCKETREACH: 'RocketReach',
  WIZA: 'Wiza',
  FORAGER: 'Forager',
  ZELIQ: 'Zeliq',
  CONTACTOUT: 'ContactOut',
  DATAGM: 'Datagma',
  PEOPLEDATALABS: 'People Data Labs',
  ANYLEADS: 'Anyleads',
  OPENAI: 'OpenAI',
  LINKEDIN: 'LinkedIn Messaging (Legacy)',
  EMAIL_PROVIDER: 'Email (SendGrid)',
  TWILIO: 'SMS (Twilio)',
  WHATSAPP_2CHAT: 'WhatsApp (2Chat)',
  RESPONDIO: 'Respond.io',
  LINE: 'LINE',
  WECHAT: 'WeChat',
  VIBER: 'Viber',
  TELEGRAM: 'Telegram',
  KAKAOTALK: 'KakaoTalk',
  VOICEMAIL_DROP: 'Voicemail (Twilio)',
  YAY: 'Yay.com',
  GOOGLE_SHEETS: 'Google Sheets',
  SUPABASE: 'Supabase'
};

export const PROVIDER_TYPE_TO_FIELD: Record<ProviderType, string> = {
  APOLLO: 'apolloProviderAccountId',
  SALES_NAV_WEBHOOK: 'salesNavWebhookProviderAccountId',
  LEADMAGIC: 'leadmagicProviderAccountId',
  PROSPEO: 'prospeoProviderAccountId',
  EXA: 'exaProviderAccountId',
  ROCKETREACH: 'rocketreachProviderAccountId',
  WIZA: 'wizaProviderAccountId',
  FORAGER: 'foragerProviderAccountId',
  ZELIQ: 'zeliqProviderAccountId',
  CONTACTOUT: 'contactoutProviderAccountId',
  DATAGM: 'datagmProviderAccountId',
  PEOPLEDATALABS: 'peopledatalabsProviderAccountId',
  ANYLEADS: 'anyleadsProviderAccountId',
  OPENAI: 'openaiProviderAccountId',
  LINKEDIN: 'linkedinProviderAccountId',
  EMAIL_PROVIDER: 'emailProviderAccountId',
  TWILIO: 'twilioProviderAccountId',
  WHATSAPP_2CHAT: 'whatsapp2chatProviderAccountId',
  RESPONDIO: 'respondioProviderAccountId',
  LINE: 'lineProviderAccountId',
  WECHAT: 'wechatProviderAccountId',
  VIBER: 'viberProviderAccountId',
  TELEGRAM: 'telegramProviderAccountId',
  KAKAOTALK: 'kakaotalkProviderAccountId',
  VOICEMAIL_DROP: 'voicemailDropProviderAccountId',
  YAY: 'yayProviderAccountId',
  GOOGLE_SHEETS: 'googleSheetsProviderAccountId',
  SUPABASE: 'supabaseProviderAccountId'
};

export const FIELD_TO_PROVIDER_TYPE: Record<string, ProviderType> = Object.fromEntries(
  Object.entries(PROVIDER_TYPE_TO_FIELD).map(([type, field]) => [field, type as ProviderType])
) as Record<string, ProviderType>;

export interface ProviderCategory {
  key: string;
  label: string;
  icon: string;
  types: ProviderType[];
}

export const PROVIDER_CATEGORIES: ProviderCategory[] = [
  {
    key: 'sourcing',
    label: 'Lead Sourcing',
    icon: 'person_search',
    types: ['SALES_NAV_WEBHOOK']
  },
  {
    key: 'enrichment',
    label: 'Data Enrichment',
    icon: 'database',
    types: ['APOLLO', 'LEADMAGIC', 'PROSPEO', 'EXA', 'ROCKETREACH', 'WIZA', 'FORAGER', 'ZELIQ', 'CONTACTOUT', 'DATAGM', 'PEOPLEDATALABS', 'ANYLEADS']
  },
  {
    key: 'ai',
    label: 'AI Services',
    icon: 'psychology',
    types: ['OPENAI']
  },
  {
    key: 'outreach',
    label: 'Outreach Channels',
    icon: 'campaign',
    types: ['EMAIL_PROVIDER', 'TWILIO', 'VOICEMAIL_DROP', 'WHATSAPP_2CHAT', 'RESPONDIO', 'LINE', 'WECHAT', 'VIBER', 'TELEGRAM', 'KAKAOTALK']
  },
  {
    key: 'operations',
    label: 'Calling & Operations',
    icon: 'call',
    types: ['YAY', 'GOOGLE_SHEETS']
  },
  {
    key: 'data-sync',
    label: 'Data Sync',
    icon: 'sync',
    types: ['SUPABASE']
  }
];

export const EXPORT_DESTINATION_TYPES: ProviderType[] = ['GOOGLE_SHEETS', 'SUPABASE'];

export const OUTREACH_CHANNEL_TYPES: ProviderType[] = [
  'EMAIL_PROVIDER', 'TWILIO', 'VOICEMAIL_DROP', 'WHATSAPP_2CHAT',
  'RESPONDIO', 'LINE', 'WECHAT', 'VIBER', 'TELEGRAM', 'KAKAOTALK'
];

export const TEMPLATE_VARIABLES = [
  { key: '{{FirstName}}', label: 'First Name', icon: 'person' },
  { key: '{{LastName}}', label: 'Last Name', icon: 'badge' },
  { key: '{{Country}}', label: 'Country', icon: 'public' },
  { key: '{{JobTitle}}', label: 'Job Title', icon: 'work' },
  { key: '{{CurrentCompany}}', label: 'Current Company', icon: 'business' }
] as const;

export const GEOGRAPHY_OPTIONS = [
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
  { code: 'SG', label: 'Singapore' },
  { code: 'JP', label: 'Japan' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'IN', label: 'India' },
  { code: 'BR', label: 'Brazil' }
];
