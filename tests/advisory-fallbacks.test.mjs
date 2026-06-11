import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationState,
  FLOW_STEPS,
  USER_INTENTS,
} from '../src/lib/conversationState.js';
import { getQuotes } from '../src/lib/insuranceData.js';
import {
  CONVERSATION_ACTIONS,
  CONVERSATION_MODES,
} from '../src/server/ai/orchestrator.js';
import {
  buildAdvisoryFallbackResponse,
} from '../src/server/ai/advisoryFallbacks.js';
import {
  TURN_QUESTION_GUIDANCE,
  TURN_RESPONSE_PATTERNS,
} from '../src/server/ai/turnPlanner.js';
import {
  buildQuoteRecommendation,
} from '../src/server/insurance/recommendationEngine.js';
import {
  ADVISOR_INTENTS,
  ADVISOR_TOPICS,
} from '../src/server/ai/advisorIntent.js';

function makeQuoteState(overrides = {}) {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    ownerIdType: 'nric',
    vehicleInfo: {
      sampleId: 'JRT9289',
      make: 'Perodua',
      model: 'Myvi',
      variant: '1.5L',
      year: 2019,
      postcode: '47000',
    },
    ...overrides,
  });
  return state;
}

function makeRetryableRateLimitError() {
  const error = new Error('LAJOO is receiving many AI requests right now.');
  error.code = 'OPENAI_RATE_LIMIT';
  error.retryable = true;
  return error;
}

test('advisory fallback gives quote recommendation when OpenAI is rate-limited', () => {
  const state = makeQuoteState({
    userPreferences: { budgetFocused: true },
  });
  const latestMessage = 'which insurer do you recommend?';
  const quoteRecommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    state,
    userPreferences: state.userPreferences,
    message: latestMessage,
  });

  const reply = buildAdvisoryFallbackResponse({
    error: makeRetryableRateLimitError(),
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION },
    decision: {
      mode: CONVERSATION_MODES.QUOTE_COMPARISON,
      action: CONVERSATION_ACTIONS.ANSWER_THEN_RESUME,
    },
    turnPlan: {
      responsePattern: TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME,
      questionGuidance: TURN_QUESTION_GUIDANCE.QUOTE_RECOMMENDATION,
    },
    latestMessage,
    productionTurnInstructions: {
      quoteRecommendation,
    },
  });

  assert.match(reply, /^\*\*My pick:\*\*/);
  assert.match(reply, /\*\*Why:\*\*/);
  assert.match(reply, /\*\*Trade-off:\*\*/);
  assert.match(reply, /\*\*Next:\*\*/);
  assert.match(reply, /Want to go with/i);
  assert.doesNotMatch(reply, /go with this/i);
  assert.doesNotMatch(reply, /choose the cheapest option, or/i);
  assert.doesNotMatch(reply, /so mention/i);
  assert.doesNotMatch(reply, /receiving many AI requests/i);
  assert.doesNotMatch(reply, /Step \d of 6/i);
});

test('advisory fallback names cheapest alternative after balanced quote recommendation', () => {
  const state = makeQuoteState();
  const latestMessage = 'which is better?';
  const quoteRecommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    state,
    userPreferences: state.userPreferences,
    message: latestMessage,
  });

  const reply = buildAdvisoryFallbackResponse({
    error: makeRetryableRateLimitError(),
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION },
    decision: {
      mode: CONVERSATION_MODES.QUOTE_COMPARISON,
      action: CONVERSATION_ACTIONS.ANSWER_THEN_RESUME,
    },
    turnPlan: {
      responsePattern: TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME,
      questionGuidance: TURN_QUESTION_GUIDANCE.QUOTE_RECOMMENDATION,
    },
    latestMessage,
    productionTurnInstructions: {
      quoteRecommendation,
    },
  });

  assert.match(reply, /\*\*My pick:\*\* \*\*Tokio Marine Insurance\*\*/i);
  assert.match(reply, /go with \*\*Tokio Marine Insurance - RM 800.00\*\*/i);
  assert.match(reply, /cheapest option \*\*Takaful Ikhlas Insurance - RM 796.00\*\*/i);
  assert.doesNotMatch(reply, /go with this/i);
});

