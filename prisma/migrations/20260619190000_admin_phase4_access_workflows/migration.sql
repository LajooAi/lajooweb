-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "mfaSecretEncrypted" TEXT,
ADD COLUMN "mfaSecretUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AdminExportEvent" ADD COLUMN "artifactMetadata" JSONB,
ADD COLUMN "artifactReadyAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminInviteToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminInviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminMfaChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "AdminMfaChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminInviteToken_tokenHash_key" ON "AdminInviteToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminInviteToken_userId_idx" ON "AdminInviteToken"("userId");

-- CreateIndex
CREATE INDEX "AdminInviteToken_email_idx" ON "AdminInviteToken"("email");

-- CreateIndex
CREATE INDEX "AdminInviteToken_status_idx" ON "AdminInviteToken"("status");

-- CreateIndex
CREATE INDEX "AdminInviteToken_expiresAt_idx" ON "AdminInviteToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminInviteToken_createdByUserId_idx" ON "AdminInviteToken"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminMfaChallenge_tokenHash_key" ON "AdminMfaChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminMfaChallenge_userId_idx" ON "AdminMfaChallenge"("userId");

-- CreateIndex
CREATE INDEX "AdminMfaChallenge_status_idx" ON "AdminMfaChallenge"("status");

-- CreateIndex
CREATE INDEX "AdminMfaChallenge_expiresAt_idx" ON "AdminMfaChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminMfaChallenge_createdAt_idx" ON "AdminMfaChallenge"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminInviteToken" ADD CONSTRAINT "AdminInviteToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminInviteToken" ADD CONSTRAINT "AdminInviteToken_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminMfaChallenge" ADD CONSTRAINT "AdminMfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
