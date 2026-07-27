-- LAJOO Admin Operating System Phase 9
-- Adds Resend webhook registration checks and no-PII notification digest events.

CREATE TABLE "AdminResendWebhookStatusCheck" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "status" TEXT NOT NULL,
    "endpointUrl" TEXT,
    "endpointMatched" BOOLEAN NOT NULL DEFAULT false,
    "matchedWebhookId" TEXT,
    "matchedWebhookStatus" TEXT,
    "matchedWebhookEvents" JSONB,
    "webhookCount" INTEGER NOT NULL DEFAULT 0,
    "requiredEventsMissing" JSONB,
    "errorClass" TEXT,
    "errorMessage" TEXT,
    "providerEnvironment" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminResendWebhookStatusCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminNotificationDigestEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "frequency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "deliveryProvider" TEXT,
    "deliveryStatus" TEXT,
    "deliveryMessageId" TEXT,
    "deliveryErrorClass" TEXT,
    "deliveryError" TEXT,
    "manualFallback" BOOLEAN NOT NULL DEFAULT false,
    "categorySummary" JSONB,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminNotificationDigestEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminResendWebhookStatusCheck_actorUserId_idx" ON "AdminResendWebhookStatusCheck"("actorUserId");
CREATE INDEX "AdminResendWebhookStatusCheck_provider_idx" ON "AdminResendWebhookStatusCheck"("provider");
CREATE INDEX "AdminResendWebhookStatusCheck_status_idx" ON "AdminResendWebhookStatusCheck"("status");
CREATE INDEX "AdminResendWebhookStatusCheck_endpointMatched_idx" ON "AdminResendWebhookStatusCheck"("endpointMatched");
CREATE INDEX "AdminResendWebhookStatusCheck_matchedWebhookStatus_idx" ON "AdminResendWebhookStatusCheck"("matchedWebhookStatus");
CREATE INDEX "AdminResendWebhookStatusCheck_errorClass_idx" ON "AdminResendWebhookStatusCheck"("errorClass");
CREATE INDEX "AdminResendWebhookStatusCheck_checkedAt_idx" ON "AdminResendWebhookStatusCheck"("checkedAt");
CREATE INDEX "AdminResendWebhookStatusCheck_createdAt_idx" ON "AdminResendWebhookStatusCheck"("createdAt");

CREATE INDEX "AdminNotificationDigestEvent_userId_idx" ON "AdminNotificationDigestEvent"("userId");
CREATE INDEX "AdminNotificationDigestEvent_actorUserId_idx" ON "AdminNotificationDigestEvent"("actorUserId");
CREATE INDEX "AdminNotificationDigestEvent_frequency_idx" ON "AdminNotificationDigestEvent"("frequency");
CREATE INDEX "AdminNotificationDigestEvent_status_idx" ON "AdminNotificationDigestEvent"("status");
CREATE INDEX "AdminNotificationDigestEvent_deliveryStatus_idx" ON "AdminNotificationDigestEvent"("deliveryStatus");
CREATE INDEX "AdminNotificationDigestEvent_deliveryProvider_idx" ON "AdminNotificationDigestEvent"("deliveryProvider");
CREATE INDEX "AdminNotificationDigestEvent_manualFallback_idx" ON "AdminNotificationDigestEvent"("manualFallback");
CREATE INDEX "AdminNotificationDigestEvent_sentAt_idx" ON "AdminNotificationDigestEvent"("sentAt");
CREATE INDEX "AdminNotificationDigestEvent_createdAt_idx" ON "AdminNotificationDigestEvent"("createdAt");

ALTER TABLE "AdminResendWebhookStatusCheck" ADD CONSTRAINT "AdminResendWebhookStatusCheck_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminNotificationDigestEvent" ADD CONSTRAINT "AdminNotificationDigestEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminNotificationDigestEvent" ADD CONSTRAINT "AdminNotificationDigestEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