test('advisory fallback answers quote alternatives when user asks about others', () => {
  const state = makeQuoteState({
    userPreferences: { budgetFocused: true },
  });
  const latestMessage = 'what about others';
  const quoteRecommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    state,
    userPreferences: state.userPreferences,
    message: 'which insurer do you recommend?',
  });

  const reply = buildAdvisoryFallbackResponse({
    error: makeRetryableRateLimitError(),
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION },
    decision: {
      mode: CONVERSATION_MODES.QUOTE_COMPARISON,
      action: CONVERSATION_ACTIONS.ANSWER_THEN_RESUME,
    },
    turnPlan: {
      responsePattern: TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME,
      questionGuidance: TURN_QUESTION_GUIDANCE.QUOTE_RECOMMENDATION,
    },
    latestMessage,
    productionTurnInstructions: {
      quoteRecommendation,
    },
  });

  assert.match(reply, /other options/i);
  assert.match(reply, /Takaful Ikhlas Insurance/i);
  assert.match(reply, /Tokio Marine Insurance|Etiqa Insurance|Allianz Insurance/i);
  assert.match(reply, /\*\*Trade-off:\*\*/);
  assert.match(reply, /\*\*Next:\*\*/);
  assert.match(reply, /lowest price, look at \*\*Takaful Ikhlas Insurance\*\*/i);
  assert.match(reply, /My current recommendation is still \*\*Takaful Ikhlas Insurance\*\*/i);
  assert.match(reply, /as my recommendation/i);
  assert.doesNotMatch(reply, /My balanced pick is still \*\*Takaful Ikhlas Insurance\*\*/i);
  assert.doesNotMatch(reply, /the \*\*cheapest option\*\*, the \*\*higher sum insured\*\*, or \*\*my balanced recommendation\*\*/i);
  assert.doesNotMatch(reply, /receiving many AI requests/i);
  assert.doesNotMatch(reply, /so mention/i);
  assert.doesNotMatch(reply, /^Why:/im);
  assert.doesNotMatch(reply, /^Tradeoff:/im);
});

test('advisory fallback explains windscreen and resumes add-on decision', () => {
  const state = makeQuoteState({
    step: FLOW_STEPS.ADDONS,
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      priceBefore: 995,
      ncdPercent: 20,
      sumInsured: 34000,
      coverType: 'Comprehensive',
    },
    selectedAddOns: [],
    addOnsConfirmed: false,
  });

  const reply = buildAdvisoryFallbackResponse({
    error: makeRetryableRateLimitError(),
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION },
    decision: {
      mode: CONVERSATION_MODES.INSURANCE_QUESTION,
      action: CONVERSATION_ACTIONS.ANSWER_THEN_RESUME,
    },
    turnPlan: {
      responsePattern: TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME,
      questionGuidance: TURN_QUESTION_GUIDANCE.ADDON_GENERAL,
    },
    latestMessage: 'what is windscreen cover?',
    productionTurnInstructions: {},
  });

  assert.match(reply, /Windscreen cover is optional protection/i);
  assert.match(reply, /coverage amount/i);
  assert.match(reply, /RM 1,000.00 or RM 2,000/i);
  assert.doesNotMatch(reply, /Step \d of 6/i);
});

