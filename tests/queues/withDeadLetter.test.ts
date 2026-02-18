import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { registerDeadLetterHandler } from '../../src/queues/workers/withDeadLetter';
import type { CorrelatedJobData } from '../../src/queues/workers/withWorkerContext';

interface CapturedFailureListener<TData> {
  value?: (job: Job<CorrelatedJobData<TData>> | undefined, error: Error) => Promise<void>;
}

function createWorkerStub<TData>(
  listenerStore: CapturedFailureListener<TData>
): {
  on: ReturnType<typeof vi.fn>;
} {
  return {
    on: vi.fn(
      (
        _event: 'failed',
        listener: (job: Job<CorrelatedJobData<TData>> | undefined, error: Error) => Promise<void>
      ) => {
        listenerStore.value = listener;
      }
    )
  };
}

describe('registerDeadLetterHandler', () => {
  it('routes terminal failures to dead letter queue', async () => {
    const enqueueDeadLetterJob = vi.fn();
    const logWarn = vi.fn();
    const logError = vi.fn();
    const listenerStore: CapturedFailureListener<{ expertId: string }> = {};
    const worker = createWorkerStub(listenerStore);

    registerDeadLetterHandler(worker, 'enrichment', {
      enqueue: enqueueDeadLetterJob,
      log: {
        warn: logWarn,
        error: logError
      }
    });

    const listener = listenerStore.value;
    expect(listener).toBeDefined();

    const failedJob = {
      id: 'job-123',
      attemptsMade: 5,
      opts: {
        attempts: 5
      },
      data: {
        correlationId: 'cid-123',
        data: {
          expertId: 'exp-1'
        }
      }
    } as unknown as Job<CorrelatedJobData<{ expertId: string }>>;

    await listener?.(failedJob, new Error('provider unavailable'));

    expect(enqueueDeadLetterJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'enrichment',
        jobId: 'job-123',
        errorMessage: 'provider unavailable',
        correlationId: 'cid-123'
      })
    );
    expect(logWarn).not.toHaveBeenCalled();
  });

  it('logs retryable failures without routing to dead letter', async () => {
    const enqueueDeadLetterJob = vi.fn();
    const logWarn = vi.fn();
    const logError = vi.fn();
    const listenerStore: CapturedFailureListener<{ projectId: string }> = {};
    const worker = createWorkerStub(listenerStore);

    registerDeadLetterHandler(worker, 'screening', {
      enqueue: enqueueDeadLetterJob,
      log: {
        warn: logWarn,
        error: logError
      }
    });

    const listener = listenerStore.value;
    expect(listener).toBeDefined();

    const retryableJob = {
      id: 'job-456',
      attemptsMade: 2,
      opts: {
        attempts: 5
      },
      data: {
        correlationId: 'cid-456',
        data: {
          projectId: 'project-1'
        }
      }
    } as unknown as Job<CorrelatedJobData<{ projectId: string }>>;

    await listener?.(retryableJob, new Error('temporary timeout'));

    expect(enqueueDeadLetterJob).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 'screening',
        jobId: 'job-456',
        attemptsMade: 2,
        attemptsConfigured: 5
      }),
      'worker-job-failed-retry-scheduled'
    );
    expect(logError).not.toHaveBeenCalled();
  });

  it('stores fallback payload when job data cannot be serialized', async () => {
    const enqueueDeadLetterJob = vi.fn();
    const logWarn = vi.fn();
    const logError = vi.fn();
    const listenerStore: CapturedFailureListener<{ metadata: bigint }> = {};
    const worker = createWorkerStub(listenerStore);

    registerDeadLetterHandler(worker, 'ranking', {
      enqueue: enqueueDeadLetterJob,
      log: {
        warn: logWarn,
        error: logError
      }
    });

    const listener = listenerStore.value;
    expect(listener).toBeDefined();

    const failedJob = {
      id: 'job-789',
      attemptsMade: 1,
      opts: {
        attempts: 1
      },
      data: {
        correlationId: 'cid-789',
        data: {
          metadata: BigInt(1)
        }
      }
    } as unknown as Job<CorrelatedJobData<{ metadata: bigint }>>;

    await listener?.(failedJob, new Error('non serializable payload'));

    expect(enqueueDeadLetterJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'ranking',
        payload: {
          serializationError: 'payload_not_serializable'
        }
      })
    );
    expect(logWarn).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 'ranking',
        jobId: 'job-789'
      }),
      'worker-job-routed-to-dead-letter'
    );
  });
});
