-- CreateEnum
CREATE TYPE "EmailStrategy" AS ENUM ('PROFESSIONAL', 'PERSONAL', 'BOTH');

-- AlterEnum
ALTER TYPE "ProviderType" ADD VALUE 'OPENAI';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "emailStrategy" "EmailStrategy" NOT NULL DEFAULT 'PROFESSIONAL',
ADD COLUMN     "openaiProviderAccountId" UUID;

-- CreateTable
CREATE TABLE "CompanyEmailPattern" (
    "id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "confidence" DECIMAL(3,2) NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "sampleEmails" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEmailPattern_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyEmailPattern_domain_key" ON "CompanyEmailPattern"("domain");

-- CreateIndex
CREATE INDEX "idx_company_email_pattern_domain" ON "CompanyEmailPattern"("domain");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_openaiProviderAccountId_fkey" FOREIGN KEY ("openaiProviderAccountId") REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
