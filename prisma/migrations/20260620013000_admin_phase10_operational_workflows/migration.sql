-- LAJOO Admin Operating System Phase 10
-- Additive operational workflow persistence only.

CREATE TABLE "AdminWebhookMonitoringAlert" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "statusCheckId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "status" TEXT NOT NULL DEFAULT 'open',
    "message" TEXT NOT NULL,
    "endpointUrl" TEXT,
    "providerStatus" TEXT,
    "secretConfigured" BOOLEAN,
    "endpointMatched" BOOLEAN,
    "requiredEventsMissing" JSONB,
    "lastVerifiedWebhookAt" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminWebhookMonitoringAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminNotificationDigestJobAttempt" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "jobName" TEXT NOT NULL DEFAULT 'admin-notification-digest',
    "frequency" TEXT NOT NULL,
    "triggerSource" TEXT NOT NULL DEFAULT 'manual_admin',
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "targetUserCount" INTEGER NOT NULL DEFAULT 0,
    "attemptedCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "manualFallbackCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryProvider" TEXT,
    "deliveryStatus" TEXT,
    "errorClass" TEXT,
    "errorMessage" TEXT,
    "liveCron" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminNotificationDigestJobAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminWebhookMonitoringAlert_actorUserId_idx" ON "AdminWebhookMonitoringAlert"("actorUserId");
CREATE INDEX "AdminWebhookMonitoringAlert_statusCheckId_idx" ON "AdminWebhookMonitoringAlert"("statusCheckId");
CREATE INDEX "AdminWebhookMonitoringAlert_provider_idx" ON "AdminWebhookMonitoringAlert"("provider");
CREATE INDEX "AdminWebhookMonitoringAlert_alertType_idx" ON "AdminWebhookMonitoringAlert"("alertType");
CREATE INDEX "AdminWebhookMonitoringAlert_severity_idx" ON "AdminWebhookMonitoringAlert"("severity");
CREATE INDEX "AdminWebhookMonitoringAlert_status_idx" ON "AdminWebhookMonitoringAlert"("status");
CREATE INDEX "AdminWebhookMonitoringAlert_detectedAt_idx" ON "AdminWebhookMonitoringAlert"("detectedAt");
CREATE INDEX "AdminWebhookMonitoringAlert_resolvedAt_idx" ON "AdminWebhookMonitoringAlert"("resolvedAt");
CREATE INDEX "AdminWebhookMonitoringAlert_createdAt_idx" ON "AdminWebhookMonitoringAlert"("createdAt");

CREATE INDEX "AdminNotificationDigestJobAttempt_actorUserId_idx" ON "AdminNotificationDigestJobAttempt"("actorUserId");
CREATE INDEX "AdminNotificationDigestJobAttempt_jobName_idx" ON "AdminNotificationDigestJobAttempt"("jobName");
CREATE INDEX "AdminNotificationDigestJobAttempt_frequency_idx" ON "AdminNotificationDigestJobAttempt"("frequency");
CREATE INDEX "AdminNotificationDigestJobAttempt_triggerSource_idx" ON "AdminNotificationDigestJobAttempt"("triggerSource");
CREATE INDEX "AdminNotificationDigestJobAttempt_status_idx" ON "AdminNotificationDigestJobAttempt"("status");
CREATE INDEX "AdminNotificationDigestJobAttempt_deliveryStatus_idx" ON "AdminNotificationDigestJobAttempt"("deliveryStatus");
CREATE INDEX "AdminNotificationDigestJobAttempt_liveCron_idx" ON "AdminNotificationDigestJobAttempt"("liveCron");
CREATE INDEX "AdminNotificationDigestJobAttempt_startedAt_idx" ON "AdminNotificationDigestJobAttempt"("startedAt");
CREATE INDEX "AdminNotificationDigestJobAttempt_createdAt_idx" ON "AdminNotificationDigestJobAttempt"("createdAt");

ALTER TABLE "AdminWebhookMonitoringAlert" ADD CONSTRAINT "AdminWebhookMonitoringAlert_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminWebhookMonitoringAlert" ADD CONSTRAINT "AdminWebhookMonitoringAlert_statusCheckId_fkey" FOREIGN KEY ("statusCheckId") REFERENCES "AdminResendWebhookStatusCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminNotificationDigestJobAttempt" ADD CONSTRAINT "AdminNotificationDigestJobAttempt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
