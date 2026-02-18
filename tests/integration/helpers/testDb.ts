import { prisma } from '../../../src/db/client';

interface TableRow {
  tablename: string;
}

export async function cleanDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  `;

  const tableNames = tables
    .map((table) => table.tablename)
    .filter((tableName) => tableName !== '_prisma_migrations');

  if (!tableNames.length) {
    return;
  }

  const joinedTables = tableNames.map((tableName) => `"${tableName}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${joinedTables} CASCADE`);
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
