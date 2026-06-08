-- Enable semantic search over imported policy PDF chunks.
-- Prisma does not natively manage pgvector columns, so the vector column and
-- ANN index are created with raw SQL while schema.prisma tracks the field as
-- Unsupported("vector").

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "KnowledgeChunk"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536),
  ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT,
  ADD COLUMN IF NOT EXISTS "embeddingUpdatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embeddingModel_idx"
  ON "KnowledgeChunk"("embeddingModel");

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embedding_hnsw_idx"
    ON "KnowledgeChunk"
    USING hnsw ("embedding" vector_cosine_ops);
EXCEPTION
  WHEN undefined_object OR feature_not_supported THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embedding_ivfflat_idx"
        ON "KnowledgeChunk"
        USING ivfflat ("embedding" vector_cosine_ops)
        WITH (lists = 100);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'KnowledgeChunk vector ANN index was not created: %', SQLERRM;
    END;
  WHEN OTHERS THEN
    RAISE NOTICE 'KnowledgeChunk vector HNSW index was not created: %', SQLERRM;
END $$;
