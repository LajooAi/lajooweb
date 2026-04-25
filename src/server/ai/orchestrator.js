import { FLOW_STEPS, USER_INTENTS } from '../../lib/conversationState.js';

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
  return /\b(compare|comparison|vs\.?|versus|difference|different|better|best|which one|which is better|why (?:not|choose)|between|recommend|recommendation|cheaper|cheapest|coverage|sum insured|claims?|claim support|allianz|etiqa|takaful|ikhlas)\b/i.test(text);
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

function resolveMode({ message, intent, state }) {
  const text = normalizeText(message);

  if (isSmallTalkAtStart(intent, state)) {
    return CONVERSATION_MODES.SMALL_TALK;
  }

  if (intent?.intent === USER_INTENTS.CHANGE_QUOTE || intent?.intent === USER_INTENTS.CONFIRM_CHANGE_QUOTE) {
    return CONVERSATION_MODES.CHANGE_REQUEST;
  }

  if (looksLikeCorrection(text)) {
    return CONVERSATION_MODES.CORRECTION;
  }

  if (intent?.intent === USER_INTENTS.ASK_QUESTION) {
    if (state?.step === FLOW_STEPS.QUOTES || looksLikeQuoteComparison(text)) {
      return CONVERSATION_MODES.QUOTE_COMPARISON;
    }
    return CONVERSATION_MODES.INSURANCE_QUESTION;
  }

  if (looksLikeQuoteComparison(text) && hasQuestionShape(text)) {
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

export function buildConversationDecision({ message, intent, state, messages = [], stepBeforeMutation = null } = {}) {
  const mode = resolveMode({ message, intent, state });
  const action = resolveAction(mode, intent, state);
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
    shouldAdvanceFlow,
    shouldAnswerFirst,
    shouldResumeFlow,
    shouldAskOneFollowUp: shouldAskFollowUp(mode, state, intent),
    shouldShowStepLabel,
    shouldAvoidStepLanguage: !shouldShowStepLabel,
    turnCount: Array.isArray(messages) ? messages.length : 0,
  };
}

export default buildConversationDecision;
