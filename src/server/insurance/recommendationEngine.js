import { getInsurerKeysFromText } from '../../lib/insurerCatalog.js';
import { CONVERSATION_MODES } from '../ai/orchestrator.js';
import {
  getApprovedPrivateCarFacts,
  inferFactTagsFromMessage,
} from './approvedFactStore.js';
import { getApprovedFactInsurerSlugForKey } from './insurerFactSlugs.js';

const BRAND_TAGS = new Set([
  'perodua',
  'myvi',
  'bezza',
  'axia',
  'alza',
  'ativa',
  'proton',
  'honda',
  'city',
  'civic',
  'subaru',
  'jetour',
]);

function formatRm(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 'RM 0';
  return `RM ${num.toLocaleString()}`;
}

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getQuoteApprovedFactInsurerSlug(quote) {
  return getApprovedFactInsurerSlugForKey(quote?.insurerKey);
}

function getVehicleContextText(state = {}) {
  const vehicle = state?.vehicleInfo || {};
  return [
    vehicle.make,
    vehicle.model,
    vehicle.variant,
    vehicle.description,
    vehicle.vehicleName,
    vehicle.year,
    vehicle.manufactureYear,
    vehicle.postcode,
  ].filter(Boolean).join(' ');
}

function getVehicleAge(state = {}) {
  const vehicle = state?.vehicleInfo || {};
  const year = Number(vehicle.year || vehicle.manufactureYear || vehicle.modelYear);
  if (!Number.isFinite(year) || year < 1980) return null;
  return new Date().getFullYear() - year;
}

function collectRecommendationTags(message, preferences = {}, state = {}) {
  const contextText = `${message || ''} ${getVehicleContextText(state)}`.trim();
  const tags = new Set(inferFactTagsFromMessage(contextText));
  const normalized = normalizeText(contextText);
  const vehicleAge = getVehicleAge(state);

  if (preferences.claimsFocused) {
    tags.add('claims');
    tags.add('roadside');
    tags.add('towing');
  }
  if (preferences.coverageFocused) {
    tags.add('special_perils');
    tags.add('sum_insured');
  }
  if (preferences.budgetFocused) {
    tags.add('budget');
  }
  if (vehicleAge !== null && vehicleAge >= 5) {
    tags.add('older_car');
    tags.add('betterment');
  }
  if (/\b(old|older|5\+|five years|repair cost|surprise cost|spare part|spare parts)\b/.test(normalized)) {
    tags.add('older_car');
    tags.add('betterment');
  }
  if (/\b(family|wife|husband|shared|many drivers|all drivers|unnamed driver|young driver|p licence|p-license)\b/.test(normalized)) {
    tags.add('all_drivers');
    tags.add('unnamed_driver');
    tags.add('excess');
  }
  if (/\b(basement|shah alam|klang|monsoon|park outside|outdoor parking)\b/.test(normalized)) {
    tags.add('flood');
    tags.add('special_perils');
  }

  return [...tags];
}

function normalizeQuote(quote) {
  if (!quote) return null;
  const insurerName = quote?.insurer?.displayName || quote?.insurer || 'Unknown insurer';
  const insurerId = quote?.insurer?.id || quote?.insurer?.key || insurerName;
  const finalPremium = Number(quote?.pricing?.finalPremium ?? quote?.priceAfter ?? quote?.price ?? 0);
  const basePremium = Number(quote?.pricing?.basePremium ?? quote?.priceBefore ?? finalPremium);
  const sumInsured = Number(quote?.sumInsured ?? quote?.insuredAmount ?? 0);
  const features = [
    ...(Array.isArray(quote?.benefits) ? quote.benefits : []),
    ...(Array.isArray(quote?.insurer?.features) ? quote.insurer.features : []),
  ].filter(Boolean).map(String);
  const insurerText = `${insurerName} ${insurerId} ${quote?.insurer?.type || ''} ${features.join(' ')}`;

  return {
    raw: quote,
    insurerName,
    insurerId,
    insurerKey: getInsurerKeysFromText(insurerText)[0] || null,
    insurerType: quote?.insurer?.type || null,
    finalPremium,
    basePremium,
    sumInsured,
    features,
  };
}

