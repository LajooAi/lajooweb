import prisma from '../../lib/prisma.js';
import {
  buildFactAuditFields,
  HIGH_IMPACT_REVIEW_TOPICS,
  startOfUtcDay,
} from '../knowledge/sourceAudit.js';

export const KNOWLEDGE_FACT_STATUSES = ['DRAFT', 'VERIFIED', 'ARCHIVED'];
export const KNOWLEDGE_FACT_CONFIDENCE = ['low', 'medium', 'high'];

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

function cleanString(value, maxLength = 5000) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? clean.slice(0, maxLength) : clean;
}

function cleanNullableString(value, maxLength = 5000) {
  const clean = cleanString(value, maxLength);
  return clean || null;
}

function parseTags(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[,;\n]+/g);

  return [...new Set(source
    .map((tag) => String(tag || '').toLowerCase().trim().replace(/[^a-z0-9_ -]/g, '').replace(/\s+/g, '_'))
    .filter((tag) => tag.length >= 2)
    .slice(0, 30))];
}

function parseDate(value, label = 'Date') {
  const clean = String(value || '').trim();
  if (!clean) return null;
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function assertDateRange(validFrom, validTo) {
  if (!validFrom || !validTo) return;
  if (startOfUtcDay(validFrom) > startOfUtcDay(validTo)) {
    throw new Error('Effective from cannot be after effective to.');
  }
}

function pushAnd(where, clause) {
  if (!clause) return;
  if (!where.AND) where.AND = [];
  where.AND.push(clause);
}

function normalizeReviewTerm(value) {
  return cleanString(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const HIGH_IMPACT_REVIEW_TERMS = [...new Set(HIGH_IMPACT_REVIEW_TOPICS.flatMap((topic) => [
  topic.id,
  topic.label,
  ...(topic.terms || []),
]))].filter(Boolean);

const HIGH_IMPACT_TAG_TERMS = [...new Set(HIGH_IMPACT_REVIEW_TERMS
  .map(normalizeReviewTerm)
  .filter((term) => term.length >= 2))];

const HIGH_IMPACT_FACT_TYPES = [
  'BETTERMENT',
  'WINDSCREEN',
  'FLOOD',
  'TOWING',
];

const HIGH_IMPACT_TEXT_TERMS = HIGH_IMPACT_REVIEW_TERMS.filter((term) => {
  const clean = cleanString(term, 80);
  const normalized = normalizeReviewTerm(clean);
  return clean.includes(' ') || normalized.length >= 4;
});

function buildHighImpactFactClause() {
  const textClauses = HIGH_IMPACT_TEXT_TERMS.flatMap((term) => ([
    { title: { contains: term, mode: 'insensitive' } },
    { value: { contains: term, mode: 'insensitive' } },
    { advisorUse: { contains: term, mode: 'insensitive' } },
    { sourceExcerpt: { contains: term, mode: 'insensitive' } },
    { sourceRelativePath: { contains: term, mode: 'insensitive' } },
  ]));

  return {
    OR: [
      { category: { in: HIGH_IMPACT_TAG_TERMS } },
      { factType: { in: HIGH_IMPACT_FACT_TYPES } },
      { tags: { hasSome: HIGH_IMPACT_TAG_TERMS } },
      ...textClauses,
    ],
  };
}

export function buildFactReviewQueueClause(reviewQueue, now = new Date()) {
  const value = cleanString(reviewQueue, 40).toLowerCase();
  if (!value || value === 'all') return null;

  const today = startOfUtcDay(now);
  const highImpact = buildHighImpactFactClause();
  const missingDates = { validFrom: null, validTo: null };
  const criticalValidity = {
    OR: [
      { validTo: { lt: today } },
      { validFrom: { gt: today } },
    ],
  };
  const missingEvidence = {
    OR: [
      { sourcePage: null },
      { sourcePage: { lte: 0 } },
      { sourceRelativePath: null },
      { sourceRelativePath: '' },
    ],
  };

  if (value === 'high_impact') return highImpact;
  if (value === 'needs_dates') return { AND: [highImpact, missingDates] };
  if (value === 'critical') return { AND: [highImpact, criticalValidity] };
  if (value === 'priority') {
    return {
      AND: [
        highImpact,
        {
          OR: [
            missingDates,
            criticalValidity,
            missingEvidence,
          ],
        },
      ],
    };
  }

  throw new Error('Invalid review queue filter.');
}

export function buildFactValidityClause(validity, now = new Date()) {
  const value = cleanString(validity, 40).toLowerCase();
  if (!value || value === 'all') return null;

  const today = startOfUtcDay(now);
  if (value === 'undated') {
    return { validFrom: null, validTo: null };
  }
  if (value === 'expired') {
    return { validTo: { lt: today } };
  }
  if (value === 'future' || value === 'not_yet_effective') {
    return { validFrom: { gt: today } };
  }
  if (value === 'active') {
    return {
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: today } }] },
        { OR: [{ validTo: null }, { validTo: { gte: today } }] },
        { OR: [{ validFrom: { not: null } }, { validTo: { not: null } }] },
      ],
    };
  }

  throw new Error('Invalid validity filter.');
}

