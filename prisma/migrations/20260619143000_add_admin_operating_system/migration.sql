-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "bootstrapSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "grantedByUserId" TEXT,
    "grantedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AdminRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'logged',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PiiRevealEvent" (
    "id" TEXT NOT NULL,
    "auditLogId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PiiRevealEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminExportEvent" (
    "id" TEXT NOT NULL,
    "auditLogId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "exportKind" TEXT NOT NULL DEFAULT 'mock',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminExportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_status_idx" ON "AdminUser"("status");

-- CreateIndex
CREATE INDEX "AdminUser_lastActiveAt_idx" ON "AdminUser"("lastActiveAt");

-- CreateIndex
CREATE INDEX "AdminRoleAssignment_userId_idx" ON "AdminRoleAssignment"("userId");

-- CreateIndex
CREATE INDEX "AdminRoleAssignment_role_idx" ON "AdminRoleAssignment"("role");

-- CreateIndex
CREATE INDEX "AdminRoleAssignment_revokedAt_idx" ON "AdminRoleAssignment"("revokedAt");

-- CreateIndex
CREATE INDEX "AdminRoleAssignment_grantedByUserId_idx" ON "AdminRoleAssignment"("grantedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession"("userId");

-- CreateIndex
CREATE INDEX "AdminSession_status_idx" ON "AdminSession"("status");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminSession_revokedAt_idx" ON "AdminSession"("revokedAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorUserId_idx" ON "AdminAuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorRole_idx" ON "AdminAuditLog"("actorRole");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_status_idx" ON "AdminAuditLog"("status");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PiiRevealEvent_auditLogId_key" ON "PiiRevealEvent"("auditLogId");

-- CreateIndex
CREATE INDEX "PiiRevealEvent_actorUserId_idx" ON "PiiRevealEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "PiiRevealEvent_actorRole_idx" ON "PiiRevealEvent"("actorRole");

-- CreateIndex
CREATE INDEX "PiiRevealEvent_targetType_targetId_idx" ON "PiiRevealEvent"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "PiiRevealEvent_field_idx" ON "PiiRevealEvent"("field");

-- CreateIndex
CREATE INDEX "PiiRevealEvent_createdAt_idx" ON "PiiRevealEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminExportEvent_auditLogId_key" ON "AdminExportEvent"("auditLogId");

-- CreateIndex
CREATE INDEX "AdminExportEvent_actorUserId_idx" ON "AdminExportEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "AdminExportEvent_actorRole_idx" ON "AdminExportEvent"("actorRole");

-- CreateIndex
CREATE INDEX "AdminExportEvent_targetType_targetId_idx" ON "AdminExportEvent"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminExportEvent_status_idx" ON "AdminExportEvent"("status");

-- CreateIndex
CREATE INDEX "AdminExportEvent_createdAt_idx" ON "AdminExportEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminRoleAssignment" ADD CONSTRAINT "AdminRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRoleAssignment" ADD CONSTRAINT "AdminRoleAssignment_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiiRevealEvent" ADD CONSTRAINT "PiiRevealEvent_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "AdminAuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiiRevealEvent" ADD CONSTRAINT "PiiRevealEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminExportEvent" ADD CONSTRAINT "AdminExportEvent_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "AdminAuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminExportEvent" ADD CONSTRAINT "AdminExportEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
