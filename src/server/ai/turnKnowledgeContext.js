import { FLOW_STEPS, USER_INTENTS } from '../../lib/conversationState.js';
import { getInsurerKeysFromText } from '../../lib/insurerCatalog.js';
import { buildApprovedFactsInstruction } from '../insurance/approvedFactStore.js';
import { getApprovedFactInsurerSlugForKey } from '../insurance/insurerFactSlugs.js';
import { buildQuoteRecommendationInstruction } from '../insurance/recommendationEngine.js';
import { getQuoteInsurerKey } from '../insurance/quoteEngine.js';
import { CONVERSATION_MODES } from './orchestrator.js';
import { TURN_QUESTION_GUIDANCE } from './turnPlanner.js';

const CONSULTATIVE_STEPS = new Set([
  FLOW_STEPS.QUOTES,
  FLOW_STEPS.ADDONS,
  FLOW_STEPS.ROADTAX,
]);

const CONSULTATIVE_MODES = new Set([
  CONVERSATION_MODES.INSURANCE_QUESTION,
  CONVERSATION_MODES.QUOTE_COMPARISON,
  CONVERSATION_MODES.CHANGE_REQUEST,
  CONVERSATION_MODES.CORRECTION,
  CONVERSATION_MODES.CONFUSED,
]);

const RECOMMENDATION_QUESTION_GUIDANCE = new Set([
  TURN_QUESTION_GUIDANCE.QUOTE_RECOMMENDATION,
  TURN_QUESTION_GUIDANCE.QUOTE_DILEMMA,
  TURN_QUESTION_GUIDANCE.ADDON_PRICE_OBJECTION,
  TURN_QUESTION_GUIDANCE.ADDON_BETTERMENT,
  TURN_QUESTION_GUIDANCE.ADDON_RECOMMENDATION,
]);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hasRecommendedQuote(quoteRecommendation) {
  return !!quoteRecommendation?.recommendedQuote;
}

function getSelectedQuoteInsurerSlug(state = {}) {
  const selectedQuoteKey = getQuoteInsurerKey(state?.selectedQuote);
  return getApprovedFactInsurerSlugForKey(selectedQuoteKey);
}

export function getApprovedFactInsurerSlugsForTurn(message = '', state = {}) {
  const mentionedSlugs = getInsurerKeysFromText(message)
    .map(getApprovedFactInsurerSlugForKey)
    .filter(Boolean);

  if (mentionedSlugs.length > 0) {
    return unique(mentionedSlugs);
  }

  return unique([getSelectedQuoteInsurerSlug(state)]);
}

function shouldUseApprovedFacts({ message, intent, decision, turnPlan, approvedFactInsurerSlugs }) {
  if (intent?.intent !== USER_INTENTS.ASK_QUESTION) return false;

  const hasInsurerContext = approvedFactInsurerSlugs.length > 0;
  const isConsultativeMode = CONSULTATIVE_MODES.has(decision?.mode);
  const isConsultativeStep = CONSULTATIVE_STEPS.has(turnPlan?.currentStep);
  const hasQuestionGuidance = !!turnPlan?.questionGuidance;
  const asksKnownPolicyTopic = /\b(betterment|windscreen|flood|special\s*perils|roadside|tow|towing|claim|claims|excess|market value|agreed value|sum insured|e-?hailing|tesla|ev|charger|shariah|takaful)\b/i.test(message);

  return hasInsurerContext || isConsultativeMode || isConsultativeStep || hasQuestionGuidance || asksKnownPolicyTopic;
}

function shouldUseRecommendationContext({ intent, decision, turnPlan, quoteRecommendation }) {
  if (!hasRecommendedQuote(quoteRecommendation)) return false;
  if (intent?.intent !== USER_INTENTS.ASK_QUESTION) return false;

  return (
    decision?.mode === CONVERSATION_MODES.QUOTE_COMPARISON ||
    CONSULTATIVE_STEPS.has(turnPlan?.currentStep) ||
    RECOMMENDATION_QUESTION_GUIDANCE.has(turnPlan?.questionGuidance)
  );
}

export function buildTurnKnowledgePlan({
  message = '',
  intent = null,
  state = {},
  decision = null,
  turnPlan = null,
  quoteRecommendation = null,
} = {}) {
  const approvedFactInsurerSlugs = getApprovedFactInsurerSlugsForTurn(message, state);
  const shouldInjectApprovedFacts = shouldUseApprovedFacts({
    message,
    intent,
    decision,
    turnPlan,
    approvedFactInsurerSlugs,
  });
  const shouldInjectRecommendationContext = shouldUseRecommendationContext({
    intent,
    decision,
    turnPlan,
    quoteRecommendation,
  });

  return {
    approvedFactInsurerSlugs,
    approvedFactLimit: approvedFactInsurerSlugs.length > 1 ? 5 : 8,
    currentStep: turnPlan?.currentStep || state?.step || null,
    mode: decision?.mode || null,
    questionGuidance: turnPlan?.questionGuidance || null,
    shouldInjectApprovedFacts,
    shouldInjectRecommendationContext,
    shouldInjectKnowledgeGuardrail: shouldInjectApprovedFacts || shouldInjectRecommendationContext,
  };
}

