-- Phase 7 admin security operations: email delivery monitoring, MFA SLA tracking,
-- audit ownership queues, and signed export artifact lifecycle controls.

ALTER TABLE "AdminMfaRecoveryRequest"
ADD COLUMN "dueAt" TIMESTAMP(3),
ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN "notifiedAt" TIMESTAMP(3),
ADD COLUMN "reminderSentAt" TIMESTAMP(3),
ADD COLUMN "overdueAt" TIMESTAMP(3),
ADD COLUMN "notificationStatus" TEXT,
ADD COLUMN "notificationProvider" TEXT,
ADD COLUMN "notificationErrorClass" TEXT,
ADD COLUMN "notificationError" TEXT;

ALTER TABLE "AdminAuditLog"
ADD COLUMN "assignmentDueAt" TIMESTAMP(3),
ADD COLUMN "escalationReason" TEXT,
ADD COLUMN "escalationResolvedAt" TIMESTAMP(3);

ALTER TABLE "AdminExportArtifactAccess"
ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "revokedByUserId" TEXT,
ADD COLUMN "revokedReason" TEXT,
ADD COLUMN "lastAccessedIpAddress" TEXT,
ADD COLUMN "lastAccessedUserAgent" TEXT;

CREATE TABLE "AdminInviteEmailEvent" (
  "id" TEXT NOT NULL,
  "inviteTokenId" TEXT,
  "actorUserId" TEXT,
  "email" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "errorClass" TEXT,
  "errorMessage" TEXT,
  "messageId" TEXT,
  "domain" TEXT,
  "providerEnvironment" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminInviteEmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminMfaRecoveryRequest_priority_idx" ON "AdminMfaRecoveryRequest"("priority");
CREATE INDEX "AdminMfaRecoveryRequest_dueAt_idx" ON "AdminMfaRecoveryRequest"("dueAt");
CREATE INDEX "AdminMfaRecoveryRequest_overdueAt_idx" ON "AdminMfaRecoveryRequest"("overdueAt");
CREATE INDEX "AdminMfaRecoveryRequest_notificationStatus_idx" ON "AdminMfaRecoveryRequest"("notificationStatus");

CREATE INDEX "AdminAuditLog_assignmentDueAt_idx" ON "AdminAuditLog"("assignmentDueAt");
CREATE INDEX "AdminAuditLog_escalationResolvedAt_idx" ON "AdminAuditLog"("escalationResolvedAt");

CREATE INDEX "AdminExportArtifactAccess_revokedAt_idx" ON "AdminExportArtifactAccess"("revokedAt");
CREATE INDEX "AdminExportArtifactAccess_revokedByUserId_idx" ON "AdminExportArtifactAccess"("revokedByUserId");

CREATE INDEX "AdminInviteEmailEvent_inviteTokenId_idx" ON "AdminInviteEmailEvent"("inviteTokenId");
CREATE INDEX "AdminInviteEmailEvent_actorUserId_idx" ON "AdminInviteEmailEvent"("actorUserId");
CREATE INDEX "AdminInviteEmailEvent_provider_idx" ON "AdminInviteEmailEvent"("provider");
CREATE INDEX "AdminInviteEmailEvent_status_idx" ON "AdminInviteEmailEvent"("status");
CREATE INDEX "AdminInviteEmailEvent_errorClass_idx" ON "AdminInviteEmailEvent"("errorClass");
CREATE INDEX "AdminInviteEmailEvent_createdAt_idx" ON "AdminInviteEmailEvent"("createdAt");

ALTER TABLE "AdminExportArtifactAccess"
ADD CONSTRAINT "AdminExportArtifactAccess_revokedByUserId_fkey"
FOREIGN KEY ("revokedByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminInviteEmailEvent"
ADD CONSTRAINT "AdminInviteEmailEvent_inviteTokenId_fkey"
FOREIGN KEY ("inviteTokenId") REFERENCES "AdminInviteToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminInviteEmailEvent"
ADD CONSTRAINT "AdminInviteEmailEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
