-- LAJOO Admin Operating System Phase 11
-- Additive scheduled operations, alert workflow, export policy governance, and SLO foundations.

ALTER TABLE "AdminWebhookMonitoringAlert"
  ADD COLUMN "assignedToUserId" TEXT,
  ADD COLUMN "resolvedByUserId" TEXT,
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN "note" TEXT,
  ADD COLUMN "snoozedUntil" TIMESTAMP(3),
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3);

CREATE TABLE "AdminWebhookMonitoringAlertEvent" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "previousStatus" TEXT,
    "status" TEXT NOT NULL,
    "previousPriority" TEXT,
    "priority" TEXT,
    "assignedToUserId" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "snoozedUntil" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminWebhookMonitoringAlertEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminWebhookMonitoringAlertNotification" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "recipientRole" TEXT,
    "status" TEXT NOT NULL,
    "deliveryProvider" TEXT,
    "deliveryStatus" TEXT,
    "deliveryMessageId" TEXT,
    "errorClass" TEXT,
    "errorMessage" TEXT,
    "manualFallback" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminWebhookMonitoringAlertNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminScheduledJobAttempt" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "jobName" TEXT NOT NULL,
    "jobKind" TEXT NOT NULL,
    "triggerSource" TEXT NOT NULL DEFAULT 'cron',
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "liveCron" BOOLEAN NOT NULL DEFAULT false,
    "errorClass" TEXT,
    "errorMessage" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminScheduledJobAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminExportArtifactPolicy" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "ttlSeconds" INTEGER NOT NULL,
    "minTtlSeconds" INTEGER NOT NULL,
    "maxTtlSeconds" INTEGER NOT NULL,
    "changedByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminExportArtifactPolicy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminWebhookMonitoringAlert_assignedToUserId_idx" ON "AdminWebhookMonitoringAlert"("assignedToUserId");
CREATE INDEX "AdminWebhookMonitoringAlert_resolvedByUserId_idx" ON "AdminWebhookMonitoringAlert"("resolvedByUserId");
CREATE INDEX "AdminWebhookMonitoringAlert_priority_idx" ON "AdminWebhookMonitoringAlert"("priority");
CREATE INDEX "AdminWebhookMonitoringAlert_snoozedUntil_idx" ON "AdminWebhookMonitoringAlert"("snoozedUntil");
CREATE INDEX "AdminWebhookMonitoringAlert_acknowledgedAt_idx" ON "AdminWebhookMonitoringAlert"("acknowledgedAt");

CREATE INDEX "AdminWebhookMonitoringAlertEvent_alertId_idx" ON "AdminWebhookMonitoringAlertEvent"("alertId");
CREATE INDEX "AdminWebhookMonitoringAlertEvent_actorUserId_idx" ON "AdminWebhookMonitoringAlertEvent"("actorUserId");
CREATE INDEX "AdminWebhookMonitoringAlertEvent_action_idx" ON "AdminWebhookMonitoringAlertEvent"("action");
CREATE INDEX "AdminWebhookMonitoringAlertEvent_status_idx" ON "AdminWebhookMonitoringAlertEvent"("status");
CREATE INDEX "AdminWebhookMonitoringAlertEvent_priority_idx" ON "AdminWebhookMonitoringAlertEvent"("priority");
CREATE INDEX "AdminWebhookMonitoringAlertEvent_assignedToUserId_idx" ON "AdminWebhookMonitoringAlertEvent"("assignedToUserId");
CREATE INDEX "AdminWebhookMonitoringAlertEvent_snoozedUntil_idx" ON "AdminWebhookMonitoringAlertEvent"("snoozedUntil");
CREATE INDEX "AdminWebhookMonitoringAlertEvent_createdAt_idx" ON "AdminWebhookMonitoringAlertEvent"("createdAt");

