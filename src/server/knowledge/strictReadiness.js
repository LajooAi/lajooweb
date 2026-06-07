import { getVerifiedDatabaseFacts } from '../insurance/databaseFactStore.js';

export const STRICT_READINESS_QUESTIONS = [
  {
    id: 'betterment',
    label: 'Betterment / zero betterment',
    question: 'Which insurers have zero betterment or betterment waiver for older cars?',
    tags: ['betterment', 'waiver_betterment', 'zero_betterment', 'older_car'],
    category: 'betterment',
    matchTerms: ['betterment', 'waiver of betterment', 'betterment waiver', 'zero betterment'],
    minDatedFacts: 3,
  },
  {
    id: 'towing_roadside',
    label: 'Towing / roadside assistance',
    question: 'Which insurers include towing or roadside assistance?',
    tags: ['towing', 'roadside', 'roadside_assistance'],
    category: 'towing_roadside',
    matchTerms: ['towing', 'tow', 'roadside assistance', 'breakdown assistance', 'rsa'],
    minDatedFacts: 3,
  },
  {
    id: 'windscreen',
    label: 'Windscreen / glass cover',
    question: 'Which insurers have windscreen cover and what should the user know before adding it?',
    tags: ['windscreen', 'glass'],
    category: 'windscreen',
    matchTerms: ['windscreen', 'glass cover', 'glass coverage', 'window glass'],
    minDatedFacts: 3,
  },
  {
    id: 'flood_special_perils',
    label: 'Flood / special perils',
    question: 'Do users need flood or special perils cover, and which insurers support it?',
    tags: ['flood', 'special_perils', 'natural_disaster'],
    category: 'flood_special_perils',
    matchTerms: ['flood', 'special perils', 'natural disaster', 'storm', 'landslide'],
    minDatedFacts: 3,
  },
  {
    id: 'ev_tesla',
    label: 'EV / Tesla benefits',
    question: 'Which insurers have EV or Tesla benefits, eligibility, or support?',
    tags: ['ev', 'electric_vehicle', 'tesla', 'battery', 'charging'],
    category: 'ev_tesla',
    matchTerms: ['ev', 'electric vehicle', 'tesla', 'charger', 'charging', 'battery'],
    minDatedFacts: 1,
  },
  {
    id: 'brand_program',
    label: 'Brand programmes',
    question: 'Which insurers have brand programmes for Perodua, Proton, Honda, Toyota, Subaru, BMW, Mercedes, or Tesla?',
    tags: ['brand_program', 'perodua', 'proton', 'honda', 'toyota', 'subaru', 'bmw', 'mercedes', 'tesla'],
    category: 'brand_program',
    requireCategoryMatch: true,
    requiredForStrictMode: false,
    matchTerms: ['brand programme', 'brand program', 'perodua', 'proton', 'honda', 'toyota', 'subaru', 'bmw', 'mercedes', 'tesla', 'careline'],
    minDatedFacts: 1,
  },
];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeId(value) {
  return String(value || '').trim();
}

function formatDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesTerm(haystack, term) {
  const cleanTerm = normalizeSearchText(term);
  if (!cleanTerm) return false;
  if (cleanTerm.length <= 3) {
    return new RegExp(`(^|\\s)${cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(haystack);
  }
  return haystack.includes(cleanTerm);
}

function compactFact(fact = {}) {
  return {
    id: normalizeId(fact.id),
    insurerName: fact.insurerName || 'Insurer',
    title: fact.title || null,
    category: fact.category || null,
    statement: fact.statement || null,
    sourceLabel: fact.sourceLabel || fact.sourceRelativePath || null,
    sourcePage: fact.sourcePage || null,
    validityStatus: fact.validityStatus || null,
    validFrom: formatDate(fact.validFrom),
    validTo: formatDate(fact.validTo),
  };
}

function factMatchesReadinessQuestion(fact = {}, question = {}) {
  if (question.requireCategoryMatch && question.category && fact.category !== question.category) {
    return false;
  }

  const haystack = normalizeSearchText([
    fact.category,
    fact.factType,
    fact.title,
    fact.statement,
    fact.advisorUse,
    ...toArray(fact.tags),
  ].join(' '));
  const matchTerms = toArray(question.matchTerms);
  if (matchTerms.length > 0) {
    return matchTerms.some((term) => includesTerm(haystack, term));
  }
  return Boolean(question.category && fact.category === question.category);
}

function dedupeFacts(facts = []) {
  const seen = new Set();
  return toArray(facts).filter((fact) => {
    const key = normalizeId(fact.id) || [
      fact.insurerName,
      fact.category,
      fact.title,
      fact.statement,
      fact.sourceLabel || fact.sourceRelativePath,
      fact.sourcePage,
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadFactsForReadinessQuestion({
  question,
  getFacts,
  perQuestionLimit,
  requireDatedFacts,
}) {
  const baseQuery = {
    tags: question.tags,
    message: question.question,
    limit: perQuestionLimit,
    requireDatedFacts,
  };
  const categoryFacts = question.category
    ? await getFacts({ ...baseQuery, category: question.category })
    : [];
  const broadFacts = await getFacts(baseQuery);
  return dedupeFacts([...toArray(categoryFacts), ...toArray(broadFacts)])
    .filter((fact) => factMatchesReadinessQuestion(fact, question));
}

function getStrictReadinessStatus({ looseCount, strictCount, minDatedFacts }) {
  if (strictCount >= minDatedFacts) return 'ready';
  if (strictCount > 0) return 'partial';
  if (looseCount > 0) return 'blocked';
  return 'missing';
}

function buildNextAction({ status, looseCount, strictCount, minDatedFacts, label }) {
  if (status === 'ready') {
    return `${label} has enough dated facts for strict AI use.`;
  }

  if (status === 'partial') {
    return `Date ${minDatedFacts - strictCount} more verified ${label} fact(s) before strict production use.`;
  }

  if (status === 'blocked') {
    return `Review and date at least ${minDatedFacts} of the ${looseCount} existing ${label} fact(s).`;
  }

  return `Add verified, source-backed ${label} facts before strict AI use.`;
}

function getFactReportLabel(fact = {}) {
  return fact.statement || fact.title || 'Verified fact';
}

export async function summarizeStrictFactReadiness({
  questions = STRICT_READINESS_QUESTIONS,
  getFacts = getVerifiedDatabaseFacts,
  perQuestionLimit = 20,
  sampleLimit = 3,
} = {}) {
  const items = [];

  for (const question of questions) {
    const looseFactsFromDb = await loadFactsForReadinessQuestion({
      question,
      getFacts,
      perQuestionLimit,
      requireDatedFacts: false,
    });
    const strictFacts = await loadFactsForReadinessQuestion({
      question,
      getFacts,
      perQuestionLimit,
      requireDatedFacts: true,
    });
    const looseFacts = dedupeFacts([...looseFactsFromDb, ...strictFacts]);
    const strictIds = new Set(strictFacts.map((fact) => normalizeId(fact.id)));
    const looseOnlyFacts = looseFacts.filter((fact) => !strictIds.has(normalizeId(fact.id)));
    const minDatedFacts = Math.max(Number(question.minDatedFacts || 1), 1);
    const status = getStrictReadinessStatus({
      looseCount: looseFacts.length,
      strictCount: strictFacts.length,
      minDatedFacts,
    });

    items.push({
      id: question.id,
      label: question.label,
      question: question.question,
      category: question.category,
      tags: question.tags,
      requiredForStrictMode: question.requiredForStrictMode !== false,
      minDatedFacts,
      looseCount: looseFacts.length,
      strictCount: strictFacts.length,
      looseOnlyCount: looseOnlyFacts.length,
      datedCoverageRatio: looseFacts.length === 0 ? 0 : strictFacts.length / looseFacts.length,
      status,
      nextAction: buildNextAction({
        status,
        looseCount: looseFacts.length,
        strictCount: strictFacts.length,
        minDatedFacts,
        label: question.label,
      }),
      datedSamples: strictFacts.slice(0, sampleLimit).map(compactFact),
      needsDatingSamples: looseOnlyFacts.slice(0, sampleLimit).map(compactFact),
    });
  }

  const summary = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {
    ready: 0,
    partial: 0,
    blocked: 0,
    missing: 0,
  });

  return {
    generatedAt: new Date().toISOString(),
    strictModeReady: items
      .filter((item) => item.requiredForStrictMode !== false)
      .every((item) => item.status === 'ready'),
    summary,
    requiredQuestions: items.filter((item) => item.requiredForStrictMode !== false).length,
    optionalQuestions: items.filter((item) => item.requiredForStrictMode === false).length,
    totalQuestions: items.length,
    items,
  };
}

export function formatStrictReadinessReport(report = {}) {
  const lines = [
    'LAJOO strict dated-facts readiness',
    `Generated: ${report.generatedAt || new Date().toISOString()}`,
    `Overall: ${report.strictModeReady ? 'READY' : 'NOT READY'} for required production topics`,
    `Questions: ${report.totalQuestions || 0} | ready=${report.summary?.ready || 0}, partial=${report.summary?.partial || 0}, blocked=${report.summary?.blocked || 0}, missing=${report.summary?.missing || 0}`,
    `Required topics: ${report.requiredQuestions ?? 0} | Optional topics: ${report.optionalQuestions ?? 0}`,
    '',
  ];

  for (const item of toArray(report.items)) {
    const ratio = `${Math.round(Number(item.datedCoverageRatio || 0) * 100)}%`;
    const optionalLabel = item.requiredForStrictMode === false ? ' | OPTIONAL' : '';
    lines.push(`[${String(item.status || '').toUpperCase()}${optionalLabel}] ${item.label}`);
    lines.push(`Question: ${item.question}`);
    lines.push(`Dated facts: ${item.strictCount}/${item.looseCount} available (${ratio}); minimum needed: ${item.minDatedFacts}`);
    lines.push(`Next action: ${item.nextAction}`);

    if (item.datedSamples?.length > 0) {
      lines.push('Dated samples:');
      for (const fact of item.datedSamples) {
        lines.push(`- ${fact.insurerName}: ${getFactReportLabel(fact)} | ${fact.sourceLabel || 'No source label'} | ${fact.validFrom || 'no start'} to ${fact.validTo || 'no expiry'}`);
      }
    }

    if (item.needsDatingSamples?.length > 0) {
      lines.push('Needs dating samples:');
      for (const fact of item.needsDatingSamples) {
        lines.push(`- ${fact.insurerName}: ${getFactReportLabel(fact)} | ${fact.sourceLabel || 'No source label'}`);
      }
    }

    lines.push('');
  }

  if (!report.strictModeReady) {
    lines.push('Do not enable LAJOO_AI_REQUIRE_DATED_FACTS=true for production until all high-risk topics are READY.');
  } else {
    lines.push('Safe next step: enable LAJOO_AI_REQUIRE_DATED_FACTS=true on staging and test insurer-specific questions.');
  }

  return lines.join('\n');
}

export default summarizeStrictFactReadiness;