export function sanitizeFactUpdateInput(input = {}) {
  const updates = {};

  if (hasOwn(input, 'title')) {
    updates.title = cleanString(input.title, 240);
  }
  if (hasOwn(input, 'value')) {
    updates.value = cleanString(input.value, 3000);
  }
  if (hasOwn(input, 'advisorUse')) {
    updates.advisorUse = cleanNullableString(input.advisorUse, 3000);
  }
  if (hasOwn(input, 'category')) {
    updates.category = cleanNullableString(input.category, 80);
  }
  if (hasOwn(input, 'tags')) {
    updates.tags = parseTags(input.tags);
  }
  if (hasOwn(input, 'confidence')) {
    const confidence = cleanString(input.confidence, 20).toLowerCase();
    updates.confidence = KNOWLEDGE_FACT_CONFIDENCE.includes(confidence) ? confidence : 'medium';
  }
  if (hasOwn(input, 'status')) {
    const status = cleanString(input.status, 20).toUpperCase();
    if (!KNOWLEDGE_FACT_STATUSES.includes(status)) {
      throw new Error('Invalid fact status.');
    }
    updates.status = status;
  }
  if (hasOwn(input, 'validFrom')) {
    updates.validFrom = parseDate(input.validFrom, 'Effective from');
  }
  if (hasOwn(input, 'validTo')) {
    updates.validTo = parseDate(input.validTo, 'Effective to');
  }

  if (updates.title !== undefined && updates.title.length < 4) {
    throw new Error('Fact title is too short.');
  }
  if (updates.value !== undefined && updates.value.length < 12) {
    throw new Error('Fact statement is too short.');
  }
  if (hasOwn(updates, 'validFrom') && hasOwn(updates, 'validTo')) {
    assertDateRange(updates.validFrom, updates.validTo);
  }

  return updates;
}

export function sanitizeDocumentUpdateInput(input = {}) {
  const updates = {};

  if (hasOwn(input, 'versionLabel')) {
    updates.versionLabel = cleanNullableString(input.versionLabel, 120);
  }
  if (hasOwn(input, 'effectiveFrom')) {
    updates.effectiveFrom = parseDate(input.effectiveFrom, 'Document effective from');
  }
  if (hasOwn(input, 'effectiveTo')) {
    updates.effectiveTo = parseDate(input.effectiveTo, 'Document effective to');
  }
  if (hasOwn(updates, 'effectiveFrom') && hasOwn(updates, 'effectiveTo')) {
    assertDateRange(updates.effectiveFrom, updates.effectiveTo);
  }

  return updates;
}

function buildFactWhere(searchParams = {}) {
  const where = {};
  const insurerCode = cleanString(searchParams.insurerCode, 40).toUpperCase();
  const category = cleanString(searchParams.category, 80);
  const factType = cleanString(searchParams.factType, 40).toUpperCase();
  const status = cleanString(searchParams.status, 40).toUpperCase();
  const query = cleanString(searchParams.query, 120);
  const validityClause = buildFactValidityClause(searchParams.validity || 'all');
  const reviewQueueClause = buildFactReviewQueueClause(searchParams.reviewQueue || 'all');

  if (insurerCode && insurerCode !== 'ALL') where.insurer = { code: insurerCode };
  if (category && category !== 'all') where.category = category;
  if (factType && factType !== 'ALL') where.factType = factType;
  if (status && status !== 'ALL') where.status = status;
  pushAnd(where, validityClause);
  pushAnd(where, reviewQueueClause);
  if (query) {
    where.OR = [
      { title: { contains: query, mode: 'insensitive' } },
      { value: { contains: query, mode: 'insensitive' } },
      { advisorUse: { contains: query, mode: 'insensitive' } },
      { sourceExcerpt: { contains: query, mode: 'insensitive' } },
      { sourceRelativePath: { contains: query, mode: 'insensitive' } },
    ];
  }

  return where;
}

function mapDocumentForAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    insurerCode: row.insurer?.code || null,
    insurerName: row.insurer?.name || 'Unknown insurer',
    title: row.title,
    sourceFileName: row.sourceFileName,
    sourceRelativePath: row.sourceRelativePath || '',
    category: row.category || '',
    documentType: row.documentType || '',
    language: row.language || '',
    versionLabel: row.versionLabel || '',
    effectiveFrom: row.effectiveFrom ? row.effectiveFrom.toISOString().slice(0, 10) : '',
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : '',
    factCount: row._count?.facts || 0,
    updatedAt: row.updatedAt?.toISOString() || null,
  };
}

