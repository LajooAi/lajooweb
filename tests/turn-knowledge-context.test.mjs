import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_STEPS, USER_INTENTS } from '../src/lib/conversationState.js';
import { getQuotes } from '../src/lib/insuranceData.js';
import { CONVERSATION_MODES } from '../src/server/ai/orchestrator.js';
import { TURN_QUESTION_GUIDANCE } from '../src/server/ai/turnPlanner.js';
import {
  buildTurnKnowledgeInstructions,
  buildTurnKnowledgePlan,
  getApprovedFactInsurerSlugsForTurn,
} from '../src/server/ai/turnKnowledgeContext.js';
import { buildQuoteRecommendation } from '../src/server/insurance/recommendationEngine.js';

function buildQuoteRecommendationContext(message, state = {}) {
  return buildQuoteRecommendation({
    quotes: getQuotes(),
    state,
    userPreferences: state.userPreferences,
    message,
  });
}

test('knowledge context falls back to selected quote insurer when user asks a policy question', () => {
  const slugs = getApprovedFactInsurerSlugsForTurn('does it include towing?', {
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      sumInsured: 34000,
    },
  });

  assert.deepEqual(slugs, ['takaful-ikhlas']);
});

test('knowledge context detects multiple mentioned insurers for comparison turns', () => {
  const slugs = getApprovedFactInsurerSlugsForTurn('compare Allianz and Takaful for betterment', {});

  assert.deepEqual(slugs.sort(), ['allianz', 'takaful-ikhlas']);
});

test('knowledge plan injects approved facts and direct recommendation guidance for quote advice', () => {
  const message = 'which insurer do you recommend between Allianz and Takaful for my Myvi?';
  const state = {
    step: FLOW_STEPS.QUOTES,
    vehicleInfo: {
      make: 'Perodua',
      model: 'Myvi',
      year: 2019,
    },
  };
  const quoteRecommendation = buildQuoteRecommendationContext(message, state);
  const decision = {
    mode: CONVERSATION_MODES.QUOTE_COMPARISON,
  };
  const turnPlan = {
    currentStep: FLOW_STEPS.QUOTES,
    questionGuidance: TURN_QUESTION_GUIDANCE.QUOTE_RECOMMENDATION,
  };

  const plan = buildTurnKnowledgePlan({
    message,
    intent: { intent: USER_INTENTS.ASK_QUESTION },
    state,
    decision,
    turnPlan,
    quoteRecommendation,
  });
  const instructions = buildTurnKnowledgeInstructions(plan, {
    message,
    decision,
    state,
    quoteRecommendation,
  });

  assert.equal(plan.shouldInjectApprovedFacts, true);
  assert.equal(plan.shouldInjectRecommendationContext, true);
  assert.deepEqual(plan.approvedFactInsurerSlugs.sort(), ['allianz', 'takaful-ikhlas']);
  assert.ok(instructions.some((instruction) => /LAJOO KNOWLEDGE AND RECOMMENDATION CONTROL/i.test(instruction)));
  assert.ok(instructions.some((instruction) => /APPROVED INSURER KNOWLEDGE/i.test(instruction)));
  assert.ok(instructions.some((instruction) => /QUOTE RECOMMENDATION ENGINE/i.test(instruction)));
});

test('knowledge context supplies recommendation background even when user asks a factual add-on question', () => {
  const message = 'is betterment important before I choose add-ons?';
  const state = {
    step: FLOW_STEPS.ADDONS,
    selectedQuote: {
      insurer: 'Allianz Insurance',
      priceAfter: 920,
      sumInsured: 36000,
    },
    vehicleInfo: {
      make: 'Perodua',
      model: 'Myvi',
      year: 2019,
    },
  };
  const quoteRecommendation = buildQuoteRecommendationContext(message, state);
  const decision = {
    mode: CONVERSATION_MODES.INSURANCE_QUESTION,
  };
  const turnPlan = {
    currentStep: FLOW_STEPS.ADDONS,
    questionGuidance: TURN_QUESTION_GUIDANCE.ADDON_BETTERMENT,
  };

  const plan = buildTurnKnowledgePlan({
    message,
    intent: { intent: USER_INTENTS.ASK_QUESTION },
    state,
    decision,
    turnPlan,
    quoteRecommendation,
  });
  const instructions = buildTurnKnowledgeInstructions(plan, {
    message,
    decision,
    state,
    quoteRecommendation,
  });

  assert.equal(plan.shouldInjectApprovedFacts, true);
  assert.equal(plan.shouldInjectRecommendationContext, true);
  assert.deepEqual(plan.approvedFactInsurerSlugs, ['allianz']);
  assert.ok(instructions.some((instruction) => /LAJOO CONSULTANT RECOMMENDATION CONTEXT/i.test(instruction)));
  assert.ok(instructions.some((instruction) => /Do not invent new insurer benefits/i.test(instruction)));
});

test('knowledge context stays quiet for non-question transaction turns', () => {
  const state = {
    step: FLOW_STEPS.ADDONS,
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      sumInsured: 34000,
    },
  };

  const quoteRecommendation = buildQuoteRecommendationContext('confirm', state);
  const plan = buildTurnKnowledgePlan({
    message: 'confirm',
    intent: { intent: USER_INTENTS.CONFIRM },
    state,
    decision: { mode: CONVERSATION_MODES.READY_TO_PROCEED },
    turnPlan: { currentStep: FLOW_STEPS.ADDONS },
    quoteRecommendation,
  });
  const instructions = buildTurnKnowledgeInstructions(plan, {
    message: 'confirm',
    decision: { mode: CONVERSATION_MODES.READY_TO_PROCEED },
    state,
    quoteRecommendation,
  });

  assert.equal(plan.shouldInjectApprovedFacts, false);
  assert.equal(plan.shouldInjectRecommendationContext, false);
  assert.deepEqual(instructions, []);
});
