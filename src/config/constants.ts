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

const ISO_TO_CAPITAL_TIMEZONE: Record<string, string> = {
  AF: 'Asia/Kabul', AL: 'Europe/Tirane', DZ: 'Africa/Algiers', AD: 'Europe/Andorra', AO: 'Africa/Luanda',
  AG: 'America/Antigua', AR: 'America/Argentina/Buenos_Aires', AM: 'Asia/Yerevan', AU: 'Australia/Sydney', AT: 'Europe/Vienna',
  AZ: 'Asia/Baku', BS: 'America/Nassau', BH: 'Asia/Bahrain', BD: 'Asia/Dhaka', BB: 'America/Barbados',
  BY: 'Europe/Minsk', BE: 'Europe/Brussels', BZ: 'America/Belize', BJ: 'Africa/Porto-Novo', BT: 'Asia/Thimphu',
  BO: 'America/La_Paz', BA: 'Europe/Sarajevo', BW: 'Africa/Gaborone', BR: 'America/Sao_Paulo', BN: 'Asia/Brunei',
  BG: 'Europe/Sofia', BF: 'Africa/Ouagadougou', BI: 'Africa/Bujumbura', CV: 'Atlantic/Cape_Verde', KH: 'Asia/Phnom_Penh',
  CM: 'Africa/Douala', CA: 'America/Toronto', CF: 'Africa/Bangui', TD: 'Africa/Ndjamena', CL: 'America/Santiago',
  CN: 'Asia/Shanghai', CO: 'America/Bogota', KM: 'Indian/Comoro', CG: 'Africa/Brazzaville', CD: 'Africa/Kinshasa',
  CR: 'America/Costa_Rica', CI: 'Africa/Abidjan', HR: 'Europe/Zagreb', CU: 'America/Havana', CY: 'Asia/Nicosia',
  CZ: 'Europe/Prague', DK: 'Europe/Copenhagen', DJ: 'Africa/Djibouti', DM: 'America/Dominica', DO: 'America/Santo_Domingo',
  EC: 'America/Guayaquil', EG: 'Africa/Cairo', SV: 'America/El_Salvador', GQ: 'Africa/Malabo', ER: 'Africa/Asmara',
  EE: 'Europe/Tallinn', SZ: 'Africa/Mbabane', ET: 'Africa/Addis_Ababa', FJ: 'Pacific/Fiji', FI: 'Europe/Helsinki',
  FR: 'Europe/Paris', GA: 'Africa/Libreville', GM: 'Africa/Banjul', GE: 'Asia/Tbilisi', DE: 'Europe/Berlin',
  GH: 'Africa/Accra', GR: 'Europe/Athens', GD: 'America/Grenada', GT: 'America/Guatemala', GN: 'Africa/Conakry',
  GW: 'Africa/Bissau', GY: 'America/Guyana', HT: 'America/Port-au-Prince', HN: 'America/Tegucigalpa', HK: 'Asia/Hong_Kong',
  HU: 'Europe/Budapest', IS: 'Atlantic/Reykjavik', IN: 'Asia/Kolkata', ID: 'Asia/Jakarta', IR: 'Asia/Tehran',
  IQ: 'Asia/Baghdad', IE: 'Europe/Dublin', IL: 'Asia/Jerusalem', IT: 'Europe/Rome', JM: 'America/Jamaica',
  JP: 'Asia/Tokyo', JO: 'Asia/Amman', KZ: 'Asia/Almaty', KE: 'Africa/Nairobi', KI: 'Pacific/Tarawa',
  KP: 'Asia/Pyongyang', KR: 'Asia/Seoul', KW: 'Asia/Kuwait', KG: 'Asia/Bishkek', LA: 'Asia/Vientiane',
  LV: 'Europe/Riga', LB: 'Asia/Beirut', LS: 'Africa/Maseru', LR: 'Africa/Monrovia', LY: 'Africa/Tripoli',
  LI: 'Europe/Vaduz', LT: 'Europe/Vilnius', LU: 'Europe/Luxembourg', MO: 'Asia/Macau', MG: 'Indian/Antananarivo',
  MW: 'Africa/Blantyre', MY: 'Asia/Kuala_Lumpur', MV: 'Indian/Maldives', ML: 'Africa/Bamako', MT: 'Europe/Malta',
  MH: 'Pacific/Majuro', MR: 'Africa/Nouakchott', MU: 'Indian/Mauritius', MX: 'America/Mexico_City', FM: 'Pacific/Pohnpei',
  MD: 'Europe/Chisinau', MC: 'Europe/Monaco', MN: 'Asia/Ulaanbaatar', ME: 'Europe/Podgorica', MA: 'Africa/Casablanca',
  MZ: 'Africa/Maputo', MM: 'Asia/Yangon', NA: 'Africa/Windhoek', NR: 'Pacific/Nauru', NP: 'Asia/Kathmandu',
  NL: 'Europe/Amsterdam', NZ: 'Pacific/Auckland', NI: 'America/Managua', NE: 'Africa/Niamey', NG: 'Africa/Lagos',
  MK: 'Europe/Skopje', NO: 'Europe/Oslo', OM: 'Asia/Muscat', PK: 'Asia/Karachi', PW: 'Pacific/Palau',
  PA: 'America/Panama', PG: 'Pacific/Port_Moresby', PY: 'America/Asuncion', PE: 'America/Lima', PH: 'Asia/Manila',
  PL: 'Europe/Warsaw', PT: 'Europe/Lisbon', PR: 'America/Puerto_Rico', QA: 'Asia/Qatar', RO: 'Europe/Bucharest',
  RU: 'Europe/Moscow', RW: 'Africa/Kigali', KN: 'America/St_Kitts', LC: 'America/St_Lucia',
  VC: 'America/St_Vincent', WS: 'Pacific/Apia', SM: 'Europe/San_Marino',
  ST: 'Africa/Sao_Tome', SA: 'Asia/Riyadh', SN: 'Africa/Dakar', RS: 'Europe/Belgrade',
  SC: 'Indian/Mahe', SL: 'Africa/Freetown', SG: 'Asia/Singapore', SK: 'Europe/Bratislava', SI: 'Europe/Ljubljana',
  SB: 'Pacific/Guadalcanal', SO: 'Africa/Mogadishu', ZA: 'Africa/Johannesburg', SS: 'Africa/Juba',
  ES: 'Europe/Madrid', LK: 'Asia/Colombo', SD: 'Africa/Khartoum', SR: 'America/Paramaribo', SE: 'Europe/Stockholm',
  CH: 'Europe/Zurich', SY: 'Asia/Damascus', TW: 'Asia/Taipei', TJ: 'Asia/Dushanbe', TZ: 'Africa/Dar_es_Salaam',
  TH: 'Asia/Bangkok', TL: 'Asia/Dili', TG: 'Africa/Lome', TO: 'Pacific/Tongatapu', TT: 'America/Port_of_Spain',
  TN: 'Africa/Tunis', TR: 'Europe/Istanbul', TM: 'Asia/Ashgabat', TV: 'Pacific/Funafuti', UG: 'Africa/Kampala',
  UA: 'Europe/Kiev', AE: 'Asia/Dubai', GB: 'Europe/London', US: 'America/New_York',
  UY: 'America/Montevideo', UZ: 'Asia/Tashkent', VU: 'Pacific/Efate', VE: 'America/Caracas', VN: 'Asia/Ho_Chi_Minh',
  YE: 'Asia/Aden', ZM: 'Africa/Lusaka', ZW: 'Africa/Harare'
};