function mapFactForAdmin(row) {
  const audit = buildFactAuditFields(row);
  return {
    id: row.id,
    insurerCode: row.insurer?.code || null,
    insurerName: row.insurer?.name || 'Unknown insurer',
    factType: row.factType,
    status: row.status,
    title: row.title,
    value: row.value,
    category: row.category,
    tags: row.tags || [],
    advisorUse: row.advisorUse,
    confidence: row.confidence,
    validFrom: row.validFrom ? row.validFrom.toISOString().slice(0, 10) : '',
    validTo: row.validTo ? row.validTo.toISOString().slice(0, 10) : '',
    sourcePage: row.sourcePage,
    sourceExcerpt: row.sourceExcerpt,
    sourceRelativePath: row.sourceRelativePath || row.policyDocument?.sourceRelativePath || '',
    sourceLabel: audit.sourceLabel,
    validityStatus: audit.validityStatus,
    usableForAi: audit.usableForAi,
    needsReview: audit.needsReview,
    reviewReasons: audit.reviewReasons,
    reviewPriority: audit.reviewPriority,
    reviewTopic: audit.reviewTopic,
    reviewTopicLabel: audit.reviewTopicLabel,
    reviewPriorityReasons: audit.reviewPriorityReasons,
    policyDocumentId: row.policyDocumentId || null,
    policyDocumentTitle: row.policyDocument?.title || '',
    policyDocumentSourceRelativePath: row.policyDocument?.sourceRelativePath || '',
    policyDocumentCategory: row.policyDocument?.category || '',
    policyDocumentType: row.policyDocument?.documentType || '',
    policyDocumentLanguage: row.policyDocument?.language || '',
    policyDocumentVersionLabel: row.policyDocument?.versionLabel || '',
    policyDocumentEffectiveFrom: row.policyDocument?.effectiveFrom ? row.policyDocument.effectiveFrom.toISOString().slice(0, 10) : '',
    policyDocumentEffectiveTo: row.policyDocument?.effectiveTo ? row.policyDocument.effectiveTo.toISOString().slice(0, 10) : '',
    policyDocumentFactCount: row.policyDocument?._count?.facts || 0,
    updatedAt: row.updatedAt?.toISOString() || null,
    createdAt: row.createdAt?.toISOString() || null,
  };
}

async function buildValiditySummary(where = {}) {
  const today = startOfUtcDay();
  const baseWhere = { ...where };
  delete baseWhere.AND;
  const baseAnd = Array.isArray(where.AND) ? where.AND : [];
  const withAnd = (...clauses) => ({
    ...baseWhere,
    AND: [...baseAnd, ...clauses].filter(Boolean),
  });

  const [active, undated, expired, future] = await Promise.all([
    prisma.insurerFact.count({
      where: withAnd(buildFactValidityClause('active')),
    }),
    prisma.insurerFact.count({
      where: withAnd(buildFactValidityClause('undated')),
    }),
    prisma.insurerFact.count({
      where: withAnd({ validTo: { lt: today } }),
    }),
    prisma.insurerFact.count({
      where: withAnd({ validFrom: { gt: today } }),
    }),
  ]);

  return { active, undated, expired, future };
}

async function buildReviewQueueSummary(where = {}) {
  const baseWhere = { ...where };
  delete baseWhere.AND;
  const baseAnd = Array.isArray(where.AND) ? where.AND : [];
  const withAnd = (...clauses) => ({
    ...baseWhere,
    AND: [...baseAnd, ...clauses].filter(Boolean),
  });

  const [highImpact, priority, needsDates, critical] = await Promise.all([
    prisma.insurerFact.count({ where: withAnd(buildFactReviewQueueClause('high_impact')) }),
    prisma.insurerFact.count({ where: withAnd(buildFactReviewQueueClause('priority')) }),
    prisma.insurerFact.count({ where: withAnd(buildFactReviewQueueClause('needs_dates')) }),
    prisma.insurerFact.count({ where: withAnd(buildFactReviewQueueClause('critical')) }),
  ]);

  return { highImpact, priority, needsDates, critical };
}

