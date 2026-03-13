-- AlterTable
ALTER TABLE "ApiKey" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProviderAccount" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "idx_provider_account_deleted_at" ON "ProviderAccount"("deletedAt");
