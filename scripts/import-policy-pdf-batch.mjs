import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import "./_load-env.mjs";
import { PrismaClient } from "@prisma/client";
import {
  classifyKnowledgePdf,
  summarizeKnowledgePdfMetadata,
} from "../src/server/knowledge/pdfMetadata.js";

const prisma = new PrismaClient();
const DEFAULT_ROOT = "knowledge/raw-pdfs";

function parseArgs(argv) {
  const args = {
    root: DEFAULT_ROOT,
    limit: null,
    dryRun: false,
    skipExisting: true,
    replaceExisting: false,
    mvpOnly: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--root" && next) {
      args.root = next;
      i += 1;
    } else if (token === "--limit" && next) {
      args.limit = Number(next);
      i += 1;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--mvp-only") {
      args.mvpOnly = true;
    } else if (token === "--no-skip-existing") {
      args.skipExisting = false;
    } else if (token === "--replace-existing") {
      args.replaceExisting = true;
      args.skipExisting = false;
    }
  }

  return args;
}

async function sha256File(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function parsePdfText(filePath) {
  let PDFParse;
  try {
    const mod = await import("pdf-parse");
    PDFParse = mod.PDFParse;
  } catch {
    throw new Error('Missing dependency "pdf-parse". Run: npm install pdf-parse');
  }
  if (typeof PDFParse !== "function") {
    throw new Error('Unsupported "pdf-parse" version. Expected export: PDFParse');
  }

  const dataBuffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: dataBuffer });
  try {
    const parsed = await parser.getText();
    return {
      text: parsed.text || "",
      pages: Number(parsed.total || 0),
    };
  } finally {
    await parser.destroy();
  }
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function splitIntoChunks(text, maxChars = 1400, overlap = 180) {
  const clean = normalizeText(text);
  if (!clean) return [];

  const parts = clean.split(/\n\n+/);
  const chunks = [];
  let current = "";

  for (const part of parts) {
    const candidate = current ? `${current}\n\n${part}` : part;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);

    if (part.length <= maxChars) {
      current = part;
      continue;
    }

    let start = 0;
    while (start < part.length) {
      const end = Math.min(start + maxChars, part.length);
      chunks.push(part.slice(start, end));
      if (end >= part.length) break;
      start = Math.max(end - overlap, start + 1);
    }
    current = "";
  }

  if (current) chunks.push(current);
  return chunks;
}

async function walkPdfFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkPdfFiles(full)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
      files.push(full);
    }
  }

  return files;
}

async function ensureInsurer(metadata) {
  if (!metadata.knownInsurer) {
    throw new Error(`Unknown insurer folder "${metadata.insurerSlug}" for ${metadata.relativePath}`);
  }

  return prisma.insurer.upsert({
    where: { code: metadata.insurerCode },
    update: {
      name: metadata.insurerName,
      type: metadata.insurerType,
      isActive: true,
    },
    create: {
      code: metadata.insurerCode,
      name: metadata.insurerName,
      type: metadata.insurerType,
    },
  });
}

async function findExistingDocument(insurerId, metadata, sourcePath) {
  return prisma.policyDocument.findFirst({
    where: {
      insurerId,
      OR: [
        { sourceRelativePath: metadata.relativePath },
        { sourcePath },
      ],
    },
    select: {
      id: true,
      checksum: true,
      sourceRelativePath: true,
      sourcePath: true,
    },
  });
}

function buildDocumentData({ insurerId, metadata, sourcePath, checksum, text }) {
  return {
    insurerId,
    title: metadata.title,
    sourceFileName: path.basename(sourcePath),
    sourcePath,
    sourceRelativePath: metadata.relativePath,
    checksum,
    category: metadata.category,
    documentType: metadata.documentType,
    language: metadata.language,
    coverageFamily: metadata.coverageFamily,
    useForPrivateCarMvp: metadata.useForPrivateCarMvp,
    versionLabel: null,
    extractedText: text,
  };
}

