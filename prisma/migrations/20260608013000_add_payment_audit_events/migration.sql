CREATE TABLE "PaymentAuditEvent" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT,
  "provider" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventStatus" TEXT NOT NULL,
  "signatureStatus" TEXT,
  "providerEventId" TEXT,
  "providerPaymentId" TEXT,
  "requestId" TEXT,
  "rawBodyHash" TEXT,
  "payload" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentAuditEvent_paymentId_idx" ON "PaymentAuditEvent"("paymentId");
CREATE INDEX "PaymentAuditEvent_provider_eventType_idx" ON "PaymentAuditEvent"("provider", "eventType");
CREATE INDEX "PaymentAuditEvent_eventStatus_idx" ON "PaymentAuditEvent"("eventStatus");
CREATE INDEX "PaymentAuditEvent_createdAt_idx" ON "PaymentAuditEvent"("createdAt");
