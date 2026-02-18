import { AppError } from '../errors/appError';

export type TransitionMap<T extends string> = Record<T, readonly T[]>;

export function assertValidTransition<TState extends string>(
  transitionMap: TransitionMap<TState>,
  currentState: TState,
  nextState: TState
): void {
  if (currentState === nextState) {
    return;
  }

  const allowed = transitionMap[currentState];
  if (!allowed.includes(nextState)) {
    throw new AppError('Invalid state transition', 409, 'invalid_state_transition', {
      currentState,
      nextState,
      allowedTransitions: allowed
    });
  }
}
