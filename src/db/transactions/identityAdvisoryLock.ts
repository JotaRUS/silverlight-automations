import { createHash } from 'node:crypto';

import { Prisma, type PrismaClient } from '@prisma/client';

import { withSerializableTransaction } from './withSerializableTransaction';

function advisoryLockKeyFromIdentity(identity: string): bigint {
  const hashBuffer = createHash('sha256').update(identity).digest();
  const key = hashBuffer.readBigInt64BE(0);
  return key;
}

export async function withIdentityAdvisoryLock<T>(
  prismaClient: PrismaClient,
  normalizedIdentity: string,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const lockKey = advisoryLockKeyFromIdentity(normalizedIdentity);

  return withSerializableTransaction(prismaClient, async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
    return callback(transaction);
  });
}