export async function listKnowledgeFacts(searchParams = {}) {
  const page = Math.max(1, Number(searchParams.page || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(searchParams.pageSize || DEFAULT_PAGE_SIZE)));
  const where = buildFactWhere(searchParams);
  const validitySummaryWhere = buildFactWhere({ ...searchParams, validity: 'all' });
  const reviewSummaryWhere = buildFactWhere({ ...searchParams, reviewQueue: 'all' });

  const [facts, total, insurers, categoryRows, factTypeRows, statusRows, validitySummary, reviewQueueSummary] = await Promise.all([
    prisma.insurerFact.findMany({
      where,
      include: {
        insurer: { select: { code: true, name: true } },
        policyDocument: {
          select: {
            id: true,
            title: true,
            sourceRelativePath: true,
            category: true,
            documentType: true,
            language: true,
            versionLabel: true,
            effectiveFrom: true,
            effectiveTo: true,
            _count: { select: { facts: true } },
          },
        },
      },
      orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.insurerFact.count({ where }),
    prisma.insurer.findMany({
      select: { code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.insurerFact.groupBy({
      by: ['category'],
      where: { category: { not: null } },
      _count: { _all: true },
      orderBy: { category: 'asc' },
    }),
    prisma.insurerFact.groupBy({
      by: ['factType'],
      _count: { _all: true },
      orderBy: { factType: 'asc' },
    }),
    prisma.insurerFact.groupBy({
      by: ['status'],
      _count: { _all: true },
      orderBy: { status: 'asc' },
    }),
    buildValiditySummary(validitySummaryWhere),
    buildReviewQueueSummary(reviewSummaryWhere),
  ]);

  return {
    facts: facts.map(mapFactForAdmin),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    filters: {
      insurers,
      categories: categoryRows.map((row) => ({ category: row.category, count: row._count._all })),
      factTypes: factTypeRows.map((row) => ({ factType: row.factType, count: row._count._all })),
      statuses: statusRows.map((row) => ({ status: row.status, count: row._count._all })),
      validitySummary,
      reviewQueueSummary,
    },
  };
}

export async function updateKnowledgeFact(factId, input = {}) {
  const id = cleanString(factId, 120);
  if (!id) throw new Error('Missing fact id.');

  const data = sanitizeFactUpdateInput(input);
  if (Object.keys(data).length === 0) {
    throw new Error('No valid fact updates provided.');
  }

  if (hasOwn(data, 'validFrom') || hasOwn(data, 'validTo')) {
    const existing = await prisma.insurerFact.findUnique({
      where: { id },
      select: { validFrom: true, validTo: true },
    });
    if (!existing) throw new Error('Knowledge fact not found.');
    assertDateRange(
      hasOwn(data, 'validFrom') ? data.validFrom : existing.validFrom,
      hasOwn(data, 'validTo') ? data.validTo : existing.validTo
    );
  }

  const updated = await prisma.insurerFact.update({
    where: { id },
    data,
    include: {
      insurer: { select: { code: true, name: true } },
      policyDocument: {
        select: {
          id: true,
          title: true,
          sourceRelativePath: true,
          category: true,
          documentType: true,
          language: true,
          versionLabel: true,
          effectiveFrom: true,
          effectiveTo: true,
          _count: { select: { facts: true } },
        },
      },
    },
  });

  return mapFactForAdmin(updated);
}

export async function updateKnowledgeDocumentValidity(documentId, input = {}, options = {}) {
  const id = cleanString(documentId, 120);
  if (!id) throw new Error('Missing document id.');

  const data = sanitizeDocumentUpdateInput(input);
  if (Object.keys(data).length === 0) {
    throw new Error('No valid document updates provided.');
  }

  const applyToFacts = Boolean(options.applyToFacts);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.policyDocument.findUnique({
      where: { id },
      select: { effectiveFrom: true, effectiveTo: true },
    });
    if (!existing) throw new Error('Knowledge document not found.');

    assertDateRange(
      hasOwn(data, 'effectiveFrom') ? data.effectiveFrom : existing.effectiveFrom,
      hasOwn(data, 'effectiveTo') ? data.effectiveTo : existing.effectiveTo
    );

    const updated = await tx.policyDocument.update({
      where: { id },
      data,
      include: {
        insurer: { select: { code: true, name: true } },
        _count: { select: { facts: true } },
      },
    });

    let affectedFacts = 0;
    if (applyToFacts) {
      const factDateUpdates = {};
      if (hasOwn(data, 'effectiveFrom')) factDateUpdates.validFrom = data.effectiveFrom;
      if (hasOwn(data, 'effectiveTo')) factDateUpdates.validTo = data.effectiveTo;

      if (Object.keys(factDateUpdates).length > 0) {
        const result = await tx.insurerFact.updateMany({
          where: { policyDocumentId: id },
          data: factDateUpdates,
        });
        affectedFacts = result.count;
      }
    }

    return {
      document: mapDocumentForAdmin(updated),
      affectedFacts,
      appliedToFacts: applyToFacts,
    };
  });
}

export default listKnowledgeFacts;
