-- LAJOO Admin Operating System Phase 15: Insurer / renewal ops workflow.
-- Additive-only migration for manual insurer processing, renewal lifecycle,
-- policy document verification metadata, and status audit history.

CREATE TABLE "AdminRenewalOpsCase" (
    "id" TEXT NOT NULL,
    "caseRef" TEXT NOT NULL,
    "sourceSessionId" TEXT,
    "customerName" TEXT,
    "customerIc" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "vehiclePlate" TEXT,
    "vehicleSummary" TEXT,
    "requestedInsurer" TEXT,
    "selectedInsurer" TEXT,
    "coverageType" TEXT,
    "addOns" JSONB,
    "roadTaxOption" TEXT,
    "premiumSnapshot" JSONB,
    "status" TEXT NOT NULL DEFAULT 'intake_received',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "ownerUserId" TEXT,
    "issuanceMode" TEXT NOT NULL DEFAULT 'manual_ops_upload',
    "sourceLabel" TEXT NOT NULL DEFAULT 'manual_ops',
    "policyIssuedToCustomer" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminRenewalOpsCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminRenewalOpsStatusEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "previousStatus" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRenewalOpsStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminRenewalQuoteLifecycleEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "insurer" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "premiumSnapshot" JSONB,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRenewalQuoteLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminInsurerPartnerSubmission" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "insurer" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'manual_insurer_portal',
    "sourceLabel" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'pending_submission',
    "externalReference" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "safeSummary" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "submittedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminInsurerPartnerSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminManualIssuanceTask" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "assignedToUserId" TEXT,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "issuanceMode" TEXT NOT NULL DEFAULT 'manual_ops_upload',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminManualIssuanceTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminPolicyDocumentVerification" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "reviewerUserId" TEXT,
    "insurer" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "policyNumber" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "storageMode" TEXT NOT NULL DEFAULT 'metadata_placeholder',
    "fileReference" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "reviewerNote" TEXT,
    "safeSummary" JSONB,
    "noCustomerRelease" BOOLEAN NOT NULL DEFAULT true,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminPolicyDocumentVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminRenewalOpsCase_caseRef_key" ON "AdminRenewalOpsCase"("caseRef");
CREATE INDEX "AdminRenewalOpsCase_caseRef_idx" ON "AdminRenewalOpsCase"("caseRef");
CREATE INDEX "AdminRenewalOpsCase_sourceSessionId_idx" ON "AdminRenewalOpsCase"("sourceSessionId");
CREATE INDEX "AdminRenewalOpsCase_status_idx" ON "AdminRenewalOpsCase"("status");
CREATE INDEX "AdminRenewalOpsCase_priority_idx" ON "AdminRenewalOpsCase"("priority");
CREATE INDEX "AdminRenewalOpsCase_ownerUserId_idx" ON "AdminRenewalOpsCase"("ownerUserId");
CREATE INDEX "AdminRenewalOpsCase_requestedInsurer_idx" ON "AdminRenewalOpsCase"("requestedInsurer");
CREATE INDEX "AdminRenewalOpsCase_selectedInsurer_idx" ON "AdminRenewalOpsCase"("selectedInsurer");
CREATE INDEX "AdminRenewalOpsCase_issuanceMode_idx" ON "AdminRenewalOpsCase"("issuanceMode");
CREATE INDEX "AdminRenewalOpsCase_sourceLabel_idx" ON "AdminRenewalOpsCase"("sourceLabel");
CREATE INDEX "AdminRenewalOpsCase_createdByUserId_idx" ON "AdminRenewalOpsCase"("createdByUserId");
CREATE INDEX "AdminRenewalOpsCase_updatedByUserId_idx" ON "AdminRenewalOpsCase"("updatedByUserId");
CREATE INDEX "AdminRenewalOpsCase_createdAt_idx" ON "AdminRenewalOpsCase"("createdAt");
CREATE INDEX "AdminRenewalOpsCase_updatedAt_idx" ON "AdminRenewalOpsCase"("updatedAt");

CREATE INDEX "AdminRenewalOpsStatusEvent_caseId_idx" ON "AdminRenewalOpsStatusEvent"("caseId");
CREATE INDEX "AdminRenewalOpsStatusEvent_actorUserId_idx" ON "AdminRenewalOpsStatusEvent"("actorUserId");
CREATE INDEX "AdminRenewalOpsStatusEvent_action_idx" ON "AdminRenewalOpsStatusEvent"("action");
CREATE INDEX "AdminRenewalOpsStatusEvent_previousStatus_idx" ON "AdminRenewalOpsStatusEvent"("previousStatus");
CREATE INDEX "AdminRenewalOpsStatusEvent_status_idx" ON "AdminRenewalOpsStatusEvent"("status");
CREATE INDEX "AdminRenewalOpsStatusEvent_createdAt_idx" ON "AdminRenewalOpsStatusEvent"("createdAt");

CREATE INDEX "AdminRenewalQuoteLifecycleEvent_caseId_idx" ON "AdminRenewalQuoteLifecycleEvent"("caseId");
CREATE INDEX "AdminRenewalQuoteLifecycleEvent_actorUserId_idx" ON "AdminRenewalQuoteLifecycleEvent"("actorUserId");
CREATE INDEX "AdminRenewalQuoteLifecycleEvent_eventType_idx" ON "AdminRenewalQuoteLifecycleEvent"("eventType");
CREATE INDEX "AdminRenewalQuoteLifecycleEvent_insurer_idx" ON "AdminRenewalQuoteLifecycleEvent"("insurer");
CREATE INDEX "AdminRenewalQuoteLifecycleEvent_status_idx" ON "AdminRenewalQuoteLifecycleEvent"("status");
CREATE INDEX "AdminRenewalQuoteLifecycleEvent_createdAt_idx" ON "AdminRenewalQuoteLifecycleEvent"("createdAt");

CREATE INDEX "AdminInsurerPartnerSubmission_caseId_idx" ON "AdminInsurerPartnerSubmission"("caseId");
CREATE INDEX "AdminInsurerPartnerSubmission_actorUserId_idx" ON "AdminInsurerPartnerSubmission"("actorUserId");
CREATE INDEX "AdminInsurerPartnerSubmission_insurer_idx" ON "AdminInsurerPartnerSubmission"("insurer");
CREATE INDEX "AdminInsurerPartnerSubmission_channel_idx" ON "AdminInsurerPartnerSubmission"("channel");
CREATE INDEX "AdminInsurerPartnerSubmission_sourceLabel_idx" ON "AdminInsurerPartnerSubmission"("sourceLabel");
CREATE INDEX "AdminInsurerPartnerSubmission_status_idx" ON "AdminInsurerPartnerSubmission"("status");
CREATE INDEX "AdminInsurerPartnerSubmission_externalReference_idx" ON "AdminInsurerPartnerSubmission"("externalReference");
CREATE INDEX "AdminInsurerPartnerSubmission_submittedAt_idx" ON "AdminInsurerPartnerSubmission"("submittedAt");
CREATE INDEX "AdminInsurerPartnerSubmission_respondedAt_idx" ON "AdminInsurerPartnerSubmission"("respondedAt");
CREATE INDEX "AdminInsurerPartnerSubmission_createdAt_idx" ON "AdminInsurerPartnerSubmission"("createdAt");

CREATE INDEX "AdminManualIssuanceTask_caseId_idx" ON "AdminManualIssuanceTask"("caseId");
CREATE INDEX "AdminManualIssuanceTask_actorUserId_idx" ON "AdminManualIssuanceTask"("actorUserId");
CREATE INDEX "AdminManualIssuanceTask_assignedToUserId_idx" ON "AdminManualIssuanceTask"("assignedToUserId");
CREATE INDEX "AdminManualIssuanceTask_taskType_idx" ON "AdminManualIssuanceTask"("taskType");
CREATE INDEX "AdminManualIssuanceTask_status_idx" ON "AdminManualIssuanceTask"("status");
CREATE INDEX "AdminManualIssuanceTask_issuanceMode_idx" ON "AdminManualIssuanceTask"("issuanceMode");
CREATE INDEX "AdminManualIssuanceTask_dueAt_idx" ON "AdminManualIssuanceTask"("dueAt");
CREATE INDEX "AdminManualIssuanceTask_completedAt_idx" ON "AdminManualIssuanceTask"("completedAt");
CREATE INDEX "AdminManualIssuanceTask_createdAt_idx" ON "AdminManualIssuanceTask"("createdAt");

CREATE INDEX "AdminPolicyDocumentVerification_caseId_idx" ON "AdminPolicyDocumentVerification"("caseId");
CREATE INDEX "AdminPolicyDocumentVerification_actorUserId_idx" ON "AdminPolicyDocumentVerification"("actorUserId");
CREATE INDEX "AdminPolicyDocumentVerification_reviewerUserId_idx" ON "AdminPolicyDocumentVerification"("reviewerUserId");
CREATE INDEX "AdminPolicyDocumentVerification_insurer_idx" ON "AdminPolicyDocumentVerification"("insurer");
CREATE INDEX "AdminPolicyDocumentVerification_documentType_idx" ON "AdminPolicyDocumentVerification"("documentType");
CREATE INDEX "AdminPolicyDocumentVerification_policyNumber_idx" ON "AdminPolicyDocumentVerification"("policyNumber");
CREATE INDEX "AdminPolicyDocumentVerification_storageMode_idx" ON "AdminPolicyDocumentVerification"("storageMode");
CREATE INDEX "AdminPolicyDocumentVerification_verificationStatus_idx" ON "AdminPolicyDocumentVerification"("verificationStatus");
CREATE INDEX "AdminPolicyDocumentVerification_uploadedAt_idx" ON "AdminPolicyDocumentVerification"("uploadedAt");
CREATE INDEX "AdminPolicyDocumentVerification_reviewedAt_idx" ON "AdminPolicyDocumentVerification"("reviewedAt");
CREATE INDEX "AdminPolicyDocumentVerification_createdAt_idx" ON "AdminPolicyDocumentVerification"("createdAt");

ALTER TABLE "AdminRenewalOpsCase" ADD CONSTRAINT "AdminRenewalOpsCase_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminRenewalOpsCase" ADD CONSTRAINT "AdminRenewalOpsCase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminRenewalOpsCase" ADD CONSTRAINT "AdminRenewalOpsCase_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminRenewalOpsStatusEvent" ADD CONSTRAINT "AdminRenewalOpsStatusEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AdminRenewalOpsCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminRenewalOpsStatusEvent" ADD CONSTRAINT "AdminRenewalOpsStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminRenewalQuoteLifecycleEvent" ADD CONSTRAINT "AdminRenewalQuoteLifecycleEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AdminRenewalOpsCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminRenewalQuoteLifecycleEvent" ADD CONSTRAINT "AdminRenewalQuoteLifecycleEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminInsurerPartnerSubmission" ADD CONSTRAINT "AdminInsurerPartnerSubmission_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AdminRenewalOpsCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminInsurerPartnerSubmission" ADD CONSTRAINT "AdminInsurerPartnerSubmission_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminManualIssuanceTask" ADD CONSTRAINT "AdminManualIssuanceTask_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AdminRenewalOpsCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminManualIssuanceTask" ADD CONSTRAINT "AdminManualIssuanceTask_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminManualIssuanceTask" ADD CONSTRAINT "AdminManualIssuanceTask_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminPolicyDocumentVerification" ADD CONSTRAINT "AdminPolicyDocumentVerification_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AdminRenewalOpsCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminPolicyDocumentVerification" ADD CONSTRAINT "AdminPolicyDocumentVerification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminPolicyDocumentVerification" ADD CONSTRAINT "AdminPolicyDocumentVerification_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
