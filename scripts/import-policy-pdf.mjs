import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import "./_load-env.mjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {
    file: null,
    insurer: null,
    title: null,
    version: null,
    effectiveFrom: null,
    effectiveTo: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--file" && next) {
      args.file = next;
      i += 1;
    } else if (token === "--insurer" && next) {
      args.insurer = next.toUpperCase();
      i += 1;
    } else if (token === "--title" && next) {
      args.title = next;
      i += 1;
    } else if (token === "--version" && next) {
      args.version = next;
      i += 1;
    } else if (token === "--effective-from" && next) {
      args.effectiveFrom = next;
      i += 1;
    } else if (token === "--effective-to" && next) {
      args.effectiveTo = next;
      i += 1;
    }
  }

  if (!args.file || !args.insurer || !args.title) {
    throw new Error(
      "Usage: node scripts/import-policy-pdf.mjs --file <path.pdf> --insurer <TAKAFUL|ETIQA|ALLIANZ> --title \"Policy Title\" [--version v1] [--effective-from YYYY-MM-DD] [--effective-to YYYY-MM-DD]"
    );
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

  const fullPath = path.resolve(process.cwd(), filePath);
  const dataBuffer = await fs.readFile(fullPath);
  const parser = new PDFParse({ data: dataBuffer });
  const parsed = await parser.getText();
  await parser.destroy();
  return {
    text: parsed.text || "",
    pages: Number(parsed.total || 0),
    sourceFileName: path.basename(fullPath),
    sourcePath: fullPath,
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

    if (current) {
      chunks.push(current);
    }

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

async function getInsurerOrFail(code) {
  const insurer = await prisma.insurer.findUnique({ where: { code } });
  if (!insurer) {
    throw new Error(
      `Insurer "${code}" not found. Import insurers first using scripts/import-insurer-facts.mjs`
    );
  }
  return insurer;
}

async function main() {
  const args = parseArgs(process.argv);
  const insurer = await getInsurerOrFail(args.insurer);
  const parsedPdf = await parsePdfText(args.file);
  const text = normalizeText(parsedPdf.text);
  const chunks = splitIntoChunks(text);

  const document = await prisma.policyDocument.create({
    data: {
      insurerId: insurer.id,
      title: args.title,
      sourceFileName: parsedPdf.sourceFileName,
      sourcePath: parsedPdf.sourcePath,
      versionLabel: args.version || null,
      effectiveFrom: args.effectiveFrom ? new Date(args.effectiveFrom) : null,
      effectiveTo: args.effectiveTo ? new Date(args.effectiveTo) : null,
      extractedText: text,
    },
  });

  if (chunks.length > 0) {
    await prisma.knowledgeChunk.createMany({
      data: chunks.map((chunkText, index) => ({
        insurerId: insurer.id,
        policyDocumentId: document.id,
        chunkOrder: index + 1,
        pageNumber: null,
        chunkText,
        tokenCount: Math.ceil(chunkText.length / 4),
      })),
    });
  }

  console.log(`Imported PDF: ${parsedPdf.sourceFileName}`);
  console.log(`Detected pages: ${parsedPdf.pages}`);
  console.log(`Created policy_document id: ${document.id}`);
  console.log(`Created chunks: ${chunks.length}`);
}

main()
  .catch((error) => {
    console.error("PDF import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
