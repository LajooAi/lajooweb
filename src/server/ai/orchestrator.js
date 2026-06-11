import { FLOW_STEPS, USER_INTENTS } from '../../lib/conversationState.js';
import { getInsurerKeysFromText } from '../../lib/insurerCatalog.js';
import { ADVISOR_INTENTS } from './advisorIntent.js';
import {
  calculateSummaryAmounts,
  getQuotesFromState,
} from '../insurance/quoteEngine.js';
import {
  ADD_ON_CATALOG,
  calculateWindscreenPremium,
} from '../insurance/addonEngine.js';
import {
  canUseDeliveredRoadTax,
  getRoadTaxDisplayName,
} from '../insurance/roadTaxEngine.js';

export const CONVERSATION_MODES = {
  FLOW_ANSWER: 'flow_answer',
  INSURANCE_QUESTION: 'insurance_question',
  QUOTE_COMPARISON: 'quote_comparison',
  CHANGE_REQUEST: 'change_request',
  CORRECTION: 'correction',
  CONFUSED: 'confused',
  SMALL_TALK: 'small_talk',
  READY_TO_PROCEED: 'ready_to_proceed',
};

export const CONVERSATION_ACTIONS = {
  ANSWER_ONLY: 'answer_only',
  ANSWER_THEN_RESUME: 'answer_then_resume',
  ADVANCE_FLOW: 'advance_flow',
  ASK_FOLLOW_UP: 'ask_one_follow_up',
  CLARIFY_CONFUSION: 'clarify_confusion',
  CHANGE_SELECTION: 'change_selected_option',
};

const FLOW_ADVANCE_INTENTS = new Set([
  USER_INTENTS.PROVIDE_INFO,
  USER_INTENTS.SELECT_QUOTE,
  USER_INTENTS.SELECT_ADDON,
  USER_INTENTS.SELECT_ROADTAX,
  USER_INTENTS.SUBMIT_DETAILS,
  USER_INTENTS.VERIFY_OTP,
  USER_INTENTS.SELECT_PAYMENT,
  USER_INTENTS.START_RENEWAL,
]);

const DECISION_STEPS = new Set([
  FLOW_STEPS.QUOTES,
  FLOW_STEPS.ADDONS,
  FLOW_STEPS.ROADTAX,
  FLOW_STEPS.PERSONAL_DETAILS,
  FLOW_STEPS.OTP,
  FLOW_STEPS.PAYMENT,
]);

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasQuestionShape(text) {
  return /\?|^(what|why|how|which|when|where|can|could|should|do|does|is|are|will|would)\b/i.test(text);
}

function looksLikeQuoteComparison(text) {
  return /\b(compare|comparison|vs\.?|versus|difference|different|better|best|which one|which is better|why (?:not|choose)|between|recommend|recommendation|advice|advise|cheaper|cheapest|coverage|sum insured|claims?|claim support)\b/i.test(text) ||
    getInsurerKeysFromText(text).length > 0;
}

function shouldTreatAsQuoteComparison(text, state) {
  if (state?.step === FLOW_STEPS.QUOTES) {
    return looksLikeQuoteComparison(text);
  }

  if (getInsurerKeysFromText(text).length > 0) {
    return true;
  }

  return /\b(compare|comparison|vs\.?|versus|which insurer|which company|insurer|quote|premium|sum insured|cheaper|cheapest|claims?|claim support)\b/i.test(text);
}

function looksLikeInsuranceQuestion(text) {
  return /\b(ncd|no claim discount|windscreen|flood|special perils|betterment|excess|market value|agreed value|sum insured|road\s*tax|roadtax|policy|coverage|cover|claims?|premium|insurer|deductible|loading|endorsement|e-hailing|ehailing)\b/i.test(text);
}

function looksLikeCorrection(text) {
  return /\b(wrong|incorrect|not correct|not my|isn'?t my|is not my|doesn'?t match|does not match|mistake|change (?:my )?(?:plate|ic|nric|owner|vehicle|car|details)|actually|should be)\b/i.test(text);
}

function isSmallTalkAtStart(intent, state) {
  return (
    state?.step === FLOW_STEPS.START &&
    !state?.plateNumber &&
    !state?.nricNumber &&
    (intent?.intent === USER_INTENTS.GREETING || intent?.intent === USER_INTENTS.UNCLEAR_OR_PLAYFUL)
  );
}

function isReadyIntent(intent) {
  return (
    intent?.intent === USER_INTENTS.CONFIRM ||
    intent?.intent === USER_INTENTS.SELECT_PAYMENT ||
    intent?.intent === USER_INTENTS.VERIFY_OTP
  );
}

