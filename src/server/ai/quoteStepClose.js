import {
  AVAILABLE_INSURER_CHOICE_TEXT,
  getInsurerKeysFromText,
  getInsurerByKey,
} from '../../lib/insurerCatalog.js';
import { parseRecommendedInsurerFromAssistantMessage } from '../../lib/flowGuards.js';
import { getQuotesFromState } from '../insurance/quoteEngine.js';

const STALE_QUOTE_CLOSE_PATTERNS = [
  /Would you like a quick side-?by-?side comparison,?\s+or should I recommend one(?: now)?(?: based on your priority\s*\([^?]+\))?\?/gi,
  /Would you like a quick side-?by-?side comparison,?\s+or should I recommend one(?: now)?(?: based on your priority\s+\(?\*\*budget\*\*,?\s*\*\*claims\*\*,?\s*(?:or\s*)?\*\*coverage\*\*\)?)?\?/gi,
  /Want a quick side-?by-?side on this point,?\s+or should I recommend one now\?/gi,
  /Want to go with this,?\s+or would you like the cheapest option or a full comparison\?/gi,
  /Would you like to go with this(?: option)?,?\s+choose the cheapest option,?\s+or (?:see|explore|get) (?:a )?(?:full )?comparison\?/gi,
  /(?:Do you want|Would you like|Want) to go with\s+(?:\*\*[^?\n]+\*\*|[^?,\n]+),?\s+choose the cheapest option,?\s+or (?:compare all insurers|compare another insurer|explore others|see (?:a )?(?:full )?comparison|get (?:a )?(?:full )?comparison)\?/gi,
];

