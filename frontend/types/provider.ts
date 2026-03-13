export type ProviderType =
  | 'APOLLO'
  | 'SALES_NAV_WEBHOOK'
  | 'LEADMAGIC'
  | 'PROSPEO'
  | 'EXA'
  | 'ROCKETREACH'
  | 'WIZA'
  | 'FORAGER'
  | 'ZELIQ'
  | 'CONTACTOUT'
  | 'DATAGM'
  | 'PEOPLEDATALABS'
  | 'ANYLEADS'
  | 'LINKEDIN'
  | 'EMAIL_PROVIDER'
  | 'TWILIO'
  | 'WHATSAPP_2CHAT'
  | 'RESPONDIO'
  | 'LINE'
  | 'WECHAT'
  | 'VIBER'
  | 'TELEGRAM'
  | 'KAKAOTALK'
  | 'VOICEMAIL_DROP'
  | 'YAY'
  | 'GOOGLE_SHEETS'
  | 'SUPABASE';

export interface ProviderAccount {
  id: string;
  providerType: ProviderType;
  accountLabel: string;
  isActive: boolean;
  rateLimitConfig: Record<string, unknown> | null;
  createdByAdminId: string;
  createdAt: string;
  updatedAt: string;
  lastHealthCheckAt: string | null;
  lastHealthStatus: string | null;
  lastHealthError: string | null;
  credentialFields: string[];
  credentialHints?: Record<string, string>;
}
