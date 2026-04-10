import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import "./_load-env.mjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const INSURER_MAP = {
  allianz: { code: "ALLIANZ", name: "Allianz Insurance", type: "CONVENTIONAL" },
  etiqa: { code: "ETIQA", name: "Etiqa Insurance", type: "CONVENTIONAL" },
  takaful: { code: "TAKAFUL", name: "Takaful Ikhlas", type: "TAKAFUL" },
};

function parseArgs(argv) {
  const args = {
    root: "data/policies",
    limit: null,
    dryRun: false,
    skipExisting: true,
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
    } else if (token === "--no-skip-existing") {
      args.skipExisting = false;
    }
  }

  return args;
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
  const parsed = await parser.getText();
  await parser.destroy();
  return {
    text: parsed.text || "",
    pages: Number(parsed.total || 0),
  };
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
      start = Math.max(end - overlap, end);
    }
    current = "";
  }

  if (current) chunks.push(current);
  return chunks;
}

function titleFromFilename(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

async function ensureInsurer(folderName) {
  const mapped = INSURER_MAP[folderName.toLowerCase()];
  if (!mapped) {
    throw new Error(`Unknown insurer folder "${folderName}". Expected one of: ${Object.keys(INSURER_MAP).join(", ")}`);
  }

  return prisma.insurer.upsert({
    where: { code: mapped.code },
    update: { name: mapped.name, type: mapped.type, isActive: true },
    create: { code: mapped.code, name: mapped.name, type: mapped.type },
  });
}

async function importOne(filePath, args) {
  const insurerFolder = path.basename(path.dirname(filePath));
  const insurer = await ensureInsurer(insurerFolder);
  const sourcePath = path.resolve(filePath);

  if (args.skipExisting) {
    const existing = await prisma.policyDocument.findFirst({
      where: { insurerId: insurer.id, sourcePath },
      select: { id: true },
    });
    if (existing) {
      return { status: "skipped", reason: "already-imported", filePath };
    }
  }

  if (args.dryRun) {
    return { status: "dry-run", filePath, insurer: insurer.code };
  }

  const parsed = await parsePdfText(sourcePath);
  const text = normalizeText(parsed.text);
  const chunks = splitIntoChunks(text);

  const doc = await prisma.policyDocument.create({
    data: {
      insurerId: insurer.id,
      title: titleFromFilename(filePath),
      sourceFileName: path.basename(filePath),
      sourcePath,
      versionLabel: null,
      extractedText: text,
    },
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
    insurer: insurer.code,
    pages: parsed.pages,
    chunks: chunks.length,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(process.cwd(), args.root);

  const files = (await walkPdfFiles(root)).sort();
  const selected = Number.isFinite(args.limit) && args.limit > 0 ? files.slice(0, args.limit) : files;

  if (selected.length === 0) {
    console.log(`No PDF files found under: ${root}`);
    return;
  }

  console.log(`Found ${files.length} PDF(s), processing ${selected.length}.`);
  console.log(`Mode: ${args.dryRun ? "dry-run" : "import"} | skipExisting=${args.skipExisting}`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of selected) {
    try {
      const result = await importOne(filePath, args);
      if (result.status === "imported") {
        imported += 1;
        console.log(`Imported: ${result.filePath} | insurer=${result.insurer} | pages=${result.pages} | chunks=${result.chunks}`);
      } else if (result.status === "skipped") {
        skipped += 1;
        console.log(`Skipped: ${result.filePath} (${result.reason})`);
      } else {
        console.log(`Dry-run: ${result.filePath} | insurer=${result.insurer}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`Failed: ${filePath}`);
      console.error(`  ${error.message}`);
    }
  }

  console.log("---");
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main()
  .catch((error) => {
    console.error("Batch import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