function scoreBoolean(value) {
  return value ? 1 : 0;
}

function buildPreferenceWeights(message, preferences = {}) {
  const text = normalizeText(message);
  const weights = {
    budget: preferences.budgetFocused ? 2.2 : 1.25,
    coverage: preferences.coverageFocused ? 2.0 : 1.0,
    claims: preferences.claimsFocused ? 1.8 : 0.85,
    facts: 0.35,
    value: 0.9,
    shariah: 0,
  };

  if (/\b(cheap|cheapest|budget|save|saving|lowest|affordable|value for money)\b/.test(text)) {
    weights.budget += 1.25;
  }
  if (/\b(max|maximum|higher|highest|coverage|cover|sum insured|protection)\b/.test(text)) {
    weights.coverage += 1.15;
  }
  if (/\b(claim|claims|support|service|towing|roadside|workshop|fast payout)\b/.test(text)) {
    weights.claims += 1.15;
    weights.facts += 1.05;
  }
  if (/\b(shariah|syariah|islamic|takaful|halal)\b/.test(text)) {
    weights.shariah = 2.8;
    weights.facts += 0.55;
  }
  if (/\b(betterment|zero betterment|old car|older car|spare parts?|repair cost|surprise cost)\b/.test(text)) {
    weights.facts += 1.8;
  }
  if (/\b(flood|special perils?|natural disaster|monsoon|landslide|storm)\b/.test(text)) {
    weights.facts += 1.45;
  }
  if (/\b(ev|electric|tesla|charger|charging|battery)\b/.test(text)) {
    weights.facts += 1.65;
  }
  if (/\b(e-?hailing|grab|private hire)\b/.test(text)) {
    weights.facts += 1.35;
  }
  if (/\b(perodua|myvi|bezza|axia|alza|ativa|proton|honda|city|civic|subaru|jetour)\b/.test(text)) {
    weights.facts += 1.25;
  }

  return weights;
}

function scoreClaimsSignals(quote) {
  const featureText = normalizeText(quote.features.join(' '));
  let score = 0;
  if (/\b(claim|claims|payout|workshop|network)\b/.test(featureText)) score += 0.34;
  if (/\b(towing|roadside|emergency|assistance)\b/.test(featureText)) score += 0.28;
  if (/\b(service|support|reliable|premium|established|international)\b/.test(featureText)) score += 0.22;
  return Math.min(1, score);
}

function normalizeRange(value, min, max, fallback = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (max <= min) return fallback;
  return (num - min) / (max - min);
}

function hasAnyTag(fact, tags) {
  return tags.some((tag) => fact.tags?.includes(tag));
}

function isPositiveBettermentFact(fact) {
  const text = normalizeText(`${fact.id} ${fact.statement} ${fact.advisorUse}`);
  return hasAnyTag(fact, ['zero_betterment', 'waiver_betterment', 'buyback', 'brand_new_parts', 'waiver']) ||
    /\b(zero betterment|waiver of betterment|waives? betterment|betterment buyback|brand[- ]?new[- ]?spare[- ]?parts?)\b/i.test(text);
}

function isBettermentRiskFact(fact) {
  const text = normalizeText(`${fact.statement} ${fact.advisorUse}`);
  return fact.category === 'betterment' &&
    /\b(applies betterment|betterment risk|increasing percentages|unless waiver)\b/i.test(text) &&
    !isPositiveBettermentFact(fact);
}

function isConditionalBenefitFact(fact) {
  const text = normalizeText(`${fact.statement} ${fact.advisorUse}`);
  return fact.tags?.includes('addon') ||
    /\b(if available|if present|if included|if selected|if the live quote|quote availability|available in the quote|optional|add-on|endorsement|top-up|selected product|product is)\b/i.test(text);
}

