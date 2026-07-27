-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "mfaStatus" TEXT NOT NULL DEFAULT 'not_configured',
ADD COLUMN "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN "invitedAt" TIMESTAMP(3),
ADD COLUMN "suspendedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AdminExportEvent" ADD COLUMN "approvedByUserId" TEXT,
ADD COLUMN "approvalReason" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "rejectedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminPaymentWebhookLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventStatus" TEXT NOT NULL,
    "paymentId" TEXT,
    "providerEventId" TEXT,
    "requestId" TEXT,
    "payloadSummary" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "source" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPaymentWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminInsurerAdapterLog" (
    "id" TEXT NOT NULL,
    "insurerCode" TEXT NOT NULL,
    "adapterName" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "requestId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "source" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminInsurerAdapterLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminOpenAiUsageLog" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "costEstimateUsd" DECIMAL(12,6),
    "requestId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "source" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminOpenAiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminJobQueueLog" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,
    "source" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminJobQueueLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminCronReminderLog" (
    "id" TEXT NOT NULL,
    "cronName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "affectedCount" INTEGER,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "source" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminCronReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminUser_mfaStatus_idx" ON "AdminUser"("mfaStatus");

-- CreateIndex
CREATE INDEX "AdminExportEvent_approvedByUserId_idx" ON "AdminExportEvent"("approvedByUserId");

-- CreateIndex
CREATE INDEX "AdminPaymentWebhookLog_provider_eventType_idx" ON "AdminPaymentWebhookLog"("provider", "eventType");

-- CreateIndex
CREATE INDEX "AdminPaymentWebhookLog_eventStatus_idx" ON "AdminPaymentWebhookLog"("eventStatus");

-- CreateIndex
CREATE INDEX "AdminPaymentWebhookLog_paymentId_idx" ON "AdminPaymentWebhookLog"("paymentId");

-- CreateIndex
CREATE INDEX "AdminPaymentWebhookLog_createdAt_idx" ON "AdminPaymentWebhookLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminInsurerAdapterLog_insurerCode_operation_idx" ON "AdminInsurerAdapterLog"("insurerCode", "operation");

-- CreateIndex
CREATE INDEX "AdminInsurerAdapterLog_status_idx" ON "AdminInsurerAdapterLog"("status");

-- CreateIndex
CREATE INDEX "AdminInsurerAdapterLog_createdAt_idx" ON "AdminInsurerAdapterLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminOpenAiUsageLog_model_operation_idx" ON "AdminOpenAiUsageLog"("model", "operation");

-- CreateIndex
CREATE INDEX "AdminOpenAiUsageLog_status_idx" ON "AdminOpenAiUsageLog"("status");

-- CreateIndex
CREATE INDEX "AdminOpenAiUsageLog_createdAt_idx" ON "AdminOpenAiUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminJobQueueLog_queueName_jobName_idx" ON "AdminJobQueueLog"("queueName", "jobName");

-- CreateIndex
CREATE INDEX "AdminJobQueueLog_status_idx" ON "AdminJobQueueLog"("status");

-- CreateIndex
CREATE INDEX "AdminJobQueueLog_createdAt_idx" ON "AdminJobQueueLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminCronReminderLog_cronName_idx" ON "AdminCronReminderLog"("cronName");

-- CreateIndex
CREATE INDEX "AdminCronReminderLog_status_idx" ON "AdminCronReminderLog"("status");

-- CreateIndex
CREATE INDEX "AdminCronReminderLog_createdAt_idx" ON "AdminCronReminderLog"("createdAt");
