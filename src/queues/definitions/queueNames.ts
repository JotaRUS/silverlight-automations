export const QUEUE_NAMES = {
  JOB_TITLE_DISCOVERY: 'job-title-discovery',
  APOLLO_LEAD_SOURCING: 'apollo-lead-sourcing',
  SALES_NAV_INGESTION: 'sales-nav-ingestion',
  LEAD_INGESTION: 'lead-ingestion',
  ENRICHMENT: 'enrichment',
  OUTREACH: 'outreach',
  SCREENING: 'screening',
  CALL_ALLOCATION: 'call-allocation',
  CALL_VALIDATION: 'call-validation',
  PERFORMANCE: 'performance',
  RANKING: 'ranking',
  GOOGLE_SHEETS_SYNC: 'google-sheets-sync',
  SUPABASE_SYNC: 'supabase-sync',
  DOCUMENTATION: 'documentation',
  SALES_NAV_SCRAPER: 'sales-nav-scraper',
  YAY_CALL_EVENTS: 'yay-call-events',
  DEAD_LETTER: 'dead-letter'
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
