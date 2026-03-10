-- AlterEnum
ALTER TYPE "ProviderType" ADD VALUE 'SUPABASE';

-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM (
  'READ_PROJECTS',
  'READ_LEADS',
  'WRITE_PROJECTS',
  'WRITE_LEADS',
  'ADMIN_PROVIDERS'
);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "supabaseProviderAccountId" UUID;

-- CreateTable
CREATE TABLE "ApiKey" (
  "id" UUID NOT NULL,
  "callerId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "scopes" "ApiKeyScope"[],
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyPrefix_key" ON "ApiKey"("keyPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "idx_api_key_caller_revoked" ON "ApiKey"("callerId", "revokedAt");

-- CreateIndex
CREATE INDEX "idx_api_key_prefix" ON "ApiKey"("keyPrefix");

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_supabaseProviderAccountId_fkey"
FOREIGN KEY ("supabaseProviderAccountId")
REFERENCES "ProviderAccount"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey"
ADD CONSTRAINT "ApiKey_callerId_fkey"
FOREIGN KEY ("callerId")
REFERENCES "Caller"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
