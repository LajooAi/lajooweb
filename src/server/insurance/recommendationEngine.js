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
export const RECOMMENDATION_SCORE_VERSION = 'quote_recommendation_v2';
const CLOSE_SCORE_GAP_THRESHOLD = 0.35;
const CLOSE_PRICE_DELTA_RM = 10;
const CLOSE_PRICE_DELTA_RATIO = 0.015;

function formatRm(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 'RM 0.00';
  return `RM ${num.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function roundScore(value, digits = 4) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(digits));
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

function collectPreferenceSignals(message, preferences = {}, state = {}, recommendationTags = []) {
  const text = normalizeText(message);
  const signals = [];

  const push = (code, label, source = 'message') => {
    if (signals.some((signal) => signal.code === code)) return;
    signals.push({ code, label, source });
  };

  if (preferences.budgetFocused) push('memory_budget_focused', 'User has shown price sensitivity before', 'conversation_memory');
  if (preferences.claimsFocused) push('memory_claims_focused', 'User has shown claims/support concern before', 'conversation_memory');
  if (preferences.coverageFocused) push('memory_coverage_focused', 'User has shown higher coverage preference before', 'conversation_memory');
  if (preferences.concisePreferred === true) push('memory_prefers_concise', 'User prefers concise answers', 'conversation_memory');

  if (/\b(cheap|cheapest|budget|save|saving|lowest|affordable|value for money)\b/.test(text)) {
    push('message_budget_focused', 'User asked for budget or lowest price');
  }
  if (/\b(max|maximum|higher|highest|coverage|cover|sum insured|protection)\b/.test(text)) {
    push('message_coverage_focused', 'User asked for higher coverage or sum insured');
  }
  if (/\b(claim|claims|support|service|towing|roadside|workshop|fast payout)\b/.test(text)) {
    push('message_claims_focused', 'User asked about claims or support');
  }
  if (/\b(shariah|syariah|islamic|takaful|halal)\b/.test(text)) {
    push('message_shariah_focused', 'User asked for takaful or Shariah preference');
  }

  const tagSet = new Set(recommendationTags);
  if (tagSet.has('older_car') || tagSet.has('betterment')) {
    push('context_older_car_or_betterment', 'Vehicle/user context suggests older-car or betterment concern', 'vehicle_or_question_context');
  }
  if (tagSet.has('flood') || tagSet.has('special_perils')) {
    push('context_flood_or_special_perils', 'Location or question suggests flood/special-perils relevance', 'vehicle_or_question_context');
  }
  if (tagSet.has('ev') || tagSet.has('tesla') || tagSet.has('charger')) {
    push('context_ev', 'Question suggests EV/Tesla/charger relevance', 'question_context');
  }
  if ([...tagSet].some((tag) => BRAND_TAGS.has(tag))) {
    push('context_vehicle_brand', 'Vehicle brand/model context is relevant', 'vehicle_context');
  }

  if (signals.length === 0) {
    push('general_best_request', 'No explicit priority detected, so use balanced recommendation', 'default');
  }

  return signals;
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

function isBrandProgramFact(fact) {
  return fact?.tags?.includes('brand_program') || fact?.category === 'brand_program';
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
    return `${fact.insurerName} has brand-program eligibility context to verify`;
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
  if ([...tagSet].some((tag) => BRAND_TAGS.has(tag)) && isBrandProgramFact(fact)) {
    score += 0.16;
    if ((fact.tags || []).some((tag) => tagSet.has(tag) && BRAND_TAGS.has(tag))) score += 0.08;
    riskNote = `${fact.insurerName} has brand-program evidence, but eligibility must be verified in the live quote/product before using it as the main recommendation reason.`;
  }
  if ((tagSet.has('takaful') || tagSet.has('shariah') || tagSet.has('islamic')) && fact.tags?.includes('takaful')) {
    score += 0.45;
  }
  if (fact.confidence === 'high') score += 0.06;
  if (fact.confidence === 'medium') score += 0.02;

  if (isBrandProgramFact(fact) && !isExactBrandProgramMatch(fact, desiredTags)) {
    score *= 0.25;
  }
  if (isBrandProgramFact(fact) && isExactBrandProgramMatch(fact, desiredTags)) {
    score = Math.min(score, 0.42);
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
    const priceDelta = quote.finalPremium - cheapest.finalPremium;
    const sumDelta = quote.sumInsured - cheapest.sumInsured;
    const closePrice = priceDelta > 0 && (
      priceDelta <= CLOSE_PRICE_DELTA_RM ||
      priceDelta / Math.max(1, cheapest.finalPremium) <= CLOSE_PRICE_DELTA_RATIO
    );
    const extraCover = sumDelta > 0 ? ` while this gives ${formatRm(sumDelta)} higher sum insured` : '';
    tradeoff = closePrice
      ? `${cheapest.insurerName} is only ${formatRm(priceDelta)} cheaper${extraCover}, so this is a close call if lowest price matters.`
      : `${cheapest.insurerName} is cheaper at ${formatRm(cheapest.finalPremium)}.`;
  } else if (quote.insurerId !== highestCover?.insurerId) {
    tradeoff = `${highestCover.insurerName} has higher sum insured at ${formatRm(highestCover.sumInsured)}.`;
  }

  return { reasons, tradeoff };
}

function rankMap(quotes, selector, direction = 'desc') {
  return Object.fromEntries(
    quotes
      .slice()
      .sort((a, b) => {
        const diff = Number(selector(direction === 'asc' ? a : b)) - Number(selector(direction === 'asc' ? b : a));
        if (diff !== 0) return diff;
        return a.insurerName.localeCompare(b.insurerName);
      })
      .map((quote, index) => [quote.insurerId, index + 1])
  );
}

function buildReasonDetails({
  winner,
  runnerUp,
  cheapest,
  highestCover,
  highestValue,
  scores,
  weights,
  factSignals,
  preferenceSignals,
}) {
  const reasonDetails = [];
  const push = (code, label, detail, evidence = {}) => {
    if (reasonDetails.some((reason) => reason.code === code)) return;
    reasonDetails.push({ code, label, detail, evidence });
  };

  if (winner.insurerId === cheapest?.insurerId) {
    push('lowest_premium', 'Lowest premium', `${winner.insurerName} has the lowest premium at ${formatRm(winner.finalPremium)}.`, {
      finalPremium: winner.finalPremium,
    });
  }

  if (winner.insurerId === highestCover?.insurerId) {
    push('highest_sum_insured', 'Highest sum insured', `${winner.insurerName} has the highest sum insured at ${formatRm(winner.sumInsured)}.`, {
      sumInsured: winner.sumInsured,
    });
  }

  if (winner.insurerId === highestValue?.insurerId) {
    push('value_score_leader', 'Best value score', `${winner.insurerName} gives the strongest sum-insured-per-ringgit value in this quote set.`, {
      valueScore: roundScore(scores.value),
    });
  }

  if (winner.insurerId !== cheapest?.insurerId && cheapest) {
    const premiumDelta = winner.finalPremium - cheapest.finalPremium;
    const sumInsuredDelta = winner.sumInsured - cheapest.sumInsured;
    if (premiumDelta > 0 && premiumDelta <= CLOSE_PRICE_DELTA_RM && sumInsuredDelta > 0) {
      push(
        'near_cheapest_with_higher_sum_insured',
        'Near-cheapest with more cover',
        `${winner.insurerName} is ${formatRm(premiumDelta)} above the cheapest quote and gives ${formatRm(sumInsuredDelta)} higher sum insured.`,
        { premiumDelta, sumInsuredDelta, cheapestInsurer: cheapest.insurerName }
      );
    }
  }

  if (weights.claims > 1.2 && scores.claims >= 0.28) {
    push('claims_signal_match', 'Claims/service signal match', `${winner.insurerName} has current quote features aligned to claims or service comfort.`, {
      claimsScore: roundScore(scores.claims),
    });
  }

  if (weights.shariah > 0 && (winner.insurerType === 'takaful' || /takaful|ikhlas/i.test(winner.insurerName))) {
    push('shariah_preference_match', 'Takaful preference match', `${winner.insurerName} matches the takaful/Shariah preference.`, {
      shariahScore: roundScore(scores.shariah),
    });
  }

  for (const reason of factSignals.reasons || []) {
    push('approved_fact_match', 'Approved fact match', reason, {
      factsScore: roundScore(scores.facts),
    });
  }

  if (preferenceSignals.some((signal) => signal.code === 'general_best_request')) {
    push('balanced_default', 'Balanced default', 'No explicit priority was detected, so LAJOO balanced premium, sum insured, value, and verified facts.', {
      totalScore: roundScore(scores.total),
    });
  }

  if (runnerUp) {
    push('runner_up_checked', 'Runner-up checked', `${runnerUp.quote.insurerName} was the nearest scored alternative.`, {
      runnerUpInsurer: runnerUp.quote.insurerName,
      scoreGap: roundScore(scores.total - runnerUp.scores.total),
    });
  }

  return reasonDetails.slice(0, 8);
}

function buildQuoteSnapshot(scored, normalizedQuotes) {
  const priceRanks = rankMap(normalizedQuotes, (quote) => quote.finalPremium, 'asc');
  const coverageRanks = rankMap(normalizedQuotes, (quote) => quote.sumInsured, 'desc');
  const valueRanks = rankMap(normalizedQuotes, (quote) => quote.finalPremium > 0 ? quote.sumInsured / quote.finalPremium : 0, 'desc');

  return scored.map((entry) => ({
    insurerName: entry.quote.insurerName,
    insurerKey: entry.quote.insurerKey,
    finalPremium: entry.quote.finalPremium,
    sumInsured: entry.quote.sumInsured,
    priceRank: priceRanks[entry.quote.insurerId] || null,
    coverageRank: coverageRanks[entry.quote.insurerId] || null,
    valueRank: valueRanks[entry.quote.insurerId] || null,
    totalScore: roundScore(entry.scores.total),
  }));
}

function buildRecommendationExplainability({
  scored,
  normalizedQuotes,
  weights,
  preferences,
  preferenceSignals,
  recommendationTags,
  reasons,
  tradeoff,
}) {
  const winner = scored[0];
  const runnerUp = scored[1] || null;
  const sortedByPrice = [...normalizedQuotes].sort((a, b) => a.finalPremium - b.finalPremium);
  const sortedByCoverage = [...normalizedQuotes].sort((a, b) => b.sumInsured - a.sumInsured);
  const sortedByValue = [...normalizedQuotes].sort((a, b) =>
    (b.finalPremium > 0 ? b.sumInsured / b.finalPremium : 0) -
    (a.finalPremium > 0 ? a.sumInsured / a.finalPremium : 0)
  );
  const cheapest = sortedByPrice[0] || null;
  const highestCover = sortedByCoverage[0] || null;
  const highestValue = sortedByValue[0] || null;
  const scoreGap = runnerUp ? winner.scores.total - runnerUp.scores.total : null;
  const premiumDeltaToCheapest = cheapest ? winner.quote.finalPremium - cheapest.finalPremium : null;
  const sumInsuredDeltaToCheapest = cheapest ? winner.quote.sumInsured - cheapest.sumInsured : null;
  const priceCloseToCheapest = cheapest && winner.quote.insurerId !== cheapest.insurerId && premiumDeltaToCheapest > 0 && (
    premiumDeltaToCheapest <= CLOSE_PRICE_DELTA_RM ||
    premiumDeltaToCheapest / Math.max(1, cheapest.finalPremium) <= CLOSE_PRICE_DELTA_RATIO
  );
  const isCloseCall = Boolean(
    (scoreGap !== null && scoreGap <= CLOSE_SCORE_GAP_THRESHOLD) ||
    (priceCloseToCheapest && sumInsuredDeltaToCheapest >= 0)
  );
  const confidenceLabel = isCloseCall
    ? 'medium_close_call'
    : (winner.scores.facts > 0.6 || (scoreGap !== null && scoreGap > 0.65) ? 'high' : 'medium');
  const reasonDetails = buildReasonDetails({
    winner: winner.quote,
    runnerUp,
    cheapest,
    highestCover,
    highestValue,
    scores: winner.scores,
    weights,
    factSignals: winner.factSignals,
    preferenceSignals,
  });

  return {
    scoreVersion: RECOMMENDATION_SCORE_VERSION,
    confidenceLabel,
    isCloseCall,
    scoreGap: scoreGap === null ? null : roundScore(scoreGap),
    recommendedInsurer: winner.quote.insurerName,
    runnerUpInsurer: runnerUp?.quote?.insurerName || null,
    reasonCodes: reasonDetails.map((reason) => reason.code),
    reasonDetails,
    preferenceSignals,
    recommendationTags,
    primaryReasons: reasons,
    tradeoff,
    weights: Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, roundScore(value)])),
    winningScores: Object.fromEntries(Object.entries(winner.scores).map(([key, value]) => [key, roundScore(value)])),
    closeCall: {
      nearestAlternative: runnerUp?.quote?.insurerName || null,
      cheapestAlternative: cheapest?.insurerName || null,
      premiumDeltaToCheapest,
      sumInsuredDeltaToCheapest,
    },
    quoteSnapshot: buildQuoteSnapshot(scored, normalizedQuotes),
    governance: {
      basis: 'user_fit_live_quote_verified_facts',
      paidPlacementApplied: false,
      commissionWeightApplied: false,
      commercialOverrideApplied: false,
      disclosure: 'Recommendation is based on quote economics, user/context fit, and approved facts available to LAJOO.',
    },
    preferenceState: {
      budgetFocused: Boolean(preferences.budgetFocused),
      claimsFocused: Boolean(preferences.claimsFocused),
      coverageFocused: Boolean(preferences.coverageFocused),
      concisePreferred: preferences.concisePreferred === true ? true : (preferences.concisePreferred === false ? false : null),
    },
  };
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
  const preferenceSignals = collectPreferenceSignals(message, preferences, state, recommendationTags);
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
  const explainability = buildRecommendationExplainability({
    scored,
    normalizedQuotes,
    weights,
    preferences,
    preferenceSignals,
    recommendationTags,
    reasons,
    tradeoff,
  });
  const cheapestQuote = normalizedQuotes
    .slice()
    .sort((a, b) => a.finalPremium - b.finalPremium)[0] || null;
  const softGoodQuestion = isSoftGoodRecommendationRequest(message);
  const cheapestQuestionChoice = !softGoodQuestion && cheapestQuote && cheapestQuote.insurerKey !== winner.quote.insurerKey
    ? `, choose the cheapest option ${cheapestQuote.insurerName} - ${formatRm(cheapestQuote.finalPremium)}`
    : '';
  const question = softGoodQuestion
    ? `Want me to select ${winner.quote.insurerName} - ${formatRm(winner.quote.finalPremium)}, or compare with another insurer?`
    : `Want to go with ${winner.quote.insurerName} - ${formatRm(winner.quote.finalPremium)}${cheapestQuestionChoice}, or explore other insurers?`;

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
    preferenceSignals,
    tradeoff,
    explainability,
    confidenceLabel: explainability.confidenceLabel,
    isCloseCall: explainability.isCloseCall,
    scoreVersion: explainability.scoreVersion,
    reasonCodes: explainability.reasonCodes,
    confidence: normalizedQuotes.length >= 2
      ? (explainability.isCloseCall ? 0.72 : (winner.scores.facts > 0.6 ? 0.84 : 0.78))
      : 0.62,
    priceLabel: formatRm(winner.quote.finalPremium),
    sumInsuredLabel: formatRm(winner.quote.sumInsured),
    question,
  };
}

function shouldGiveRecommendation(decision, message) {
  const text = normalizeText(message);
  if (decision?.mode === CONVERSATION_MODES.QUOTE_COMPARISON) return true;
  return /\b(recommend|recommendation|which should|which one|which is good|which good|which insurer.{0,40}good|good one|best|better|choose for me|what do you think|your pick)\b/.test(text);
}

function isSoftGoodRecommendationRequest(message) {
  const text = normalizeText(message);
  return /\b(which (?:one )?(?:is )?good|which good|which insurer.{0,40}good|what(?:'s| is) good|good one)\b/.test(text);
}

export function buildQuoteRecommendationInstruction(decision, context = {}) {
  const recommendation = context.quoteRecommendation;
  const quote = recommendation?.recommendedQuote;
  if (!quote || !shouldGiveRecommendation(decision, context.message || '')) return null;

  const alternatives = Array.isArray(recommendation.alternatives)
    ? recommendation.alternatives.slice(0, 2).map((alt) => `${alt.insurerName} (${formatRm(alt.finalPremium)}, sum insured ${formatRm(alt.sumInsured)})`)
    : [];
  const cheapestQuote = Array.isArray(recommendation.scoredQuotes)
    ? recommendation.scoredQuotes
      .filter((scoredQuote) => Number(scoredQuote?.finalPremium) > 0)
      .slice()
      .sort((a, b) => Number(a.finalPremium) - Number(b.finalPremium))[0]
    : null;
  const cheapestQuestionChoice = cheapestQuote?.insurerName && cheapestQuote.insurerName !== quote.insurerName
    ? `, choose the cheapest option ${cheapestQuote.insurerName} - ${formatRm(cheapestQuote.finalPremium)}`
    : '';
  const softGoodQuestion = isSoftGoodRecommendationRequest(context.message || '');
  const nextQuestionExample = softGoodQuestion
    ? `Want me to select ${quote.insurerName} - ${formatRm(quote.finalPremium)}, or compare with another insurer?`
    : `Want to go with ${quote.insurerName} - ${formatRm(quote.finalPremium)}${cheapestQuestionChoice}, or explore others?`;
  const factReasons = Array.isArray(recommendation.factReasons) && recommendation.factReasons.length > 0
    ? recommendation.factReasons.join('; ')
    : null;
  const riskNotes = Array.isArray(recommendation.riskNotes) && recommendation.riskNotes.length > 0
    ? recommendation.riskNotes.join('; ')
    : null;
  const tags = Array.isArray(recommendation.recommendationTags) && recommendation.recommendationTags.length > 0
    ? recommendation.recommendationTags.join(', ')
    : null;
  const reasonCodes = Array.isArray(recommendation.reasonCodes) && recommendation.reasonCodes.length > 0
    ? recommendation.reasonCodes.join(', ')
    : null;
  const closeCallLine = recommendation.isCloseCall
    ? `- Close-call guidance: This recommendation is a close call. State the winner confidently, but mention the nearest/cheapest alternative clearly instead of overselling certainty.`
    : `- Confidence: ${recommendation.confidenceLabel || 'medium'} under ${recommendation.scoreVersion || RECOMMENDATION_SCORE_VERSION}.`;

  return `QUOTE RECOMMENDATION ENGINE
If the user asks LAJOO to recommend, use this structured recommendation:
- Recommended insurer: ${quote.insurerName}
- Premium: ${formatRm(quote.finalPremium)}
- Sum insured: ${formatRm(quote.sumInsured)}
- Detected user need tags: ${tags || 'general quote recommendation'}
- Recommendation score version: ${recommendation.scoreVersion || RECOMMENDATION_SCORE_VERSION}
- Reason codes: ${reasonCodes || 'balanced_default'}
- Reasons: ${recommendation.reasons.join('; ')}
${factReasons ? `- Approved fact-backed reasons: ${factReasons}` : '- Approved fact-backed reasons: none specific for this user need; rely on current quote price/sum insured and avoid policy claims.'}
${riskNotes ? `- Caution notes: ${riskNotes}` : ''}
- Honest tradeoff: ${recommendation.tradeoff}
${closeCallLine}
${alternatives.length > 0 ? `- Nearby alternatives: ${alternatives.join(' | ')}` : ''}

Response rules:
- Use this exact visible structure for quote recommendation/comparison replies:
  **My pick:** **${quote.insurerName}** — **${formatRm(quote.finalPremium)}**

  **Why:** One clear reason using the quote price, sum insured, or approved fact-backed reason.

  **Trade-off:** One honest tradeoff versus the cheapest, highest-sum-insured, or closest alternative.

  **Next:** One clear choice question that names the options with premiums, such as "${nextQuestionExample}"
- Bold insurer names, final premiums, sum insured amounts, and important decision words.
- If the user only asks which insurer is "good", keep the close focused on the recommended insurer and comparison. Do not introduce the cheapest insurer as a second suggested path unless it was already explained as the trade-off.
- Keep this structure only for quote recommendation/comparison moments. Do not force it onto normal insurance explanations.
- Include the exact insurer name "${quote.insurerName}" in the My pick line so the system can remember the recommendation.
- Use approved fact-backed reasons only as written above. Do not expand them into extra benefits, limits, or eligibility promises.
- Brand-program reasons are eligibility context only. Do not make them the main reason unless the live quote/product confirms that exact programme; phrase them as "may be relevant if eligible".
- Do not show the full quote list again unless the user asks.
- Do not invent insurer policy facts. Current quote features are helpful context, not final policy promises.
- Do not end with vague wording like "go with this" or "cheapest option" without insurer names and premiums.
- End with exactly one Next question.`;
}

export default buildQuoteRecommendation;
