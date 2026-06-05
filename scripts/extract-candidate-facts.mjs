import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_MANIFEST = "knowledge/manifest.json";
const DEFAULT_JSON_OUT = "knowledge/candidate-facts.private-car.json";
const DEFAULT_MD_OUT = "knowledge/candidate-facts.private-car.md";

const DETECTORS = [
  {
    factType: "TOWING",
    title: "Roadside assistance / towing terms found",
    keywords: [/road\s*assist/i, /roadside/i, /towing/i, /tow\s*truck/i, /emergency\s+assistance/i, /breakdown/i],
    value: (insurer) => `${insurer} private-car material contains roadside assistance, towing, or emergency assistance terms. Review the source excerpt before approving exact limits.`,
  },
  {
    factType: "CLAIMS",
    title: "Claims guidance found",
    keywords: [/claim/i, /claims/i, /accident/i, /repairer/i, /panel\s+workshop/i, /workshop/i],
    value: (insurer) => `${insurer} private-car material contains claims, accident, repairer, or workshop guidance. Review the source excerpt before approving service details.`,
  },
  {
    factType: "BETTERMENT",
    title: "Betterment / betterment waiver terms found",
    keywords: [/betterment/i, /waiver\s+of\s+betterment/i, /compulsory\s+waiver/i],
    value: (insurer) => `${insurer} private-car material contains betterment or betterment-waiver terms. Review the source excerpt before approving availability and conditions.`,
  },
  {
    factType: "WINDSCREEN",
    title: "Windscreen / glass cover terms found",
    keywords: [/windscreen/i, /windshield/i, /window\s+glass/i, /glass\s+cover/i],
    value: (insurer) => `${insurer} private-car material contains windscreen or glass cover terms. Review the source excerpt before approving pricing, limits, or claim treatment.`,
  },
  {
    factType: "FLOOD",
    title: "Flood / special perils terms found",
    keywords: [/special\s+perils/i, /\bflood\b/i, /natural\s+disaster/i, /landslide/i, /storm/i, /typhoon/i, /hurricane/i],
    value: (insurer) => `${insurer} private-car material contains flood, special perils, or natural disaster terms. Review the source excerpt before approving inclusion or add-on status.`,
  },
  {
    factType: "ELIGIBILITY",
    title: "E-hailing / usage eligibility terms found",
    keywords: [/e-?hailing/i, /\bgrab\b/i, /ride\s*sharing/i, /private\s+hire/i, /commercial\s+use/i],
    value: (insurer) => `${insurer} private-car material contains e-hailing, ride-sharing, or vehicle usage terms. Review the source excerpt before approving eligibility guidance.`,
  },
  {
    factType: "GENERAL",
    title: "NCD relief / NCD-related add-on terms found",
    keywords: [/ncd\s+relief/i, /no\s+claim\s+discount/i, /\bncd\b/i],
    value: (insurer) => `${insurer} private-car material contains NCD-related terms. Review the source excerpt before approving any NCD relief or claim impact statement.`,
  },
  {
    factType: "GENERAL",
    title: "Key care / key replacement terms found",
    keywords: [/key\s+care/i, /key\s+replacement/i, /lost\s+key/i],
    value: (insurer) => `${insurer} private-car material contains key care or key replacement terms. Review the source excerpt before approving coverage details.`,
  },
  {
    factType: "GENERAL",
    title: "Personal accident terms found",
    keywords: [/personal\s+accident/i, /\bpa\b/i, /death\s+or\s+disablement/i],
    value: (insurer) => `${insurer} private-car material contains personal accident terms. Review the source excerpt before approving benefit details.`,
  },
  {
    factType: "GENERAL",
    title: "All drivers / driver extension terms found",
    keywords: [/all\s+drivers/i, /named\s+driver/i, /authorized\s+driver/i, /authorised\s+driver/i],
    value: (insurer) => `${insurer} private-car material contains driver extension or all-driver terms. Review the source excerpt before approving conditions.`,
  },
  {
    factType: "GENERAL",
    title: "Return to invoice / gap-style terms found",
    keywords: [/return\s+to\s+invoice/i, /invoice\s+value/i, /\brti\b/i],
    value: (insurer) => `${insurer} private-car material contains return-to-invoice style terms. Review the source excerpt before approving details.`,
  },
];

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    out: DEFAULT_JSON_OUT,
    mdOut: DEFAULT_MD_OUT,
    product: "private-car",
    mvpOnly: true,
    limit: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--manifest" && next) {
      args.manifest = next;
      i += 1;
    } else if (token === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (token === "--md-out" && next) {
      args.mdOut = next;
      i += 1;
    } else if (token === "--product" && next) {
      args.product = next;
      i += 1;
    } else if (token === "--all-private-car") {
      args.mvpOnly = false;
    } else if (token === "--limit" && next) {
      args.limit = Number(next);
      i += 1;
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

function cleanText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function oneLine(text) {
  return cleanText(text).replace(/\s+/g, " ").trim();
}

function findEvidence(text, keywords) {
  for (const keyword of keywords) {
    const match = keyword.exec(text);
    if (!match) continue;
    const index = match.index || 0;
    const start = Math.max(0, index - 220);
    const end = Math.min(text.length, index + 520);
    return oneLine(text.slice(start, end));
  }
  return null;
}

function isUsefulSourceFile(file) {
  if (file.productType !== "private-car") return false;
  if (file.documentType === "third_party_terms") return false;
  if (/third-party/i.test(file.relativePath)) return false;
  return true;
}

function buildCandidateFact({ detector, file, evidence }) {
  return {
    id: `${file.id}-${detector.factType}-${detector.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    insurerSlug: file.insurerSlug,
    insurerCode: file.insurerCode,
    insurerName: file.insurerName,
    productType: file.productType,
    coverageFamily: file.coverageFamily,
    documentType: file.documentType,
    language: file.languages.length === 1 ? file.languages[0] : (file.languages.length > 1 ? file.languages.join("+") : "unknown"),
    factType: detector.factType,
    title: detector.title,
    value: detector.value(file.insurerName),
    status: "CANDIDATE_REVIEW_REQUIRED",
    recommendedApproval: "review",
    sourceFileName: path.basename(file.relativePath),
    sourceRelativePath: file.relativePath,
    sourcePage: null,
    sourceExcerpt: evidence,
    validFrom: null,
    validTo: null,
    reviewNotes: "Generated from PDF keyword evidence. Founder/admin must approve before AI uses it as insurer fact.",
  };
}

async function extractFactsForFile(file) {
  const parsed = await parsePdfText(file.absolutePath);
  const text = cleanText(parsed.text);
  const facts = [];
  const seenTitles = new Set();

  for (const detector of DETECTORS) {
    const evidence = findEvidence(text, detector.keywords);
    if (!evidence) continue;

    const key = `${detector.factType}:${detector.title}`;
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    facts.push(buildCandidateFact({ detector, file, evidence }));
  }

  return {
    file: file.relativePath,
    pages: parsed.pages,
    chars: text.length,
    facts,
  };
}

function buildMarkdownReport(payload) {
  const lines = [
    "# LAJOO Candidate Insurer Facts",
    "",
    `Generated: ${payload.generatedAt}`,
    `Scope: ${payload.scope.productType}${payload.scope.mvpOnly ? " / private-car MVP only" : ""}`,
    "",
    "These are **not approved facts yet**. Review, edit, and approve before importing into the live AI knowledge database.",
    "",
    "| # | Insurer | Fact Type | Candidate Fact | Source | Approve? |",
    "|---:|---|---|---|---|---|",
  ];

  payload.facts.forEach((fact, index) => {
    const value = fact.value.replace(/\|/g, "\\|");
    const source = fact.sourceRelativePath.replace(/\|/g, "\\|");
    lines.push(`| ${index + 1} | ${fact.insurerName} | ${fact.factType} | ${value} | \`${source}\` |  |`);
  });

  lines.push("");
  lines.push("## Review Notes");
  lines.push("");
  lines.push("- Approve only facts that are useful for private-car renewal advice.");
  lines.push("- If the fact is true but wording is too broad, edit it before approval.");
  lines.push("- Do not approve exact limits unless the source excerpt clearly states the limit.");
  lines.push("- Motorcycle, commercial, and campaign documents are intentionally excluded from this first pass.");

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.resolve(process.cwd(), args.manifest);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  let files = manifest.files.filter((file) => file.productType === args.product);

  if (args.product === "private-car") {
    files = files.filter(isUsefulSourceFile);
  }
  if (args.mvpOnly) {
    files = files.filter((file) => file.useForPrivateCarMvp);
  }
  if (Number.isFinite(args.limit) && args.limit > 0) {
    files = files.slice(0, args.limit);
  }

  const facts = [];
  const errors = [];
  const processedFiles = [];

  for (const file of files) {
    try {
      const result = await extractFactsForFile(file);
      processedFiles.push({
        relativePath: result.file,
        pages: result.pages,
        chars: result.chars,
        candidateFacts: result.facts.length,
      });
      facts.push(...result.facts);
      console.log(`Scanned: ${result.file} | pages=${result.pages} | facts=${result.facts.length}`);
    } catch (error) {
      errors.push({ relativePath: file.relativePath, error: error.message });
      console.error(`Failed: ${file.relativePath}`);
      console.error(`  ${error.message}`);
    }
  }

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceManifest: path.relative(process.cwd(), manifestPath),
    scope: {
      productType: args.product,
      mvpOnly: args.mvpOnly,
      approvalStatus: "candidate_review_required",
    },
    summary: {
      filesScanned: processedFiles.length,
      candidateFacts: facts.length,
      errors: errors.length,
      byInsurer: facts.reduce((acc, fact) => {
        acc[fact.insurerSlug] = (acc[fact.insurerSlug] || 0) + 1;
        return acc;
      }, {}),
      byFactType: facts.reduce((acc, fact) => {
        acc[fact.factType] = (acc[fact.factType] || 0) + 1;
        return acc;
      }, {}),
    },
    processedFiles,
    errors,
    facts,
  };

  const outPath = path.resolve(process.cwd(), args.out);
  const mdOutPath = path.resolve(process.cwd(), args.mdOut);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(mdOutPath, buildMarkdownReport(payload));

  console.log("---");
  console.log(`Candidate facts JSON written: ${outPath}`);
  console.log(`Candidate facts review written: ${mdOutPath}`);
  console.log(`Files scanned: ${payload.summary.filesScanned}`);
  console.log(`Candidate facts: ${payload.summary.candidateFacts}`);
  console.log(`Errors: ${payload.summary.errors}`);
}

main().catch((error) => {
  console.error("Candidate fact extraction failed:", error);
  process.exitCode = 1;
});
