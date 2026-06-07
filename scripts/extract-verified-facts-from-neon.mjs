import process from "node:process";
import "./_load-env.mjs";
import { PrismaClient } from "@prisma/client";
import {
  buildVerifiedFactCandidatesForDocument,
} from "../src/server/knowledge/factExtraction.js";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: null,
    status: "VERIFIED",
    replaceGenerated: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--replace-generated") {
      args.replaceGenerated = true;
    } else if (token === "--status" && next) {
      args.status = String(next || "").toUpperCase();
      i += 1;
    } else if (token === "--limit" && next) {
      args.limit = Number(next);
      i += 1;
    }
  }

  if (!["DRAFT", "VERIFIED"].includes(args.status)) {
    throw new Error("--status must be DRAFT or VERIFIED");
  }

  return args;
}

function buildAdvisorUse(candidate) {
  return `${candidate.advisorUse}\nGenerated from imported PDF evidence. Keep final user answers source-bound and confirm exact limits before payment.`;
}

async function loadPrivateCarDocuments(args) {
  const take = Number.isFinite(args.limit) && args.limit > 0 ? args.limit : undefined;
  return prisma.policyDocument.findMany({
    where: {
      category: "private-car",
      useForPrivateCarMvp: true,
      extractedText: { not: null },
    },
    include: {
      insurer: { select: { id: true, code: true, name: true, type: true } },
      chunks: {
        select: {
          pageNumber: true,
          chunkOrder: true,
          chunkText: true,
        },
        orderBy: [
          { pageNumber: "asc" },
          { chunkOrder: "asc" },
        ],
      },
    },
    orderBy: [
      { insurer: { code: "asc" } },
      { sourceRelativePath: "asc" },
    ],
    take,
  });
}

async function deleteGeneratedFacts() {
  const generated = await prisma.insurerFact.findMany({
    where: {
      advisorUse: {
        contains: "Generated from imported PDF evidence.",
      },
    },
    select: { id: true },
  });

  if (generated.length === 0) return 0;
  await prisma.insurerFact.deleteMany({
    where: { id: { in: generated.map((row) => row.id) } },
  });
  return generated.length;
}

async function upsertCandidate(candidate, status) {
  const existing = await prisma.insurerFact.findFirst({
    where: {
      insurerId: candidate.insurerId,
      factType: candidate.factType,
      title: candidate.title,
      sourceRelativePath: candidate.sourceRelativePath,
      value: candidate.value,
    },
    select: { id: true },
  });

  const data = {
    insurerId: candidate.insurerId,
    policyDocumentId: candidate.policyDocumentId,
    factType: candidate.factType,
    title: candidate.title,
    value: candidate.value,
    category: candidate.category,
    tags: candidate.tags,
    advisorUse: buildAdvisorUse(candidate),
    confidence: candidate.confidence,
    status,
    sourceExcerpt: candidate.sourceExcerpt,
    sourcePage: candidate.sourcePage,
    sourceRelativePath: candidate.sourceRelativePath,
    validFrom: candidate.validFrom,
    validTo: candidate.validTo,
  };

  if (existing) {
    await prisma.insurerFact.update({
      where: { id: existing.id },
      data,
    });
    return "updated";
  }

  await prisma.insurerFact.create({ data });
  return "inserted";
}

function summarizeCandidates(candidates) {
  return {
    byInsurer: candidates.reduce((acc, item) => {
      acc[item.insurerCode] = (acc[item.insurerCode] || 0) + 1;
      return acc;
    }, {}),
    byFactType: candidates.reduce((acc, item) => {
      acc[item.factType] = (acc[item.factType] || 0) + 1;
      return acc;
    }, {}),
    byCategory: candidates.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {}),
  };
}

function printObjectCounts(label, object) {
  console.log(label);
  for (const [key, value] of Object.entries(object).sort()) {
    console.log(`- ${key}: ${value}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const deleted = args.replaceGenerated && !args.dryRun ? await deleteGeneratedFacts() : 0;
  const documents = await loadPrivateCarDocuments(args);
  const candidates = [];

  for (const document of documents) {
    const documentCandidates = buildVerifiedFactCandidatesForDocument(document)
      .map((candidate) => ({
        ...candidate,
        insurerId: document.insurerId,
        insurerCode: document.insurer?.code,
        insurerName: document.insurer?.name,
      }));
    candidates.push(...documentCandidates);
    console.log(`Scanned: ${document.sourceRelativePath} | facts=${documentCandidates.length}`);
  }

  const summary = summarizeCandidates(candidates);
  console.log("---");
  console.log(`Documents scanned: ${documents.length}`);
  console.log(`Candidate facts: ${candidates.length}`);
  if (args.replaceGenerated) console.log(`Deleted previous generated facts: ${deleted}`);
  printObjectCounts("By insurer:", summary.byInsurer);
  printObjectCounts("By fact type:", summary.byFactType);
  printObjectCounts("By category:", summary.byCategory);

  if (args.dryRun) {
    console.log("---");
    console.log("Dry-run only. No facts inserted.");
    return;
  }

  let inserted = 0;
  let updated = 0;

  for (const candidate of candidates) {
    const result = await upsertCandidate(candidate, args.status);
    if (result === "inserted") inserted += 1;
    if (result === "updated") updated += 1;
  }

  console.log("---");
  console.log(`Facts inserted: ${inserted}`);
  console.log(`Facts updated: ${updated}`);
  console.log(`Fact status: ${args.status}`);
}

main()
  .catch((error) => {
    console.error("Verified fact extraction failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
