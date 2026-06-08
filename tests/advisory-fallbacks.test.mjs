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

  assert.match(reply, /^I recommend \*\*/);
  assert.match(reply, /Why:/);
  assert.match(reply, /Tradeoff:/);
  assert.match(reply, /Want to go with/i);
  assert.doesNotMatch(reply, /Step \d of 6/i);
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
  assert.match(reply, /RM 1,000 or RM 2,000/i);
  assert.doesNotMatch(reply, /Step \d of 6/i);
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
  assert.match(reply, /Windscreen/i);
  assert.match(reply, /flood only|both|skip add-ons/i);
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
