CREATE TABLE "PdpaConsentAuditEvent" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "action" TEXT NOT NULL DEFAULT 'accepted',
  "consentVersion" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'chat',
  "reason" TEXT,
  "messageHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PdpaConsentAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PdpaConsentAuditEvent_sessionId_idx" ON "PdpaConsentAuditEvent"("sessionId");
CREATE INDEX "PdpaConsentAuditEvent_consentVersion_idx" ON "PdpaConsentAuditEvent"("consentVersion");
CREATE INDEX "PdpaConsentAuditEvent_acceptedAt_idx" ON "PdpaConsentAuditEvent"("acceptedAt");
CREATE INDEX "PdpaConsentAuditEvent_createdAt_idx" ON "PdpaConsentAuditEvent"("createdAt");
