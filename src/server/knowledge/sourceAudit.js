export const FACT_VALIDITY_STATUS = {
  ACTIVE: 'active',
  UNDATED: 'undated',
  EXPIRED: 'expired',
  NOT_YET_EFFECTIVE: 'not_yet_effective',
};

export const FACT_REVIEW_PRIORITY = {
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
};

export const HIGH_IMPACT_REVIEW_TOPICS = [
  {
    id: 'betterment',
    label: 'Betterment / waiver',
    terms: ['betterment', 'waiver_betterment', 'zero_betterment', 'betterment waiver', 'a201'],
  },
  {
    id: 'windscreen',
    label: 'Windscreen / glass',
    terms: ['windscreen', 'glass', 'window coverage'],
  },
  {
    id: 'flood_special_perils',
    label: 'Flood / special perils',
    terms: ['flood', 'special_perils', 'special perils', 'natural disaster', 'storm', 'landslide'],
  },
  {
    id: 'towing_roadside',
    label: 'Towing / roadside assistance',
    terms: ['towing', 'tow', 'roadside', 'roadside assistance', 'breakdown assistance', 'rsa'],
  },
  {
    id: 'ev_tesla',
    label: 'EV / Tesla benefits',
    terms: ['ev', 'electric vehicle', 'tesla', 'hybrid', 'charging', 'battery'],
  },
  {
    id: 'brand_program',
    label: 'Brand programmes',
    terms: ['brand_program', 'brand programme', 'brand program', 'careline', 'subaru', 'honda', 'toyota', 'bmw', 'mercedes', 'proton', 'perodua'],
  },
];

const STRICT_DATED_FACT_VALUES = new Set(['1', 'true', 'yes', 'strict', 'production']);

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function containsReviewTerm(haystack, term) {
  const cleanTerm = normalizeText(term);
  if (!cleanTerm) return false;
  const paddedHaystack = ` ${haystack} `;
  return paddedHaystack.includes(` ${cleanTerm} `);
}

function hasDate(value) {
  return Boolean(toDate(value));
}

export function shouldRequireDatedFactsForAi(options = {}) {
  if (typeof options.requireDatedFacts === 'boolean') return options.requireDatedFacts;
  return STRICT_DATED_FACT_VALUES.has(String(process.env.LAJOO_AI_REQUIRE_DATED_FACTS || '').toLowerCase().trim());
}