function shouldAskFollowUp(mode, state, intent) {
  if (mode === CONVERSATION_MODES.CONFUSED) return true;
  if (mode === CONVERSATION_MODES.QUOTE_COMPARISON && state?.step === FLOW_STEPS.QUOTES) return true;
  if (mode === CONVERSATION_MODES.INSURANCE_QUESTION && DECISION_STEPS.has(state?.step)) return true;
  if (intent?.confidence !== undefined && Number(intent.confidence) < 0.68) return true;
  return false;
}

function resolveAdvisorMode(advisorIntent, state) {
  const key = advisorIntent?.intent || ADVISOR_INTENTS.NONE;
  if (!key || key === ADVISOR_INTENTS.NONE) return null;

  if (key === ADVISOR_INTENTS.CONFUSED_USER) {
    return CONVERSATION_MODES.CONFUSED;
  }

  if ([
    ADVISOR_INTENTS.COMMERCIAL_BIAS_CHALLENGE,
    ADVISOR_INTENTS.REJECT_RECOMMENDATION,
    ADVISOR_INTENTS.QUOTE_FILTER_PREFERENCE,
    ADVISOR_INTENTS.QUOTE_EXPLORATION,
    ADVISOR_INTENTS.QUOTE_OBJECTION,
    ADVISOR_INTENTS.QUOTE_PRICE_EXPLANATION,
    ADVISOR_INTENTS.DELEGATE_DECISION,
  ].includes(key)) {
    return CONVERSATION_MODES.QUOTE_COMPARISON;
  }

  if ([
    ADVISOR_INTENTS.PRIVACY_CONCERN,
    ADVISOR_INTENTS.HUMAN_HANDOFF,
    ADVISOR_INTENTS.ADDON_EXPLANATION,
    ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    ADVISOR_INTENTS.PAYMENT_CONCERN,
    ADVISOR_INTENTS.ROADTAX_ALREADY_RENEWED,
    ADVISOR_INTENTS.ROADTAX_LEGALITY,
  ].includes(key)) {
    return DECISION_STEPS.has(state?.step)
      ? CONVERSATION_MODES.INSURANCE_QUESTION
      : CONVERSATION_MODES.FLOW_ANSWER;
  }

  return null;
}

function resolveMode({ message, intent, state, advisorIntent = null }) {
  const text = normalizeText(message);
  const advisorMode = resolveAdvisorMode(advisorIntent, state);
  if (advisorMode) {
    return advisorMode;
  }

  if (isSmallTalkAtStart(intent, state)) {
    return CONVERSATION_MODES.SMALL_TALK;
  }

  if (
    intent?.intent === USER_INTENTS.CHANGE_QUOTE ||
    intent?.intent === USER_INTENTS.CONFIRM_CHANGE_QUOTE ||
    intent?.intent === USER_INTENTS.CHANGE_ADDONS
  ) {
    return CONVERSATION_MODES.CHANGE_REQUEST;
  }

  if (looksLikeCorrection(text)) {
    return CONVERSATION_MODES.CORRECTION;
  }

  if (intent?.intent === USER_INTENTS.ASK_QUESTION) {
    if (shouldTreatAsQuoteComparison(text, state)) {
      return CONVERSATION_MODES.QUOTE_COMPARISON;
    }
    return CONVERSATION_MODES.INSURANCE_QUESTION;
  }

  if (shouldTreatAsQuoteComparison(text, state) && hasQuestionShape(text)) {
    return CONVERSATION_MODES.QUOTE_COMPARISON;
  }

  if (looksLikeInsuranceQuestion(text) && hasQuestionShape(text)) {
    return CONVERSATION_MODES.INSURANCE_QUESTION;
  }

  if (intent?.intent === USER_INTENTS.UNCLEAR_OR_PLAYFUL || intent?.intent === USER_INTENTS.OTHER) {
    return CONVERSATION_MODES.CONFUSED;
  }

  if (isReadyIntent(intent)) {
    return CONVERSATION_MODES.READY_TO_PROCEED;
  }

  return CONVERSATION_MODES.FLOW_ANSWER;
}

