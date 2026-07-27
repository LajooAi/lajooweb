import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import {
  getInsurerByKey,
  getInsurerKeysFromText,
} from '../../lib/insurerCatalog.js';
import { recordAdminOpenAiUsageLog } from '../admin/adminTechLogs.js';

export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_KNOWLEDGE_EMBEDDING_MODEL = 'text-embedding-3-small';

const DISABLED_VALUES = new Set(['0', 'false', 'off', 'no', 'disabled']);
const ENABLED_VALUES = new Set(['1', 'true', 'on', 'yes', 'enabled', 'auto', '']);
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

function safeRecordEmbeddingUsage(event) {
  recordAdminOpenAiUsageLog(event).catch(() => null);
}

function cleanText(value, maxLength = 7000) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength);
}

function truncateText(text, maxLength = 360) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1)}…`;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function querySnippetTerms(query = '') {
  const text = String(query || '').toLowerCase();
  const generalTerms = new Set(text
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 4)
    .slice(0, 14));
  const priorityTerms = new Set();

  if (/\b(break|breaks|breakdown|tow|towing|roadside|stuck|accident)\b/i.test(text)) {
    ['breakdown', 'roadside', 'assist', 'assistance', 'towing', 'tow', 'accident'].forEach((term) => priorityTerms.add(term));
  }
  if (/\b(flood|rain|monsoon|storm|landslide|natural|disaster|perils?)\b/i.test(text)) {
    ['flood', 'special', 'perils', 'storm', 'landslide', 'natural', 'disaster'].forEach((term) => priorityTerms.add(term));
  }
  if (/\b(windscreen|windshield|glass|crack|cracked|window|sunroof)\b/i.test(text)) {
    ['windscreen', 'windshield', 'glass', 'window', 'sunroof', 'crack'].forEach((term) => priorityTerms.add(term));
  }
  if (/\b(betterment|waiver|older|parts?|repair)\b/i.test(text)) {
    ['betterment', 'waiver', 'parts', 'repair', 'replacement'].forEach((term) => priorityTerms.add(term));
  }

  return [...priorityTerms, ...generalTerms];
}

export function buildRelevantKnowledgeSnippet(chunkText, query = '', maxLength = 320) {
  const clean = String(chunkText || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;

  const terms = querySnippetTerms(query);
  const lower = clean.toLowerCase();
  const matchIndex = terms
    .map((term) => {
      const match = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').exec(lower);
      return match ? match.index : -1;
    })
    .find((index) => index >= 0);

  if (!Number.isInteger(matchIndex)) {
    return truncateText(clean, maxLength);
  }

  const start = Math.max(0, matchIndex - 90);
  const end = Math.min(clean.length, start + maxLength);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < clean.length ? '…' : '';
  return `${prefix}${clean.slice(start, end).trim()}${suffix}`;
}

function normalizeLimit(value, fallback = 6, max = 12) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(Math.ceil(numeric), max);
}

function normalizeSimilarity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-1, Math.min(1, numeric));
}

function getKnowledgeEmbeddingModel(options = {}) {
  return String(
    options.model ||
    process.env.OPENAI_EMBEDDING_MODEL ||
    process.env.LAJOO_KNOWLEDGE_EMBEDDING_MODEL ||
    DEFAULT_KNOWLEDGE_EMBEDDING_MODEL
  ).trim() || DEFAULT_KNOWLEDGE_EMBEDDING_MODEL;
}

function getOpenAiApiKey(options = {}) {
  return String(options.apiKey || process.env.OPENAI_API_KEY || '').trim();
}

export function shouldUseSemanticKnowledgeSearch(options = {}) {
  const hasApiKey = Boolean(getOpenAiApiKey(options));
  if (typeof options.enabled === 'boolean') return options.enabled && hasApiKey;
  const setting = String(
    options.setting ??
    process.env.LAJOO_KNOWLEDGE_SEMANTIC_SEARCH ??
    'auto'
  ).trim().toLowerCase();

  if (DISABLED_VALUES.has(setting)) return false;
  if (!ENABLED_VALUES.has(setting)) return false;
  return hasApiKey;
}

export function embeddingToPgVector(embedding) {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array.');
  }
  if (embedding.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding must have ${KNOWLEDGE_EMBEDDING_DIMENSIONS} dimensions.`);
  }

  const values = embedding.map((value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new Error('Embedding contains a non-numeric value.');
    }
    return Number(numeric.toFixed(8));
  });

  return `[${values.join(',')}]`;
}

