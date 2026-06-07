import path from "node:path";

export const KNOWN_INSURERS = {
  allianz: { code: "ALLIANZ", name: "Allianz Insurance", type: "CONVENTIONAL" },
  etiqa: { code: "ETIQA", name: "Etiqa Insurance", type: "CONVENTIONAL" },
  generali: { code: "GENERALI", name: "Generali Insurance", type: "CONVENTIONAL" },
  lonpac: { code: "LONPAC", name: "Lonpac", type: "CONVENTIONAL" },
  msig: { code: "MSIG", name: "MSIG", type: "CONVENTIONAL" },
  "takaful-ikhlas": { code: "TAKAFUL", name: "Takaful Ikhlas", type: "TAKAFUL" },
  "tokio-marine": { code: "TOKIO", name: "Tokio Marine", type: "CONVENTIONAL" },
};

export const KNOWN_PDF_CATEGORIES = new Set([
  "private-car",
  "motorcycle",
  "commercial",
  "campaigns",
  "claims",
  "others",
  "unclear",
]);

export function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

export function normalizeKnowledgeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function inferPdfLanguages(fileName) {
  const name = normalizeKnowledgeName(fileName);
  const languages = new Set();

  if (/(^|[-.])en($|[-.])/.test(name) || /english|eng/.test(name)) languages.add("en");
  if (/(^|[-.])bm($|[-.])/.test(name) || /bahasa|malay|melayu/.test(name)) languages.add("bm");
  if (/(^|[-.])cn($|[-.])/.test(name) || /chinese|mandarin/.test(name)) languages.add("cn");

  return [...languages];
}

export function inferPdfDocumentType(fileName, category = "unclear") {
  const name = normalizeKnowledgeName(fileName);

  if (/pds|product-disclosure/.test(name)) return "product_disclosure_sheet";
  if (/certificate/.test(name)) return "certificate_wording";
  if (/policy-wording|pw($|-|\.)|wording/.test(name)) return "policy_wording";
  if (/road-assist|roadside|road-assistant|road-ranger|towing/.test(name)) return "roadside_assistance";
  if (/claim|claims/.test(name)) return "claims_guide";
  if (/add-on|addon|optional|special-peril|perils|betterment|windscreen|ncd-relief|key|all-driver|e-hailing|ehailing|return-to-invoice/.test(name)) return "add_on_terms";
  if (/brochure|flyer|leaflet|guide|benefit|additional-coverage|truck-warrior|bravo|protector|lady|motor-plus|supreme-takaful|ez-mile|ezmile/.test(name)) return "brochure";
  if (/faq/.test(name)) return "faq";
  if (/campaign|special-offer|tnc|terms/.test(name) || category === "campaigns") return "campaign_terms";
  if (/panel-workshop|workshop|repairer|code-of-conduct/.test(name)) return "repairer_or_workshop";
  if (/third-party/.test(name)) return "third_party_terms";
  return "unknown";
}

export function inferPdfCoverageFamily(fileName) {
  const name = normalizeKnowledgeName(fileName);

  if (/third-party-ft|third-party-fire|third-party.*theft/.test(name)) return "third_party_fire_theft";
  if (/third-party/.test(name)) return "third_party";
  if (/comprehensive-plus|plus/.test(name)) return "comprehensive_plus";
  if (/comprehensive|enhanced|autopro|ezsecure|multi-drive|lady|protector/.test(name)) return "comprehensive";
  return "unspecified";
}

export function inferPrivateCarMvpScope({ category, documentType, coverageFamily, fileName }) {
  if (category !== "private-car") return false;
  if (["third_party", "third_party_fire_theft"].includes(coverageFamily)) return false;

  const name = normalizeKnowledgeName(fileName);
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

export function buildPdfTitle(fileName) {
  return path.basename(fileName, path.extname(fileName))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyKnowledgePdf(root, filePath) {
  const relativePath = toPosixPath(path.relative(root, filePath));
  const parts = relativePath.split("/");
  const insurerSlug = parts[0];
  const insurer = KNOWN_INSURERS[insurerSlug] || null;
  const categoryFolder = parts.length > 2 ? parts[1] : "unclear";
  const category = KNOWN_PDF_CATEGORIES.has(categoryFolder) ? categoryFolder : "unclear";
  const fileName = path.basename(filePath);
  const documentType = inferPdfDocumentType(fileName, category);
  const coverageFamily = inferPdfCoverageFamily(fileName);
  const languages = inferPdfLanguages(fileName);

  return {
    relativePath,
    insurerSlug,
    insurerCode: insurer?.code || insurerSlug.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
    insurerName: insurer?.name || insurerSlug,
    insurerType: insurer?.type || "CONVENTIONAL",
    knownInsurer: Boolean(insurer),
    category,
    productType: category,
    documentType,
    coverageFamily,
    languages,
    language: languages.length === 1 ? languages[0] : (languages.length > 1 ? languages.join("+") : "unknown"),
    title: buildPdfTitle(fileName),
    useForPrivateCarMvp: inferPrivateCarMvpScope({ category, documentType, coverageFamily, fileName }),
  };
}

export function summarizeKnowledgePdfMetadata(files) {
  const summary = {
    totalPdfs: files.length,
    privateCarMvpPdfs: 0,
    byInsurer: {},
    byProductType: {},
    byCategory: {},
    byDocumentType: {},
    byLanguage: {},
  };

  for (const file of files) {
    summary.byInsurer[file.insurerSlug] = (summary.byInsurer[file.insurerSlug] || 0) + 1;
    summary.byProductType[file.productType] = (summary.byProductType[file.productType] || 0) + 1;
    summary.byCategory[file.category] = (summary.byCategory[file.category] || 0) + 1;
    summary.byDocumentType[file.documentType] = (summary.byDocumentType[file.documentType] || 0) + 1;
    summary.byLanguage[file.language] = (summary.byLanguage[file.language] || 0) + 1;
    if (file.useForPrivateCarMvp) summary.privateCarMvpPdfs += 1;
  }

  return summary;
}
