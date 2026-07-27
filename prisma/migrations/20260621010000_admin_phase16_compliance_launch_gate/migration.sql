-- LAJOO Admin Operating System Phase 16: Legal, Compliance, PDPA, and Regulatory Launch Gate.
-- Additive-only migration for launch-gate records, legal document registry,
-- PDPA/AI compliance checklists, insurer-approved scripts/facts, decisions, and events.

CREATE TABLE "AdminComplianceOperatingModelGate" (
    "id" TEXT NOT NULL,
    "modelType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requires_legal_review',
    "launchReady" BOOLEAN NOT NULL DEFAULT false,
    "evidenceTitle" TEXT,
    "evidenceUrl" TEXT,
    "evidenceSummary" TEXT,
    "sourceUrls" JSONB,
    "blockers" JSONB,
    "notes" TEXT,
    "reviewerName" TEXT,
    "reviewerRole" TEXT,
    "updatedByUserId" TEXT,
    "updatedByEmail" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminComplianceOperatingModelGate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminComplianceLegalDocument" (
    "id" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v0.1-draft',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "ownerRole" TEXT,
    "ownerName" TEXT,
    "reviewerName" TEXT,
    "sourceLinks" JSONB,
    "effectiveAt" TIMESTAMP(3),
    "reviewDueAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminComplianceLegalDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminComplianceChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistType" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "ownerRole" TEXT,
    "ownerName" TEXT,
    "reviewerName" TEXT,
    "launchBlocking" BOOLEAN NOT NULL DEFAULT true,
    "dueAt" TIMESTAMP(3),
    "evidence" JSONB,
    "reviewerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminComplianceChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminInsurerApprovedScriptFact" (
    "id" TEXT NOT NULL,
    "insurer" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceTitle" TEXT,
    "sourceUrl" TEXT,
    "allowedUseCases" JSONB,
    "scriptSummary" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "reviewerName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminInsurerApprovedScriptFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminComplianceLaunchDecision" (
    "id" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL DEFAULT 'launch_gate',
    "status" TEXT NOT NULL DEFAULT 'not_ready',
    "decidedById" TEXT,
    "decidedByEmail" TEXT,
    "decidedByRole" TEXT,
    "reason" TEXT NOT NULL,
    "blockers" JSONB,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminComplianceLaunchDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminComplianceGateEvent" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousStatus" TEXT,
    "status" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminComplianceGateEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminComplianceOperatingModelGate_modelType_key" ON "AdminComplianceOperatingModelGate"("modelType");
CREATE INDEX "AdminComplianceOperatingModelGate_modelType_idx" ON "AdminComplianceOperatingModelGate"("modelType");
CREATE INDEX "AdminComplianceOperatingModelGate_status_idx" ON "AdminComplianceOperatingModelGate"("status");
CREATE INDEX "AdminComplianceOperatingModelGate_launchReady_idx" ON "AdminComplianceOperatingModelGate"("launchReady");
CREATE INDEX "AdminComplianceOperatingModelGate_reviewerRole_idx" ON "AdminComplianceOperatingModelGate"("reviewerRole");
CREATE INDEX "AdminComplianceOperatingModelGate_updatedByUserId_idx" ON "AdminComplianceOperatingModelGate"("updatedByUserId");
CREATE INDEX "AdminComplianceOperatingModelGate_reviewedAt_idx" ON "AdminComplianceOperatingModelGate"("reviewedAt");
CREATE INDEX "AdminComplianceOperatingModelGate_createdAt_idx" ON "AdminComplianceOperatingModelGate"("createdAt");

CREATE UNIQUE INDEX "AdminComplianceLegalDocument_documentType_version_key" ON "AdminComplianceLegalDocument"("documentType", "version");
CREATE INDEX "AdminComplianceLegalDocument_documentType_idx" ON "AdminComplianceLegalDocument"("documentType");
CREATE INDEX "AdminComplianceLegalDocument_status_idx" ON "AdminComplianceLegalDocument"("status");
CREATE INDEX "AdminComplianceLegalDocument_ownerRole_idx" ON "AdminComplianceLegalDocument"("ownerRole");
CREATE INDEX "AdminComplianceLegalDocument_reviewDueAt_idx" ON "AdminComplianceLegalDocument"("reviewDueAt");
CREATE INDEX "AdminComplianceLegalDocument_approvedAt_idx" ON "AdminComplianceLegalDocument"("approvedAt");
CREATE INDEX "AdminComplianceLegalDocument_createdAt_idx" ON "AdminComplianceLegalDocument"("createdAt");

CREATE UNIQUE INDEX "AdminComplianceChecklistItem_checklistType_itemKey_key" ON "AdminComplianceChecklistItem"("checklistType", "itemKey");
CREATE INDEX "AdminComplianceChecklistItem_checklistType_idx" ON "AdminComplianceChecklistItem"("checklistType");
CREATE INDEX "AdminComplianceChecklistItem_itemKey_idx" ON "AdminComplianceChecklistItem"("itemKey");
CREATE INDEX "AdminComplianceChecklistItem_status_idx" ON "AdminComplianceChecklistItem"("status");
CREATE INDEX "AdminComplianceChecklistItem_ownerRole_idx" ON "AdminComplianceChecklistItem"("ownerRole");
CREATE INDEX "AdminComplianceChecklistItem_launchBlocking_idx" ON "AdminComplianceChecklistItem"("launchBlocking");
CREATE INDEX "AdminComplianceChecklistItem_dueAt_idx" ON "AdminComplianceChecklistItem"("dueAt");
CREATE INDEX "AdminComplianceChecklistItem_createdAt_idx" ON "AdminComplianceChecklistItem"("createdAt");

CREATE INDEX "AdminInsurerApprovedScriptFact_insurer_idx" ON "AdminInsurerApprovedScriptFact"("insurer");
CREATE INDEX "AdminInsurerApprovedScriptFact_recordType_idx" ON "AdminInsurerApprovedScriptFact"("recordType");
CREATE INDEX "AdminInsurerApprovedScriptFact_status_idx" ON "AdminInsurerApprovedScriptFact"("status");
CREATE INDEX "AdminInsurerApprovedScriptFact_effectiveFrom_idx" ON "AdminInsurerApprovedScriptFact"("effectiveFrom");
CREATE INDEX "AdminInsurerApprovedScriptFact_effectiveTo_idx" ON "AdminInsurerApprovedScriptFact"("effectiveTo");
CREATE INDEX "AdminInsurerApprovedScriptFact_approvedAt_idx" ON "AdminInsurerApprovedScriptFact"("approvedAt");
CREATE INDEX "AdminInsurerApprovedScriptFact_createdAt_idx" ON "AdminInsurerApprovedScriptFact"("createdAt");

CREATE INDEX "AdminComplianceLaunchDecision_decisionType_idx" ON "AdminComplianceLaunchDecision"("decisionType");
CREATE INDEX "AdminComplianceLaunchDecision_status_idx" ON "AdminComplianceLaunchDecision"("status");
CREATE INDEX "AdminComplianceLaunchDecision_decidedById_idx" ON "AdminComplianceLaunchDecision"("decidedById");
CREATE INDEX "AdminComplianceLaunchDecision_decidedByRole_idx" ON "AdminComplianceLaunchDecision"("decidedByRole");
CREATE INDEX "AdminComplianceLaunchDecision_createdAt_idx" ON "AdminComplianceLaunchDecision"("createdAt");

CREATE INDEX "AdminComplianceGateEvent_targetType_idx" ON "AdminComplianceGateEvent"("targetType");
CREATE INDEX "AdminComplianceGateEvent_targetId_idx" ON "AdminComplianceGateEvent"("targetId");
CREATE INDEX "AdminComplianceGateEvent_action_idx" ON "AdminComplianceGateEvent"("action");
CREATE INDEX "AdminComplianceGateEvent_status_idx" ON "AdminComplianceGateEvent"("status");
CREATE INDEX "AdminComplianceGateEvent_actorUserId_idx" ON "AdminComplianceGateEvent"("actorUserId");
CREATE INDEX "AdminComplianceGateEvent_actorRole_idx" ON "AdminComplianceGateEvent"("actorRole");
CREATE INDEX "AdminComplianceGateEvent_createdAt_idx" ON "AdminComplianceGateEvent"("createdAt");
