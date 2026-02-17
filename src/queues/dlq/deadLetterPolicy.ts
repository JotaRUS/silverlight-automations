export const DEAD_LETTER_RETENTION_DAYS = 30;

export interface DeadLetterEnvelope {
  queueName: string;
  jobId: string;
  payload: unknown;
  errorMessage: string;
  stack?: string;
  failedAt: string;
  correlationId?: string;
}