export function startOfUtcDay(value = new Date()) {
  const date = toDate(value) || new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getFactValidityStatus(fact = {}, now = new Date()) {
  const today = startOfUtcDay(now);
  const validFrom = toDate(fact.validFrom);
  const validTo = toDate(fact.validTo);

  if (validFrom && startOfUtcDay(validFrom) > today) {
    return FACT_VALIDITY_STATUS.NOT_YET_EFFECTIVE;
  }

  if (validTo && startOfUtcDay(validTo) < today) {
    return FACT_VALIDITY_STATUS.EXPIRED;
  }

  if (!validFrom && !validTo) {
    return FACT_VALIDITY_STATUS.UNDATED;
  }

  return FACT_VALIDITY_STATUS.ACTIVE;
}

export function isFactDated(fact = {}) {
  return hasDate(fact.validFrom) || hasDate(fact.validTo);
}

export function isGenericGeneratedBrandProgramFact(fact = {}) {
  return fact.category === 'brand_program' &&
    /\bimported private-car\b/i.test(fact.value || fact.statement || '') &&
    /\bprogramme or product wording\b/i.test(fact.value || fact.statement || '');
}

export function getHighImpactReviewTopic(fact = {}) {
  const haystack = normalizeText([
    fact.factType,
    fact.category,
    fact.title,
    fact.value,
    fact.advisorUse,
    fact.sourceRelativePath,
    fact.policyDocument?.title,
    fact.policyDocument?.sourceRelativePath,
    ...(Array.isArray(fact.tags) ? fact.tags : []),
  ].join(' '));

  return HIGH_IMPACT_REVIEW_TOPICS.find((topic) => topic.terms.some((term) => {
    return containsReviewTerm(haystack, term);
  })) || null;
}

export function getFactReviewPriority(fact = {}, now = new Date()) {
  const topic = getHighImpactReviewTopic(fact);
  const validityStatus = getFactValidityStatus(fact, now);
  const reasons = [];

  if (!topic) {
    return {
      level: FACT_REVIEW_PRIORITY.NORMAL,
      topic: null,
      label: 'Normal',
      reasons,
    };
  }

  reasons.push(`${topic.label} is a high-impact customer advice topic.`);

  if (isGenericGeneratedBrandProgramFact(fact)) {
    reasons.push('Generic auto-generated brand-program wording must be manually verified before AI use.');
  }
  if (validityStatus === FACT_VALIDITY_STATUS.UNDATED) {
    reasons.push('Missing effective/expiry dates for a high-impact fact.');
  }
  if (validityStatus === FACT_VALIDITY_STATUS.EXPIRED) {
    reasons.push('Expired high-impact fact; archive or update before relying on it.');
  }
  if (validityStatus === FACT_VALIDITY_STATUS.NOT_YET_EFFECTIVE) {
    reasons.push('Future-dated high-impact fact; not usable until effective date.');
  }
  if (!fact.sourceRelativePath && !fact.policyDocument?.sourceRelativePath) {
    reasons.push('Missing source PDF path for a high-impact fact.');
  }
  if (!Number.isInteger(fact.sourcePage) || fact.sourcePage <= 0) {
    reasons.push('Missing source page number for a high-impact fact.');
  }

  const critical = validityStatus === FACT_VALIDITY_STATUS.EXPIRED ||
    validityStatus === FACT_VALIDITY_STATUS.NOT_YET_EFFECTIVE;
  const high = validityStatus === FACT_VALIDITY_STATUS.UNDATED || reasons.length > 1;

  return {
    level: critical ? FACT_REVIEW_PRIORITY.CRITICAL : high ? FACT_REVIEW_PRIORITY.HIGH : FACT_REVIEW_PRIORITY.NORMAL,
    topic: topic.id,
    label: topic.label,
    reasons,
  };
}

export function isFactUsableForAi(fact = {}, now = new Date(), options = {}) {
  if (fact.status !== 'VERIFIED') return false;
  if (isGenericGeneratedBrandProgramFact(fact)) return false;
  const validityStatus = getFactValidityStatus(fact, now);
  if (validityStatus === FACT_VALIDITY_STATUS.ACTIVE) return true;
  if (validityStatus === FACT_VALIDITY_STATUS.UNDATED) {
    return !shouldRequireDatedFactsForAi(options);
  }
  return false;
}

export function buildUsableFactDateWhere(now = new Date(), options = {}) {
  const today = startOfUtcDay(now);
  const clauses = [
    {
      OR: [
        { validFrom: null },
        { validFrom: { lte: today } },
      ],
    },
    {
      OR: [
        { validTo: null },
        { validTo: { gte: today } },
      ],
    },
  ];

  if (shouldRequireDatedFactsForAi(options)) {
    clauses.push({ OR: [{ validFrom: { not: null } }, { validTo: { not: null } }] });
  }

  return clauses;
}

export function buildFactSourceLabel(fact = {}) {
  const relativePath = fact.sourceRelativePath || fact.policyDocument?.sourceRelativePath || '';
  const documentTitle = fact.policyDocument?.title || '';
  const page = Number.isInteger(fact.sourcePage) && fact.sourcePage > 0
    ? `p. ${fact.sourcePage}`
    : 'page not captured';

  if (relativePath) return `${relativePath} (${page})`;
  if (documentTitle) return `${documentTitle} (${page})`;
  return `No source file (${page})`;
}

export function buildFactReviewReasons(fact = {}, now = new Date()) {
  const reasons = [];
  const validityStatus = getFactValidityStatus(fact, now);

  if (validityStatus === FACT_VALIDITY_STATUS.UNDATED) {
    reasons.push('Missing effective/expiry dates.');
  }
  if (validityStatus === FACT_VALIDITY_STATUS.EXPIRED) {
    reasons.push('Expired fact; archive or update before AI use.');
  }
  if (validityStatus === FACT_VALIDITY_STATUS.NOT_YET_EFFECTIVE) {
    reasons.push('Future-dated fact; not usable until effective date.');
  }
  if (isGenericGeneratedBrandProgramFact(fact)) {
    reasons.push('Generic auto-generated brand-program fact needs admin verification.');
  }
  if (!fact.sourceRelativePath && !fact.policyDocument?.sourceRelativePath) {
    reasons.push('Missing source PDF path.');
  }
  if (!fact.sourceExcerpt) {
    reasons.push('Missing source excerpt.');
  }
  if (!Number.isInteger(fact.sourcePage) || fact.sourcePage <= 0) {
    reasons.push('Missing source page number.');
  }

  return reasons;
}

export function buildFactAuditFields(fact = {}, now = new Date()) {
  const validityStatus = getFactValidityStatus(fact, now);
  const reviewReasons = buildFactReviewReasons(fact, now);
  const reviewPriority = getFactReviewPriority(fact, now);

  return {
    sourceLabel: buildFactSourceLabel(fact),
    validityStatus,
    usableForAi: isFactUsableForAi(fact, now),
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    reviewPriority: reviewPriority.level,
    reviewTopic: reviewPriority.topic,
    reviewTopicLabel: reviewPriority.label,
    reviewPriorityReasons: reviewPriority.reasons,
  };
}

export default buildFactAuditFields;
