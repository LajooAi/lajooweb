-- CreateEnum
CREATE TYPE "InsurerType" AS ENUM ('TAKAFUL', 'CONVENTIONAL');

-- CreateEnum
CREATE TYPE "FactType" AS ENUM ('TOWING', 'CLAIMS', 'BETTERMENT', 'WINDSCREEN', 'FLOOD', 'ROADTAX', 'ELIGIBILITY', 'CONTACT', 'GENERAL');

-- CreateEnum
CREATE TYPE "FactStatus" AS ENUM ('DRAFT', 'VERIFIED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'EXPIRED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Insurer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InsurerType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insurer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourcePath" TEXT,
    "versionLabel" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "extractedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "policyDocumentId" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "chunkOrder" INTEGER NOT NULL,
    "chunkText" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurerFact" (
    "id" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "policyDocumentId" TEXT,
    "factType" "FactType" NOT NULL,
    "title" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "status" "FactStatus" NOT NULL DEFAULT 'DRAFT',
    "sourcePage" INTEGER,
    "sourceExcerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurerFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurerPromotion" (
    "id" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "policyDocumentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'UPCOMING',
    "sourcePage" INTEGER,
    "sourceExcerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurerPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Insurer_code_key" ON "Insurer"("code");

-- CreateIndex
CREATE INDEX "PolicyDocument_insurerId_idx" ON "PolicyDocument"("insurerId");

-- CreateIndex
CREATE INDEX "PolicyDocument_effectiveFrom_effectiveTo_idx" ON "PolicyDocument"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_insurerId_policyDocumentId_idx" ON "KnowledgeChunk"("insurerId", "policyDocumentId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_policyDocumentId_chunkOrder_idx" ON "KnowledgeChunk"("policyDocumentId", "chunkOrder");

-- CreateIndex
CREATE INDEX "InsurerFact_insurerId_factType_idx" ON "InsurerFact"("insurerId", "factType");

-- CreateIndex
CREATE INDEX "InsurerFact_validFrom_validTo_idx" ON "InsurerFact"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "InsurerPromotion_insurerId_validFrom_validTo_idx" ON "InsurerPromotion"("insurerId", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "InsurerPromotion_status_idx" ON "InsurerPromotion"("status");

-- AddForeignKey
ALTER TABLE "PolicyDocument" ADD CONSTRAINT "PolicyDocument_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_policyDocumentId_fkey" FOREIGN KEY ("policyDocumentId") REFERENCES "PolicyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurerFact" ADD CONSTRAINT "InsurerFact_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurerFact" ADD CONSTRAINT "InsurerFact_policyDocumentId_fkey" FOREIGN KEY ("policyDocumentId") REFERENCES "PolicyDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurerPromotion" ADD CONSTRAINT "InsurerPromotion_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurerPromotion" ADD CONSTRAINT "InsurerPromotion_policyDocumentId_fkey" FOREIGN KEY ("policyDocumentId") REFERENCES "PolicyDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