export async function generateKnowledgeEmbeddings(inputs, options = {}) {
  const apiKey = getOpenAiApiKey(options);
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is required for knowledge embeddings.');
    error.code = 'OPENAI_EMBEDDING_KEY_MISSING';
    throw error;
  }

  const cleanInputs = (Array.isArray(inputs) ? inputs : [inputs])
    .map((input) => cleanText(input))
    .filter(Boolean);
  if (cleanInputs.length === 0) {
    const error = new Error('Cannot embed empty knowledge text.');
    error.code = 'OPENAI_EMBEDDING_EMPTY_INPUT';
    throw error;
  }

  const model = getKnowledgeEmbeddingModel(options);
  const startedAt = Date.now();
  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: cleanInputs,
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    safeRecordEmbeddingUsage({
      model,
      operation: 'knowledge_embedding',
      status: 'failed',
      errorCode: payload?.error?.code || `HTTP_${response.status}`,
      errorMessage: payload?.error?.message || 'OpenAI embeddings request failed.',
      latencyMs: Date.now() - startedAt,
      metadata: { inputCount: cleanInputs.length, dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS },
      source: 'system',
    });
    const error = new Error(payload?.error?.message || `OpenAI embeddings request failed with ${response.status}.`);
    error.code = payload?.error?.code || 'OPENAI_EMBEDDING_FAILED';
    error.status = response.status;
    throw error;
  }

  const embeddings = Array.isArray(payload?.data)
    ? payload.data
      .slice()
      .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
      .map((entry) => entry.embedding)
    : [];
  if (embeddings.length !== cleanInputs.length) {
    const error = new Error('OpenAI embeddings response count did not match input count.');
    error.code = 'OPENAI_EMBEDDING_COUNT_MISMATCH';
    throw error;
  }
  for (const embedding of embeddings) {
    embeddingToPgVector(embedding);
  }

  safeRecordEmbeddingUsage({
    model,
    operation: 'knowledge_embedding',
    status: 'success',
    totalTokens: payload?.usage?.total_tokens,
    latencyMs: Date.now() - startedAt,
    metadata: { inputCount: cleanInputs.length, dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS },
    source: 'system',
  });

  return {
    embeddings,
    model,
  };
}

export async function generateKnowledgeEmbedding(input, options = {}) {
  const { embeddings, model } = await generateKnowledgeEmbeddings([input], options);
  return {
    embedding: embeddings[0],
    model,
  };
}

function normalizeInsurerCodes(query, options = {}) {
  const explicitCodes = Array.isArray(options.insurerCodes)
    ? options.insurerCodes
    : [];
  const codes = [
    ...explicitCodes,
    ...getInsurerKeysFromText(query)
      .map((key) => getInsurerByKey(key)?.code)
      .filter(Boolean),
  ];

  return [...new Set(codes.map((code) => String(code || '').toUpperCase()).filter(Boolean))];
}

export function buildSemanticKnowledgeResult(row = {}) {
  const sourceRelativePath = row.sourceRelativePath || null;
  const sourcePage = Number.isInteger(row.pageNumber) && row.pageNumber > 0
    ? row.pageNumber
    : null;
  const sourceLabel = sourceRelativePath
    ? `${sourceRelativePath}${sourcePage ? ` (p. ${sourcePage})` : ' (page not captured)'}`
    : null;
  const similarity = normalizeSimilarity(row.similarity);
  const insurerCode = String(row.insurerCode || '').toUpperCase() || null;
  const sourceName = row.documentTitle || row.sourceFileName || 'Policy Document';

  return {
    id: `db-semantic-chunk-${row.id}`,
    category: 'Policy Documents',
    question: `${row.insurerName || 'Insurer'}: ${sourceName}`,
    answer: buildRelevantKnowledgeSnippet(row.chunkText, row.queryText, 320),
    keywords: [],
    score: Number((similarity * 20 + 4).toFixed(4)),
    semanticSimilarity: Number(similarity.toFixed(4)),
    sourceType: 'db_semantic_chunk',
    sourceLabel,
    sourceRelativePath,
    sourcePage,
    insurerCode,
    embeddingModel: row.embeddingModel || null,
  };
}

