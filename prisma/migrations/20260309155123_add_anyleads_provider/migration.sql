-- AlterEnum
ALTER TYPE "EnrichmentProvider" ADD VALUE 'ANYLEADS';

-- AlterEnum
ALTER TYPE "ProviderType" ADD VALUE 'ANYLEADS';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "anyleadsProviderAccountId" UUID;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_anyleadsProviderAccountId_fkey" FOREIGN KEY ("anyleadsProviderAccountId") REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
