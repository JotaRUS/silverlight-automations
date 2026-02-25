-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM (
  'APOLLO',
  'SALES_NAV_WEBHOOK',
  'LEADMAGIC',
  'PROSPEO',
  'EXA',
  'ROCKETREACH',
  'WIZA',
  'FORAGER',
  'ZELIQ',
  'CONTACTOUT',
  'DATAGM',
  'PEOPLEDATALABS',
  'LINKEDIN',
  'EMAIL_PROVIDER',
  'TWILIO',
  'WHATSAPP_2CHAT',
  'RESPONDIO',
  'LINE',
  'WECHAT',
  'VIBER',
  'TELEGRAM',
  'KAKAOTALK',
  'VOICEMAIL_DROP',
  'YAY',
  'GOOGLE_SHEETS'
);

-- AlterTable
ALTER TABLE "Project"
ADD COLUMN "enrichmentRoutingConfig" JSONB,
ADD COLUMN "apolloProviderAccountId" UUID,
ADD COLUMN "salesNavWebhookProviderAccountId" UUID,
ADD COLUMN "leadmagicProviderAccountId" UUID,
ADD COLUMN "prospeoProviderAccountId" UUID,
ADD COLUMN "exaProviderAccountId" UUID,
ADD COLUMN "rocketreachProviderAccountId" UUID,
ADD COLUMN "wizaProviderAccountId" UUID,
ADD COLUMN "foragerProviderAccountId" UUID,
ADD COLUMN "zeliqProviderAccountId" UUID,
ADD COLUMN "contactoutProviderAccountId" UUID,
ADD COLUMN "datagmProviderAccountId" UUID,
ADD COLUMN "peopledatalabsProviderAccountId" UUID,
ADD COLUMN "linkedinProviderAccountId" UUID,
ADD COLUMN "emailProviderAccountId" UUID,
ADD COLUMN "twilioProviderAccountId" UUID,
ADD COLUMN "whatsapp2chatProviderAccountId" UUID,
ADD COLUMN "respondioProviderAccountId" UUID,
ADD COLUMN "lineProviderAccountId" UUID,
ADD COLUMN "wechatProviderAccountId" UUID,
ADD COLUMN "viberProviderAccountId" UUID,
ADD COLUMN "telegramProviderAccountId" UUID,
ADD COLUMN "kakaotalkProviderAccountId" UUID,
ADD COLUMN "voicemailDropProviderAccountId" UUID,
ADD COLUMN "yayProviderAccountId" UUID,
ADD COLUMN "googleSheetsProviderAccountId" UUID;

-- CreateTable
CREATE TABLE "ProviderAccount" (
  "id" UUID NOT NULL,
  "providerType" "ProviderType" NOT NULL,
  "accountLabel" TEXT NOT NULL,
  "credentialsJson" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "rateLimitConfig" JSONB,
  "createdByAdminId" UUID NOT NULL,
  "lastHealthCheckAt" TIMESTAMP(3),
  "lastHealthStatus" TEXT,
  "lastHealthError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_provider_account_label" ON "ProviderAccount"("providerType", "accountLabel");

-- CreateIndex
CREATE INDEX "idx_provider_account_type_active" ON "ProviderAccount"("providerType", "isActive");

-- CreateIndex
CREATE INDEX "idx_provider_account_created_by" ON "ProviderAccount"("createdByAdminId");

-- AddForeignKey
ALTER TABLE "ProviderAccount"
ADD CONSTRAINT "ProviderAccount_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId")
REFERENCES "Caller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_apolloProviderAccountId_fkey" FOREIGN KEY ("apolloProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_salesNavWebhookProviderAccountId_fkey" FOREIGN KEY ("salesNavWebhookProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_leadmagicProviderAccountId_fkey" FOREIGN KEY ("leadmagicProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_prospeoProviderAccountId_fkey" FOREIGN KEY ("prospeoProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_exaProviderAccountId_fkey" FOREIGN KEY ("exaProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_rocketreachProviderAccountId_fkey" FOREIGN KEY ("rocketreachProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_wizaProviderAccountId_fkey" FOREIGN KEY ("wizaProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_foragerProviderAccountId_fkey" FOREIGN KEY ("foragerProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_zeliqProviderAccountId_fkey" FOREIGN KEY ("zeliqProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_contactoutProviderAccountId_fkey" FOREIGN KEY ("contactoutProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_datagmProviderAccountId_fkey" FOREIGN KEY ("datagmProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_peopledatalabsProviderAccountId_fkey" FOREIGN KEY ("peopledatalabsProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_linkedinProviderAccountId_fkey" FOREIGN KEY ("linkedinProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_emailProviderAccountId_fkey" FOREIGN KEY ("emailProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_twilioProviderAccountId_fkey" FOREIGN KEY ("twilioProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_whatsapp2chatProviderAccountId_fkey" FOREIGN KEY ("whatsapp2chatProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_respondioProviderAccountId_fkey" FOREIGN KEY ("respondioProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_lineProviderAccountId_fkey" FOREIGN KEY ("lineProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_wechatProviderAccountId_fkey" FOREIGN KEY ("wechatProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_viberProviderAccountId_fkey" FOREIGN KEY ("viberProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_telegramProviderAccountId_fkey" FOREIGN KEY ("telegramProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_kakaotalkProviderAccountId_fkey" FOREIGN KEY ("kakaotalkProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_voicemailDropProviderAccountId_fkey" FOREIGN KEY ("voicemailDropProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_yayProviderAccountId_fkey" FOREIGN KEY ("yayProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project"
ADD CONSTRAINT "Project_googleSheetsProviderAccountId_fkey" FOREIGN KEY ("googleSheetsProviderAccountId")
REFERENCES "ProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
