-- AlterTable
ALTER TABLE "PolicyDocument"
ADD COLUMN "sourceRelativePath" TEXT,
ADD COLUMN "checksum" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "documentType" TEXT,
ADD COLUMN "language" TEXT,
ADD COLUMN "coverageFamily" TEXT,
ADD COLUMN "useForPrivateCarMvp" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PolicyDocument_insurerId_category_idx" ON "PolicyDocument"("insurerId", "category");

-- CreateIndex
CREATE INDEX "PolicyDocument_insurerId_documentType_idx" ON "PolicyDocument"("insurerId", "documentType");

-- CreateIndex
CREATE INDEX "PolicyDocument_language_idx" ON "PolicyDocument"("language");

-- CreateIndex
CREATE INDEX "PolicyDocument_useForPrivateCarMvp_idx" ON "PolicyDocument"("useForPrivateCarMvp");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocument_insurerId_sourceRelativePath_key" ON "PolicyDocument"("insurerId", "sourceRelativePath");
