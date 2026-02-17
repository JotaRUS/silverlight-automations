import { describe, expect, it } from 'vitest';

import { normalizeChannel } from '../../src/config/channels';

describe('normalizeChannel', () => {
  it.each(['kakaotalk', 'kakao', 'kaokao', 'kalao'])('normalizes %s to kakaotalk', (value) => {
    expect(normalizeChannel(value)).toBe('kakaotalk');
  });

  it('throws for unknown channel', () => {
    expect(() => normalizeChannel('unknown-channel')).toThrowError(/Unsupported channel value/);
  });
});
