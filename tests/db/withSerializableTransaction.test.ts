import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { withSerializableTransaction } from '../../src/db/transactions/withSerializableTransaction';

describe('withSerializableTransaction', () => {
  it('retries on serializable transaction conflict and succeeds', async () => {
    const callback = vi.fn().mockResolvedValue('ok');
    const transactionMock = vi.fn();

    transactionMock
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(async (runner: (tx: unknown) => Promise<unknown>) => runner({}));

    const prismaClient = {
      $transaction: transactionMock
    } as unknown as PrismaClient;

    const result = await withSerializableTransaction(prismaClient, callback);
    expect(result).toBe('ok');
    expect(transactionMock).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('throws immediately for non-retryable errors', async () => {
    const callback = vi.fn().mockResolvedValue('ok');
    const transactionMock = vi.fn().mockRejectedValue({ code: 'P2002' });

    const prismaClient = {
      $transaction: transactionMock
    } as unknown as PrismaClient;

    await expect(withSerializableTransaction(prismaClient, callback)).rejects.toEqual({
      code: 'P2002'
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
