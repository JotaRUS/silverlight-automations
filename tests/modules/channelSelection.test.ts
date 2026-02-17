import { describe, expect, it } from 'vitest';

import { selectEmailsForOutreach } from '../../src/modules/outreach/channelSelection';

describe('selectEmailsForOutreach', () => {
  const emails = [
    { value: 'pro@example.com', label: 'professional' as const },
    { value: 'personal@example.com', label: 'personal' as const }
  ];

  it('keeps only professional emails for Europe rules', () => {
    const selected = selectEmailsForOutreach('FR', emails);
    expect(selected).toEqual([{ value: 'pro@example.com', label: 'professional' }]);
  });

  it('allows professional and personal emails in other regions', () => {
    const selected = selectEmailsForOutreach('US', emails);
    expect(selected).toEqual(emails);
  });
});
