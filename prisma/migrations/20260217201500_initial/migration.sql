-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ENRICHING', 'ENRICHED', 'OUTREACH_PENDING', 'CONTACTED', 'REPLIED', 'DISQUALIFIED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "ExpertStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUPPRESSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('EMAIL', 'PHONE', 'LINKEDIN', 'HANDLE');

-- CreateEnum
CREATE TYPE "ContactLabel" AS ENUM ('PROFESSIONAL', 'PERSONAL', 'MOBILE', 'LANDLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'BOUNCED', 'INVALID');

-- CreateEnum
CREATE TYPE "EnrichmentProvider" AS ENUM ('LEADMAGIC', 'PROSPEO', 'EXA', 'ROCKETREACH', 'WIZA', 'FORAGER', 'ZELIQ', 'CONTACTOUT', 'DATAGM', 'PEOPLEDATALABS');

-- CreateEnum
CREATE TYPE "EnrichmentAttemptStatus" AS ENUM ('SUCCESS', 'FAILED', 'RATE_LIMITED', 'TRIAL_EXHAUSTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('PHONE', 'EMAIL', 'LINKEDIN', 'WHATSAPP', 'RESPONDIO', 'SMS', 'IMESSAGE', 'LINE', 'WECHAT', 'VIBER', 'TELEGRAM', 'KAKAOTALK', 'VOICEMAIL');

-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "ScreeningStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'ESCALATED');

-- CreateEnum
CREATE TYPE "CallTaskStatus" AS ENUM ('PENDING', 'ASSIGNED', 'DIALING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('INTERESTED_SIGNUP_LINK_SENT', 'RETRYABLE_REJECTION', 'NEVER_CONTACT_AGAIN', 'NO_ANSWER', 'BUSY', 'FAILED');

-- CreateEnum
CREATE TYPE "CallerAllocationStatus" AS ENUM ('ACTIVE', 'WARMUP_GRACE', 'AT_RISK', 'PAUSED_LOW_DIAL_RATE', 'RESTRICTED_FRAUD', 'IDLE_NO_AVAILABLE_TASKS', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "FraudStatus" AS ENUM ('NONE', 'FLAGGED', 'RESTRICTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "GoogleSheetOperation" AS ENUM ('APPEND', 'UPDATE');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('SUCCESS', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "SystemEventCategory" AS ENUM ('SYSTEM', 'JOB', 'WEBHOOK', 'ENFORCEMENT', 'FRAUD', 'ALLOCATION');

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetThreshold" INTEGER NOT NULL,
    "signedUpCount" INTEGER NOT NULL DEFAULT 0,
    "completionPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "geographyIsoCodes" TEXT[],
    "regionConfig" JSONB NOT NULL,
    "overrideCooldown" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "countryIso" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTitle" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "companyId" UUID,
    "titleOriginal" TEXT NOT NULL,
    "titleNormalized" TEXT NOT NULL,
    "relevanceScore" DECIMAL(5,2) NOT NULL,
    "aiDecisionLog" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesNavSearch" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "paginationCursor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SalesNavSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "companyId" UUID,
    "salesNavSearchId" UUID,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT,
    "jobTitle" TEXT,
    "regionIso" TEXT,
    "countryIso" TEXT,
    "linkedinUrl" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "enrichmentConfidence" DECIMAL(5,2),
    "metadata" JSONB,
    "expertId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expert" (
    "id" UUID NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT NOT NULL,
    "currentRole" TEXT,
    "currentCompany" TEXT,
    "regionIso" TEXT,
    "countryIso" TEXT,
    "timezone" TEXT,
    "languageCodes" TEXT[],
    "preferredChannel" "Channel",
    "status" "ExpertStatus" NOT NULL DEFAULT 'PENDING',
    "sourceLeadId" UUID,
    "emailHash" TEXT,
    "phoneHash" TEXT,
    "linkedinHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Expert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertContact" (
    "id" UUID NOT NULL,
    "expertId" UUID NOT NULL,
    "type" "ContactType" NOT NULL,
    "label" "ContactLabel" NOT NULL DEFAULT 'OTHER',
    "value" TEXT NOT NULL,
    "valueNormalized" TEXT NOT NULL,
    "verificationStatus" "ContactVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "confidenceScore" DECIMAL(5,2),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExpertContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentAttempt" (
    "id" UUID NOT NULL,
    "leadId" UUID,
    "expertId" UUID,
    "provider" "EnrichmentProvider" NOT NULL,
    "status" "EnrichmentAttemptStatus" NOT NULL,
    "confidenceScore" DECIMAL(5,2),
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "rateLimited" BOOLEAN NOT NULL DEFAULT false,
    "trialExhausted" BOOLEAN NOT NULL DEFAULT false,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrichmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CooldownLog" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "expertId" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "blocked" BOOLEAN NOT NULL,
    "overrideApplied" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "enforcedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CooldownLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachThread" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "expertId" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "status" "ThreadStatus" NOT NULL DEFAULT 'OPEN',
    "firstContactAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "replied" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OutreachThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "body" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningQuestion" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreeningQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningResponse" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "expertId" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "responseText" TEXT,
    "status" "ScreeningStatus" NOT NULL DEFAULT 'PENDING',
    "score" DECIMAL(5,2),
    "qualified" BOOLEAN,
    "metadata" JSONB,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreeningResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caller" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "languageCodes" TEXT[],
    "regionIsoCodes" TEXT[],
    "allocationStatus" "CallerAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "fraudStatus" "FraudStatus" NOT NULL DEFAULT 'NONE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Caller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallTask" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "expertId" UUID NOT NULL,
    "callerId" UUID,
    "status" "CallTaskStatus" NOT NULL DEFAULT 'PENDING',
    "callOutcome" "CallOutcome",
    "priorityScore" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "assignedAt" TIMESTAMP(3),
    "executionWindowStartsAt" TIMESTAMP(3),
    "executionWindowEndsAt" TIMESTAMP(3),
    "attemptedDialCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CallTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" UUID NOT NULL,
    "callTaskId" UUID,
    "projectId" UUID,
    "expertId" UUID,
    "callerId" UUID,
    "callId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "billableSeconds" INTEGER,
    "ringDurationSeconds" INTEGER,
    "dialedNumber" TEXT NOT NULL,
    "terminationReason" TEXT,
    "sipCode" INTEGER,
    "recordingUrl" TEXT,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "fraudFlag" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLogRaw" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "accountId" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "correlationId" TEXT,

    CONSTRAINT "CallLogRaw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallerPerformanceMetric" (
    "id" UUID NOT NULL,
    "callerId" UUID NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolling60MinuteDials" INTEGER NOT NULL DEFAULT 0,
    "rolling60MinuteConnections" INTEGER NOT NULL DEFAULT 0,
    "rolling60MinuteValidConnections" INTEGER NOT NULL DEFAULT 0,
    "shortCallsLastHour" INTEGER NOT NULL DEFAULT 0,
    "activeCallExemptionSeconds" INTEGER NOT NULL DEFAULT 0,
    "graceModeActive" BOOLEAN NOT NULL DEFAULT false,
    "warmupStartedAt" TIMESTAMP(3),
    "allocationStatus" "CallerAllocationStatus" NOT NULL,
    "performanceScore" DECIMAL(6,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallerPerformanceMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingSnapshot" (
    "id" UUID NOT NULL,
    "projectId" UUID,
    "expertId" UUID,
    "score" DECIMAL(8,3) NOT NULL,
    "rank" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleSheetExport" (
    "id" UUID NOT NULL,
    "projectId" UUID,
    "tabName" TEXT NOT NULL,
    "operation" "GoogleSheetOperation" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "ExportStatus" NOT NULL,
    "payload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleSheetExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleSheetRowMap" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sheetTab" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleSheetRowMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" UUID NOT NULL,
    "category" "SystemEventCategory" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "correlationId" TEXT,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadLetterJob" (
    "id" UUID NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "stackTrace" TEXT,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "correlationId" TEXT,

    CONSTRAINT "DeadLetterJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_project_ranking" ON "Project"("status", "priority", "completionPercentage");

-- CreateIndex
CREATE INDEX "idx_project_deleted_at" ON "Project"("deletedAt");

-- CreateIndex
CREATE INDEX "idx_company_project" ON "Company"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_company_project_name" ON "Company"("projectId", "name");

-- CreateIndex
CREATE INDEX "idx_job_title_project_score" ON "JobTitle"("projectId", "relevanceScore");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_job_title_project_normalized" ON "JobTitle"("projectId", "titleNormalized");

-- CreateIndex
CREATE INDEX "idx_sales_nav_project_active" ON "SalesNavSearch"("projectId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_sales_nav_project_url" ON "SalesNavSearch"("projectId", "normalizedUrl");

-- CreateIndex
CREATE INDEX "idx_lead_project_status" ON "Lead"("projectId", "status");

-- CreateIndex
CREATE INDEX "idx_lead_project_created_at" ON "Lead"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_lead_linkedin" ON "Lead"("linkedinUrl");

-- CreateIndex
CREATE INDEX "idx_expert_email_hash" ON "Expert"("emailHash");

-- CreateIndex
CREATE INDEX "idx_expert_phone_hash" ON "Expert"("phoneHash");

-- CreateIndex
CREATE INDEX "idx_expert_linkedin_hash" ON "Expert"("linkedinHash");

-- CreateIndex
CREATE INDEX "idx_expert_callable_filters" ON "Expert"("status", "countryIso", "timezone");

-- CreateIndex
CREATE INDEX "idx_contact_type_normalized_value" ON "ExpertContact"("type", "valueNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_expert_contact" ON "ExpertContact"("expertId", "type", "valueNormalized");

-- CreateIndex
CREATE INDEX "idx_enrichment_lead_attempted_at" ON "EnrichmentAttempt"("leadId", "attemptedAt");

-- CreateIndex
CREATE INDEX "idx_enrichment_provider_status" ON "EnrichmentAttempt"("provider", "status", "attemptedAt");

-- CreateIndex
CREATE INDEX "idx_cooldown_lookup" ON "CooldownLog"("projectId", "expertId", "expiresAt");

-- CreateIndex
CREATE INDEX "idx_cooldown_channel_expiry" ON "CooldownLog"("expertId", "channel", "expiresAt");

-- CreateIndex
CREATE INDEX "idx_thread_project_status_activity" ON "OutreachThread"("projectId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "idx_thread_expert_channel" ON "OutreachThread"("expertId", "channel");

-- CreateIndex
CREATE INDEX "idx_outreach_message_thread_created" ON "OutreachMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_outreach_message_provider_id" ON "OutreachMessage"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_question_order_project" ON "ScreeningQuestion"("projectId", "displayOrder");

-- CreateIndex
CREATE INDEX "idx_screening_progress" ON "ScreeningResponse"("projectId", "expertId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Caller_email_key" ON "Caller"("email");

-- CreateIndex
CREATE INDEX "idx_caller_alloc_fraud" ON "Caller"("allocationStatus", "fraudStatus");

-- CreateIndex
CREATE INDEX "idx_call_task_status_priority" ON "CallTask"("status", "priorityScore");

-- CreateIndex
CREATE INDEX "idx_call_task_caller_status" ON "CallTask"("callerId", "status");

-- CreateIndex
CREATE INDEX "idx_call_task_project_status" ON "CallTask"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_callId_key" ON "CallLog"("callId");

-- CreateIndex
CREATE INDEX "idx_call_log_project_created" ON "CallLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_call_log_caller_created" ON "CallLog"("callerId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_call_log_expert_created" ON "CallLog"("expertId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallLogRaw_eventId_key" ON "CallLogRaw"("eventId");

-- CreateIndex
CREATE INDEX "idx_call_log_raw_type_received" ON "CallLogRaw"("eventType", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedWebhookEvent_eventId_key" ON "ProcessedWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "idx_processed_webhook_processed_at" ON "ProcessedWebhookEvent"("processedAt");

-- CreateIndex
CREATE INDEX "idx_perf_caller_snapshot" ON "CallerPerformanceMetric"("callerId", "snapshotAt");

-- CreateIndex
CREATE INDEX "idx_ranking_created_rank" ON "RankingSnapshot"("createdAt", "rank");

-- CreateIndex
CREATE INDEX "idx_ranking_project_created" ON "RankingSnapshot"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_sheet_export_tab_status" ON "GoogleSheetExport"("tabName", "status", "attemptedAt");

-- CreateIndex
CREATE INDEX "idx_sheet_export_entity" ON "GoogleSheetExport"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "idx_sheet_row_map_lookup" ON "GoogleSheetRowMap"("sheetTab", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_sheet_row_map" ON "GoogleSheetRowMap"("entityType", "entityId", "sheetTab");

-- CreateIndex
CREATE INDEX "idx_system_event_category_created" ON "SystemEvent"("category", "createdAt");

-- CreateIndex
CREATE INDEX "idx_system_event_entity" ON "SystemEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "idx_dlq_queue_failed_at" ON "DeadLetterJob"("queueName", "failedAt");

-- CreateIndex
CREATE INDEX "idx_dlq_archived_at" ON "DeadLetterJob"("archivedAt");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTitle" ADD CONSTRAINT "JobTitle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTitle" ADD CONSTRAINT "JobTitle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesNavSearch" ADD CONSTRAINT "SalesNavSearch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_salesNavSearchId_fkey" FOREIGN KEY ("salesNavSearchId") REFERENCES "SalesNavSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertContact" ADD CONSTRAINT "ExpertContact_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentAttempt" ADD CONSTRAINT "EnrichmentAttempt_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentAttempt" ADD CONSTRAINT "EnrichmentAttempt_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooldownLog" ADD CONSTRAINT "CooldownLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooldownLog" ADD CONSTRAINT "CooldownLog_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachThread" ADD CONSTRAINT "OutreachThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachThread" ADD CONSTRAINT "OutreachThread_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "OutreachThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningQuestion" ADD CONSTRAINT "ScreeningQuestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningResponse" ADD CONSTRAINT "ScreeningResponse_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningResponse" ADD CONSTRAINT "ScreeningResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ScreeningQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningResponse" ADD CONSTRAINT "ScreeningResponse_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "Caller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_callTaskId_fkey" FOREIGN KEY ("callTaskId") REFERENCES "CallTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "Caller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallerPerformanceMetric" ADD CONSTRAINT "CallerPerformanceMetric_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "Caller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingSnapshot" ADD CONSTRAINT "RankingSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingSnapshot" ADD CONSTRAINT "RankingSnapshot_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleSheetExport" ADD CONSTRAINT "GoogleSheetExport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
