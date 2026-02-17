import { describe, expect, it, vi } from 'vitest';

import type { DeadLetterEnvelope } from '../../src/queues/dlq/deadLetterPolicy';
import { persistDeadLetterEnvelope } from '../../src/queues/workers/deadLetterWorker';

describe('persistDeadLetterEnvelope', () => {
  it('persists dead letter envelope into repository shape', async () => {
    const repositoryCreate = vi.fn();
    const envelope: DeadLetterEnvelope = {
      queueName: 'enrichment',
      jobId: 'job-123',
      payload: {
        correlationId: 'cid-123',
        data: {
          leadId: 'lead-1'
        }
      },
      errorMessage: 'provider timeout',
      stack: 'Error: provider timeout',
      failedAt: new Date().toISOString(),
      correlationId: 'cid-123'
    };

    await persistDeadLetterEnvelope(envelope, {
      create: repositoryCreate
    });

    expect(repositoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'enrichment',
        jobId: 'job-123',
        errorMessage: 'provider timeout',
        stackTrace: 'Error: provider timeout',
        correlationId: 'cid-123'
      })
    );
  });
});
