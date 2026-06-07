-- CreateTable
CREATE TABLE "PaymentIntentSnapshot" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerMode" TEXT,
    "providerPaymentIntentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requires_provider',
    "paymentMethod" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "insurer" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "insurance" DECIMAL(12,2) NOT NULL,
    "addons" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL,
    "roadtax" DECIMAL(12,2) NOT NULL,
    "breakdown" JSONB,
    "checkoutData" JSONB,
    "clientConfirmationToken" TEXT,
    "transactionRef" TEXT,
    "paymentAvailable" BOOLEAN NOT NULL DEFAULT false,
    "canIssuePolicy" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentIntentSnapshot_sessionId_idx" ON "PaymentIntentSnapshot"("sessionId");

-- CreateIndex
CREATE INDEX "PaymentIntentSnapshot_status_idx" ON "PaymentIntentSnapshot"("status");

-- CreateIndex
CREATE INDEX "PaymentIntentSnapshot_expiresAt_idx" ON "PaymentIntentSnapshot"("expiresAt");
