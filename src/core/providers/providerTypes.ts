import { z } from 'zod';

export const providerTypeSchema = z.enum([
  'APOLLO',
  'SALES_NAV_WEBHOOK',
  'LEADMAGIC',
  'PROSPEO',
  'EXA',
  'ROCKETREACH',
  'WIZA',
  'FORAGER',
  'ZELIQ',
  'CONTACTOUT',
  'DATAGM',
  'PEOPLEDATALABS',
  'ANYLEADS',
  'LINKEDIN',
  'EMAIL_PROVIDER',
  'TWILIO',
  'WHATSAPP_2CHAT',
  'RESPONDIO',
  'LINE',
  'WECHAT',
  'VIBER',
  'TELEGRAM',
  'KAKAOTALK',
  'VOICEMAIL_DROP',
  'YAY',
  'GOOGLE_SHEETS'
]);

export type ProviderType = z.infer<typeof providerTypeSchema>;

export const ENRICHMENT_PROVIDER_TYPES: ProviderType[] = [
  'LEADMAGIC',
  'PROSPEO',
  'EXA',
  'ROCKETREACH',
  'WIZA',
  'FORAGER',
  'ZELIQ',
  'CONTACTOUT',
  'DATAGM',
  'PEOPLEDATALABS',
  'ANYLEADS'
];

export type ProjectProviderBindingField =
  | 'apolloProviderAccountId'
  | 'salesNavWebhookProviderAccountId'
  | 'leadmagicProviderAccountId'
  | 'prospeoProviderAccountId'
  | 'exaProviderAccountId'
  | 'rocketreachProviderAccountId'
  | 'wizaProviderAccountId'
  | 'foragerProviderAccountId'
  | 'zeliqProviderAccountId'
  | 'contactoutProviderAccountId'
  | 'datagmProviderAccountId'
  | 'peopledatalabsProviderAccountId'
  | 'linkedinProviderAccountId'
  | 'emailProviderAccountId'
  | 'twilioProviderAccountId'
  | 'whatsapp2chatProviderAccountId'
  | 'respondioProviderAccountId'
  | 'lineProviderAccountId'
  | 'wechatProviderAccountId'
  | 'viberProviderAccountId'
  | 'telegramProviderAccountId'
  | 'kakaotalkProviderAccountId'
  | 'voicemailDropProviderAccountId'
  | 'yayProviderAccountId'
  | 'anyleadsProviderAccountId'
  | 'googleSheetsProviderAccountId';

export const PROVIDER_TYPE_TO_PROJECT_BINDING_FIELD: Record<ProviderType, ProjectProviderBindingField> = {
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
  GOOGLE_SHEETS: 'googleSheetsProviderAccountId'
};

