import { createHash } from 'node:crypto';
import { maskSensitiveText } from '../../lib/piiMasking.js';
import { shouldRequireDatedFactsForAi } from '../knowledge/sourceAudit.js';

const MAX_TRACE_SOURCES = 12;
const MAX_METADATA_TRACES = 30;

function cleanText(value, maxLength = 240) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1)}...`;
}

function formatDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function compactArray(value, limit = 12) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, limit) : [];
}

function sourceKey(source = {}) {
  return [
    source.id,
    source.sourceType,
    source.insurerName,
    source.category,
    source.factType,
    source.sourceRelativePath,
    source.sourcePage,
    source.sourceLabel,
  ].map((part) => String(part || '')).join('|');
}

function traceHash(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function normalizeFactSource(fact = {}, usedFor = 'verified_fact') {
  if (!fact) return null;
  const sourceRelativePath = fact.sourceRelativePath || null;
  const sourcePage = Number.isInteger(fact.sourcePage) && fact.sourcePage > 0
    ? fact.sourcePage
    : null;
  const sourceLabel = fact.sourceLabel || (
    sourceRelativePath
      ? `${sourceRelativePath}${sourcePage ? ` (p. ${sourcePage})` : ''}`
      : null
  );

  return {
    id: fact.id || null,
    sourceType: fact.sourceType || 'db_verified_fact',
    usedFor: [usedFor],
    insurerName: fact.insurerName || null,
    insurerSlug: fact.insurerSlug || null,
    category: fact.category || null,
    factType: fact.factType || null,
    title: cleanText(fact.title, 160) || null,
    sourceRelativePath,
    sourcePage,
    sourceLabel,
    validityStatus: fact.validityStatus || null,
    validFrom: formatDate(fact.validFrom),
    validTo: formatDate(fact.validTo),
    confidence: fact.confidence || null,
    statementPreview: cleanText(fact.statement || fact.answer, 220) || null,
    sourceExcerptPreview: cleanText(fact.sourceExcerpt, 220) || null,
  };
}

function normalizeKnowledgeMatchSource(match = {}, usedFor = 'question_grounding') {
  if (!match) return null;
  return normalizeFactSource({
    id: match.id || null,
    sourceType: match.sourceType || 'knowledge_match',
    insurerName: match.insurerName || null,
    insurerSlug: match.insurerSlug || null,
    category: match.categoryName || match.factCategory || match.category || null,
    factType: match.factType || null,
    title: match.title || match.question || null,
    sourceRelativePath: match.sourceRelativePath || null,
    sourcePage: match.sourcePage || null,
    sourceLabel: match.sourceLabel || null,
    validityStatus: match.validityStatus || null,
    validFrom: match.validFrom || null,
    validTo: match.validTo || null,
    confidence: match.confidence || null,
    statement: match.statement || match.answer || null,
    sourceExcerpt: match.sourceExcerpt || null,
  }, usedFor);
}

function mergeSources(sources = []) {
  const map = new Map();
  for (const source of sources.filter(Boolean)) {
    const key = sourceKey(source);
    if (!key.trim()) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, source);
      continue;
    }
    existing.usedFor = [...new Set([
      ...compactArray(existing.usedFor),
      ...compactArray(source.usedFor),
    ])];
  }
  return [...map.values()].slice(0, MAX_TRACE_SOURCES);
}

export function buildKnowledgeSourceTrace({
  sessionId = null,
  latestMessage = '',
  state = null,
  intent = null,
  decision = null,
  turnPlan = null,
  questionKnowledgeMatches = [],
  verifiedDatabaseFacts = [],
  quoteRecommendation = null,
  now = new Date(),
} = {}) {
  const sources = mergeSources([
    ...compactArray(questionKnowledgeMatches, MAX_TRACE_SOURCES)
      .map((match) => normalizeKnowledgeMatchSource(match, 'question_grounding')),
    ...compactArray(verifiedDatabaseFacts, MAX_TRACE_SOURCES)
      .map((fact) => normalizeFactSource(fact, 'turn_instruction')),
  ]);

  if (sources.length === 0) return null;

  const createdAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const recommendation = quoteRecommendation?.recommendedQuote ? {
    insurerName: quoteRecommendation.recommendedQuote.insurerName || null,
    insurerKey: quoteRecommendation.recommendedQuote.insurerKey || null,
    factReasons: compactArray(quoteRecommendation.factReasons, 8).map((reason) => cleanText(reason, 220)),
    riskNotes: compactArray(quoteRecommendation.riskNotes, 8).map((note) => cleanText(note, 220)),
  } : null;

  const base = {
    version: 1,
    createdAt,
    sessionId: sessionId || null,
    step: state?.step || turnPlan?.currentStep || null,
    intent: intent?.intent || null,
    conversationMode: decision?.mode || null,
    responsePattern: turnPlan?.responsePattern || null,
    strictDatedFactsRequired: shouldRequireDatedFactsForAi(),
    questionPreview: maskSensitiveText(cleanText(latestMessage, 280), { maxLength: 280 }),
    sourceCount: sources.length,
    sources,
    recommendation,
  };

  return {
    traceId: `kst_${traceHash({
      createdAt,
      sessionId,
      questionPreview: base.questionPreview,
      sourceKeys: sources.map(sourceKey),
    })}`,
    ...base,
  };
}

function compactTraceForMetadata(trace = {}) {
  if (!trace?.traceId) return null;
  return {
    traceId: trace.traceId,
    createdAt: trace.createdAt,
    step: trace.step || null,
    intent: trace.intent || null,
    conversationMode: trace.conversationMode || null,
    responsePattern: trace.responsePattern || null,
    strictDatedFactsRequired: Boolean(trace.strictDatedFactsRequired),
    questionPreview: trace.questionPreview || '',
    sourceCount: Number(trace.sourceCount || 0),
    sources: compactArray(trace.sources, MAX_TRACE_SOURCES).map((source) => ({
      id: source.id || null,
      sourceType: source.sourceType || null,
      usedFor: compactArray(source.usedFor, 6),
      insurerName: source.insurerName || null,
      category: source.category || null,
      factType: source.factType || null,
      sourceRelativePath: source.sourceRelativePath || null,
      sourcePage: source.sourcePage || null,
      sourceLabel: source.sourceLabel || null,
      validityStatus: source.validityStatus || null,
      validFrom: source.validFrom || null,
      validTo: source.validTo || null,
    })),
    recommendation: trace.recommendation || null,
  };
}

export function appendKnowledgeSourceTraceToMetadata(existingMetadata = {}, trace = null, baseMetadata = {}) {
  const metadata = {
    ...(existingMetadata || {}),
    ...(baseMetadata || {}),
  };
  const compactTrace = compactTraceForMetadata(trace);
  if (!compactTrace) return metadata;

  const existingTraces = Array.isArray(existingMetadata?.knowledgeSourceTraces)
    ? existingMetadata.knowledgeSourceTraces
    : [];
  metadata.lastKnowledgeSourceTrace = compactTrace;
  metadata.knowledgeSourceTraces = [...existingTraces, compactTrace].slice(-MAX_METADATA_TRACES);
  return metadata;
}

export function logKnowledgeSourceTrace(trace = null) {
  const compactTrace = compactTraceForMetadata(trace);
  if (!compactTrace) return;
  console.info('[KNOWLEDGE_SOURCE_TRACE]', JSON.stringify({
    traceId: compactTrace.traceId,
    sessionId: trace?.sessionId || null,
    step: compactTrace.step,
    intent: compactTrace.intent,
    sourceCount: compactTrace.sourceCount,
    sources: compactTrace.sources.map((source) => ({
      id: source.id,
      insurerName: source.insurerName,
      category: source.category,
      sourceLabel: source.sourceLabel,
      validityStatus: source.validityStatus,
    })),
  }));
}

export default buildKnowledgeSourceTrace;