async function importOne(entry, args) {
  const { filePath, metadata } = entry;
  const sourcePath = path.resolve(filePath);
  const checksum = await sha256File(sourcePath);

  if (args.dryRun) {
    const stats = await fs.stat(sourcePath);
    return {
      status: "dry-run",
      filePath,
      checksum,
      sizeBytes: stats.size,
      metadata,
    };
  }

  const insurer = await ensureInsurer(metadata);
  const existing = await findExistingDocument(insurer.id, metadata, sourcePath);
  if (existing && args.skipExisting) {
    return {
      status: "skipped",
      reason: existing.checksum === checksum ? "already-imported" : "already-imported-different-checksum",
      filePath,
      checksum,
      metadata,
    };
  }
  if (existing && args.replaceExisting) {
    await prisma.policyDocument.delete({ where: { id: existing.id } });
  }

  const parsed = await parsePdfText(sourcePath);
  const text = normalizeText(parsed.text);
  const chunks = splitIntoChunks(text);
  const doc = await prisma.policyDocument.create({
    data: buildDocumentData({
      insurerId: insurer.id,
      metadata,
      sourcePath,
      checksum,
      text,
    }),
  });

  if (chunks.length > 0) {
    await prisma.knowledgeChunk.createMany({
      data: chunks.map((chunkText, index) => ({
        insurerId: insurer.id,
        policyDocumentId: doc.id,
        pageNumber: null,
        chunkOrder: index + 1,
        chunkText,
        tokenCount: Math.ceil(chunkText.length / 4),
      })),
    });
  }

  return {
    status: "imported",
    filePath,
    checksum,
    metadata,
    pages: parsed.pages,
    chunks: chunks.length,
    chars: text.length,
  };
}

function printMetadataSummary(entries) {
  const summary = summarizeKnowledgePdfMetadata(entries.map((entry) => entry.metadata));
  console.log(`PDFs selected: ${summary.totalPdfs}`);
  console.log(`Private-car MVP PDFs: ${summary.privateCarMvpPdfs}`);
  console.log("By insurer:");
  for (const [insurer, count] of Object.entries(summary.byInsurer).sort()) {
    console.log(`- ${insurer}: ${count}`);
  }
  console.log("By category:");
  for (const [category, count] of Object.entries(summary.byCategory).sort()) {
    console.log(`- ${category}: ${count}`);
  }
  console.log("By document type:");
  for (const [documentType, count] of Object.entries(summary.byDocumentType).sort()) {
    console.log(`- ${documentType}: ${count}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(process.cwd(), args.root);
  const files = (await walkPdfFiles(root)).sort();
  let entries = files.map((filePath) => ({
    filePath,
    metadata: classifyKnowledgePdf(root, filePath),
  }));

  if (args.mvpOnly) {
    entries = entries.filter((entry) => entry.metadata.useForPrivateCarMvp);
  }
  if (Number.isFinite(args.limit) && args.limit > 0) {
    entries = entries.slice(0, args.limit);
  }

  if (entries.length === 0) {
    console.log(`No PDF files selected under: ${root}`);
    return;
  }

  const unknownEntries = entries.filter((entry) => !entry.metadata.knownInsurer);
  if (unknownEntries.length > 0) {
    console.error(`Unknown insurer folder(s) found: ${unknownEntries.length}`);
    for (const entry of unknownEntries.slice(0, 20)) {
      console.error(`- ${entry.metadata.relativePath}`);
    }
    throw new Error("Fix unknown insurer folders before importing knowledge PDFs.");
  }

  console.log(`Found ${files.length} PDF(s), processing ${entries.length}.`);
  console.log(`Root: ${root}`);
  console.log(`Mode: ${args.dryRun ? "dry-run" : "import"} | skipExisting=${args.skipExisting} | replaceExisting=${args.replaceExisting} | mvpOnly=${args.mvpOnly}`);
  printMetadataSummary(entries);
  console.log("---");

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let dryRun = 0;
  let emptyText = 0;

  for (const entry of entries) {
    try {
      const result = await importOne(entry, args);
      if (result.status === "imported") {
        imported += 1;
        if (result.chars === 0) emptyText += 1;
        console.log(
          `Imported: ${result.metadata.relativePath} | insurer=${result.metadata.insurerCode} | category=${result.metadata.category} | type=${result.metadata.documentType} | lang=${result.metadata.language} | pages=${result.pages} | chunks=${result.chunks}`
        );
      } else if (result.status === "skipped") {
        skipped += 1;
        console.log(`Skipped: ${result.metadata.relativePath} (${result.reason})`);
      } else {
        dryRun += 1;
        console.log(
          `Dry-run: ${result.metadata.relativePath} | insurer=${result.metadata.insurerCode} | category=${result.metadata.category} | type=${result.metadata.documentType} | lang=${result.metadata.language} | mvp=${result.metadata.useForPrivateCarMvp}`
        );
      }
    } catch (error) {
      failed += 1;
      console.error(`Failed: ${entry.metadata.relativePath}`);
      console.error(`  ${error.message}`);
    }
  }

  console.log("---");
  console.log(`Dry-run: ${dryRun}`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Imported PDFs with empty extracted text: ${emptyText}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Batch import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
