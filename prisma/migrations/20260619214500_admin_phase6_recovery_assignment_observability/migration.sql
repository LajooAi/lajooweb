-- Phase 6 admin security operations: additive only.

-- CreateTable
CREATE TABLE "AdminMfaRecoveryRequest" (
    "id" TEXT NOT NULL,
    "requesterUserId" TEXT,
    "targetUserId" TEXT NOT NULL,
    "approverUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "reason" TEXT NOT NULL,
    "approvalReason" TEXT,
    "rejectionReason" TEXT,
    "emergencyOverrideReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminMfaRecoveryRequest_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AdminAuditLog" ADD COLUMN "assignedToUserId" TEXT,
ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN "escalationStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "escalatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AdminPaymentWebhookLog" ADD COLUMN "providerEnvironment" TEXT,
ADD COLUMN "verificationStatus" TEXT,
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "latencyMs" INTEGER,
ADD COLUMN "errorClass" TEXT;

-- AlterTable
ALTER TABLE "AdminInsurerAdapterLog" ADD COLUMN "providerEnvironment" TEXT,
ADD COLUMN "adapterVersion" TEXT,
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "errorClass" TEXT;

-- AlterTable
ALTER TABLE "AdminOpenAiUsageLog" ADD COLUMN "providerEnvironment" TEXT,
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "latencyMs" INTEGER,
ADD COLUMN "errorClass" TEXT;

-- AlterTable
ALTER TABLE "AdminJobQueueLog" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "workerName" TEXT,
ADD COLUMN "errorClass" TEXT;

-- AlterTable
ALTER TABLE "AdminCronReminderLog" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "workerName" TEXT,
ADD COLUMN "errorClass" TEXT;

-- CreateIndex
CREATE INDEX "AdminMfaRecoveryRequest_requesterUserId_idx" ON "AdminMfaRecoveryRequest"("requesterUserId");

-- CreateIndex
CREATE INDEX "AdminMfaRecoveryRequest_targetUserId_idx" ON "AdminMfaRecoveryRequest"("targetUserId");

-- CreateIndex
CREATE INDEX "AdminMfaRecoveryRequest_approverUserId_idx" ON "AdminMfaRecoveryRequest"("approverUserId");

-- CreateIndex
CREATE INDEX "AdminMfaRecoveryRequest_status_idx" ON "AdminMfaRecoveryRequest"("status");

-- CreateIndex
CREATE INDEX "AdminMfaRecoveryRequest_requestedAt_idx" ON "AdminMfaRecoveryRequest"("requestedAt");

-- CreateIndex
CREATE INDEX "AdminMfaRecoveryRequest_createdAt_idx" ON "AdminMfaRecoveryRequest"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_assignedToUserId_idx" ON "AdminAuditLog"("assignedToUserId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_priority_idx" ON "AdminAuditLog"("priority");

-- CreateIndex
CREATE INDEX "AdminAuditLog_escalationStatus_idx" ON "AdminAuditLog"("escalationStatus");

-- CreateIndex
CREATE INDEX "AdminPaymentWebhookLog_providerEnvironment_idx" ON "AdminPaymentWebhookLog"("providerEnvironment");

-- CreateIndex
CREATE INDEX "AdminPaymentWebhookLog_verificationStatus_idx" ON "AdminPaymentWebhookLog"("verificationStatus");

-- CreateIndex
CREATE INDEX "AdminPaymentWebhookLog_errorClass_idx" ON "AdminPaymentWebhookLog"("errorClass");

-- CreateIndex
CREATE INDEX "AdminInsurerAdapterLog_providerEnvironment_idx" ON "AdminInsurerAdapterLog"("providerEnvironment");

-- CreateIndex
CREATE INDEX "AdminInsurerAdapterLog_errorClass_idx" ON "AdminInsurerAdapterLog"("errorClass");

-- CreateIndex
CREATE INDEX "AdminOpenAiUsageLog_providerEnvironment_idx" ON "AdminOpenAiUsageLog"("providerEnvironment");

-- CreateIndex
CREATE INDEX "AdminOpenAiUsageLog_errorClass_idx" ON "AdminOpenAiUsageLog"("errorClass");

-- CreateIndex
CREATE INDEX "AdminJobQueueLog_workerName_idx" ON "AdminJobQueueLog"("workerName");

-- CreateIndex
CREATE INDEX "AdminJobQueueLog_errorClass_idx" ON "AdminJobQueueLog"("errorClass");

-- CreateIndex
CREATE INDEX "AdminCronReminderLog_workerName_idx" ON "AdminCronReminderLog"("workerName");

-- CreateIndex
CREATE INDEX "AdminCronReminderLog_errorClass_idx" ON "AdminCronReminderLog"("errorClass");

-- AddForeignKey
ALTER TABLE "AdminMfaRecoveryRequest" ADD CONSTRAINT "AdminMfaRecoveryRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminMfaRecoveryRequest" ADD CONSTRAINT "AdminMfaRecoveryRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminMfaRecoveryRequest" ADD CONSTRAINT "AdminMfaRecoveryRequest_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
