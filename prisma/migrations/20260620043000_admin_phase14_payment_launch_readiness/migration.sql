-- LAJOO Admin Operating System Phase 14: Payment launch readiness.
-- Additive-only migration for sanitized payment webhook verification,
-- reconciliation queues, and refund/exception workflow foundations.

CREATE TABLE "AdminPaymentWebhookVerificationEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "safeStatus" TEXT NOT NULL,
    "paymentReference" TEXT,
    "paymentId" TEXT,
    "providerEventId" TEXT,
    "providerPaymentId" TEXT,
    "requestId" TEXT,
    "rawBodyHash" TEXT,
    "providerEnvironment" TEXT,
    "errorClass" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "payloadSummary" JSONB,
    "source" TEXT NOT NULL DEFAULT 'system',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPaymentWebhookVerificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminPaymentReconciliationItem" (
    "id" TEXT NOT NULL,
    "verificationEventId" TEXT,
    "paymentId" TEXT,
    "paymentReference" TEXT,
    "provider" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "amountExpected" DECIMAL(12,2),
    "amountReceived" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "providerEventId" TEXT,
    "assignedToUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewReason" TEXT,
    "resolutionReason" TEXT,
    "safeSummary" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminPaymentReconciliationItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminPaymentReconciliationEvent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "previousStatus" TEXT,
    "status" TEXT NOT NULL,
    "previousPriority" TEXT,
    "priority" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPaymentReconciliationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminPaymentException" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "paymentReference" TEXT,
    "provider" TEXT NOT NULL,
    "exceptionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "refundMode" TEXT NOT NULL DEFAULT 'manual_placeholder',
    "providerRefundId" TEXT,
    "createdByUserId" TEXT,
    "assignedToUserId" TEXT,
    "resolvedByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "resolutionReason" TEXT,
    "noRealRefund" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'manual_admin',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminPaymentException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminPaymentExceptionEvent" (
    "id" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "previousStatus" TEXT,
    "status" TEXT NOT NULL,
    "previousPriority" TEXT,
    "priority" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPaymentExceptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminPaymentWebhookVerificationEvent_actorUserId_idx" ON "AdminPaymentWebhookVerificationEvent"("actorUserId");
CREATE INDEX "AdminPaymentWebhookVerificationEvent_provider_eventType_idx" ON "AdminPaymentWebhookVerificationEvent"("provider", "eventType");
CREATE INDEX "AdminPaymentWebhookVerificationEvent_verificationStatus_idx" ON "AdminPaymentWebhookVerificationEvent"("verificationStatus");
CREATE INDEX "AdminPaymentWebhookVerificationEvent_safeStatus_idx" ON "AdminPaymentWebhookVerificationEvent"("safeStatus");
CREATE INDEX "AdminPaymentWebhookVerificationEvent_paymentId_idx" ON "AdminPaymentWebhookVerificationEvent"("paymentId");
CREATE INDEX "AdminPaymentWebhookVerificationEvent_paymentReference_idx" ON "AdminPaymentWebhookVerificationEvent"("paymentReference");
CREATE INDEX "AdminPaymentWebhookVerificationEvent_providerEventId_idx" ON "AdminPaymentWebhookVerificationEvent"("providerEventId");
CREATE INDEX "AdminPaymentWebhookVerificationEvent_providerEnvironment_idx" ON "AdminPaymentWebhookVerificationEvent"("providerEnvironment");
CREATE INDEX "AdminPaymentWebhookVerificationEvent_errorClass_idx" ON "AdminPaymentWebhookVerificationEvent"("errorClass");
CREATE INDEX "AdminPaymentWebhookVerificationEvent_source_idx" ON "AdminPaymentWebhookVerificationEvent"("source");
CREATE INDEX "AdminPaymentWebhookVerificationEvent_createdAt_idx" ON "AdminPaymentWebhookVerificationEvent"("createdAt");

CREATE INDEX "AdminPaymentReconciliationItem_verificationEventId_idx" ON "AdminPaymentReconciliationItem"("verificationEventId");
CREATE INDEX "AdminPaymentReconciliationItem_paymentId_idx" ON "AdminPaymentReconciliationItem"("paymentId");
CREATE INDEX "AdminPaymentReconciliationItem_paymentReference_idx" ON "AdminPaymentReconciliationItem"("paymentReference");
CREATE INDEX "AdminPaymentReconciliationItem_provider_idx" ON "AdminPaymentReconciliationItem"("provider");
CREATE INDEX "AdminPaymentReconciliationItem_issueType_idx" ON "AdminPaymentReconciliationItem"("issueType");
CREATE INDEX "AdminPaymentReconciliationItem_status_idx" ON "AdminPaymentReconciliationItem"("status");
CREATE INDEX "AdminPaymentReconciliationItem_priority_idx" ON "AdminPaymentReconciliationItem"("priority");
CREATE INDEX "AdminPaymentReconciliationItem_providerEventId_idx" ON "AdminPaymentReconciliationItem"("providerEventId");
CREATE INDEX "AdminPaymentReconciliationItem_assignedToUserId_idx" ON "AdminPaymentReconciliationItem"("assignedToUserId");
CREATE INDEX "AdminPaymentReconciliationItem_reviewedByUserId_idx" ON "AdminPaymentReconciliationItem"("reviewedByUserId");
CREATE INDEX "AdminPaymentReconciliationItem_reviewedAt_idx" ON "AdminPaymentReconciliationItem"("reviewedAt");
CREATE INDEX "AdminPaymentReconciliationItem_resolvedAt_idx" ON "AdminPaymentReconciliationItem"("resolvedAt");
CREATE INDEX "AdminPaymentReconciliationItem_createdAt_idx" ON "AdminPaymentReconciliationItem"("createdAt");