CREATE INDEX "AdminWebhookMonitoringAlertNotification_alertId_idx" ON "AdminWebhookMonitoringAlertNotification"("alertId");
CREATE INDEX "AdminWebhookMonitoringAlertNotification_recipientUserId_idx" ON "AdminWebhookMonitoringAlertNotification"("recipientUserId");
CREATE INDEX "AdminWebhookMonitoringAlertNotification_recipientRole_idx" ON "AdminWebhookMonitoringAlertNotification"("recipientRole");
CREATE INDEX "AdminWebhookMonitoringAlertNotification_status_idx" ON "AdminWebhookMonitoringAlertNotification"("status");
CREATE INDEX "AdminWebhookMonitoringAlertNotification_deliveryStatus_idx" ON "AdminWebhookMonitoringAlertNotification"("deliveryStatus");
CREATE INDEX "AdminWebhookMonitoringAlertNotification_errorClass_idx" ON "AdminWebhookMonitoringAlertNotification"("errorClass");
CREATE INDEX "AdminWebhookMonitoringAlertNotification_manualFallback_idx" ON "AdminWebhookMonitoringAlertNotification"("manualFallback");
CREATE INDEX "AdminWebhookMonitoringAlertNotification_createdAt_idx" ON "AdminWebhookMonitoringAlertNotification"("createdAt");

CREATE INDEX "AdminScheduledJobAttempt_actorUserId_idx" ON "AdminScheduledJobAttempt"("actorUserId");
CREATE INDEX "AdminScheduledJobAttempt_jobName_idx" ON "AdminScheduledJobAttempt"("jobName");
CREATE INDEX "AdminScheduledJobAttempt_jobKind_idx" ON "AdminScheduledJobAttempt"("jobKind");
CREATE INDEX "AdminScheduledJobAttempt_triggerSource_idx" ON "AdminScheduledJobAttempt"("triggerSource");
CREATE INDEX "AdminScheduledJobAttempt_status_idx" ON "AdminScheduledJobAttempt"("status");
CREATE INDEX "AdminScheduledJobAttempt_liveCron_idx" ON "AdminScheduledJobAttempt"("liveCron");
CREATE INDEX "AdminScheduledJobAttempt_startedAt_idx" ON "AdminScheduledJobAttempt"("startedAt");
CREATE INDEX "AdminScheduledJobAttempt_createdAt_idx" ON "AdminScheduledJobAttempt"("createdAt");

CREATE INDEX "AdminExportArtifactPolicy_environment_idx" ON "AdminExportArtifactPolicy"("environment");
CREATE INDEX "AdminExportArtifactPolicy_status_idx" ON "AdminExportArtifactPolicy"("status");
CREATE INDEX "AdminExportArtifactPolicy_changedByUserId_idx" ON "AdminExportArtifactPolicy"("changedByUserId");
CREATE INDEX "AdminExportArtifactPolicy_effectiveFrom_idx" ON "AdminExportArtifactPolicy"("effectiveFrom");
CREATE INDEX "AdminExportArtifactPolicy_supersededAt_idx" ON "AdminExportArtifactPolicy"("supersededAt");
CREATE INDEX "AdminExportArtifactPolicy_createdAt_idx" ON "AdminExportArtifactPolicy"("createdAt");

ALTER TABLE "AdminWebhookMonitoringAlert" ADD CONSTRAINT "AdminWebhookMonitoringAlert_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminWebhookMonitoringAlert" ADD CONSTRAINT "AdminWebhookMonitoringAlert_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminWebhookMonitoringAlertEvent" ADD CONSTRAINT "AdminWebhookMonitoringAlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "AdminWebhookMonitoringAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminWebhookMonitoringAlertEvent" ADD CONSTRAINT "AdminWebhookMonitoringAlertEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminWebhookMonitoringAlertNotification" ADD CONSTRAINT "AdminWebhookMonitoringAlertNotification_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "AdminWebhookMonitoringAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminWebhookMonitoringAlertNotification" ADD CONSTRAINT "AdminWebhookMonitoringAlertNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminScheduledJobAttempt" ADD CONSTRAINT "AdminScheduledJobAttempt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminExportArtifactPolicy" ADD CONSTRAINT "AdminExportArtifactPolicy_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
