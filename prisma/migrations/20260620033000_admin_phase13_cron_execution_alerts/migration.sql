-- LAJOO Admin Operating System Phase 13
-- Additive cron execution alert workflow persistence.

CREATE TABLE "AdminCronExecutionAlert" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "assignedToUserId" TEXT,
    "resolvedByUserId" TEXT,
    "scheduledJobAttemptId" TEXT,
    "jobName" TEXT NOT NULL,
    "jobKind" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "status" TEXT NOT NULL DEFAULT 'open',
    "message" TEXT NOT NULL,
    "note" TEXT,
    "snoozedUntil" TIMESTAMP(3),
    "lastAttemptStatus" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "staleThresholdMinutes" INTEGER,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminCronExecutionAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminCronExecutionAlertEvent" (
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

    CONSTRAINT "AdminCronExecutionAlertEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminCronExecutionAlertNotification" (
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

    CONSTRAINT "AdminCronExecutionAlertNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminCronExecutionAlert_actorUserId_idx" ON "AdminCronExecutionAlert"("actorUserId");
CREATE INDEX "AdminCronExecutionAlert_assignedToUserId_idx" ON "AdminCronExecutionAlert"("assignedToUserId");
CREATE INDEX "AdminCronExecutionAlert_resolvedByUserId_idx" ON "AdminCronExecutionAlert"("resolvedByUserId");
CREATE INDEX "AdminCronExecutionAlert_scheduledJobAttemptId_idx" ON "AdminCronExecutionAlert"("scheduledJobAttemptId");
CREATE INDEX "AdminCronExecutionAlert_jobName_idx" ON "AdminCronExecutionAlert"("jobName");
CREATE INDEX "AdminCronExecutionAlert_jobKind_idx" ON "AdminCronExecutionAlert"("jobKind");
CREATE INDEX "AdminCronExecutionAlert_alertType_idx" ON "AdminCronExecutionAlert"("alertType");
CREATE INDEX "AdminCronExecutionAlert_priority_idx" ON "AdminCronExecutionAlert"("priority");
CREATE INDEX "AdminCronExecutionAlert_severity_idx" ON "AdminCronExecutionAlert"("severity");
CREATE INDEX "AdminCronExecutionAlert_status_idx" ON "AdminCronExecutionAlert"("status");
CREATE INDEX "AdminCronExecutionAlert_snoozedUntil_idx" ON "AdminCronExecutionAlert"("snoozedUntil");
CREATE INDEX "AdminCronExecutionAlert_lastAttemptAt_idx" ON "AdminCronExecutionAlert"("lastAttemptAt");
CREATE INDEX "AdminCronExecutionAlert_lastSuccessAt_idx" ON "AdminCronExecutionAlert"("lastSuccessAt");
CREATE INDEX "AdminCronExecutionAlert_detectedAt_idx" ON "AdminCronExecutionAlert"("detectedAt");
CREATE INDEX "AdminCronExecutionAlert_acknowledgedAt_idx" ON "AdminCronExecutionAlert"("acknowledgedAt");
CREATE INDEX "AdminCronExecutionAlert_resolvedAt_idx" ON "AdminCronExecutionAlert"("resolvedAt");
CREATE INDEX "AdminCronExecutionAlert_createdAt_idx" ON "AdminCronExecutionAlert"("createdAt");

CREATE INDEX "AdminCronExecutionAlertEvent_alertId_idx" ON "AdminCronExecutionAlertEvent"("alertId");
CREATE INDEX "AdminCronExecutionAlertEvent_actorUserId_idx" ON "AdminCronExecutionAlertEvent"("actorUserId");
CREATE INDEX "AdminCronExecutionAlertEvent_action_idx" ON "AdminCronExecutionAlertEvent"("action");
CREATE INDEX "AdminCronExecutionAlertEvent_status_idx" ON "AdminCronExecutionAlertEvent"("status");
CREATE INDEX "AdminCronExecutionAlertEvent_priority_idx" ON "AdminCronExecutionAlertEvent"("priority");
CREATE INDEX "AdminCronExecutionAlertEvent_assignedToUserId_idx" ON "AdminCronExecutionAlertEvent"("assignedToUserId");
CREATE INDEX "AdminCronExecutionAlertEvent_snoozedUntil_idx" ON "AdminCronExecutionAlertEvent"("snoozedUntil");
CREATE INDEX "AdminCronExecutionAlertEvent_createdAt_idx" ON "AdminCronExecutionAlertEvent"("createdAt");

CREATE INDEX "AdminCronExecutionAlertNotification_alertId_idx" ON "AdminCronExecutionAlertNotification"("alertId");
CREATE INDEX "AdminCronExecutionAlertNotification_recipientUserId_idx" ON "AdminCronExecutionAlertNotification"("recipientUserId");
CREATE INDEX "AdminCronExecutionAlertNotification_recipientRole_idx" ON "AdminCronExecutionAlertNotification"("recipientRole");
CREATE INDEX "AdminCronExecutionAlertNotification_status_idx" ON "AdminCronExecutionAlertNotification"("status");
CREATE INDEX "AdminCronExecutionAlertNotification_deliveryProvider_idx" ON "AdminCronExecutionAlertNotification"("deliveryProvider");
CREATE INDEX "AdminCronExecutionAlertNotification_deliveryStatus_idx" ON "AdminCronExecutionAlertNotification"("deliveryStatus");
CREATE INDEX "AdminCronExecutionAlertNotification_errorClass_idx" ON "AdminCronExecutionAlertNotification"("errorClass");
CREATE INDEX "AdminCronExecutionAlertNotification_manualFallback_idx" ON "AdminCronExecutionAlertNotification"("manualFallback");
CREATE INDEX "AdminCronExecutionAlertNotification_createdAt_idx" ON "AdminCronExecutionAlertNotification"("createdAt");

ALTER TABLE "AdminCronExecutionAlert"
ADD CONSTRAINT "AdminCronExecutionAlert_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminCronExecutionAlert"
ADD CONSTRAINT "AdminCronExecutionAlert_assignedToUserId_fkey"
FOREIGN KEY ("assignedToUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminCronExecutionAlert"
ADD CONSTRAINT "AdminCronExecutionAlert_resolvedByUserId_fkey"
FOREIGN KEY ("resolvedByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminCronExecutionAlert"
ADD CONSTRAINT "AdminCronExecutionAlert_scheduledJobAttemptId_fkey"
FOREIGN KEY ("scheduledJobAttemptId") REFERENCES "AdminScheduledJobAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminCronExecutionAlertEvent"
ADD CONSTRAINT "AdminCronExecutionAlertEvent_alertId_fkey"
FOREIGN KEY ("alertId") REFERENCES "AdminCronExecutionAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminCronExecutionAlertEvent"
ADD CONSTRAINT "AdminCronExecutionAlertEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminCronExecutionAlertNotification"
ADD CONSTRAINT "AdminCronExecutionAlertNotification_alertId_fkey"
FOREIGN KEY ("alertId") REFERENCES "AdminCronExecutionAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminCronExecutionAlertNotification"
ADD CONSTRAINT "AdminCronExecutionAlertNotification_recipientUserId_fkey"
FOREIGN KEY ("recipientUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
