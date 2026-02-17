import { ENFORCEMENT } from '../../config/constants';

export interface CallFraudEvaluationInput {
  durationSeconds: number;
  timezoneMismatch: boolean;
  recentShortCalls: number;
}

export interface CallFraudEvaluationResult {
  isFraud: boolean;
  shouldSuspend: boolean;
}

export function evaluateCallFraud(input: CallFraudEvaluationInput): CallFraudEvaluationResult {
  const isShortCall = input.durationSeconds < ENFORCEMENT.MIN_CALL_DURATION_SECONDS;
  const isFraud = isShortCall || input.timezoneMismatch;
  const shouldSuspend = isFraud && input.recentShortCalls >= 3;

  return {
    isFraud,
    shouldSuspend
  };
}
