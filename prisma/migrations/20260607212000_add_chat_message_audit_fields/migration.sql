-- Store admin review flags for assistant answers in the conversation audit panel.
ALTER TABLE "ChatMessage"
ADD COLUMN "auditStatus" TEXT,
ADD COLUMN "auditNote" TEXT,
ADD COLUMN "auditedAt" TIMESTAMP(3);

CREATE INDEX "ChatMessage_auditStatus_idx" ON "ChatMessage"("auditStatus");