test('advisory fallback answers add-on skip decision without generic paragraph', () => {
  const state = makeQuoteState({
    step: FLOW_STEPS.ADDONS,
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      priceBefore: 1000,
      ncdPercent: 20,
      sumInsured: 35000,
      coverType: 'Comprehensive',
    },
    selectedAddOns: [],
    addOnsConfirmed: false,
  });

  const reply = buildAdvisoryFallbackResponse({
    error: makeRetryableRateLimitError(),
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION },
    decision: {
      mode: CONVERSATION_MODES.INSURANCE_QUESTION,
      action: CONVERSATION_ACTIONS.ANSWER_THEN_RESUME,
    },
    turnPlan: {
      responsePattern: TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME,
      advisorIntentContext: {
        intent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
        topic: ADVISOR_TOPICS.ADDON_SKIP_DECISION,
        confidence: 0.9,
      },
    },
    latestMessage: 'should i skip?',
    productionTurnInstructions: {},
  });

  assert.match(reply, /^Yes - you can skip add-ons/i);
  assert.match(reply, /My practical minimum/i);
  assert.match(reply, /2\. Special Perils \(RM 150.00\)/i);
  assert.match(reply, /1\. Windscreen/i);
  assert.match(reply, /8\. Betterment waiver \(RM 350.00\)/i);
  assert.doesNotMatch(reply, /Whether to skip add-ons entirely depends/i);
  assert.doesNotMatch(reply, /Step \d of 6/i);
});

test('advisory fallback does not offer betterment selection before add-ons step', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.START,
    plateNumber: null,
    nricNumber: null,
    vehicleInfo: null,
  });

  const reply = buildAdvisoryFallbackResponse({
    error: makeRetryableRateLimitError(),
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION },
    decision: {
      mode: CONVERSATION_MODES.INSURANCE_QUESTION,
      action: CONVERSATION_ACTIONS.ANSWER_THEN_RESUME,
    },
    turnPlan: {
      responsePattern: TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME,
      advisorIntentContext: {
        intent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
        topic: ADVISOR_TOPICS.BETTERMENT,
        confidence: 0.9,
      },
    },
    latestMessage: 'what is zero betterment',
    productionTurnInstructions: {},
  });

  assert.match(reply, /Zero betterment helps reduce/i);
  assert.match(reply, /actual add-on options/i);
  assert.match(reply, /vehicle plate/i);
  assert.match(reply, /owner identification number/i);
  assert.doesNotMatch(reply, /RM 350.00/i);
  assert.doesNotMatch(reply, /Do you want to add/i);
  assert.doesNotMatch(reply, /or skip it/i);
});

test('advisory fallback answers road tax alternative renewal channels', () => {
  const state = makeQuoteState({
    step: FLOW_STEPS.ROADTAX,
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      priceBefore: 1000,
      ncdPercent: 20,
      sumInsured: 35000,
      coverType: 'Comprehensive',
    },
    selectedAddOns: [],
    addOnsConfirmed: true,
    selectedRoadTax: null,
  });

  const reply = buildAdvisoryFallbackResponse({
    error: makeRetryableRateLimitError(),
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION },
    decision: {
      mode: CONVERSATION_MODES.INSURANCE_QUESTION,
      action: CONVERSATION_ACTIONS.ANSWER_THEN_RESUME,
    },
    turnPlan: {
      responsePattern: TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME,
      questionGuidance: TURN_QUESTION_GUIDANCE.ROADTAX_ALTERNATIVE,
    },
    latestMessage: 'where else can I renew road tax?',
  });

  assert.match(reply, /JPJ\/MyJPJ/i);
  assert.match(reply, /mySIKAP/i);
  assert.match(reply, /MyEG/i);
  assert.match(reply, /Pos Malaysia/i);
  assert.match(reply, /Insurance must already be active/i);
  assert.match(reply, /12-month digital road tax \(RM 90.00\)/i);
  assert.match(reply, /skip road tax/i);
  assert.doesNotMatch(reply, /receiving many AI requests/i);
});

