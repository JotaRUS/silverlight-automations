import { describe, expect, it } from 'vitest';

import { assertValidTransition, type TransitionMap } from '../../src/core/state-machine/assertValidTransition';

type SampleState = 'pending' | 'running' | 'done';

const transitionMap: TransitionMap<SampleState> = {
  pending: ['running'],
  running: ['done'],
  done: []
};

describe('assertValidTransition', () => {
  it('allows valid transitions', () => {
    expect(() => {
      assertValidTransition(transitionMap, 'pending', 'running');
    }).not.toThrow();
  });

  it('throws on invalid transitions', () => {
    expect(() => {
      assertValidTransition(transitionMap, 'pending', 'done');
    }).toThrowError(/Invalid state transition/);
  });
});
