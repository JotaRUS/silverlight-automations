-- CreateEnum
CREATE TYPE "AuthRole" AS ENUM ('ADMIN', 'OPS', 'CALLER');

-- AlterTable
ALTER TABLE "Caller" ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "role" "AuthRole" NOT NULL DEFAULT 'CALLER';
