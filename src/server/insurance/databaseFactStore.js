import prisma from '../../lib/prisma.js';
import { getInsurerByCode, getInsurerKeysFromText } from '../../lib/insurerCatalog.js';
import {
  buildFactAuditFields,
  buildUsableFactDateWhere,
  isFactUsableForAi,
  shouldRequireDatedFactsForAi,
} from '../knowledge/sourceAudit.js';
import { inferFactTagsFromMessage } from './approvedFactStore.js';
import { getApprovedFactInsurerSlugForKey } from './insurerFactSlugs.js';

const FACT_QUERY_LIMIT = 220;

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength = 360) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1)}...`;
}

function extractMessageTokens(message = '') {
  return [...new Set(normalizeText(message)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 4)
    .slice(0, 18))];
}

function getInsurerSlugFromCode(code) {
  const insurer = getInsurerByCode(code);
  if (!insurer) return null;
  return getApprovedFactInsurerSlugForKey(insurer.key) || insurer.id || null;
}

function getInsurerCodesFromSlug(insurerSlug) {
  const slug = String(insurerSlug || '').toLowerCase();
  if (!slug) return [];
  return ['ALLIANZ', 'ETIQA', 'GENERALI', 'LONPAC', 'MSIG', 'TAKAFUL', 'TOKIO']
    .filter((code) => getInsurerSlugFromCode(code) === slug);
}

function getInsurerCodesFromMessage(message = '') {
  return getInsurerKeysFromText(message)
    .map((key) => {
      const codeByKey = {
        allianz: 'ALLIANZ',
        etiqa: 'ETIQA',
        generali: 'GENERALI',
        lonpac: 'LONPAC',
        msig: 'MSIG',
        takaful: 'TAKAFUL',
        tokio: 'TOKIO',
      };
      return codeByKey[key] || null;
    })
    .filter(Boolean);
}

export function mapInsurerFactRowToApprovedFact(row, options = {}) {
  if (!row) return null;
  const insurerCode = row.insurer?.code || null;
  const insurerSlug = getInsurerSlugFromCode(insurerCode);
  const audit = buildFactAuditFields(row);
  const requireDatedFacts = shouldRequireDatedFactsForAi(options);
  const isGenericGeneratedBrandProgram =
    row.category === 'brand_program' &&
    /\bimported private-car\b/i.test(row.value || '') &&
    /\bprogramme or product wording\b/i.test(row.value || '');
  const usableForAi =
    !isGenericGeneratedBrandProgram &&
    isFactUsableForAi(row, undefined, { requireDatedFacts });
  return {
    id: `db:${row.id}`,
    insurerSlug,
    insurerName: row.insurer?.name || 'Insurer',
    title: row.title || null,
    category: row.category || normalizeText(row.factType || 'general'),
    tags: Array.isArray(row.tags) ? row.tags : [],
    statement: row.value,
    advisorUse: row.advisorUse,
    confidence: row.confidence || 'medium',
    approvedForAi: usableForAi,
    sourceType: 'db_verified_fact',
    sourceRelativePath: row.sourceRelativePath || row.policyDocument?.sourceRelativePath || null,
    sourcePage: row.sourcePage || null,
    sourceLabel: audit.sourceLabel,
    sourceExcerpt: row.sourceExcerpt || null,
    factType: row.factType || null,
    validFrom: row.validFrom || null,
    validTo: row.validTo || null,
    validityStatus: audit.validityStatus,
    needsReview: audit.needsReview || isGenericGeneratedBrandProgram,
    reviewReasons: isGenericGeneratedBrandProgram
      ? [...(audit.reviewReasons || []), 'generic auto-generated brand-program fact needs admin verification']
      : audit.reviewReasons,
    usableForAi,
    strictDatedFactsRequired: requireDatedFacts,
  };
}

function scoreMappedFact(fact, { insurerSlug = null, tags = [], message = '' } = {}) {
  if (!fact?.approvedForAi) return 0;
  const text = normalizeText([
    fact.insurerName,
    fact.category,
    fact.statement,
    fact.advisorUse,
    fact.sourceRelativePath,
    ...(fact.tags || []),
  ].join(' '));
  let score = 0;

  if (insurerSlug && fact.insurerSlug === insurerSlug) score += 6;
  if (!insurerSlug && fact.insurerSlug) score += 0.2;

  for (const tag of tags) {
    if (fact.tags?.includes(tag)) score += 2.4;
    if (text.includes(String(tag).replace(/_/g, ' '))) score += 0.6;
  }

  for (const token of extractMessageTokens(message)) {
    if (text.includes(token)) score += 0.25;
  }

  if (fact.confidence === 'high') score += 0.35;
  if (fact.confidence === 'medium') score += 0.12;
  if (fact.sourceExcerpt) score += 0.18;
  return score;
}

function dedupeMappedFacts(entries = []) {
  const seen = new Set();
  return entries.filter((entry) => {
    const fact = entry.fact;
    const key = [
      fact?.insurerSlug,
      fact?.category,
      fact?.factType,
      fact?.title || fact?.statement,
      (fact?.tags || []).slice().sort().join(','),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function diversifyFactsByInsurer(entries = [], limit = 12, shouldDiversify = false) {
  if (!shouldDiversify) return entries.slice(0, limit);

  const selected = [];
  const deferred = [];
  const seenInsurers = new Set();
  for (const entry of entries) {
    const insurer = entry.fact?.insurerSlug || 'unknown';
    if (!seenInsurers.has(insurer)) {
      selected.push(entry);
      seenInsurers.add(insurer);
    } else {
      deferred.push(entry);
    }
    if (selected.length >= limit) return selected;
  }

  return [...selected, ...deferred].slice(0, limit);
}

function shouldDiversifyFactResults({ insurerSlug = null, message = '' } = {}) {
  if (insurerSlug) return false;
  return /\b(compare|which insurer|which one|best|better|recommend|recommendation|versus|vs\.?)\b/i.test(message);
}

export function buildDbFactWhere({ insurerSlug = null, tags = [], category = null, message = '', requireDatedFacts = undefined } = {}) {
  const insurerCodes = insurerSlug
    ? getInsurerCodesFromSlug(insurerSlug)
    : getInsurerCodesFromMessage(message);
  const tokenClauses = extractMessageTokens(message).slice(0, 8).flatMap((token) => ([
    { value: { contains: token, mode: 'insensitive' } },
    { title: { contains: token, mode: 'insensitive' } },
    { advisorUse: { contains: token, mode: 'insensitive' } },
    { sourceExcerpt: { contains: token, mode: 'insensitive' } },
  ]));
  const dateClauses = buildUsableFactDateWhere(undefined, { requireDatedFacts });
  const topicClauses = tags.length > 0
    ? [{ OR: tags.map((tag) => ({ tags: { has: tag } })) }]
    : tokenClauses.length > 0
      ? [{ OR: tokenClauses }]
      : [];

  return {
    status: 'VERIFIED',
    AND: [...dateClauses, ...topicClauses],
    ...(category ? { category } : {}),
    ...(insurerCodes.length > 0 ? { insurer: { code: { in: insurerCodes } } } : {}),
  };
}

export async function getVerifiedDatabaseFacts({
  insurerSlug = null,
  tags = [],
  category = null,
  message = '',
  limit = 12,
  requireDatedFacts = undefined,
} = {}) {
  if (!process.env.DATABASE_URL) return [];

  const queryLimit = Math.max(Number(limit || 12) * 20, FACT_QUERY_LIMIT);
  try {
    const rows = await prisma.insurerFact.findMany({
      where: buildDbFactWhere({ insurerSlug, tags, category, message, requireDatedFacts }),
      include: {
        insurer: { select: { code: true, name: true } },
        policyDocument: { select: { sourceRelativePath: true, title: true } },
      },
      take: queryLimit,
      orderBy: [{ updatedAt: 'desc' }],
    });

    const scored = rows
      .map((row) => mapInsurerFactRowToApprovedFact(row, { requireDatedFacts }))
      .filter(Boolean)
      .map((fact) => ({
        fact,
        score: scoreMappedFact(fact, { insurerSlug, tags, message }),
      }))
      .filter((entry) => entry.score > 0 || (!message && tags.length === 0))
      .sort((a, b) => b.score - a.score);

    return diversifyFactsByInsurer(
      dedupeMappedFacts(scored),
      Number(limit || 12),
      shouldDiversifyFactResults({ insurerSlug, message })
    ).map((entry) => entry.fact);
  } catch (error) {
    console.warn('[database-fact-store] verified fact lookup failed.', error?.message || error);
    return [];
  }
}

export async function findVerifiedDatabaseFactsForMessage(message = '', { insurerSlug = null, limit = 8, requireDatedFacts = undefined } = {}) {
  const tags = inferFactTagsFromMessage(message);
  if (tags.length === 0 && !insurerSlug && getInsurerKeysFromText(message).length === 0) return [];
  return getVerifiedDatabaseFacts({
    insurerSlug,
    tags,
    message,
    limit,
    requireDatedFacts,
  });
}

export function buildVerifiedDatabaseFactsInstructionFromFacts(facts = []) {
  const filtered = (Array.isArray(facts) ? facts : []).filter((fact) => fact?.approvedForAi);
  if (filtered.length === 0) return null;

  const lines = [
    'VERIFIED DATABASE INSURER FACTS',
    'These facts came from imported insurer PDFs in Neon and are approved for AI use. Use them before raw PDF chunks.',
    shouldRequireDatedFactsForAi()
      ? 'Date rule: strict dated-facts mode is ON; only current dated facts should be treated as usable for AI advice.'
      : 'Date rule: active facts are current; undated facts may be used cautiously but should not be treated as a time-guaranteed promise.',
  ];

  filtered.slice(0, 6).forEach((fact, index) => {
    lines.push(`${index + 1}. ${fact.insurerName}: ${fact.statement}`);
    if (fact.advisorUse) lines.push(`   Advisor use: ${fact.advisorUse}`);
    if (fact.sourceLabel || fact.sourceRelativePath) {
      lines.push(`   Source: ${fact.sourceLabel || fact.sourceRelativePath}`);
    }
    if (fact.validityStatus) lines.push(`   Validity: ${fact.validityStatus}`);
    if (fact.sourceExcerpt) lines.push(`   Source excerpt: ${truncateText(fact.sourceExcerpt, 220)}`);
  });

  lines.push('Compliance: do not turn these into broader promises. Confirm limits, eligibility, and selected add-ons before payment.');
  return lines.join('\n');
}

export async function buildVerifiedDatabaseFactsInstruction(message = '', options = {}) {
  const facts = await findVerifiedDatabaseFactsForMessage(message, options);
  return buildVerifiedDatabaseFactsInstructionFromFacts(facts);
}

export default getVerifiedDatabaseFacts;
