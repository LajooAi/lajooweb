import prisma from '../../lib/prisma.js';

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

function parseDate(value) {
  const clean = String(value || '').trim();
  if (!clean) return null;
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function sanitizeFactUpdateInput(input = {}) {
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(input, 'title')) {
    updates.title = cleanString(input.title, 240);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'value')) {
    updates.value = cleanString(input.value, 3000);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'advisorUse')) {
    updates.advisorUse = cleanNullableString(input.advisorUse, 3000);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'category')) {
    updates.category = cleanNullableString(input.category, 80);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'tags')) {
    updates.tags = parseTags(input.tags);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'confidence')) {
    const confidence = cleanString(input.confidence, 20).toLowerCase();
    updates.confidence = KNOWLEDGE_FACT_CONFIDENCE.includes(confidence) ? confidence : 'medium';
  }
  if (Object.prototype.hasOwnProperty.call(input, 'status')) {
    const status = cleanString(input.status, 20).toUpperCase();
    if (!KNOWLEDGE_FACT_STATUSES.includes(status)) {
      throw new Error('Invalid fact status.');
    }
    updates.status = status;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'validFrom')) {
    updates.validFrom = parseDate(input.validFrom);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'validTo')) {
    updates.validTo = parseDate(input.validTo);
  }

  if (updates.title !== undefined && updates.title.length < 4) {
    throw new Error('Fact title is too short.');
  }
  if (updates.value !== undefined && updates.value.length < 12) {
    throw new Error('Fact statement is too short.');
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

  if (insurerCode && insurerCode !== 'ALL') where.insurer = { code: insurerCode };
  if (category && category !== 'all') where.category = category;
  if (factType && factType !== 'ALL') where.factType = factType;
  if (status && status !== 'ALL') where.status = status;
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

function mapFactForAdmin(row) {
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
    policyDocumentTitle: row.policyDocument?.title || '',
    updatedAt: row.updatedAt?.toISOString() || null,
    createdAt: row.createdAt?.toISOString() || null,
  };
}

export async function listKnowledgeFacts(searchParams = {}) {
  const page = Math.max(1, Number(searchParams.page || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(searchParams.pageSize || DEFAULT_PAGE_SIZE)));
  const where = buildFactWhere(searchParams);

  const [facts, total, insurers, categoryRows, factTypeRows, statusRows] = await Promise.all([
    prisma.insurerFact.findMany({
      where,
      include: {
        insurer: { select: { code: true, name: true } },
        policyDocument: { select: { title: true, sourceRelativePath: true } },
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

  const updated = await prisma.insurerFact.update({
    where: { id },
    data,
    include: {
      insurer: { select: { code: true, name: true } },
      policyDocument: { select: { title: true, sourceRelativePath: true } },
    },
  });

  return mapFactForAdmin(updated);
}

export default listKnowledgeFacts;
