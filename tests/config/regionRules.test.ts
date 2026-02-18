import { describe, expect, it } from 'vitest';

import { requiresProfessionalEmailOnly } from '../../src/config/regionRules';

describe('requiresProfessionalEmailOnly', () => {
  it.each([
    ['FR', true],
    ['DE', true],
    ['GB', true],
    ['CA', true],
    ['AU', true],
    ['US', false],
    ['SG', false],
    ['BR', false]
  ])('evaluates country %s correctly', (country, expected) => {
    expect(requiresProfessionalEmailOnly(country)).toBe(expected);
  });
});
