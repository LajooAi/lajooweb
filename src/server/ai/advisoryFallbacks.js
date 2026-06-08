import { FLOW_STEPS, USER_INTENTS } from '../../lib/conversationState.js';
import { CONVERSATION_ACTIONS, CONVERSATION_MODES } from './orchestrator.js';
import { TURN_QUESTION_GUIDANCE, TURN_RESPONSE_PATTERNS } from './turnPlanner.js';
import {
  findInsuranceConcepts,
  shouldUseGeneralConceptAnswer,
} from './insuranceConcepts.js';

const RETRYABLE_OPENAI_CODES = new Set([
  'OPENAI_RATE_LIMIT',
  'OPENAI_UNAVAILABLE',
]);

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function formatRm(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  return `RM ${numeric.toLocaleString('en-MY', {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function isRetryableOpenAiCapacityError(error) {
  const code = String(error?.code || '').toUpperCase();
  if (RETRYABLE_OPENAI_CODES.has(code)) return error?.retryable !== false;

  const message = String(error?.message || '');
  return error?.retryable === true && /rate\s*limit|too many requests|unavailable|could not reach/i.test(message);
}

function getRecommendedQuote(recommendation) {
  const quote = recommendation?.recommendedQuote;
  if (!quote || typeof quote !== 'object') return null;

  const insurerName = quote.insurerName || quote.insurer?.displayName || quote.insurer || null;
  if (!insurerName) return null;

  return {
    insurerName,
    finalPremiumLabel: formatRm(quote.finalPremium ?? quote.priceAfter ?? quote.pricing?.finalPremium),
    sumInsuredLabel: formatRm(quote.sumInsured ?? quote.insuredAmount),
  };
}

function isQuoteRecommendationTurn({ state, decision, turnPlan, latestMessage, recommendation }) {
  if (state?.step !== FLOW_STEPS.QUOTES) return false;
  if (!getRecommendedQuote(recommendation)) return false;

  const text = normalizeText(latestMessage);
  return (
    turnPlan?.questionGuidance === TURN_QUESTION_GUIDANCE.QUOTE_RECOMMENDATION ||
    decision?.mode === CONVERSATION_MODES.QUOTE_COMPARISON ||
    /\b(recommend|recommendation|which insurer|which one|which should|best|better|choose for me|your pick|what do you think)\b/i.test(text)
  );
}

function buildQuoteRecommendationFallback({ recommendation }) {
  const quote = getRecommendedQuote(recommendation);
  if (!quote) return null;

  const reasons = Array.isArray(recommendation?.reasons)
    ? recommendation.reasons.filter(Boolean).slice(0, 2)
    : [];
  const alternatives = Array.isArray(recommendation?.alternatives)
    ? recommendation.alternatives.filter(Boolean).slice(0, 2)
    : [];

  const details = [];
  if (quote.finalPremiumLabel && quote.sumInsuredLabel) {
    details.push(`${quote.finalPremiumLabel} with ${quote.sumInsuredLabel} sum insured`);
  } else if (quote.finalPremiumLabel) {
    details.push(`${quote.finalPremiumLabel} premium`);
  } else if (quote.sumInsuredLabel) {
    details.push(`${quote.sumInsuredLabel} sum insured`);
  }

  const lines = [
    `I recommend **${quote.insurerName}** for this renewal.`,
  ];

  const reasonText = reasons.length > 0
    ? reasons.join('; ')
    : 'it gives the best balance from the current quote set';
  lines.push(`Why: ${[reasonText, ...details].filter(Boolean).join(', ')}.`);

  if (recommendation?.tradeoff) {
    lines.push(`Tradeoff: ${recommendation.tradeoff}`);
  } else if (alternatives.length > 0) {
    const alternative = alternatives[0];
    const altPremium = formatRm(alternative.finalPremium ?? alternative.priceAfter ?? alternative.pricing?.finalPremium);
    if (alternative.insurerName && altPremium) {
      lines.push(`Tradeoff: ${alternative.insurerName} is the closest alternative at ${altPremium}.`);
    }
  }

  lines.push(`Want to go with **${quote.insurerName}**?`);
  return lines.filter(Boolean).join('\n\n');
}

function conceptCloseForStep(concept, state) {
  const step = state?.step;

  if (step === FLOW_STEPS.QUOTES) {
    return 'For your quote decision, do you want my recommendation or a quick side-by-side comparison?';
  }

  if (step === FLOW_STEPS.ADDONS) {
    if (concept.id === 'windscreen') {
      return 'If you want windscreen cover, tell me the coverage amount, for example RM 1,000 or RM 2,000.';
    }
    if (concept.id === 'flood') {
      return 'Do you want to add Special Perils, add windscreen too, or skip add-ons?';
    }
    if (concept.id === 'e_hailing') {
      return 'Are you using this car for Grab or other e-hailing services?';
    }
    return 'Do you want to add it, choose another add-on, or skip add-ons?';
  }

  if (step === FLOW_STEPS.ROADTAX) {
    return 'For road tax, do you want 12-month digital road tax or no road tax?';
  }

  if (step === FLOW_STEPS.PERSONAL_DETAILS) {
    return 'When you are ready, send the remaining details in one message: email, phone number, and address.';
  }

  return 'Want to continue from here?';
}

function isConceptFallbackTurn({ intent, decision, latestMessage }) {
  if (!shouldUseGeneralConceptAnswer(latestMessage)) return false;

  return (
    intent?.intent === USER_INTENTS.ASK_QUESTION ||
    decision?.mode === CONVERSATION_MODES.INSURANCE_QUESTION ||
    decision?.action === CONVERSATION_ACTIONS.ANSWER_THEN_RESUME
  );
}

function buildConceptFallback({ latestMessage, state }) {
  const [concept] = findInsuranceConcepts(latestMessage, { limit: 1 });
  if (!concept) return null;

  return [
    concept.explanation,
    conceptCloseForStep(concept, state),
  ].filter(Boolean).join('\n\n');
}

function isConfusedTurn({ decision, turnPlan }) {
  return (
    decision?.mode === CONVERSATION_MODES.CONFUSED ||
    turnPlan?.responsePattern === TURN_RESPONSE_PATTERNS.CLARIFY_CONFUSION
  );
}

function buildConfusedFallback(state) {
  if (state?.step === FLOW_STEPS.QUOTES) {
    return 'No worries. The simple choice is: cheapest, higher sum insured, or my recommendation. Which one should I use to guide you?';
  }
  if (state?.step === FLOW_STEPS.ADDONS) {
    return 'No worries. For add-ons, the simple choices are: add windscreen, add flood/Special Perils, or skip add-ons. Which one do you prefer?';
  }
  if (state?.step === FLOW_STEPS.ROADTAX) {
    return 'No worries. For road tax, choose 12-month digital road tax or no road tax. Which one do you want?';
  }
  return 'No worries. Tell me what you want to change or ask, and I will guide you one thing at a time.';
}

function isNeedsGuidanceTurn(latestMessage) {
  const text = normalizeText(latestMessage);
  return /\b(which|what)\s+(do|should)\s+i\s+(need|choose|take|pick)\b/i.test(text) ||
    /\bwhich\s+one\s+(do|should)\s+i\s+(need|choose|take|pick)\b/i.test(text) ||
    /\bwhat\s+would\s+you\s+(recommend|suggest)\b/i.test(text);
}

function buildNeedsGuidanceFallback(state) {
  if (state?.step === FLOW_STEPS.ADDONS) {
    return [
      'For add-ons, do not buy everything. Choose based on your real risk.',
      '**My practical pick:** add **Special Perils/Flood** if your area or parking place can flood. Add **Windscreen** if a glass replacement would be painful to pay yourself. Skip **E-hailing** unless this car is used for Grab or similar services.',
      'If you want the simple safe choice, tell me **flood only**, **windscreen only**, **both**, or **skip add-ons**.',
    ].join('\n\n');
  }

  if (state?.step === FLOW_STEPS.QUOTES) {
    return 'For insurer choice, I can guide you in three simple ways: cheapest price, higher sum insured, or balanced recommendation. Which one matters most to you?';
  }

  if (state?.step === FLOW_STEPS.ROADTAX) {
    return 'For road tax, choose **12-month digital road tax** if you want LAJOO to handle it together. Choose **no road tax** if you only want insurance renewal.';
  }

  if (state?.step === FLOW_STEPS.PERSONAL_DETAILS) {
    return 'At this stage, I need your email, phone number, and address so LAJOO can continue to OTP verification and document delivery.';
  }

  return 'Tell me what you are deciding between, and I’ll narrow it down to the safest simple choice.';
}

export function buildAdvisoryFallbackResponse({
  error,
  state,
  intent,
  decision,
  turnPlan,
  latestMessage,
  productionTurnInstructions,
} = {}) {
  if (!isRetryableOpenAiCapacityError(error)) return null;

  const recommendation = productionTurnInstructions?.quoteRecommendation;

  if (isQuoteRecommendationTurn({ state, decision, turnPlan, latestMessage, recommendation })) {
    return buildQuoteRecommendationFallback({ recommendation });
  }

  if (isNeedsGuidanceTurn(latestMessage)) {
    return buildNeedsGuidanceFallback(state);
  }

  if (isConceptFallbackTurn({ intent, decision, latestMessage })) {
    const conceptFallback = buildConceptFallback({ latestMessage, state });
    if (conceptFallback) return conceptFallback;
  }

  if (isConfusedTurn({ decision, turnPlan })) {
    return buildConfusedFallback(state);
  }

  return null;
}

export default buildAdvisoryFallbackResponse;