CREATE INDEX "AdminPaymentReconciliationEvent_itemId_idx" ON "AdminPaymentReconciliationEvent"("itemId");
CREATE INDEX "AdminPaymentReconciliationEvent_actorUserId_idx" ON "AdminPaymentReconciliationEvent"("actorUserId");
CREATE INDEX "AdminPaymentReconciliationEvent_action_idx" ON "AdminPaymentReconciliationEvent"("action");
CREATE INDEX "AdminPaymentReconciliationEvent_status_idx" ON "AdminPaymentReconciliationEvent"("status");
CREATE INDEX "AdminPaymentReconciliationEvent_priority_idx" ON "AdminPaymentReconciliationEvent"("priority");
CREATE INDEX "AdminPaymentReconciliationEvent_createdAt_idx" ON "AdminPaymentReconciliationEvent"("createdAt");

CREATE INDEX "AdminPaymentException_paymentId_idx" ON "AdminPaymentException"("paymentId");
CREATE INDEX "AdminPaymentException_paymentReference_idx" ON "AdminPaymentException"("paymentReference");
CREATE INDEX "AdminPaymentException_provider_idx" ON "AdminPaymentException"("provider");
CREATE INDEX "AdminPaymentException_exceptionType_idx" ON "AdminPaymentException"("exceptionType");
CREATE INDEX "AdminPaymentException_status_idx" ON "AdminPaymentException"("status");
CREATE INDEX "AdminPaymentException_priority_idx" ON "AdminPaymentException"("priority");
CREATE INDEX "AdminPaymentException_createdByUserId_idx" ON "AdminPaymentException"("createdByUserId");
CREATE INDEX "AdminPaymentException_assignedToUserId_idx" ON "AdminPaymentException"("assignedToUserId");
CREATE INDEX "AdminPaymentException_resolvedByUserId_idx" ON "AdminPaymentException"("resolvedByUserId");
CREATE INDEX "AdminPaymentException_source_idx" ON "AdminPaymentException"("source");
CREATE INDEX "AdminPaymentException_resolvedAt_idx" ON "AdminPaymentException"("resolvedAt");
CREATE INDEX "AdminPaymentException_createdAt_idx" ON "AdminPaymentException"("createdAt");

CREATE INDEX "AdminPaymentExceptionEvent_exceptionId_idx" ON "AdminPaymentExceptionEvent"("exceptionId");
CREATE INDEX "AdminPaymentExceptionEvent_actorUserId_idx" ON "AdminPaymentExceptionEvent"("actorUserId");
CREATE INDEX "AdminPaymentExceptionEvent_action_idx" ON "AdminPaymentExceptionEvent"("action");
CREATE INDEX "AdminPaymentExceptionEvent_status_idx" ON "AdminPaymentExceptionEvent"("status");
CREATE INDEX "AdminPaymentExceptionEvent_priority_idx" ON "AdminPaymentExceptionEvent"("priority");
CREATE INDEX "AdminPaymentExceptionEvent_createdAt_idx" ON "AdminPaymentExceptionEvent"("createdAt");

ALTER TABLE "AdminPaymentWebhookVerificationEvent" ADD CONSTRAINT "AdminPaymentWebhookVerificationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminPaymentReconciliationItem" ADD CONSTRAINT "AdminPaymentReconciliationItem_verificationEventId_fkey" FOREIGN KEY ("verificationEventId") REFERENCES "AdminPaymentWebhookVerificationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminPaymentReconciliationItem" ADD CONSTRAINT "AdminPaymentReconciliationItem_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminPaymentReconciliationItem" ADD CONSTRAINT "AdminPaymentReconciliationItem_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminPaymentReconciliationEvent" ADD CONSTRAINT "AdminPaymentReconciliationEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AdminPaymentReconciliationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminPaymentReconciliationEvent" ADD CONSTRAINT "AdminPaymentReconciliationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminPaymentException" ADD CONSTRAINT "AdminPaymentException_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminPaymentException" ADD CONSTRAINT "AdminPaymentException_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminPaymentException" ADD CONSTRAINT "AdminPaymentException_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminPaymentExceptionEvent" ADD CONSTRAINT "AdminPaymentExceptionEvent_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "AdminPaymentException"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminPaymentExceptionEvent" ADD CONSTRAINT "AdminPaymentExceptionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
