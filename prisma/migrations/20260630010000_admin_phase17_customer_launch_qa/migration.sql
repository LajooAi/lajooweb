-- LAJOO Admin Operating System Phase 17: Customer Launch QA.
-- Additive-only migration for /my launch QA checklists, stuck-flow scenarios,
-- mobile QA, payment-failure safety QA, support handoff QA, UAT runs, and events.

CREATE TABLE "AdminCustomerLaunchQaItem" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "ownerRole" TEXT,
    "ownerName" TEXT,
    "reviewerName" TEXT,
    "reviewerRole" TEXT,
    "reviewerNote" TEXT,
    "launchBlocking" BOOLEAN NOT NULL DEFAULT true,
    "blocker" BOOLEAN NOT NULL DEFAULT true,
    "severity" TEXT NOT NULL DEFAULT 'normal',
    "viewport" TEXT,
    "slaHours" INTEGER,
    "dueAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminCustomerLaunchQaItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminCustomerLaunchUatRun" (
    "id" TEXT NOT NULL,
    "runName" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "testerName" TEXT,
    "testerRole" TEXT,
    "team" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "blockerCount" INTEGER NOT NULL DEFAULT 0,
    "signoffStatus" TEXT NOT NULL DEFAULT 'not_ready',
    "signoffReason" TEXT,
    "signedOffById" TEXT,
    "signedOffByEmail" TEXT,
    "signedOffByRole" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "notes" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminCustomerLaunchUatRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminCustomerLaunchQaEvent" (
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

    CONSTRAINT "AdminCustomerLaunchQaEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminCustomerLaunchQaItem_category_itemKey_key" ON "AdminCustomerLaunchQaItem"("category", "itemKey");
CREATE INDEX "AdminCustomerLaunchQaItem_category_idx" ON "AdminCustomerLaunchQaItem"("category");
CREATE INDEX "AdminCustomerLaunchQaItem_itemKey_idx" ON "AdminCustomerLaunchQaItem"("itemKey");
CREATE INDEX "AdminCustomerLaunchQaItem_status_idx" ON "AdminCustomerLaunchQaItem"("status");
CREATE INDEX "AdminCustomerLaunchQaItem_ownerRole_idx" ON "AdminCustomerLaunchQaItem"("ownerRole");
CREATE INDEX "AdminCustomerLaunchQaItem_reviewerRole_idx" ON "AdminCustomerLaunchQaItem"("reviewerRole");
CREATE INDEX "AdminCustomerLaunchQaItem_launchBlocking_idx" ON "AdminCustomerLaunchQaItem"("launchBlocking");
CREATE INDEX "AdminCustomerLaunchQaItem_blocker_idx" ON "AdminCustomerLaunchQaItem"("blocker");
CREATE INDEX "AdminCustomerLaunchQaItem_severity_idx" ON "AdminCustomerLaunchQaItem"("severity");
CREATE INDEX "AdminCustomerLaunchQaItem_viewport_idx" ON "AdminCustomerLaunchQaItem"("viewport");
CREATE INDEX "AdminCustomerLaunchQaItem_dueAt_idx" ON "AdminCustomerLaunchQaItem"("dueAt");
CREATE INDEX "AdminCustomerLaunchQaItem_reviewedAt_idx" ON "AdminCustomerLaunchQaItem"("reviewedAt");
CREATE INDEX "AdminCustomerLaunchQaItem_createdAt_idx" ON "AdminCustomerLaunchQaItem"("createdAt");

CREATE INDEX "AdminCustomerLaunchUatRun_environment_idx" ON "AdminCustomerLaunchUatRun"("environment");
CREATE INDEX "AdminCustomerLaunchUatRun_testerRole_idx" ON "AdminCustomerLaunchUatRun"("testerRole");
CREATE INDEX "AdminCustomerLaunchUatRun_status_idx" ON "AdminCustomerLaunchUatRun"("status");
CREATE INDEX "AdminCustomerLaunchUatRun_signoffStatus_idx" ON "AdminCustomerLaunchUatRun"("signoffStatus");
CREATE INDEX "AdminCustomerLaunchUatRun_blockerCount_idx" ON "AdminCustomerLaunchUatRun"("blockerCount");
CREATE INDEX "AdminCustomerLaunchUatRun_signedOffById_idx" ON "AdminCustomerLaunchUatRun"("signedOffById");
CREATE INDEX "AdminCustomerLaunchUatRun_signedOffByRole_idx" ON "AdminCustomerLaunchUatRun"("signedOffByRole");
CREATE INDEX "AdminCustomerLaunchUatRun_startedAt_idx" ON "AdminCustomerLaunchUatRun"("startedAt");
CREATE INDEX "AdminCustomerLaunchUatRun_completedAt_idx" ON "AdminCustomerLaunchUatRun"("completedAt");
CREATE INDEX "AdminCustomerLaunchUatRun_createdAt_idx" ON "AdminCustomerLaunchUatRun"("createdAt");

CREATE INDEX "AdminCustomerLaunchQaEvent_targetType_idx" ON "AdminCustomerLaunchQaEvent"("targetType");
CREATE INDEX "AdminCustomerLaunchQaEvent_targetId_idx" ON "AdminCustomerLaunchQaEvent"("targetId");
CREATE INDEX "AdminCustomerLaunchQaEvent_action_idx" ON "AdminCustomerLaunchQaEvent"("action");
CREATE INDEX "AdminCustomerLaunchQaEvent_status_idx" ON "AdminCustomerLaunchQaEvent"("status");
CREATE INDEX "AdminCustomerLaunchQaEvent_actorUserId_idx" ON "AdminCustomerLaunchQaEvent"("actorUserId");
CREATE INDEX "AdminCustomerLaunchQaEvent_actorRole_idx" ON "AdminCustomerLaunchQaEvent"("actorRole");
CREATE INDEX "AdminCustomerLaunchQaEvent_createdAt_idx" ON "AdminCustomerLaunchQaEvent"("createdAt");
