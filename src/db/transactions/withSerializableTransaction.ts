import { Prisma, type PrismaClient } from '@prisma/client';

const SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS = 5;
const SERIALIZABLE_TRANSACTION_BACKOFF_MS = 10;

interface RetryablePrismaError {
  code?: string;
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as RetryablePrismaError;
  return candidate.code === 'P2034';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withSerializableTransaction<T>(
  prismaClient: PrismaClient,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  let attempt = 0;

  while (attempt < SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS) {
    attempt += 1;
    try {
      return await prismaClient.$transaction(async (transaction) => callback(transaction), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt >= SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS) {
        throw error;
      }
      await delay(SERIALIZABLE_TRANSACTION_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }

  throw new Error('serializable_transaction_retry_exhausted');
}
