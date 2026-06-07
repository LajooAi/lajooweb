import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  classifyKnowledgePdf,
  summarizeKnowledgePdfMetadata,
} from "../src/server/knowledge/pdfMetadata.js";

const DEFAULT_ROOT = "knowledge/raw-pdfs";
const DEFAULT_OUT = "knowledge/manifest.json";

function parseArgs(argv) {
  const args = {
    root: DEFAULT_ROOT,
    out: DEFAULT_OUT,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--root" && next) {
      args.root = next;
      i += 1;
    } else if (token === "--out" && next) {
      args.out = next;
      i += 1;
    }
  }

  return args;
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function sha256File(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function buildManifest(args) {
  const root = path.resolve(process.cwd(), args.root);
  const out = path.resolve(process.cwd(), args.out);
  const pdfs = (await walkFiles(root)).sort();
  const files = [];

  for (const filePath of pdfs) {
    const stats = await fs.stat(filePath);
    const hash = await sha256File(filePath);
    const classified = classifyKnowledgePdf(root, filePath);
    files.push({
      id: hash.slice(0, 16),
      ...classified,
      absolutePath: filePath,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      sha256: hash,
      extractionStatus: "not_extracted",
      approvalStatus: "raw",
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root,
    summary: summarizeKnowledgePdfMetadata(files),
    files,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const manifest = await buildManifest(args);
  const out = path.resolve(process.cwd(), args.out);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Knowledge manifest written: ${out}`);
  console.log(`PDFs indexed: ${manifest.summary.totalPdfs}`);
  console.log(`Private-car MVP PDFs: ${manifest.summary.privateCarMvpPdfs}`);
  console.log("By insurer:");
  for (const [insurer, count] of Object.entries(manifest.summary.byInsurer).sort()) {
    console.log(`- ${insurer}: ${count}`);
  }
}

main().catch((error) => {
  console.error("Knowledge manifest build failed:", error);
  process.exitCode = 1;
});
