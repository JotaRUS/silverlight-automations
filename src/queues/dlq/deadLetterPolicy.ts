export const DEAD_LETTER_RETENTION_DAYS = 30;
export const DEAD_LETTER_CAPTURE_JOB_NAME = 'dead-letter.capture';

export interface DeadLetterEnvelope {
  queueName: string;
  jobId: string;
  payload: unknown;
  errorMessage: string;
  stack?: string;
  failedAt: string;
  correlationId?: string;
}
