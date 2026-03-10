export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'ARCHIVED';

export interface ProjectRecord {
  id: string;
  name: string;
  description?: string | null;
  targetThreshold: number;
  signedUpCount: number;
  completionPercentage: number;
  geographyIsoCodes: string[];
  regionConfig?: Record<string, unknown>;
  priority: number;
  overrideCooldown: boolean;
  status: ProjectStatus;
  enrichmentRoutingConfig?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  apolloProviderAccountId?: string | null;
  salesNavWebhookProviderAccountId?: string | null;
  leadmagicProviderAccountId?: string | null;
  prospeoProviderAccountId?: string | null;
  exaProviderAccountId?: string | null;
  rocketreachProviderAccountId?: string | null;
  wizaProviderAccountId?: string | null;
  foragerProviderAccountId?: string | null;
  zeliqProviderAccountId?: string | null;
  contactoutProviderAccountId?: string | null;
  datagmProviderAccountId?: string | null;
  peopledatalabsProviderAccountId?: string | null;
  linkedinProviderAccountId?: string | null;
  emailProviderAccountId?: string | null;
  twilioProviderAccountId?: string | null;
  whatsapp2chatProviderAccountId?: string | null;
  respondioProviderAccountId?: string | null;
  lineProviderAccountId?: string | null;
  wechatProviderAccountId?: string | null;
  viberProviderAccountId?: string | null;
  telegramProviderAccountId?: string | null;
  kakaotalkProviderAccountId?: string | null;
  voicemailDropProviderAccountId?: string | null;
  yayProviderAccountId?: string | null;
  googleSheetsProviderAccountId?: string | null;
  supabaseProviderAccountId?: string | null;
}

export interface ProjectCompanyRecord {
  id: string;
  name: string;
  domain?: string | null;
  countryIso?: string | null;
}

export interface ProjectJobTitleRecord {
  id: string;
  titleOriginal: string;
  titleNormalized: string;
  relevanceScore: number;
  source: string;
}
