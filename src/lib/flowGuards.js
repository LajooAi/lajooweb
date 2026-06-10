/**
 * Shared flow guard helpers used by route-level orchestration and tests/evals.
 * Keep these pure and deterministic.
 */
import { getInsurerKeysFromText } from "./insurerCatalog.js";

export function parseRecommendedInsurerFromAssistantMessage(lastAIMessage) {
  const text = String(lastAIMessage || '').replace(/\*/g, '');
  const lower = text.toLowerCase();
  if (!lower) return null;

  const mapInsurerFromChunk = (chunk) => {
    const mentions = getInsurerKeysFromText(chunk);
    return mentions.length === 1 ? mentions[0] : null;
  };

  const hasMultipleInsurerMentions = getInsurerKeysFromText(lower).length > 1;

  // First, try to parse an explicit recommendation clause even if other insurers are also mentioned.
  const recommendationPatterns = [
    /(?:my pick(?:\s+is)?|my choice(?:\s+is)?)\s*:?\s+([^.!?\n—-]+)/i,
    /(?:i\s*(?:'d|would)\s*recommend|i\s*recommend|my recommendation(?:\s+is)?|i\s*(?:'d|would)\s*go with|i\s*go with|you should go with|best option(?:\s+is)?|best pick(?:\s+is)?|i(?:'m| am)\s+recommending)\s+([^.!?\n]+)/i,
    /(?:considering[^.!?\n]*,\s*i\s*(?:'d|would)\s*recommend)\s+([^.!?\n]+)/i,
    /(?:shall\s+i|should\s+i|want\s+me\s+to|would\s+you\s+like\s+me\s+to|can\s+i)\s+(?:select|choose|lock(?:\s+in)?|go\s+with|proceed\s+with)\s+([^.!?\n]+)/i,
  ];
  for (const pattern of recommendationPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const insurer = mapInsurerFromChunk(match[1] || '');
    if (insurer) return insurer;
  }

  // Explicit list/choice prompt with all insurers and no explicit recommendation should not auto-select.
  if (
    /pick|choose|select|which|or say recommend for me|if you need help deciding/i.test(lower) &&
    hasMultipleInsurerMentions
  ) {
    return null;
  }

  // Fallback: only accept if exactly one insurer is mentioned in the whole message + recommendation cue.
  const singleMention = mapInsurerFromChunk(text);
  const hasRecommendationCue = /i recommend|i(?:'d| would)\s+recommend|my recommendation|i(?:'d| would) go with|best option|best pick|go with|proceed with|continue with|lock in|suggest/i.test(lower);
  if (!singleMention || !hasRecommendationCue) return null;

  return singleMention;
}

export function isVehicleDetailsRejectionMessage(message) {
  const text = String(message || '').trim().toLowerCase();
  if (!text) return false;

  if (/^(no|nope|nah)\b/.test(text)) return true;
  if (/\b(wrong|incorrect|not right|not correct|doesn'?t match|don'?t match|dont match|do not match|different)\b/.test(text)) return true;
  if (/\b(not my|isn'?t my|is not my)\s+(car|vehicle)\b/.test(text)) return true;

  return false;
}

export function wasLastAssistantVehicleConfirmation(messages) {
  const lastAssistant = [...(messages || [])]
    .reverse()
    .find(m => m.role === 'assistant' && m.content)?.content || '';
  const text = String(lastAssistant).toLowerCase();
  return /found your vehicle|vehicle reg\.?num|vehicle registration number|cover(?:age)? type|policy (?:effective|period)|is this correct\?/i.test(text);
}

export function canUseDeliveredRoadTaxByOwnerType(ownerIdType) {
  return ownerIdType === 'foreign_id' || ownerIdType === 'company_reg';
}
