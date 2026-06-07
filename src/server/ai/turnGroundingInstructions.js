import { USER_INTENTS } from '../../lib/conversationState.js';
import { searchInsurerKnowledgeFromDb } from '../../lib/insurerKnowledgeDb.js';
import { findVerifiedDatabaseFactsForMessage } from '../insurance/databaseFactStore.js';
import { shouldRequireDatedFactsForAi } from '../knowledge/sourceAudit.js';

function truncateKnowledgeFact(text, maxLen = 280) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}...`;
}

function isComparisonQuestion(text) {
  const msg = String(text || '').toLowerCase();
  if (!msg) return false;

  if (/\b(compare|comparison|versus|vs\.?|difference|differentiate)\b/i.test(msg)) return true;
  if (/\b(zero\s+betterment|waiver(?:\s+of)?\s+betterment|betterment)\b/i.test(msg)) return true;
  if (/\bwhich insurer\b/i.test(msg)) return true;
  if (/\bbetween\b.+\b(?:and|vs)\b/i.test(msg)) return true;

  return false;
}

export async function loadKnowledgeMatchesForQuestion(latestMessage, intent, options = {}) {
  if (intent?.intent !== USER_INTENTS.ASK_QUESTION) return [];
  const query = String(latestMessage || '').trim();
  if (!query) return [];

  const limit = Number(options.limit || 6);
  const maxChunkCandidates = Number(options.maxChunkCandidates || 320);
  const verifiedFacts = await findVerifiedDatabaseFactsForMessage(query, {
    limit: Math.min(limit, 6),
  });
  const verifiedMatches = verifiedFacts.map((fact) => ({
    id: fact.id,
    category: 'Verified Insurer Facts',
    categoryName: fact.category || null,
    question: `${fact.insurerName}: ${fact.category || 'verified private-car fact'}`,
    answer: [
      fact.statement,
      fact.advisorUse ? `Advisor use: ${fact.advisorUse}` : null,
      fact.sourceLabel ? `Source: ${fact.sourceLabel}` : null,
      fact.validityStatus ? `Validity: ${fact.validityStatus}` : null,
      fact.sourceRelativePath ? `Source file: ${fact.sourceRelativePath}` : null,
    ].filter(Boolean).join(' '),
    keywords: fact.tags || [],
    score: 100,
    sourceType: 'db_verified_fact',
    sourceLabel: fact.sourceLabel || fact.sourceRelativePath || null,
    sourceRelativePath: fact.sourceRelativePath || null,
    sourcePage: fact.sourcePage || null,
    sourceExcerpt: fact.sourceExcerpt || null,
    validityStatus: fact.validityStatus || null,
    validFrom: fact.validFrom || null,
    validTo: fact.validTo || null,
    confidence: fact.confidence || null,
    factType: fact.factType || null,
    insurerName: fact.insurerName || null,
    insurerSlug: fact.insurerSlug || null,
    tags: fact.tags || [],
    statement: fact.statement || null,
    insurerCode: null,
  }));

  if (shouldRequireDatedFactsForAi()) {
    return verifiedMatches.slice(0, limit);
  }

  const remainingLimit = Math.max(0, limit - verifiedMatches.length);
  const chunkMatches = remainingLimit > 0
    ? await searchInsurerKnowledgeFromDb(query, { limit: remainingLimit, maxChunkCandidates })
    : [];
  return [...verifiedMatches, ...(Array.isArray(chunkMatches) ? chunkMatches : [])].slice(0, limit);
}

export function buildLiveKnowledgeSnapshot(matches = [], limit = 4) {
  if (!Array.isArray(matches) || matches.length === 0) return [];
  return matches.slice(0, limit).map((entry) => {
    const sourceType = String(entry.sourceType || 'db_unknown').replace(/^db_/, '');
    const sourceLabel = String(entry.question || 'Insurer knowledge').trim();
    const fact = truncateKnowledgeFact(entry.answer, 180);
    return `${sourceLabel} [${sourceType}]: ${fact}`;
  });
}

export function buildComparisonQuestionInstruction(latestMessage, intent, state) {
  if (intent?.intent !== USER_INTENTS.ASK_QUESTION) return null;
  const query = String(latestMessage || '').trim();
  if (!query || !isComparisonQuestion(query)) return null;

  return `COMPARISON ANSWER CONTRACT
User asked a comparison-style insurance question.
Format your answer in this order:
1) One-line direct summary.
2) A compact side-by-side list with one line per insurer/policy being compared.
3) If a claim is not in PostgreSQL references, write: "not found in current insurer database".
4) One practical recommendation line tied to user intent (budget, claims ease, or coverage).
5) One clear close question that brings user back to current step (${state.step}).

Style:
- Up to 6 short lines total (not counting the close question).
- Be specific and factual; no generic marketing claims.
- Keep pricing/selection flow unchanged.`;
}

export async function buildKnowledgeGroundingInstruction(latestMessage, intent, state, preloadedMatches = null, options = {}) {
  if (intent?.intent !== USER_INTENTS.ASK_QUESTION) return null;
  const query = String(latestMessage || '').trim();
  if (!query) return null;

  const matches = Array.isArray(preloadedMatches)
    ? preloadedMatches
    : await loadKnowledgeMatchesForQuestion(query, intent, { limit: 6, maxChunkCandidates: 320 });
  if (!Array.isArray(matches) || matches.length === 0) {
    if (options.allowGeneralConceptAnswer) {
      return `GENERAL CONCEPT GROUNDING
No PostgreSQL insurer-specific references were found, but the user is asking about an approved general insurance concept.
- Use the APPROVED GENERAL INSURANCE CONCEPTS instruction if present.
- Do not say "not found in current insurer database" for the general concept itself.
- If the user asks whether a specific insurer includes/offers this, then say that insurer-specific proof is not found in the current insurer database.
- After answering, guide back to the current flow step with one clear next-action question.
Current step: ${state.step}.`;
    }

    return `QUESTION HANDLING CONTRACT
No relevant PostgreSQL insurer knowledge was found for this question.
- Do NOT guess or use generic memory for insurer-specific facts.
- Say clearly that this detail is not found in the current insurer database.
- Ask one short clarifying follow-up (insurer name, plan name, or exact term) so you can search again.
- Then guide back to the current flow step with one clear next-action question.
Current step: ${state.step}.`;
  }

  const factLines = matches.slice(0, 3).map((entry, index) => {
    const question = String(entry.question || '').trim();
    const answer = truncateKnowledgeFact(entry.answer, 260);
    const sourceType = String(entry.sourceType || 'db_unknown').replace(/^db_/, '');
    const sourceLabel = entry.sourceLabel ? `\n   Evidence: ${entry.sourceLabel}` : '';
    const validity = entry.validityStatus ? `\n   Validity: ${entry.validityStatus}` : '';
    return `${index + 1}. ${question}\n   Source: PostgreSQL (${sourceType})${sourceLabel}${validity}\n   Key fact: ${answer}`;
  }).join('\n');

  return `QUESTION GROUNDING (MANDATORY)
User asked: "${query}"
Use ONLY the PostgreSQL grounded references below before adding advice:
${factLines}

Rules:
- Answer the question first with concrete facts from these references only.
- Treat undated facts as approved but not time-guaranteed; avoid saying "currently" unless the source has active dates.
- Do not use quote-card marketing bullets as policy truth.
- Do not invent policy/regulatory details not supported by these references.
- Then bridge back to the current step with one concise next-action question.`;
}

export default buildKnowledgeGroundingInstruction;