function formatMoney(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 'RM 0.00';
  return `RM ${numeric.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function summarizeQuote(quote) {
  if (!quote) return null;
  return {
    insurer: quote?.insurer?.displayName || quote?.insurer || 'Unknown insurer',
    price: Number(quote?.pricing?.finalPremium ?? quote?.priceAfter ?? 0),
    priceLabel: formatMoney(quote?.pricing?.finalPremium ?? quote?.priceAfter ?? 0),
    sumInsured: Number(quote?.sumInsured ?? 0),
    sumInsuredLabel: formatMoney(quote?.sumInsured ?? 0),
    quoteId: quote?.id || quote?.quoteId || null,
  };
}

function summarizeSelectedQuote(state) {
  const quote = state?.selectedQuote;
  if (!quote) return null;
  return {
    insurer: quote.insurer || 'Selected insurer',
    price: Number(quote.priceAfter || 0),
    priceLabel: formatMoney(quote.priceAfter || 0),
    priceBeforeLabel: formatMoney(quote.priceBefore || 0),
    sumInsured: Number(quote.sumInsured || 0),
    sumInsuredLabel: formatMoney(quote.sumInsured || 0),
    coverType: quote.coverType || 'Comprehensive',
    quoteId: quote.quoteId || null,
  };
}

function summarizeAddOns(state) {
  const selected = Array.isArray(state?.selectedAddOns) ? state.selectedAddOns : [];
  return {
    confirmed: !!state?.addOnsConfirmed,
    status: selected.length > 0
      ? (state?.addOnsConfirmed ? 'confirmed' : 'preselected_waiting_for_confirm')
      : (state?.addOnsConfirmed ? 'confirmed_none' : 'not_selected_yet'),
    selected: selected.map((addOn) => ({
      id: addOn?.id || null,
      name: addOn?.name || 'Add-on',
      price: Number(addOn?.price || 0),
      priceLabel: formatMoney(addOn?.price || 0),
      coverageAmount: Number(addOn?.coverageAmount || 0) || null,
    })),
    available: ADD_ON_CATALOG.map((addOn) => ({
      id: addOn.id,
      number: addOn.number,
      name: addOn.name,
      price: addOn.hasCoverageInput
        ? null
        : Number(addOn.price || 0),
      priceLabel: addOn.hasCoverageInput
        ? 'depends on coverage amount'
        : formatMoney(addOn.price || 0),
      defaultCoverage: addOn.defaultCoverage || null,
      defaultPriceLabel: addOn.hasCoverageInput
        ? formatMoney(calculateWindscreenPremium(addOn.defaultCoverage || 0))
        : null,
      recommended: !!addOn.recommended,
    })),
    windscreenFormula: 'Windscreen premium = selected coverage amount x 15%. Example: RM 2,000.00 coverage costs RM 300.00.',
  };
}

function summarizeRoadTax(state) {
  const selected = state?.selectedRoadTax || null;
  const physicalAvailable = canUseDeliveredRoadTax(state);
  return {
    status: selected ? 'selected' : 'not_selected_yet',
    selected: selected ? {
      name: getRoadTaxDisplayName(selected),
      price: Number(selected.price || 0),
      priceLabel: formatMoney(selected.price || 0),
    } : null,
    digitalOption: {
      name: '12 months digital road tax',
      price: 90,
      priceLabel: formatMoney(90),
    },
    printedOrDeliveredAvailable: physicalAvailable,
    printedRule: 'Printed road tax is only for Foreign ID or Company vehicles from 1 Feb 2026.',
  };
}

function buildNextActionHints(state, engineContext) {
  const step = state?.step;
  if (step === FLOW_STEPS.QUOTES && !state?.selectedQuote) {
    return [
      'Compare current insurers using premium, sum insured, and approved facts only.',
      'If user asks LAJOO to choose, recommend one insurer and ask if they want to go with it.',
      'If user is unsure, ask what matters most: lowest premium, claims comfort, or higher coverage.',
    ];
  }
  if (step === FLOW_STEPS.ADDONS) {
    return [
      'Answer add-on questions first, then return to add-on choice.',
      'If windscreen is selected without coverage amount, ask only for the coverage amount.',
      'Do not move to road tax until add-ons are confirmed or skipped.',
    ];
  }
  if (step === FLOW_STEPS.ROADTAX) {
    return [
      'Offer digital road tax or no road tax.',
      engineContext?.roadTax?.printedOrDeliveredAvailable
        ? 'Printed/physical delivery can be discussed because owner type is eligible.'
        : 'Do not offer printed/physical delivery for individual NRIC-owned vehicles.',
    ];
  }
  if (step === FLOW_STEPS.PERSONAL_DETAILS) {
    return ['Collect email, phone, and address before OTP. Ask only for missing fields.'];
  }
  if (step === FLOW_STEPS.PAYMENT) {
    return ['Do not confirm payment or policy issuance unless payment state confirms it.'];
  }
  return ['Ask only for the next missing required item.'];
}

function buildEngineContext(state = {}) {
  const quotes = getQuotesFromState(state);
  const quoteSummaries = quotes.map(summarizeQuote).filter(Boolean);
  const cheapestQuote = quoteSummaries.slice().sort((a, b) => a.price - b.price)[0] || null;
  const highestSumInsuredQuote = quoteSummaries.slice().sort((a, b) => b.sumInsured - a.sumInsured)[0] || null;
  const totals = state?.selectedQuote
    ? calculateSummaryAmounts(state)
    : { insurance: 0, addOns: 0, roadTax: 0, tax: 0, total: 0 };
  const engineContext = {
    quoteOptions: quoteSummaries,
    cheapestQuote,
    highestSumInsuredQuote,
    selectedQuote: summarizeSelectedQuote(state),
    addOns: summarizeAddOns(state),
    roadTax: summarizeRoadTax(state),
    totals: {
      insurance: totals.insurance,
      addOns: totals.addOns,
      roadTax: totals.roadTax,
      tax: totals.tax,
      total: totals.total,
      totalLabel: formatMoney(totals.total),
    },
  };
  engineContext.nextActionHints = buildNextActionHints(state, engineContext);
  return engineContext;
}

function resolveAction(mode, intent, state) {
  if (mode === CONVERSATION_MODES.CHANGE_REQUEST) return CONVERSATION_ACTIONS.CHANGE_SELECTION;
  if (mode === CONVERSATION_MODES.CORRECTION) return CONVERSATION_ACTIONS.ASK_FOLLOW_UP;
  if (mode === CONVERSATION_MODES.CONFUSED) return CONVERSATION_ACTIONS.CLARIFY_CONFUSION;
  if (mode === CONVERSATION_MODES.SMALL_TALK) return CONVERSATION_ACTIONS.ASK_FOLLOW_UP;

  if (mode === CONVERSATION_MODES.QUOTE_COMPARISON || mode === CONVERSATION_MODES.INSURANCE_QUESTION) {
    if (DECISION_STEPS.has(state?.step)) return CONVERSATION_ACTIONS.ANSWER_THEN_RESUME;
    return CONVERSATION_ACTIONS.ANSWER_ONLY;
  }

  if (FLOW_ADVANCE_INTENTS.has(intent?.intent) || mode === CONVERSATION_MODES.READY_TO_PROCEED) {
    return CONVERSATION_ACTIONS.ADVANCE_FLOW;
  }

  return CONVERSATION_ACTIONS.ASK_FOLLOW_UP;
}

export function buildConversationDecision({ message, intent, state, messages = [], stepBeforeMutation = null, advisorIntent = null } = {}) {
  const mode = resolveMode({ message, intent, state, advisorIntent });
  const action = resolveAction(mode, intent, state);
  const engineContext = buildEngineContext(state);
  const shouldAdvanceFlow = action === CONVERSATION_ACTIONS.ADVANCE_FLOW;
  const shouldAnswerFirst =
    action === CONVERSATION_ACTIONS.ANSWER_ONLY ||
    action === CONVERSATION_ACTIONS.ANSWER_THEN_RESUME;
  const shouldResumeFlow = action === CONVERSATION_ACTIONS.ANSWER_THEN_RESUME;
  const shouldShowStepLabel =
    shouldAdvanceFlow &&
    ![
      CONVERSATION_MODES.INSURANCE_QUESTION,
      CONVERSATION_MODES.QUOTE_COMPARISON,
      CONVERSATION_MODES.CONFUSED,
      CONVERSATION_MODES.SMALL_TALK,
      CONVERSATION_MODES.CORRECTION,
    ].includes(mode);

  return {
    mode,
    action,
    currentStep: state?.step || null,
    previousStep: stepBeforeMutation || null,
    intent: intent?.intent || null,
    confidence: Number(intent?.confidence || 0),
    advisorIntent: advisorIntent?.intent || ADVISOR_INTENTS.NONE,
    advisorTopic: advisorIntent?.topic || null,
    advisorIntentConfidence: Number(advisorIntent?.confidence || 0),
    advisorIntentContext: advisorIntent || null,
    shouldAdvanceFlow,
    shouldAnswerFirst,
    shouldResumeFlow,
    shouldAskOneFollowUp: shouldAskFollowUp(mode, state, intent),
    shouldShowStepLabel,
    shouldAvoidStepLanguage: !shouldShowStepLabel,
    turnCount: Array.isArray(messages) ? messages.length : 0,
    engineContext,
  };
}

export default buildConversationDecision;