export function isoCodeToCapitalTimezone(code: string): string | null {
  return ISO_TO_CAPITAL_TIMEZONE[code.toUpperCase()] ?? null;
}

export type EmailStrategyType = 'PROFESSIONAL' | 'PERSONAL' | 'BOTH';

export const COUNTRY_EMAIL_DEFAULTS: Record<string, EmailStrategyType> = {
  AR: 'PERSONAL', BR: 'PERSONAL', MX: 'PERSONAL', CL: 'PERSONAL',
  CO: 'PERSONAL', PE: 'PERSONAL', UY: 'PERSONAL', PY: 'PERSONAL',
  EC: 'PERSONAL', VE: 'PERSONAL', BO: 'PERSONAL', CR: 'PERSONAL',
  PA: 'PERSONAL', DO: 'PERSONAL', GT: 'PERSONAL', HN: 'PERSONAL',
  SV: 'PERSONAL', NI: 'PERSONAL', CU: 'PERSONAL', PR: 'PERSONAL',
  US: 'PROFESSIONAL', CA: 'PROFESSIONAL', GB: 'PROFESSIONAL',
  DE: 'PROFESSIONAL', FR: 'PROFESSIONAL', AU: 'PROFESSIONAL',
  NL: 'PROFESSIONAL', CH: 'PROFESSIONAL', SE: 'PROFESSIONAL',
  NO: 'PROFESSIONAL', DK: 'PROFESSIONAL', FI: 'PROFESSIONAL',
  JP: 'PROFESSIONAL', KR: 'PROFESSIONAL', SG: 'PROFESSIONAL',
  IE: 'PROFESSIONAL', NZ: 'PROFESSIONAL', AT: 'PROFESSIONAL',
  BE: 'PROFESSIONAL', LU: 'PROFESSIONAL', IL: 'PROFESSIONAL'
};
