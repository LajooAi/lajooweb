-- Store per-assistant-turn insurer knowledge source traces for auditability.
ALTER TABLE "ChatMessage"
ADD COLUMN "knowledgeTrace" JSONB;
