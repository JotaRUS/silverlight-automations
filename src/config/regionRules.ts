export const EUROPE_ISO_COUNTRIES = new Set<string>([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'NO',
  'IS',
  'LI',
  'CH',
  'GB'
]);

export const PROFESSIONAL_EMAIL_ONLY_COUNTRIES = new Set<string>([
  'CA',
  'GB',
  'AU',
  ...EUROPE_ISO_COUNTRIES
]);

export function requiresProfessionalEmailOnly(countryIso: string): boolean {
  return PROFESSIONAL_EMAIL_ONLY_COUNTRIES.has(countryIso.toUpperCase());
}
