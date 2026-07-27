-- LAJOO Admin Operating System Phase 8
-- Adds Resend webhook ingestion, notification preferences, MFA SLA reminder events,
-- audit assignment history, role ownership, and artifact rotation metadata.

ALTER TABLE "AdminAuditLog"
ADD COLUMN "ownerRole" TEXT;

ALTER TABLE "AdminExportArtifactAccess"
ADD COLUMN "rotatedFromAccessId" TEXT,
ADD COLUMN "rotatedAt" TIMESTAMP(3),
ADD COLUMN "rotationReason" TEXT;

CREATE TABLE "AdminEmailWebhookEvent" (
    "id" TEXT NOT NULL,
    "inviteEmailEventId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "svixId" TEXT,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerEventId" TEXT,
    "providerMessageId" TEXT,
    "recipientMasked" TEXT,
    "emailDigest" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'verified',
    "errorClass" TEXT,
    "payloadSummary" JSONB,
    "linkedBy" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminEmailWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL DEFAULT 'immediate',
    "manualFallbackEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminMfaRecoveryReminderEvent" (
    "id" TEXT NOT NULL,
    "recoveryRequestId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "deliveryStatus" TEXT,
    "deliveryProvider" TEXT,
    "errorClass" TEXT,
    "escalationTargetRole" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminMfaRecoveryReminderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminAuditAssignmentEvent" (
    "id" TEXT NOT NULL,
    "auditLogId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "previousAssignedToUserId" TEXT,
    "assignedToUserId" TEXT,
    "previousOwnerRole" TEXT,
    "ownerRole" TEXT,
    "previousPriority" TEXT,
    "priority" TEXT,
    "previousEscalationStatus" TEXT,
    "escalationStatus" TEXT,
    "previousAssignmentDueAt" TIMESTAMP(3),
    "assignmentDueAt" TIMESTAMP(3),
    "previousEscalationReason" TEXT,
    "escalationReason" TEXT,
    "reason" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditAssignmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminEmailWebhookEvent_svixId_key" ON "AdminEmailWebhookEvent"("svixId");
CREATE INDEX "AdminEmailWebhookEvent_inviteEmailEventId_idx" ON "AdminEmailWebhookEvent"("inviteEmailEventId");
CREATE INDEX "AdminEmailWebhookEvent_provider_idx" ON "AdminEmailWebhookEvent"("provider");
CREATE INDEX "AdminEmailWebhookEvent_eventType_idx" ON "AdminEmailWebhookEvent"("eventType");
CREATE INDEX "AdminEmailWebhookEvent_status_idx" ON "AdminEmailWebhookEvent"("status");
CREATE INDEX "AdminEmailWebhookEvent_providerMessageId_idx" ON "AdminEmailWebhookEvent"("providerMessageId");
CREATE INDEX "AdminEmailWebhookEvent_verificationStatus_idx" ON "AdminEmailWebhookEvent"("verificationStatus");
CREATE INDEX "AdminEmailWebhookEvent_receivedAt_idx" ON "AdminEmailWebhookEvent"("receivedAt");
CREATE INDEX "AdminEmailWebhookEvent_createdAt_idx" ON "AdminEmailWebhookEvent"("createdAt");

CREATE UNIQUE INDEX "AdminNotificationPreference_userId_category_key" ON "AdminNotificationPreference"("userId", "category");
CREATE INDEX "AdminNotificationPreference_userId_idx" ON "AdminNotificationPreference"("userId");
CREATE INDEX "AdminNotificationPreference_category_idx" ON "AdminNotificationPreference"("category");
CREATE INDEX "AdminNotificationPreference_frequency_idx" ON "AdminNotificationPreference"("frequency");

CREATE INDEX "AdminMfaRecoveryReminderEvent_recoveryRequestId_idx" ON "AdminMfaRecoveryReminderEvent"("recoveryRequestId");
CREATE INDEX "AdminMfaRecoveryReminderEvent_actorUserId_idx" ON "AdminMfaRecoveryReminderEvent"("actorUserId");
CREATE INDEX "AdminMfaRecoveryReminderEvent_action_idx" ON "AdminMfaRecoveryReminderEvent"("action");
CREATE INDEX "AdminMfaRecoveryReminderEvent_status_idx" ON "AdminMfaRecoveryReminderEvent"("status");
CREATE INDEX "AdminMfaRecoveryReminderEvent_priority_idx" ON "AdminMfaRecoveryReminderEvent"("priority");
CREATE INDEX "AdminMfaRecoveryReminderEvent_escalationTargetRole_idx" ON "AdminMfaRecoveryReminderEvent"("escalationTargetRole");
CREATE INDEX "AdminMfaRecoveryReminderEvent_createdAt_idx" ON "AdminMfaRecoveryReminderEvent"("createdAt");

CREATE INDEX "AdminAuditLog_ownerRole_idx" ON "AdminAuditLog"("ownerRole");
CREATE INDEX "AdminAuditAssignmentEvent_auditLogId_idx" ON "AdminAuditAssignmentEvent"("auditLogId");
CREATE INDEX "AdminAuditAssignmentEvent_actorUserId_idx" ON "AdminAuditAssignmentEvent"("actorUserId");
CREATE INDEX "AdminAuditAssignmentEvent_assignedToUserId_idx" ON "AdminAuditAssignmentEvent"("assignedToUserId");
CREATE INDEX "AdminAuditAssignmentEvent_ownerRole_idx" ON "AdminAuditAssignmentEvent"("ownerRole");
CREATE INDEX "AdminAuditAssignmentEvent_priority_idx" ON "AdminAuditAssignmentEvent"("priority");
CREATE INDEX "AdminAuditAssignmentEvent_escalationStatus_idx" ON "AdminAuditAssignmentEvent"("escalationStatus");
CREATE INDEX "AdminAuditAssignmentEvent_assignmentDueAt_idx" ON "AdminAuditAssignmentEvent"("assignmentDueAt");
CREATE INDEX "AdminAuditAssignmentEvent_createdAt_idx" ON "AdminAuditAssignmentEvent"("createdAt");

CREATE INDEX "AdminExportArtifactAccess_rotatedFromAccessId_idx" ON "AdminExportArtifactAccess"("rotatedFromAccessId");
CREATE INDEX "AdminExportArtifactAccess_rotatedAt_idx" ON "AdminExportArtifactAccess"("rotatedAt");

ALTER TABLE "AdminEmailWebhookEvent" ADD CONSTRAINT "AdminEmailWebhookEvent_inviteEmailEventId_fkey" FOREIGN KEY ("inviteEmailEventId") REFERENCES "AdminInviteEmailEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminNotificationPreference" ADD CONSTRAINT "AdminNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminMfaRecoveryReminderEvent" ADD CONSTRAINT "AdminMfaRecoveryReminderEvent_recoveryRequestId_fkey" FOREIGN KEY ("recoveryRequestId") REFERENCES "AdminMfaRecoveryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminMfaRecoveryReminderEvent" ADD CONSTRAINT "AdminMfaRecoveryReminderEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminAuditAssignmentEvent" ADD CONSTRAINT "AdminAuditAssignmentEvent_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "AdminAuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminAuditAssignmentEvent" ADD CONSTRAINT "AdminAuditAssignmentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
