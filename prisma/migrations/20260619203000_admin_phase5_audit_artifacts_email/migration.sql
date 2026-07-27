-- AlterTable
ALTER TABLE "AdminInviteToken" ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'manual_required',
ADD COLUMN "deliveryProvider" TEXT,
ADD COLUMN "deliveryMessageId" TEXT,
ADD COLUMN "deliveryError" TEXT,
ADD COLUMN "deliverySentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AdminAuditLog" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'unreviewed',
ADD COLUMN "reviewedByUserId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewNote" TEXT;

-- CreateTable
CREATE TABLE "AdminExportArtifactAccess" (
    "id" TEXT NOT NULL,
    "exportEventId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "requestedByUserId" TEXT,
    "requestedByRole" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "accessedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminExportArtifactAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminInviteToken_deliveryStatus_idx" ON "AdminInviteToken"("deliveryStatus");

-- CreateIndex
CREATE INDEX "AdminAuditLog_reviewStatus_idx" ON "AdminAuditLog"("reviewStatus");

-- CreateIndex
CREATE INDEX "AdminAuditLog_reviewedByUserId_idx" ON "AdminAuditLog"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminExportArtifactAccess_tokenHash_key" ON "AdminExportArtifactAccess"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminExportArtifactAccess_exportEventId_idx" ON "AdminExportArtifactAccess"("exportEventId");

-- CreateIndex
CREATE INDEX "AdminExportArtifactAccess_requestedByUserId_idx" ON "AdminExportArtifactAccess"("requestedByUserId");

-- CreateIndex
CREATE INDEX "AdminExportArtifactAccess_status_idx" ON "AdminExportArtifactAccess"("status");

-- CreateIndex
CREATE INDEX "AdminExportArtifactAccess_expiresAt_idx" ON "AdminExportArtifactAccess"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminExportArtifactAccess_createdAt_idx" ON "AdminExportArtifactAccess"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminExportArtifactAccess" ADD CONSTRAINT "AdminExportArtifactAccess_exportEventId_fkey" FOREIGN KEY ("exportEventId") REFERENCES "AdminExportEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminExportArtifactAccess" ADD CONSTRAINT "AdminExportArtifactAccess_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
