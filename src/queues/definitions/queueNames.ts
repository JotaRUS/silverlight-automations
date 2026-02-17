export const QUEUE_NAMES = {
  JOB_TITLE_DISCOVERY: 'job-title-discovery',
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
  DOCUMENTATION: 'documentation',
  YAY_CALL_EVENTS: 'yay-call-events',
  DEAD_LETTER: 'dead-letter'
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