export function mergeSemanticAndKeywordResults(semanticResults = [], keywordResults = [], limit = 6) {
  const map = new Map();
  for (const item of [...semanticResults, ...keywordResults]) {
    const key = [
      item.sourceRelativePath || item.sourceLabel || item.question,
      item.sourcePage || '',
      String(item.answer || '').toLowerCase(),
    ].join('|');
    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }
    const existing = map.get(key);
    if (Number(item.score || 0) > Number(existing.score || 0)) {
      map.set(key, item);
    }
  }

  return [...map.values()]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, normalizeLimit(limit));
}

export async function searchKnowledgeChunksSemantic(query, options = {}) {
  const cleanQuery = cleanText(query, 1200);
  if (!cleanQuery || !shouldUseSemanticKnowledgeSearch(options) || !process.env.DATABASE_URL) {
    return [];
  }

  const limit = normalizeLimit(options.limit || 6);
  const minSimilarity = Number.isFinite(Number(options.minSimilarity))
    ? Number(options.minSimilarity)
    : 0.18;
  const insurerCodes = normalizeInsurerCodes(cleanQuery, options);

  try {
    const { embedding, model } = await generateKnowledgeEmbedding(cleanQuery, options);
    const vectorLiteral = embeddingToPgVector(embedding);
    const insurerFilter = insurerCodes.length > 0
      ? Prisma.sql`AND i."code" IN (${Prisma.join(insurerCodes)})`
      : Prisma.empty;

    const rows = await prisma.$queryRaw`
      SELECT
        kc."id",
        kc."chunkText",
        kc."pageNumber",
        kc."chunkOrder",
        kc."embeddingModel",
        pd."title" AS "documentTitle",
        pd."sourceFileName" AS "sourceFileName",
        pd."sourceRelativePath" AS "sourceRelativePath",
        i."code" AS "insurerCode",
        i."name" AS "insurerName",
        1 - (kc."embedding" <=> ${vectorLiteral}::vector) AS "similarity"
      FROM "KnowledgeChunk" kc
      INNER JOIN "PolicyDocument" pd ON pd."id" = kc."policyDocumentId"
      INNER JOIN "Insurer" i ON i."id" = kc."insurerId"
      WHERE kc."embedding" IS NOT NULL
        AND (kc."embeddingModel" = ${model} OR kc."embeddingModel" IS NULL)
        ${insurerFilter}
      ORDER BY kc."embedding" <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;

    return rows
      .map((row) => buildSemanticKnowledgeResult({ ...row, queryText: cleanQuery }))
      .filter((result) => Number(result.semanticSimilarity || 0) >= minSimilarity);
  } catch (error) {
    console.warn('[semantic-knowledge] semantic chunk search failed; falling back to keyword search.', error?.message || error);
    return [];
  }
}

export async function updateKnowledgeChunkEmbedding({
  chunkId,
  embedding,
  model = DEFAULT_KNOWLEDGE_EMBEDDING_MODEL,
  prismaClient = prisma,
} = {}) {
  if (!chunkId) throw new Error('chunkId is required.');
  const vectorLiteral = embeddingToPgVector(embedding);
  await prismaClient.$executeRaw`
    UPDATE "KnowledgeChunk"
    SET
      "embedding" = ${vectorLiteral}::vector,
      "embeddingModel" = ${model},
      "embeddingUpdatedAt" = NOW()
    WHERE "id" = ${chunkId}
  `;
}

export default searchKnowledgeChunksSemantic;