function isExactBrandProgramMatch(fact, desiredTags) {
  const tagSet = new Set(desiredTags);
  return fact.tags?.includes('brand_program') &&
    (fact.tags || []).some((tag) => tagSet.has(tag) && BRAND_TAGS.has(tag));
}

function formatFactReason(fact, desiredTags) {
  const tagSet = new Set(desiredTags);

  if (tagSet.has('betterment') || tagSet.has('older_car')) {
    if (isPositiveBettermentFact(fact)) return `${fact.insurerName} has approved betterment-related support`;
  }
  if (tagSet.has('flood') || tagSet.has('special_perils')) {
    if (hasAnyTag(fact, ['flood', 'special_perils', 'flood_allowance', 'natural_disaster'])) {
      return `${fact.insurerName} has approved flood/special-perils support`;
    }
  }
  if (tagSet.has('ev') || tagSet.has('tesla') || tagSet.has('charger')) {
    if (hasAnyTag(fact, ['ev', 'tesla', 'charger', 'portable_charger', 'charging_cable'])) {
      return fact.tags?.includes('tesla')
        ? `${fact.insurerName} has approved Tesla-specific support`
        : `${fact.insurerName} has approved EV-related support`;
    }
  }
  if (tagSet.has('roadside') || tagSet.has('towing') || tagSet.has('long_distance')) {
    if (hasAnyTag(fact, ['unlimited_towing', 'roadside', 'towing', '200km', 'breakdown'])) {
      return `${fact.insurerName} has approved roadside/towing support`;
    }
  }
  if (tagSet.has('low_mileage') || tagSet.has('usage_based')) {
    if (hasAnyTag(fact, ['low_mileage', 'usage_based', 'cashback', 'pay_as_you_drive', 'ez_mile'])) {
      return `${fact.insurerName} has approved low-mileage/value support`;
    }
  }
  if ([...tagSet].some((tag) => BRAND_TAGS.has(tag)) && fact.tags?.includes('brand_program')) {
    return `${fact.insurerName} has an approved brand-program suitability fact`;
  }
  if (tagSet.has('takaful') || tagSet.has('shariah') || tagSet.has('islamic')) {
    if (fact.tags?.includes('takaful')) return `${fact.insurerName} matches the user's takaful preference`;
  }

  return fact.advisorUse || fact.statement;
}

function scoreApprovedFact(fact, desiredTags) {
  if (!fact || fact.insurerSlug === 'market') return { score: 0, reason: null, riskNote: null };

  const tagSet = new Set(desiredTags);
  const matches = (fact.tags || []).filter((tag) => tagSet.has(tag));
  let score = Math.min(0.55, matches.length * 0.16);
  let riskNote = null;

  if ((tagSet.has('betterment') || tagSet.has('older_car')) && fact.category === 'betterment') {
    if (isPositiveBettermentFact(fact)) {
      score += 0.75;
    } else if (isBettermentRiskFact(fact)) {
      score = Math.min(score, 0.06);
      riskNote = `${fact.insurerName} has betterment wording that should be explained before recommending it for older cars.`;
    }
  }
  if ((tagSet.has('flood') || tagSet.has('special_perils')) && hasAnyTag(fact, ['flood', 'special_perils', 'flood_allowance', 'natural_disaster', 'full_cover'])) {
    score += 0.42;
  }
  if ((tagSet.has('roadside') || tagSet.has('towing') || tagSet.has('long_distance')) && hasAnyTag(fact, ['unlimited_towing', 'roadside', 'towing', '200km', 'breakdown'])) {
    score += fact.tags?.includes('unlimited_towing') ? 0.66 : 0.42;
  }
  if ((tagSet.has('ev') || tagSet.has('tesla') || tagSet.has('charger')) && hasAnyTag(fact, ['ev', 'tesla', 'charger', 'portable_charger', 'charging_cable'])) {
    score += fact.tags?.includes('tesla') ? 0.82 : 0.52;
    if (tagSet.has('tesla') && fact.tags?.includes('tesla')) score += 0.55;
  }
  if ((tagSet.has('low_mileage') || tagSet.has('usage_based') || tagSet.has('budget')) && hasAnyTag(fact, ['low_mileage', 'usage_based', 'cashback', 'pay_as_you_drive', 'ez_mile'])) {
    score += 0.48;
  }
  if ((tagSet.has('e_hailing') || tagSet.has('private_hire') || tagSet.has('grab')) && hasAnyTag(fact, ['e_hailing', 'private_hire', 'endorsement'])) {
    score += 0.55;
  }
  if ([...tagSet].some((tag) => BRAND_TAGS.has(tag)) && fact.tags?.includes('brand_program')) {
    score += 0.68;
    if ((fact.tags || []).some((tag) => tagSet.has(tag) && BRAND_TAGS.has(tag))) score += 0.28;
  }
  if ((tagSet.has('takaful') || tagSet.has('shariah') || tagSet.has('islamic')) && fact.tags?.includes('takaful')) {
    score += 0.45;
  }
  if (fact.confidence === 'high') score += 0.06;
  if (fact.confidence === 'medium') score += 0.02;

  if (fact.tags?.includes('brand_program') && !isExactBrandProgramMatch(fact, desiredTags)) {
    score *= 0.25;
  }
  if (isConditionalBenefitFact(fact) && !isExactBrandProgramMatch(fact, desiredTags)) {
    score *= 0.58;
  }

  const clamped = Math.max(0, Math.min(2, score));
  return {
    score: clamped,
    reason: clamped >= 0.35 ? formatFactReason(fact, desiredTags) : null,
    riskNote,
  };
}

