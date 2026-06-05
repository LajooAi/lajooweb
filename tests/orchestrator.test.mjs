import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUserIntent, FLOW_STEPS } from '../src/lib/conversationState.js';
import {
  buildConversationDecision,
  CONVERSATION_ACTIONS,
  CONVERSATION_MODES,
} from '../src/server/ai/orchestrator.js';
import { shouldSuppressStepLine } from '../src/server/ai/responsePolicy.js';
import { buildAdvisorStrategyInstruction } from '../src/server/ai/advisorStrategies.js';
import {
  buildInsuranceConceptInstruction,
  shouldUseGeneralConceptAnswer,
} from '../src/server/ai/insuranceConcepts.js';
import {
  buildQuoteRecommendation,
  buildQuoteRecommendationInstruction,
} from '../src/server/insurance/recommendationEngine.js';
import { getQuotes } from '../src/lib/insuranceData.js';

function decide(message, state) {
  const intent = detectUserIntent(message, state);
  return buildConversationDecision({ message, intent, state, messages: [{ role: 'user', content: message }] });
}

test('classifies insurance question during add-ons as answer then resume', () => {
  const state = {
    step: FLOW_STEPS.ADDONS,
    selectedQuote: { insurer: 'Takaful Ikhlas' },
    addOnsConfirmed: false,
  };
  const decision = decide('what is betterment?', state);

  assert.equal(decision.mode, CONVERSATION_MODES.INSURANCE_QUESTION);
  assert.equal(decision.action, CONVERSATION_ACTIONS.ANSWER_THEN_RESUME);
  assert.equal(decision.shouldResumeFlow, true);
  assert.equal(shouldSuppressStepLine(decision), true);
});

test('classifies quote comparison during quote step', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    addOnsConfirmed: false,
  };
  const decision = decide('why should I choose Takaful instead of Allianz?', state);

  assert.equal(decision.mode, CONVERSATION_MODES.QUOTE_COMPARISON);
  assert.equal(decision.action, CONVERSATION_ACTIONS.ANSWER_THEN_RESUME);
  assert.equal(decision.shouldAskOneFollowUp, true);
});

test('classifies change request after quote selection', () => {
  const state = {
    step: FLOW_STEPS.ADDONS,
    selectedQuote: { insurer: 'Takaful Ikhlas' },
    addOnsConfirmed: false,
  };
  const decision = decide('can I switch to Etiqa?', state);

  assert.equal(decision.mode, CONVERSATION_MODES.CHANGE_REQUEST);
  assert.equal(decision.action, CONVERSATION_ACTIONS.CHANGE_SELECTION);
});

test('classifies user correction as correction mode', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    selectedQuote: null,
  };
  const decision = decide('that is not my vehicle, the plate is wrong', state);

  assert.equal(decision.mode, CONVERSATION_MODES.CORRECTION);
  assert.equal(decision.action, CONVERSATION_ACTIONS.ASK_FOLLOW_UP);
});

test('classifies confused quote reply as confused mode', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    addOnsConfirmed: false,
  };
  const decision = decide('hmm dunno lah', state);

  assert.equal(decision.mode, CONVERSATION_MODES.CONFUSED);
  assert.equal(decision.action, CONVERSATION_ACTIONS.CLARIFY_CONFUSION);
});

test('classifies yes/confirm as ready to proceed', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    addOnsConfirmed: false,
  };
  const decision = decide('yes', state);

  assert.equal(decision.mode, CONVERSATION_MODES.READY_TO_PROCEED);
  assert.equal(decision.action, CONVERSATION_ACTIONS.ADVANCE_FLOW);
});

test('advisor strategy gives quote comparison consulting guidance', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    userPreferences: { budgetFocused: true },
  };
  const decision = decide('which insurer do you recommend?', state);
  const recommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    state,
    message: 'which insurer do you recommend?',
  });
  const instruction = buildAdvisorStrategyInstruction(decision, state, { quoteRecommendation: recommendation });

  assert.match(instruction, /compare insurer choices/i);
  assert.match(instruction, /Recommended quote/i);
  assert.match(instruction, /current quote data/i);
});

test('orchestrator includes engine context for quote choices', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    vehicleInfo: { sampleId: 'JRT9289' },
  };
  const decision = decide('which is cheapest?', state);

  assert.equal(decision.mode, CONVERSATION_MODES.QUOTE_COMPARISON);
  assert.ok(decision.engineContext.quoteOptions.length >= 7);
  assert.equal(decision.engineContext.cheapestQuote.insurer, 'Takaful Ikhlas Insurance');
  assert.equal(decision.engineContext.cheapestQuote.priceLabel, 'RM 796');
  assert.match(decision.engineContext.nextActionHints.join(' '), /Compare current insurers/i);
});

