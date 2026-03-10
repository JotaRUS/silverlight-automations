import { getData } from 'country-list';

export interface CountryOption {
  code: string;
  label: string;
}

interface RawCountryOption {
  code: string;
  name: string;
}

export const ALL_COUNTRY_OPTIONS: CountryOption[] = getData()
  .map((country: RawCountryOption) => ({
    code: country.code,
    label: country.name
  }))
  .sort((left: CountryOption, right: CountryOption) => left.label.localeCompare(right.label));

const COUNTRY_NAME_BY_CODE = new Map(
  ALL_COUNTRY_OPTIONS.map((country) => [country.code, country.label])
);

export function getCountryLabel(code: string): string {
  return COUNTRY_NAME_BY_CODE.get(code.toUpperCase()) ?? code;
}