function dedupeApprovedFacts(facts = []) {
  const seen = new Set();
  return facts.filter((fact) => {
    const key = fact?.id || `${fact?.insurerSlug}|${fact?.statement}|${fact?.sourceRelativePath}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFactSignals(quote, desiredTags, extraApprovedFacts = []) {
  const insurerSlug = getQuoteApprovedFactInsurerSlug(quote);
  if (!insurerSlug || desiredTags.length === 0) {
    return { score: 0, reasons: [], facts: [], riskNotes: [] };
  }

  const staticFacts = getApprovedPrivateCarFacts({
    insurerSlug,
    tags: desiredTags,
    limit: 14,
  }).filter((fact) => fact.insurerSlug === insurerSlug);
  const databaseFacts = (Array.isArray(extraApprovedFacts) ? extraApprovedFacts : [])
    .filter((fact) => fact?.approvedForAi)
    .filter((fact) => fact.insurerSlug === insurerSlug)
    .filter((fact) => desiredTags.some((tag) => fact.tags?.includes(tag)));
  const facts = dedupeApprovedFacts([...databaseFacts, ...staticFacts]);

  const scoredFacts = facts
    .map((fact) => ({ fact, ...scoreApprovedFact(fact, desiredTags) }))
    .filter((entry) => entry.score > 0 || entry.riskNote)
    .sort((a, b) => b.score - a.score);

  const score = Math.min(2, scoredFacts.slice(0, 3).reduce((sum, entry) => sum + entry.score, 0));
  const reasons = [...new Set(scoredFacts.map((entry) => entry.reason).filter(Boolean))].slice(0, 3);
  const riskNotes = [...new Set(scoredFacts.map((entry) => entry.riskNote).filter(Boolean))].slice(0, 2);

  return {
    score,
    reasons,
    riskNotes,
    facts: scoredFacts.slice(0, 5).map((entry) => entry.fact),
  };
}

function buildReasonBundle(quote, scores, weights, allQuotes, factSignals = {}) {
  const reasons = [];
  const sortedByPrice = [...allQuotes].sort((a, b) => a.finalPremium - b.finalPremium);
  const sortedByCoverage = [...allQuotes].sort((a, b) => b.sumInsured - a.sumInsured);

  if (quote.insurerId === sortedByPrice[0]?.insurerId) {
    reasons.push(`lowest premium in the current quote set at ${formatRm(quote.finalPremium)}`);
  }
  if (quote.insurerId === sortedByCoverage[0]?.insurerId) {
    reasons.push(`highest sum insured in the current quote set at ${formatRm(quote.sumInsured)}`);
  }
  if (weights.claims > 1.2 && scores.claims >= 0.28) {
    reasons.push('current quote features point to stronger service or claims comfort');
  }
  if (weights.shariah > 0 && (quote.insurerType === 'takaful' || /takaful|ikhlas/i.test(quote.insurerName))) {
    reasons.push('matches the user preference for a takaful / Shariah-compliant option');
  }
  for (const reason of factSignals.reasons || []) {
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  if (reasons.length === 0) {
    reasons.push('best balance of premium and sum insured from the current quote set');
  }

  const cheapest = sortedByPrice[0];
  const highestCover = sortedByCoverage[0];
  let tradeoff = 'It is a balanced pick, but the user should still confirm if price, claims comfort, or higher sum insured matters most.';
  if (quote.insurerId !== cheapest?.insurerId) {
    tradeoff = `${cheapest.insurerName} is cheaper at ${formatRm(cheapest.finalPremium)}, so mention the price tradeoff.`;
  } else if (quote.insurerId !== highestCover?.insurerId) {
    tradeoff = `${highestCover.insurerName} has higher sum insured at ${formatRm(highestCover.sumInsured)}, so mention the coverage tradeoff.`;
  }

  return { reasons, tradeoff };
}

export function buildQuoteRecommendation({
  quotes = [],
  state = {},
  userPreferences = null,
  message = '',
  extraApprovedFacts = [],
} = {}) {
  const normalizedQuotes = (Array.isArray(quotes) ? quotes : [])
    .map(normalizeQuote)
    .filter((quote) => quote && quote.finalPremium > 0);

  if (normalizedQuotes.length === 0) {
    return {
      recommendedQuote: null,
      reasons: [],
      tradeoff: null,
      confidence: 0,
      question: 'I need the vehicle quote options first before I can recommend an insurer.',
    };
  }

  const preferences = userPreferences || state?.userPreferences || {};
  const weights = buildPreferenceWeights(message, preferences);
  const recommendationTags = collectRecommendationTags(message, preferences, state);
  const prices = normalizedQuotes.map((quote) => quote.finalPremium);
  const sums = normalizedQuotes.map((quote) => quote.sumInsured);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minSum = Math.min(...sums);
  const maxSum = Math.max(...sums);
  const explicitlyBudgetFocused = preferences.budgetFocused ||
    /\b(cheap|cheapest|budget|save|saving|lowest|affordable|value for money)\b/i.test(String(message || ''));

  const scored = normalizedQuotes.map((quote) => {
    const budget = 1 - normalizeRange(quote.finalPremium, minPrice, maxPrice);
    const coverage = normalizeRange(quote.sumInsured, minSum, maxSum);
    const value = quote.finalPremium > 0 ? normalizeRange(quote.sumInsured / quote.finalPremium, Math.min(...normalizedQuotes.map((q) => q.sumInsured / q.finalPremium)), Math.max(...normalizedQuotes.map((q) => q.sumInsured / q.finalPremium))) : 0;
    const claims = scoreClaimsSignals(quote);
    const shariah = scoreBoolean(quote.insurerType === 'takaful' || /takaful|ikhlas/i.test(quote.insurerName));
    const factSignals = buildFactSignals(quote, recommendationTags, extraApprovedFacts);
    const facts = factSignals.score;
    const cheapestBonus = explicitlyBudgetFocused && quote.finalPremium === minPrice ? 0.9 : 0;
    const total =
      budget * weights.budget +
      coverage * weights.coverage +
      claims * weights.claims +
      facts * weights.facts +
      value * weights.value +
      shariah * weights.shariah +
      cheapestBonus;

    return {
      quote,
      scores: { budget, coverage, claims, facts, value, shariah, total },
      factSignals,
    };
  }).sort((a, b) => b.scores.total - a.scores.total);

  const winner = scored[0];
  const { reasons, tradeoff } = buildReasonBundle(winner.quote, winner.scores, weights, normalizedQuotes, winner.factSignals);

  return {
    recommendedQuote: winner.quote,
    alternatives: scored.slice(1, 4).map((entry) => entry.quote),
    scoredQuotes: scored.map((entry) => ({
      insurerName: entry.quote.insurerName,
      insurerKey: entry.quote.insurerKey,
      finalPremium: entry.quote.finalPremium,
      sumInsured: entry.quote.sumInsured,
      scores: entry.scores,
      factReasons: entry.factSignals.reasons,
      riskNotes: entry.factSignals.riskNotes,
    })),
    scores: winner.scores,
    reasons,
    factReasons: winner.factSignals.reasons,
    riskNotes: winner.factSignals.riskNotes,
    recommendationTags,
    tradeoff,
    confidence: normalizedQuotes.length >= 2 ? (winner.scores.facts > 0.6 ? 0.84 : 0.78) : 0.62,
    priceLabel: formatRm(winner.quote.finalPremium),
    sumInsuredLabel: formatRm(winner.quote.sumInsured),
    question: 'Want to go with this, or do you want to compare another insurer?',
  };
}

function shouldGiveRecommendation(decision, message) {
  const text = normalizeText(message);
  if (decision?.mode === CONVERSATION_MODES.QUOTE_COMPARISON) return true;
  return /\b(recommend|recommendation|which should|which one|best|better|choose for me|what do you think|your pick)\b/.test(text);
}

export function buildQuoteRecommendationInstruction(decision, context = {}) {
  const recommendation = context.quoteRecommendation;
  const quote = recommendation?.recommendedQuote;
  if (!quote || !shouldGiveRecommendation(decision, context.message || '')) return null;

  const alternatives = Array.isArray(recommendation.alternatives)
    ? recommendation.alternatives.slice(0, 2).map((alt) => `${alt.insurerName} (${formatRm(alt.finalPremium)}, sum insured ${formatRm(alt.sumInsured)})`)
    : [];
  const factReasons = Array.isArray(recommendation.factReasons) && recommendation.factReasons.length > 0
    ? recommendation.factReasons.join('; ')
    : null;
  const riskNotes = Array.isArray(recommendation.riskNotes) && recommendation.riskNotes.length > 0
    ? recommendation.riskNotes.join('; ')
    : null;
  const tags = Array.isArray(recommendation.recommendationTags) && recommendation.recommendationTags.length > 0
    ? recommendation.recommendationTags.join(', ')
    : null;

  return `QUOTE RECOMMENDATION ENGINE
If the user asks LAJOO to recommend, use this structured recommendation:
- Recommended insurer: ${quote.insurerName}
- Premium: ${formatRm(quote.finalPremium)}
- Sum insured: ${formatRm(quote.sumInsured)}
- Detected user need tags: ${tags || 'general quote recommendation'}
- Reasons: ${recommendation.reasons.join('; ')}
${factReasons ? `- Approved fact-backed reasons: ${factReasons}` : '- Approved fact-backed reasons: none specific for this user need; rely on current quote price/sum insured and avoid policy claims.'}
${riskNotes ? `- Caution notes: ${riskNotes}` : ''}
- Honest tradeoff: ${recommendation.tradeoff}
${alternatives.length > 0 ? `- Nearby alternatives: ${alternatives.join(' | ')}` : ''}

Response rules:
- Say "I recommend ${quote.insurerName}" so the system can remember the recommendation.
- Give one clear reason and one tradeoff.
- Use approved fact-backed reasons only as written above. Do not expand them into extra benefits, limits, or eligibility promises.
- Do not show the full quote list again unless the user asks.
- Do not invent insurer policy facts. Current quote features are helpful context, not final policy promises.
- End with: "Want to go with this?" or one equally clear close question.`;
}

export default buildQuoteRecommendation;