test('advisor strategy includes engine-aware quote, add-on, road-tax, and total context', () => {
  const state = {
    step: FLOW_STEPS.ADDONS,
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      priceBefore: 995,
      sumInsured: 34000,
      coverType: 'Comprehensive',
    },
    selectedAddOns: [],
    addOnsConfirmed: false,
    selectedRoadTax: null,
    ownerIdType: 'nric',
  };
  const decision = decide('what add-ons do I need?', state);
  const instruction = buildAdvisorStrategyInstruction(decision, state);

  assert.match(instruction, /ENGINE-AWARE CONTEXT/i);
  assert.match(instruction, /Selected quote: Takaful Ikhlas Insurance \(RM 796, sum insured RM 34,000\)/i);
  assert.match(instruction, /Current total: RM 869\.68/i);
  assert.match(instruction, /Add-ons: not selected yet/i);
  assert.match(instruction, /Road tax physical\/delivery eligibility: not eligible/i);
  assert.match(instruction, /Windscreen premium = selected coverage amount x 15%/i);
});

test('add-on recommendation question during add-ons stays as insurance question', () => {
  const state = {
    step: FLOW_STEPS.ADDONS,
    selectedQuote: { insurer: 'Takaful Ikhlas Insurance', priceAfter: 796 },
    addOnsConfirmed: false,
  };
  const decision = decide('which add-ons do I need?', state);

  assert.equal(decision.mode, CONVERSATION_MODES.INSURANCE_QUESTION);
  assert.equal(decision.action, CONVERSATION_ACTIONS.ANSWER_THEN_RESUME);
});

test('insurer comparison during add-ons remains quote comparison', () => {
  const state = {
    step: FLOW_STEPS.ADDONS,
    selectedQuote: { insurer: 'Takaful Ikhlas Insurance', priceAfter: 796 },
    addOnsConfirmed: false,
  };
  const decision = decide('compare Allianz and Takaful for me', state);

  assert.equal(decision.mode, CONVERSATION_MODES.QUOTE_COMPARISON);
});

test('insurance concepts allow general NCD explanation without insurer database facts', () => {
  const message = 'what is NCD?';
  const instruction = buildInsuranceConceptInstruction(message, { step: FLOW_STEPS.QUOTES });

  assert.equal(shouldUseGeneralConceptAnswer(message), true);
  assert.match(instruction, /No Claim Discount/i);
  assert.match(instruction, /approved general explanations/i);
});

test('insurance concepts still treat zero betterment insurer questions as insurer-specific', () => {
  const message = 'which insurer has zero betterment?';

  assert.equal(shouldUseGeneralConceptAnswer(message), false);
});

test('recommendation engine picks cheapest quote for budget-focused user', () => {
  const recommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    userPreferences: { budgetFocused: true },
    message: 'I want the cheapest option',
  });

  assert.equal(recommendation.recommendedQuote.insurerKey, 'takaful');
  assert.match(recommendation.reasons.join(' '), /lowest premium/i);
});

test('recommendation engine uses approved betterment facts for older-car users', () => {
  const recommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    message: 'My car is old. I want to avoid betterment and surprise repair cost.',
  });

  assert.equal(recommendation.recommendedQuote.insurerKey, 'tokio');
  assert.ok(recommendation.scores.facts > 0.5);
  assert.match(recommendation.reasons.join(' '), /betterment-related support/i);
  assert.ok(recommendation.recommendationTags.includes('older_car'));
});

test('recommendation engine uses Tesla-specific approved facts ahead of generic EV facts', () => {
  const recommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    message: 'Which is best for my Tesla EV charger and battery towing?',
  });

  assert.equal(recommendation.recommendedQuote.insurerKey, 'etiqa');
  assert.match(recommendation.factReasons.join(' '), /Tesla-specific support/i);
  assert.ok(recommendation.recommendationTags.includes('tesla'));
});

test('recommendation engine uses brand-program facts only when brand context matches', () => {
  const recommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    state: { vehicleInfo: { model: '2019 Perodua Myvi 1.5' } },
    message: 'Which one is good for my Perodua Myvi?',
  });

  assert.equal(recommendation.recommendedQuote.insurerKey, 'takaful');
  assert.match(recommendation.factReasons.join(' '), /brand-program suitability/i);
  assert.ok(recommendation.recommendationTags.includes('perodua'));
});

test('quote recommendation instruction gives a parsable direct recommendation', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    userPreferences: { budgetFocused: true },
  };
  const decision = decide('recommend one for me', state);
  const quoteRecommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    state,
    message: 'recommend one for me',
  });
  const instruction = buildQuoteRecommendationInstruction(decision, {
    quoteRecommendation,
    state,
    message: 'recommend one for me',
  });

  assert.match(instruction, /I recommend Takaful Ikhlas Insurance/i);
  assert.match(instruction, /Approved fact-backed reasons/i);
  assert.match(instruction, /Do not expand them into extra benefits/i);
  assert.match(instruction, /Do not show the full quote list again/i);
});