test('advisory fallback answers 6-month road tax limitation', () => {
  const state = makeQuoteState({
    step: FLOW_STEPS.ROADTAX,
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      priceBefore: 1000,
      ncdPercent: 20,
      sumInsured: 35000,
      coverType: 'Comprehensive',
    },
    selectedAddOns: [],
    addOnsConfirmed: true,
    selectedRoadTax: null,
  });

  const reply = buildAdvisoryFallbackResponse({
    error: makeRetryableRateLimitError(),
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION },
    decision: {
      mode: CONVERSATION_MODES.INSURANCE_QUESTION,
      action: CONVERSATION_ACTIONS.ANSWER_THEN_RESUME,
    },
    turnPlan: {
      responsePattern: TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME,
      advisorIntentContext: {
        intent: ADVISOR_INTENTS.ROADTAX_LEGALITY,
        topic: ADVISOR_TOPICS.DIGITAL_ROADTAX,
        entities: { asksSixMonthRoadTax: true },
      },
    },
    latestMessage: 'can i renew for 6 months and what is digital roadtax if police stops me?',
  });

  assert.match(reply, /digital road tax\/e-LKM/i);
  assert.match(reply, /12-month digital road tax only/i);
  assert.match(reply, /6-month option/i);
  assert.match(reply, /another channel/i);
  assert.match(reply, /12-month digital road tax or no road tax/i);
});

test('advisory fallback answers add-on needs guidance during OpenAI capacity errors', () => {
  const state = makeQuoteState({
    step: FLOW_STEPS.ADDONS,
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      priceBefore: 995,
      ncdPercent: 20,
      sumInsured: 34000,
      coverType: 'Comprehensive',
    },
    selectedAddOns: [],
    addOnsConfirmed: false,
  });

  const reply = buildAdvisoryFallbackResponse({
    error: makeRetryableRateLimitError(),
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION },
    decision: {
      mode: CONVERSATION_MODES.INSURANCE_QUESTION,
      action: CONVERSATION_ACTIONS.ANSWER_THEN_RESUME,
    },
    turnPlan: {
      responsePattern: TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME,
      questionGuidance: TURN_QUESTION_GUIDANCE.ADDON_GENERAL,
    },
    latestMessage: 'Which do I need?',
    productionTurnInstructions: {},
  });

  assert.match(reply, /do not buy everything/i);
  assert.match(reply, /Special Perils\/Flood/i);
  assert.match(reply, /landslide|landslip/i);
  assert.match(reply, /Windscreen/i);
  assert.match(reply, /Betterment waiver \(RM 350.00\)/i);
  assert.match(reply, /\*\*My practical pick:\*\*\n\n- \*\*2\. Special Perils\/Flood \(RM 150.00\)\*\*/i);
  assert.match(reply, /\n- \*\*1\. Windscreen\*\*/i);
  assert.match(reply, /\n- \*\*3\. E-hailing \(RM 2,000.00\)\*\*/i);
  assert.match(reply, /\n- \*\*8\. Betterment waiver \(RM 350.00\)\*\*/i);
  assert.match(reply, /nice-to-have/i);
  assert.match(reply, /older premium, continental, performance, luxury, or cars with expensive parts/i);
  assert.match(reply, /1, 2 and 8 \(includes Betterment waiver RM 350.00\)|skip add-ons/i);
  assert.doesNotMatch(reply, /receiving many AI requests/i);
  assert.doesNotMatch(reply, /Step \d of 6/i);
});

test('advisory fallback does not hide non-retryable OpenAI errors', () => {
  const state = makeQuoteState();
  const error = new Error('OPENAI_API_KEY is invalid.');
  error.code = 'OPENAI_INVALID_API_KEY';
  error.retryable = false;

  const reply = buildAdvisoryFallbackResponse({
    error,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION },
    decision: {
      mode: CONVERSATION_MODES.QUOTE_COMPARISON,
      action: CONVERSATION_ACTIONS.ANSWER_THEN_RESUME,
    },
    turnPlan: {
      responsePattern: TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME,
      questionGuidance: TURN_QUESTION_GUIDANCE.QUOTE_RECOMMENDATION,
    },
    latestMessage: 'which insurer do you recommend?',
    productionTurnInstructions: {
      quoteRecommendation: buildQuoteRecommendation({
        quotes: getQuotes(),
        state,
        userPreferences: state.userPreferences,
        message: 'which insurer do you recommend?',
      }),
    },
  });

  assert.equal(reply, null);
});
