/**
 * Shared flow guard helpers used by route-level orchestration and tests/evals.
 * Keep these pure and deterministic.
 */

export function parseRecommendedInsurerFromAssistantMessage(lastAIMessage) {
  const text = String(lastAIMessage || '').toLowerCase();
  if (!text) return null;

  const mentions = [];
  if (/takaful|ikhlas/i.test(text)) mentions.push('takaful');
  if (/etiqa/i.test(text)) mentions.push('etiqa');
  if (/allianz/i.test(text)) mentions.push('allianz');

  // Multiple mentions are usually quote listing, not recommendation.
  if (mentions.length !== 1) return null;

  // Explicit list/choice prompt means no single recommendation.
  if (/pick|choose|select|which|or say recommend for me|if you need help deciding/i.test(text) &&
      /(takaful).*(etiqa).*(allianz)|(allianz).*(etiqa).*(takaful)|(etiqa).*(takaful).*(allianz)/i.test(text)) {
    return null;
  }

  const hasRecommendationCue = /i recommend|i(?:'d| would)\s+recommend|my recommendation|i(?:'d| would) go with|best option|best pick|go with|suggest/i.test(text);
  if (!hasRecommendationCue) return null;

  return mentions[0];
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
  return /found your vehicle|vehicle reg\.?num|cover type|policy effective|is this correct\?/i.test(text);
}

export function canUseDeliveredRoadTaxByOwnerType(ownerIdType) {
  return ownerIdType === 'foreign_id' || ownerIdType === 'company_reg';
}
