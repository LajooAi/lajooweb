-- AlterTable
ALTER TABLE "InsurerFact"
ADD COLUMN "category" TEXT,
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "advisorUse" TEXT,
ADD COLUMN "confidence" TEXT,
ADD COLUMN "sourceRelativePath" TEXT;

-- CreateIndex
CREATE INDEX "InsurerFact_status_idx" ON "InsurerFact"("status");

-- CreateIndex
CREATE INDEX "InsurerFact_category_idx" ON "InsurerFact"("category");

-- CreateIndex
CREATE INDEX "InsurerFact_sourceRelativePath_idx" ON "InsurerFact"("sourceRelativePath");