function buildKnowledgeGuardrailInstruction(turnKnowledgePlan) {
  if (!turnKnowledgePlan?.shouldInjectKnowledgeGuardrail) return null;

  return `LAJOO KNOWLEDGE AND RECOMMENDATION CONTROL
Use this for the current turn:
- For insurer-specific benefits, exclusions, towing, betterment, claims, product terms, or eligibility, use only approved facts supplied in this turn, current live quote fields, or verified database grounding.
- If the needed insurer fact is not supplied, say LAJOO needs to verify it before confirming. Do not guess.
- Treat recommendation-engine output as consultant guidance, not a final insurer promise.
- Answer the user's question first, then resume the renewal flow naturally with one next question.
- Keep the wording human, practical, and Malaysian-user friendly.`;
}

function formatRm(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 'RM 0.00';
  return `RM ${numeric.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildRecommendationContextInstruction(turnKnowledgePlan, quoteRecommendation) {
  if (!turnKnowledgePlan?.shouldInjectRecommendationContext || !hasRecommendedQuote(quoteRecommendation)) {
    return null;
  }

  const quote = quoteRecommendation.recommendedQuote;
  const reasons = Array.isArray(quoteRecommendation.reasons) && quoteRecommendation.reasons.length > 0
    ? quoteRecommendation.reasons.join('; ')
    : 'best balance from the current quote set';
  const factReasons = Array.isArray(quoteRecommendation.factReasons) && quoteRecommendation.factReasons.length > 0
    ? quoteRecommendation.factReasons.join('; ')
    : 'none for this exact turn';
  const riskNotes = Array.isArray(quoteRecommendation.riskNotes) && quoteRecommendation.riskNotes.length > 0
    ? quoteRecommendation.riskNotes.join('; ')
    : 'none';

  return `LAJOO CONSULTANT RECOMMENDATION CONTEXT
Use this as background when the user asks for advice, comparison, tradeoff, or which option/add-on makes sense:
- Current leading insurer: ${quote.insurerName}
- Premium: ${formatRm(quote.finalPremium)}
- Sum insured: ${formatRm(quote.sumInsured)}
- Main reasons: ${reasons}
- Approved fact-backed reasons: ${factReasons}
- Caution notes: ${riskNotes}
- Honest tradeoff: ${quoteRecommendation.tradeoff || 'Explain price, coverage, and policy-certainty tradeoffs plainly.'}

How to use it:
- If the user asks "which one", recommend one option confidently.
- For insurer recommendation/comparison moments, use this visible structure: **My pick:**, **Why:**, **Trade-off:**, **Next:**.
- Bold insurer names, final premiums, sum insured amounts, and key decision words.
- In **Next:**, name the recommended insurer and the best concrete alternative with premiums when available. Avoid vague closes like "go with this" or "cheapest option" without an insurer name.
- If the user asks a factual question, answer that first, then optionally bridge to this recommendation in one short sentence.
- Treat brand-program reasons as eligibility context only unless the live quote/product confirms that exact programme.
- Do not invent new insurer benefits from this context.`;
}

function buildApprovedFactsInstructions(turnKnowledgePlan, message) {
  if (!turnKnowledgePlan?.shouldInjectApprovedFacts) return [];

  const slugs = turnKnowledgePlan.approvedFactInsurerSlugs;
  if (slugs.length > 0) {
    return slugs
      .map((insurerSlug) => buildApprovedFactsInstruction(message, {
        insurerSlug,
        limit: turnKnowledgePlan.approvedFactLimit,
      }))
      .filter(Boolean);
  }

  const generalInstruction = buildApprovedFactsInstruction(message, {
    limit: turnKnowledgePlan.approvedFactLimit,
  });
  return generalInstruction ? [generalInstruction] : [];
}

export function buildTurnKnowledgeInstructions(turnKnowledgePlan, {
  message = '',
  decision = null,
  state = {},
  quoteRecommendation = null,
} = {}) {
  if (!turnKnowledgePlan) return [];

  const instructions = [];
  const guardrailInstruction = buildKnowledgeGuardrailInstruction(turnKnowledgePlan);
  if (guardrailInstruction) instructions.push(guardrailInstruction);

  instructions.push(...buildApprovedFactsInstructions(turnKnowledgePlan, message));

  const directRecommendationInstruction = buildQuoteRecommendationInstruction(decision, {
    quoteRecommendation,
    state,
    message,
  });
  if (directRecommendationInstruction) {
    instructions.push(directRecommendationInstruction);
  } else {
    const recommendationContextInstruction = buildRecommendationContextInstruction(turnKnowledgePlan, quoteRecommendation);
    if (recommendationContextInstruction) instructions.push(recommendationContextInstruction);
  }

  return instructions;
}

export default buildTurnKnowledgePlan;
