import { Prisma, type PrismaClient } from '@prisma/client';

export async function withSerializableTransaction<T>(
  prismaClient: PrismaClient,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prismaClient.$transaction(async (transaction) => callback(transaction), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });
}
