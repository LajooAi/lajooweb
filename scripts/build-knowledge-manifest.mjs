import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_ROOT = "knowledge/raw-pdfs";
const DEFAULT_OUT = "knowledge/manifest.json";

const INSURERS = {
  allianz: { code: "ALLIANZ", name: "Allianz Insurance" },
  etiqa: { code: "ETIQA", name: "Etiqa Insurance" },
  generali: { code: "GENERALI", name: "Generali Insurance" },
  lonpac: { code: "LONPAC", name: "Lonpac Insurance" },
  msig: { code: "MSIG", name: "MSIG Insurance" },
  "takaful-ikhlas": { code: "TAKAFUL", name: "Takaful Ikhlas" },
  "tokio-marine": { code: "TOKIO", name: "Tokio Marine Insurance" },
};

const KNOWN_PRODUCT_FOLDERS = new Set([
  "private-car",
  "motorcycle",
  "commercial",
  "campaigns",
  "claims",
  "others",
  "unclear",
]);

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

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .trim();
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

function inferLanguages(fileName) {
  const name = normalizeName(fileName);
  const languages = new Set();

  if (/(^|-)en($|-|\.)/.test(name) || /english|eng/.test(name)) languages.add("en");
  if (/(^|-)bm($|-|\.)/.test(name) || /bahasa|malay|melayu/.test(name)) languages.add("bm");
  if (/(^|-)cn($|-|\.)/.test(name) || /chinese|mandarin/.test(name)) languages.add("cn");

  return [...languages];
}

function inferDocumentType(fileName, productType) {
  const name = normalizeName(fileName);

  if (/pds|product-disclosure/.test(name)) return "product_disclosure_sheet";
  if (/certificate/.test(name)) return "certificate_wording";
  if (/policy-wording|pw($|-|\.)|wording/.test(name)) return "policy_wording";
  if (/road-assist|roadside|road-assistant|road-ranger|towing/.test(name)) return "roadside_assistance";
  if (/claim|claims/.test(name)) return "claims_guide";
  if (/add-on|addon|optional|special-peril|betterment|windscreen|ncd-relief|key|all-driver|e-hailing|ehailing|return-to-invoice/.test(name)) return "add_on_terms";
  if (/brochure|flyer|leaflet/.test(name)) return "brochure";
  if (/faq/.test(name)) return "faq";
  if (/campaign|special-offer|tnc|terms/.test(name) || productType === "campaigns") return "campaign_terms";
  if (/panel-workshop|workshop|repairer|code-of-conduct/.test(name)) return "repairer_or_workshop";
  if (/third-party/.test(name)) return "third_party_terms";
  return "unknown";
}

function inferCoverageFamily(fileName) {
  const name = normalizeName(fileName);
  if (/third-party-ft|third-party-fire|third-party.*theft/.test(name)) return "third_party_fire_theft";
  if (/third-party/.test(name)) return "third_party";
  if (/comprehensive-plus|plus/.test(name)) return "comprehensive_plus";
  if (/comprehensive|enhanced|autopro|ezsecure|multi-drive|lady|protector/.test(name)) return "comprehensive";
  return "unspecified";
}

function inferMvpScope({ productType, documentType, coverageFamily, fileName }) {
  if (productType !== "private-car") return false;
  if (["third_party", "third_party_fire_theft"].includes(coverageFamily)) return false;

  const name = normalizeName(fileName);
  if (/third-party/.test(name)) return false;

  return [
    "product_disclosure_sheet",
    "policy_wording",
    "certificate_wording",
    "roadside_assistance",
    "claims_guide",
    "add_on_terms",
    "brochure",
    "faq",
  ].includes(documentType);
}

function buildTitleFromFile(fileName) {
  return path.basename(fileName, path.extname(fileName))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyFile(root, filePath) {
  const relativePath = toPosixPath(path.relative(root, filePath));
  const parts = relativePath.split("/");
  const insurerSlug = parts[0];
  const insurer = INSURERS[insurerSlug] || {
    code: insurerSlug.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
    name: insurerSlug,
  };

  const productFolder = parts.length > 2 ? parts[1] : "unclear";
  const productType = KNOWN_PRODUCT_FOLDERS.has(productFolder) ? productFolder : "unclear";
  const fileName = path.basename(filePath);
  const documentType = inferDocumentType(fileName, productType);
  const coverageFamily = inferCoverageFamily(fileName);

  return {
    relativePath,
    insurerSlug,
    insurerCode: insurer.code,
    insurerName: insurer.name,
    productType,
    documentType,
    coverageFamily,
    languages: inferLanguages(fileName),
    title: buildTitleFromFile(fileName),
    useForPrivateCarMvp: inferMvpScope({ productType, documentType, coverageFamily, fileName }),
  };
}

function summarize(files) {
  const byInsurer = {};
  const byProductType = {};
  const byDocumentType = {};
  let privateCarMvp = 0;

  for (const file of files) {
    byInsurer[file.insurerSlug] = (byInsurer[file.insurerSlug] || 0) + 1;
    byProductType[file.productType] = (byProductType[file.productType] || 0) + 1;
    byDocumentType[file.documentType] = (byDocumentType[file.documentType] || 0) + 1;
    if (file.useForPrivateCarMvp) privateCarMvp += 1;
  }

  return {
    totalPdfs: files.length,
    privateCarMvpPdfs: privateCarMvp,
    byInsurer,
    byProductType,
    byDocumentType,
  };
}

async function buildManifest(args) {
  const root = path.resolve(process.cwd(), args.root);
  const out = path.resolve(process.cwd(), args.out);
  const pdfs = (await walkFiles(root)).sort();
  const files = [];

  for (const filePath of pdfs) {
    const stats = await fs.stat(filePath);
    const hash = await sha256File(filePath);
    const classified = classifyFile(root, filePath);
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
    summary: summarize(files),
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
