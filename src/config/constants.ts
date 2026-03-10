export const API_PREFIX = '/api/v1';

export const ENFORCEMENT = {
  COOLDOWN_DAYS: 30,
  MIN_CALL_DURATION_SECONDS: 5,
  DIALS_PER_HOUR_TARGET: 30,
  CALLER_WARMUP_GRACE_MINUTES: 5,
  CALLER_AT_RISK_THRESHOLD_MINUTES: 5,
  CALLER_PAUSE_THRESHOLD_MINUTES: 10,
  SIGNUP_CHASE_RETRY_AFTER_HOURS: 24,
  SIGNUP_CHASE_MAX_DAILY_CALL_ATTEMPTS: 3
} as const;

export const YAY_WEBHOOK = {
  MAX_EVENT_AGE_MS: 5 * 60 * 1000
} as const;

export const JOB_NAMES = {
  YAY_CALL_EVENT: 'yay.call-event',
  DEAD_LETTER_ARCHIVAL: 'dead-letter.archival'
} as const;

export const AUTO_SOURCING = {
  INTERVAL_MS: 5 * 60 * 1000,
  ENRICHMENT_BATCH_SIZE: 50,
  OUTREACH_BATCH_SIZE: 30,
  STALE_PIPELINE_HOURS: 24
} as const;

const ISO_TO_LOCATION: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  SG: 'Singapore',
  JP: 'Japan',
  DE: 'Germany',
  FR: 'France',
  IN: 'India',
  BR: 'Brazil',
  NL: 'Netherlands',
  CH: 'Switzerland',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  IE: 'Ireland',
  NZ: 'New Zealand',
  IL: 'Israel',
  KR: 'South Korea',
  CN: 'China',
  HK: 'Hong Kong',
  TW: 'Taiwan',
  MY: 'Malaysia',
  TH: 'Thailand',
  PH: 'Philippines',
  ID: 'Indonesia',
  VN: 'Vietnam',
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  ZA: 'South Africa',
  NG: 'Nigeria',
  KE: 'Kenya',
  EG: 'Egypt',
  MX: 'Mexico',
  AR: 'Argentina',
  CO: 'Colombia',
  CL: 'Chile',
  PE: 'Peru',
  ES: 'Spain',
  IT: 'Italy',
  PT: 'Portugal',
  PL: 'Poland',
  CZ: 'Czech Republic',
  AT: 'Austria',
  BE: 'Belgium',
  RO: 'Romania',
  HU: 'Hungary',
  GR: 'Greece',
  TR: 'Turkey',
  RU: 'Russia',
  UA: 'Ukraine'
};

/**
 * Converts ISO 3166-1 alpha-2 codes (stored on projects) into
 * human-readable location names that the Apollo API expects for
 * the `person_locations` parameter.
 */
export function isoCodeToLocationName(code: string): string {
  return ISO_TO_LOCATION[code.toUpperCase()] ?? code;
}