const GENERIC_RECOMMENDATION_CLOSE_PATTERNS = [
  /Would you like my recommendation,?\s+or do you want to choose one of these:\s*[^?]+\?/gi,
  /Let me know if you(?:'d| would)? prefer my recommendation,?\s+or if you want to choose one of these:\s*[^.?\n]+[.?]?/gi,
];

const WEAK_DIRECT_ADVICE_CLOSE_PATTERNS = [
  /(?:Do you want|Would you like|Want) to go with\s+(?:\*\*[^?\n]+\*\*|[^?,\n]+),?\s+choose the cheapest option\s+(?:\*\*[^?\n]+\*\*|[^?,\n]+),?\s+or (?:(?:compare|explore|see) (?:another|other|more) (?:insurers?|options?)|explore others)\?/gi,
];

function formatRm(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  return `RM ${numeric.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getQuoteSummary(quote) {
  if (!quote || typeof quote !== 'object') return null;
  const insurerName = quote.insurerName || quote.insurer?.displayName || quote.insurer || null;
  if (!insurerName) return null;

  return {
    insurerName,
    finalPremium: Number(quote.finalPremium ?? quote.priceAfter ?? quote.pricing?.finalPremium),
  };
}

function getQuoteSummariesFromState(state = {}) {
  const candidates = [];
  if (state?.selectedQuote) candidates.push(state.selectedQuote);

  try {
    candidates.push(...getQuotesFromState(state));
  } catch {
    // Quote-close quality should never break the main chat response.
  }

  return candidates.map(getQuoteSummary).filter(Boolean);
}

function getQuoteSummaryFromState(state = {}, insurerName = '') {
  const targetKeys = getInsurerKeysFromText(insurerName);
  if (targetKeys.length === 0) return null;

  return getQuoteSummariesFromState(state).find((quote) => {
    const quoteKeys = getInsurerKeysFromText(quote.insurerName);
    return quoteKeys.some((key) => targetKeys.includes(key));
  }) || null;
}

function getCheapestFromState(state = {}) {
  return getQuoteSummariesFromState(state)
    .filter((quote) => Number(quote?.finalPremium) > 0)
    .sort((a, b) => Number(a.finalPremium) - Number(b.finalPremium))[0] || null;
}

function formatQuoteChoiceLabel(summary) {
  if (!summary?.insurerName) return null;
  const premiumLabel = formatRm(summary.finalPremium);
  return premiumLabel ? `${summary.insurerName} - ${premiumLabel}` : summary.insurerName;
}

function getRecommendationFromContext(context = {}) {
  return getQuoteSummary(
    context?.productionTurnInstructions?.quoteRecommendation?.recommendedQuote ||
    context?.quoteRecommendation?.recommendedQuote
  );
}

function getCheapestFromContext(context = {}) {
  const recommendation = context?.productionTurnInstructions?.quoteRecommendation ||
    context?.quoteRecommendation ||
    null;
  const scoredQuotes = Array.isArray(recommendation?.scoredQuotes)
    ? recommendation.scoredQuotes
    : [];
  const cheapestScoredQuote = scoredQuotes
    .map(getQuoteSummary)
    .filter(Boolean)
    .filter((quote) => Number(quote?.finalPremium) > 0)
    .sort((a, b) => Number(a.finalPremium) - Number(b.finalPremium))[0];
  if (cheapestScoredQuote?.insurerName) return cheapestScoredQuote;

  const quoteSnapshot = Array.isArray(recommendation?.explainability?.quoteSnapshot)
    ? recommendation.explainability.quoteSnapshot
    : [];
  const cheapestSnapshotQuote = quoteSnapshot
    .map(getQuoteSummary)
    .filter(Boolean)
    .filter((quote) => Number(quote?.finalPremium) > 0)
    .sort((a, b) => Number(a.finalPremium) - Number(b.finalPremium))[0];
  return cheapestSnapshotQuote || null;
}

function parseExplicitRecommendationLabel(response = '') {
  const text = String(response || '').replace(/\*/g, '');
  const patterns = [
    /(?:here'?s\s+my\s+advice|my\s+advice)\s*:?\s*(?:go with\s+)?([^.\n]+)/i,
    /(?:my pick|recommendation|recommended insurer|best pick|best option)\s*:\s*([^.\n]+)/i,
    /(?:my recommendation is|i recommend|i would recommend|i'd recommend|go with)\s+([^.\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const keys = getInsurerKeysFromText(match[1] || '');
    if (keys.length === 1) return keys[0];
  }

  return null;
}

function latestUserMessageFromContext(context = {}) {
  const latest = [...(context.messages || [])]
    .reverse()
    .find((message) => message?.role === 'user')?.content;
  return String(context.latestMessage || context.message || latest || '');
}

function isSoftGoodRecommendationRequest(context = {}) {
  const latestUserMessage = latestUserMessageFromContext(context);
  return /\b(which (?:one )?(?:is )?good|which good|which insurer.{0,40}good|what(?:'s| is) good|good one)\b/i.test(latestUserMessage);
}

function isDirectAdviceClose({ context = {}, response = '' } = {}) {
  const latestUserMessage = latestUserMessageFromContext(context);
  return (
    /\b(?:what(?:'s| is)?\s+your\s+advice|your\s+advice|advise\s+me|what\s+do\s+you\s+advise)\b/i.test(latestUserMessage) ||
    /\b(?:here'?s\s+my\s+advice|my\s+advice)\s*:/i.test(String(response || ''))
  );
}

export function resolveQuoteStepRecommendedInsurerName({ state = {}, context = {}, response = '' } = {}) {
  const contextRecommendation = getRecommendationFromContext(context);
  if (contextRecommendation?.insurerName) return contextRecommendation.insurerName;

  const parsedFromResponse = parseExplicitRecommendationLabel(response) ||
    parseRecommendedInsurerFromAssistantMessage(response);
  if (parsedFromResponse) {
    return getInsurerByKey(parsedFromResponse)?.displayName || null;
  }

  if (state?.lastRecommendedInsurer) {
    return getInsurerByKey(state.lastRecommendedInsurer)?.displayName || null;
  }

  return null;
}

export function buildQuoteStepClosePrompt({ state = {}, context = {}, response = '' } = {}) {
  const recommendedName = resolveQuoteStepRecommendedInsurerName({ state, context, response });
  const contextRecommendation = getRecommendationFromContext(context);
  const stateRecommendation = getQuoteSummaryFromState(state, recommendedName);
  const cheapest = getCheapestFromContext(context) || getCheapestFromState(state);
  const recommendedLabel = formatQuoteChoiceLabel(
    contextRecommendation?.insurerName === recommendedName
      ? contextRecommendation
      : (stateRecommendation || { insurerName: recommendedName })
  );
  const cheapestLabel = formatQuoteChoiceLabel(cheapest);

  if (recommendedName) {
    if (isDirectAdviceClose({ context, response }) || isSoftGoodRecommendationRequest(context)) {
      return `Want me to select **${recommendedLabel || recommendedName}**, or compare with another insurer?`;
    }

    const cheapestChoice = cheapest?.insurerName && cheapest.insurerName !== recommendedName
      ? `, choose the cheapest option **${cheapestLabel}**`
      : '';
    return `Would you like to go with **${recommendedLabel || recommendedName}**${cheapestChoice}, or explore other insurers?`;
  }

  return `Would you like my recommendation, or do you want to choose one of these: ${AVAILABLE_INSURER_CHOICE_TEXT}?`;
}

export function containsStaleQuoteStepClose(response = '') {
  const text = String(response || '');
  return STALE_QUOTE_CLOSE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function replaceStaleQuoteStepClose(response = '', closePrompt = '') {
  let text = String(response || '');
  if (!closePrompt) return text;

  for (const pattern of STALE_QUOTE_CLOSE_PATTERNS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, closePrompt);
  }

  const closeIsSpecific = getInsurerKeysFromText(closePrompt).length > 0 &&
    /\b(?:go with|select|choose)\b/i.test(closePrompt) &&
    !/\bchoose one of these\b/i.test(closePrompt);
  if (parseExplicitRecommendationLabel(text) || closeIsSpecific) {
    for (const pattern of GENERIC_RECOMMENDATION_CLOSE_PATTERNS) {
      pattern.lastIndex = 0;
      text = text.replace(pattern, closePrompt);
    }
  }

  if (/^\s*Want me to select\b/i.test(closePrompt)) {
    for (const pattern of WEAK_DIRECT_ADVICE_CLOSE_PATTERNS) {
      pattern.lastIndex = 0;
      text = text.replace(pattern, closePrompt);
    }
  }

  return text;
}

export function hasQuoteStepSelectionClose(response = '') {
  const text = String(response || '').trim();
  if (!text || containsStaleQuoteStepClose(text)) return false;
  if (/\b(?:want|would you like|do you want)\b[^?]{0,80}\bgo with this\b/i.test(text)) return false;

  const questionSegments = text.match(/[^?]*\?/g) || [];
  const vagueCheapestMentions = questionSegments.flatMap((segment) => (
    [...segment.matchAll(/\bcheapest option\b([^?]{0,90})/gi)]
  ));
  if (vagueCheapestMentions.some((match) => getInsurerKeysFromText(match[1] || '').length === 0)) {
    return false;
  }

  const hasActionCue = /\?|(?:^|\s)(reply|please|choose|select|tell me|go with|lock in|proceed|confirm)(?:\s|$)/i.test(text);
  const hasQuoteDecisionCue =
    /\b(go with|choose|select|lock in|proceed|tell me (?:which|the) insurer|insurer name|which insurer|which option)\b/i.test(text) ||
    /\b(my recommendation|recommended insurer|recommended option|cheapest option|another insurer)\b/i.test(text) ||
    /\bcompare (?:one|a|another|more|specific)|\b(budget|claims|coverage)\b/i.test(text);

  return hasActionCue && hasQuoteDecisionCue;
}
