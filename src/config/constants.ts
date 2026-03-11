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
  AF: 'Afghanistan', AL: 'Albania', DZ: 'Algeria', AD: 'Andorra', AO: 'Angola',
  AG: 'Antigua and Barbuda', AR: 'Argentina', AM: 'Armenia', AU: 'Australia', AT: 'Austria',
  AZ: 'Azerbaijan', BS: 'Bahamas', BH: 'Bahrain', BD: 'Bangladesh', BB: 'Barbados',
  BY: 'Belarus', BE: 'Belgium', BZ: 'Belize', BJ: 'Benin', BT: 'Bhutan',
  BO: 'Bolivia', BA: 'Bosnia and Herzegovina', BW: 'Botswana', BR: 'Brazil', BN: 'Brunei',
  BG: 'Bulgaria', BF: 'Burkina Faso', BI: 'Burundi', CV: 'Cape Verde', KH: 'Cambodia',
  CM: 'Cameroon', CA: 'Canada', CF: 'Central African Republic', TD: 'Chad', CL: 'Chile',
  CN: 'China', CO: 'Colombia', KM: 'Comoros', CG: 'Congo', CD: 'Democratic Republic of the Congo',
  CR: 'Costa Rica', CI: "Cote d'Ivoire", HR: 'Croatia', CU: 'Cuba', CY: 'Cyprus',
  CZ: 'Czech Republic', DK: 'Denmark', DJ: 'Djibouti', DM: 'Dominica', DO: 'Dominican Republic',
  EC: 'Ecuador', EG: 'Egypt', SV: 'El Salvador', GQ: 'Equatorial Guinea', ER: 'Eritrea',
  EE: 'Estonia', SZ: 'Eswatini', ET: 'Ethiopia', FJ: 'Fiji', FI: 'Finland',
  FR: 'France', GA: 'Gabon', GM: 'Gambia', GE: 'Georgia', DE: 'Germany',
  GH: 'Ghana', GR: 'Greece', GD: 'Grenada', GT: 'Guatemala', GN: 'Guinea',
  GW: 'Guinea-Bissau', GY: 'Guyana', HT: 'Haiti', HN: 'Honduras', HK: 'Hong Kong',
  HU: 'Hungary', IS: 'Iceland', IN: 'India', ID: 'Indonesia', IR: 'Iran',
  IQ: 'Iraq', IE: 'Ireland', IL: 'Israel', IT: 'Italy', JM: 'Jamaica',
  JP: 'Japan', JO: 'Jordan', KZ: 'Kazakhstan', KE: 'Kenya', KI: 'Kiribati',
  KP: 'North Korea', KR: 'South Korea', KW: 'Kuwait', KG: 'Kyrgyzstan', LA: 'Laos',
  LV: 'Latvia', LB: 'Lebanon', LS: 'Lesotho', LR: 'Liberia', LY: 'Libya',
  LI: 'Liechtenstein', LT: 'Lithuania', LU: 'Luxembourg', MO: 'Macao', MG: 'Madagascar',
  MW: 'Malawi', MY: 'Malaysia', MV: 'Maldives', ML: 'Mali', MT: 'Malta',
  MH: 'Marshall Islands', MR: 'Mauritania', MU: 'Mauritius', MX: 'Mexico', FM: 'Micronesia',
  MD: 'Moldova', MC: 'Monaco', MN: 'Mongolia', ME: 'Montenegro', MA: 'Morocco',
  MZ: 'Mozambique', MM: 'Myanmar', NA: 'Namibia', NR: 'Nauru', NP: 'Nepal',
  NL: 'Netherlands', NZ: 'New Zealand', NI: 'Nicaragua', NE: 'Niger', NG: 'Nigeria',
  MK: 'North Macedonia', NO: 'Norway', OM: 'Oman', PK: 'Pakistan', PW: 'Palau',
  PA: 'Panama', PG: 'Papua New Guinea', PY: 'Paraguay', PE: 'Peru', PH: 'Philippines',
  PL: 'Poland', PT: 'Portugal', PR: 'Puerto Rico', QA: 'Qatar', RO: 'Romania',
  RU: 'Russia', RW: 'Rwanda', KN: 'Saint Kitts and Nevis', LC: 'Saint Lucia',
  VC: 'Saint Vincent and the Grenadines', WS: 'Samoa', SM: 'San Marino',
  ST: 'Sao Tome and Principe', SA: 'Saudi Arabia', SN: 'Senegal', RS: 'Serbia',
  SC: 'Seychelles', SL: 'Sierra Leone', SG: 'Singapore', SK: 'Slovakia', SI: 'Slovenia',
  SB: 'Solomon Islands', SO: 'Somalia', ZA: 'South Africa', SS: 'South Sudan',
  ES: 'Spain', LK: 'Sri Lanka', SD: 'Sudan', SR: 'Suriname', SE: 'Sweden',
  CH: 'Switzerland', SY: 'Syria', TW: 'Taiwan', TJ: 'Tajikistan', TZ: 'Tanzania',
  TH: 'Thailand', TL: 'Timor-Leste', TG: 'Togo', TO: 'Tonga', TT: 'Trinidad and Tobago',
  TN: 'Tunisia', TR: 'Turkey', TM: 'Turkmenistan', TV: 'Tuvalu', UG: 'Uganda',
  UA: 'Ukraine', AE: 'United Arab Emirates', GB: 'United Kingdom', US: 'United States',
  UY: 'Uruguay', UZ: 'Uzbekistan', VU: 'Vanuatu', VE: 'Venezuela', VN: 'Vietnam',
  YE: 'Yemen', ZM: 'Zambia', ZW: 'Zimbabwe'
};

/**
 * Converts ISO 3166-1 alpha-2 codes (stored on projects) into
 * human-readable location names that the Apollo API expects for
 * the `person_locations` parameter.
 */
export function isoCodeToLocationName(code: string): string {
  return ISO_TO_LOCATION[code.toUpperCase()] ?? code;
}
