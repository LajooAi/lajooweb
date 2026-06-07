const EXCERPT_BEFORE = 260;
const EXCERPT_AFTER = 520;

const BRAND_PROGRAMS = [
  { tag: 'perodua', label: 'Perodua' },
  { tag: 'proton', label: 'Proton' },
  { tag: 'honda', label: 'Honda' },
  { tag: 'subaru', label: 'Subaru' },
  { tag: 'jetour', label: 'Jetour' },
];

export const PDF_FACT_DETECTORS = [
  {
    id: 'roadside_towing',
    factType: 'TOWING',
    category: 'roadside',
    tags: ['roadside', 'towing', 'breakdown', 'claims'],
    confidence: 'medium',
    documentTypes: ['roadside_assistance', 'brochure', 'faq', 'policy_wording', 'product_disclosure_sheet'],
    patterns: [
      /road\s*assist(?:ance)?/i,
      /roadside/i,
      /\btow(?:ing|ed)?\b/i,
      /breakdown/i,
      /road\s*ranger/i,
      /auto\s*assist/i,
      /accident\s+assist/i,
    ],
    title: 'Private-car roadside assistance / towing wording found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car roadside assistance or towing wording in "${documentTitle}". Confirm exact limits, eligibility, and service conditions from the source before promising them.`,
    advisorUse: ({ insurerName }) =>
      `Use this as cautious support when a user asks about ${insurerName} towing or breakdown help. Do not invent distance limits, free towing promises, or 24-hour availability unless a more specific approved fact states it.`,
  },
  {
    id: 'claims_guidance',
    factType: 'CLAIMS',
    category: 'claims',
    tags: ['claims', 'accident', 'repairer', 'workshop'],
    confidence: 'medium',
    documentTypes: ['claims_guide', 'repairer_or_workshop', 'policy_wording', 'faq', 'brochure'],
    patterns: [
      /\bclaims?\b/i,
      /\baccident\b/i,
      /panel\s+workshop/i,
      /\brepairer/i,
      /\bworkshop\b/i,
      /windscreen\s+claim/i,
    ],
    title: 'Private-car claims / repair guidance found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car claims, accident, workshop, or repair guidance in "${documentTitle}". Use source wording for exact claim steps and document requirements.`,
    advisorUse: ({ insurerName }) =>
      `Use this when explaining ${insurerName} claim support in general terms. Keep exact claim procedures tied to the source document.`,
  },
  {
    id: 'betterment_waiver',
    factType: 'BETTERMENT',
    category: 'betterment',
    tags: ['betterment', 'waiver_betterment', 'older_car', 'surprise_cost'],
    confidence: 'medium',
    documentTypes: ['add_on_terms', 'brochure', 'policy_wording', 'product_disclosure_sheet'],
    patterns: [
      /waiver\s+of\s+betterment/i,
      /betterment\s+waiver/i,
      /compulsory\s+waiver/i,
      /waiver.*betterment/i,
      /betterment.*waiver/i,
    ],
    title: 'Betterment waiver wording found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car betterment waiver wording in "${documentTitle}". Treat this as condition-based or add-on-based unless the live quote confirms availability for the selected vehicle.`,
    advisorUse: ({ insurerName }) =>
      `Use this for older-car users who worry about surprise repair cost. Say ${insurerName} has betterment-waiver wording in the database, but confirm quote eligibility before presenting it as selected cover.`,
  },
  {
    id: 'betterment_general',
    factType: 'BETTERMENT',
    category: 'betterment',
    tags: ['betterment', 'older_car', 'surprise_cost'],
    confidence: 'medium',
    documentTypes: ['policy_wording', 'product_disclosure_sheet', 'faq'],
    patterns: [
      /\bbetterment\b/i,
      /replacement\s+parts?/i,
      /spare\s+parts?/i,
    ],
    title: 'Betterment wording found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car betterment wording in "${documentTitle}". Betterment may affect older-car repair cost unless a waiver/add-on or product term applies.`,
    advisorUse: ({ insurerName }) =>
      `Use this as a caution note for ${insurerName}. Do not call it zero betterment unless a waiver/zero-betterment fact is also available.`,
  },
  {
    id: 'windscreen_glass',
    factType: 'WINDSCREEN',
    category: 'windscreen',
    tags: ['windscreen', 'glass', 'ncd_safe', 'sum_insured'],
    confidence: 'medium',
    documentTypes: ['add_on_terms', 'brochure', 'policy_wording', 'product_disclosure_sheet', 'faq'],
    patterns: [
      /\bwindscreen\b/i,
      /\bwindshield\b/i,
      /\bwindow\s+glass\b/i,
      /\bglass\s+cover\b/i,
      /\btinted\s+film\b/i,
      /\bsunroof\b/i,
    ],
    title: 'Windscreen / glass cover wording found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car windscreen or glass cover wording in "${documentTitle}". Coverage amount and premium should follow the selected add-on/live quote.`,
    advisorUse: ({ insurerName }) =>
      `Use this when a user asks whether ${insurerName} has windscreen-related terms. Explain the concept, then confirm selected coverage amount before adding it.`,
  },
  {
    id: 'flood_special_perils',
    factType: 'FLOOD',
    category: 'flood',
    tags: ['flood', 'special_perils', 'natural_disaster', 'monsoon'],
    confidence: 'medium',
    documentTypes: ['add_on_terms', 'brochure', 'policy_wording', 'product_disclosure_sheet', 'faq', 'campaign_terms'],
    patterns: [
      /special\s+perils?/i,
      /\bflood\b/i,
      /natural\s+disaster/i,
      /\bstorm\b/i,
      /\blandslide\b/i,
      /\btyphoon\b/i,
      /\bhurricane\b/i,
      /convulsion\s+of\s+nature/i,
    ],
    title: 'Flood / special perils wording found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car flood, special perils, or natural disaster wording in "${documentTitle}". Treat it as optional/add-on-based unless the live quote or policy source confirms inclusion.`,
    advisorUse: ({ insurerName }) =>
      `Use this for Malaysian flood-risk advice involving ${insurerName}. Recommend checking/adding special perils where relevant, but do not say it is included by default unless specifically proven.`,
  },
  {
    id: 'e_hailing',
    factType: 'ELIGIBILITY',
    category: 'usage',
    tags: ['e_hailing', 'grab', 'private_hire', 'endorsement'],
    confidence: 'medium',
    documentTypes: ['add_on_terms', 'brochure', 'policy_wording', 'product_disclosure_sheet', 'faq'],
    patterns: [
      /e-?hailing/i,
      /\bgrab\b/i,
      /private\s+hire/i,
      /ride\s*sharing/i,
      /fare[-\s]*paying/i,
      /passenger\s+carrying/i,
    ],
    title: 'E-hailing / private-hire wording found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car e-hailing, private-hire, or usage-eligibility wording in "${documentTitle}". Confirm the endorsement/add-on before covering Grab or other e-hailing use.`,
    advisorUse: ({ insurerName }) =>
      `Use this when the user says they drive for Grab/e-hailing. Ask usage clearly before recommending ${insurerName} coverage.`,
  },
  {
    id: 'ncd_relief',
    factType: 'GENERAL',
    category: 'ncd',
    tags: ['ncd', 'ncd_relief', 'claim_impact'],
    confidence: 'medium',
    documentTypes: ['add_on_terms', 'brochure', 'policy_wording', 'product_disclosure_sheet', 'faq'],
    patterns: [
      /ncd\s+relief/i,
      /no\s+claim\s+discount/i,
      /\bncd\b/i,
    ],
    title: 'NCD-related wording found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car NCD-related wording in "${documentTitle}". Use exact source wording before saying whether a claim affects NCD.`,
    advisorUse: ({ insurerName }) =>
      `Use this for ${insurerName} NCD questions. Explain NCD generally, then verify exact NCD relief or claim-impact wording before confirming.`,
  },
  {
    id: 'low_mileage',
    factType: 'GENERAL',
    category: 'usage',
    tags: ['low_mileage', 'usage_based', 'budget', 'cashback', 'ez_mile'],
    confidence: 'medium',
    documentTypes: ['brochure', 'faq', 'product_disclosure_sheet', 'policy_wording'],
    patterns: [
      /ez\s*-?\s*mile/i,
      /low\s+mileage/i,
      /mileage/i,
      /drive\s+less/i,
      /cashback/i,
      /pay\s+as\s+you\s+drive/i,
    ],
    title: 'Low-mileage / usage-based wording found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car low-mileage, usage-based, cashback, or mileage-related wording in "${documentTitle}". Confirm current product availability before recommending it as active.`,
    advisorUse: ({ insurerName }) =>
      `Use this when the user is budget-focused or drives less. Present ${insurerName} low-mileage wording as something LAJOO can verify, not a guaranteed discount.`,
  },
  {
    id: 'ev_charger',
    factType: 'ELIGIBILITY',
    category: 'ev',
    tags: ['ev', 'charger', 'charging_cable', 'tesla'],
    confidence: 'medium',
    documentTypes: ['brochure', 'faq', 'product_disclosure_sheet', 'policy_wording', 'add_on_terms'],
    patterns: [
      /\bev\b/i,
      /electric\s+vehicle/i,
      /charger/i,
      /charging\s+cable/i,
      /wall\s*box/i,
      /\btesla\b/i,
      /out\s+of\s+charge/i,
    ],
    title: 'EV / charger wording found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car EV, charger, charging-cable, or Tesla-related wording in "${documentTitle}". Confirm exact EV benefits and eligibility before presenting them as selected cover.`,
    advisorUse: ({ insurerName }) =>
      `Use this when the user drives an EV/Tesla or asks about charger cover. Be precise and source-bound.`,
  },
  {
    id: 'key_care',
    factType: 'GENERAL',
    category: 'add_on',
    tags: ['key_care', 'key_replacement', 'addon'],
    confidence: 'medium',
    documentTypes: ['add_on_terms', 'brochure', 'policy_wording', 'product_disclosure_sheet'],
    patterns: [
      /key\s+care/i,
      /key\s+replacement/i,
      /lost\s+key/i,
      /replacement\s+key/i,
    ],
    title: 'Key care / key replacement wording found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car key care or key replacement wording in "${documentTitle}". Confirm add-on availability and limits before recommending it.`,
    advisorUse: ({ insurerName }) =>
      `Use this only if the user asks about lost keys or optional add-ons for ${insurerName}.`,
  },
  {
    id: 'all_drivers',
    factType: 'GENERAL',
    category: 'driver',
    tags: ['all_drivers', 'unnamed_driver', 'named_driver', 'addon'],
    confidence: 'medium',
    documentTypes: ['add_on_terms', 'brochure', 'policy_wording', 'product_disclosure_sheet'],
    patterns: [
      /all\s+drivers/i,
      /named\s+driver/i,
      /unnamed\s+driver/i,
      /authori[sz]ed\s+driver/i,
    ],
    title: 'Driver extension wording found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car named-driver, unnamed-driver, or all-driver wording in "${documentTitle}". Confirm driver conditions and excess before advising.`,
    advisorUse: ({ insurerName }) =>
      `Use this when the user shares the car with family or multiple drivers. Ask who drives the car before recommending driver extensions.`,
  },
  {
    id: 'return_to_invoice',
    factType: 'GENERAL',
    category: 'add_on',
    tags: ['return_to_invoice', 'invoice_value', 'gap_cover', 'addon'],
    confidence: 'medium',
    documentTypes: ['add_on_terms', 'brochure', 'policy_wording', 'product_disclosure_sheet'],
    patterns: [
      /return\s+to\s+invoice/i,
      /invoice\s+value/i,
      /\brti\b/i,
    ],
    title: 'Return-to-invoice wording found',
    statement: ({ insurerName, documentTitle }) =>
      `${insurerName} has imported private-car return-to-invoice or invoice-value wording in "${documentTitle}". Confirm current eligibility and limit before recommending it.`,
    advisorUse: ({ insurerName }) =>
      `Use this for newer or financed cars only after checking whether the user values invoice-value protection.`,
  },
];

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength = 620) {
  const clean = normalizeText(value);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1)}...`;
}

function findEvidence(text, patterns = []) {
  const source = String(text || '');
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match) continue;
    const index = match.index || 0;
    const start = Math.max(0, index - EXCERPT_BEFORE);
    const end = Math.min(source.length, index + EXCERPT_AFTER);
    return truncateText(source.slice(start, end));
  }
  return null;
}

function createContext(document) {
  const insurerName = document?.insurer?.name || 'The insurer';
  const documentTitle = document?.title || document?.sourceFileName || 'the source document';
  return { insurerName, documentTitle, document };
}

function isDetectorAllowedForDocument(detector, document) {
  if (document?.category !== 'private-car') return false;
  if (document?.useForPrivateCarMvp !== true) return false;
  if (!Array.isArray(detector.documentTypes) || detector.documentTypes.length === 0) return true;
  return detector.documentTypes.includes(document?.documentType);
}

function buildDetectorCandidate(detector, document, sourceExcerpt) {
  const context = createContext(document);
  return {
    detectorId: detector.id,
    insurerCode: document?.insurer?.code || null,
    insurerName: document?.insurer?.name || null,
    policyDocumentId: document?.id || null,
    sourceRelativePath: document?.sourceRelativePath || null,
    factType: detector.factType,
    title: detector.title,
    value: detector.statement(context),
    category: detector.category,
    tags: [...new Set(detector.tags || [])],
    advisorUse: detector.advisorUse(context),
    confidence: detector.confidence || 'medium',
    sourceExcerpt,
    status: 'VERIFIED',
  };
}

function buildBrandProgramCandidates(document) {
  if (document?.category !== 'private-car' || document?.useForPrivateCarMvp !== true) return [];

  const sourceText = `${document?.sourceRelativePath || ''} ${document?.title || ''} ${document?.extractedText || ''}`;
  const haystack = normalizeText(sourceText).toLowerCase();
  const candidates = [];
  for (const brand of BRAND_PROGRAMS) {
    if (!haystack.includes(brand.tag)) continue;

    const sourceExcerpt = findEvidence(sourceText, [new RegExp(`\\b${brand.tag}\\b`, 'i')]) ||
      truncateText(document?.extractedText || `${brand.label} appears in ${document?.sourceRelativePath || document?.title || 'source'}`);
    const context = createContext(document);
    candidates.push({
      detectorId: `brand_${brand.tag}`,
      insurerCode: document?.insurer?.code || null,
      insurerName: document?.insurer?.name || null,
      policyDocumentId: document?.id || null,
      sourceRelativePath: document?.sourceRelativePath || null,
      factType: 'ELIGIBILITY',
      title: `${brand.label} brand-program wording found`,
      value: `${context.insurerName} has imported private-car ${brand.label}-related programme or product wording in "${context.documentTitle}". Do not say it is automatically best for every ${brand.label} owner; use it only as brand-specific eligibility/support context.`,
      category: 'brand_program',
      tags: ['brand_program', brand.tag],
      advisorUse: `Use this when a user owns a ${brand.label} vehicle and asks whether ${context.insurerName} is suitable. Combine with live quote price, sum insured, and user needs.`,
      confidence: 'medium',
      sourceExcerpt,
      status: 'VERIFIED',
    });
  }
  return candidates;
}

function candidateKey(candidate) {
  return [
    candidate.insurerCode,
    candidate.factType,
    candidate.title,
    candidate.value,
    candidate.sourceRelativePath,
  ].join('|');
}

export function buildVerifiedFactCandidatesForDocument(document) {
  const text = String(document?.extractedText || '');
  if (!text.trim()) return [];

  const candidates = [];
  for (const detector of PDF_FACT_DETECTORS) {
    if (!isDetectorAllowedForDocument(detector, document)) continue;
    const sourceExcerpt = findEvidence(text, detector.patterns);
    if (!sourceExcerpt) continue;
    candidates.push(buildDetectorCandidate(detector, document, sourceExcerpt));
  }
  candidates.push(...buildBrandProgramCandidates(document));

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = candidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default buildVerifiedFactCandidatesForDocument;
