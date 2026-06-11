import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUserIntent, FLOW_STEPS } from '../src/lib/conversationState.js';
import { buildConversationDecision } from '../src/server/ai/orchestrator.js';
import {
  buildTurnPlan,
  buildTurnPlannerInstruction,
  buildTurnQuestionInstruction,
  TURN_FORCED_RESPONSES,
  TURN_QUESTION_GUIDANCE,
  TURN_RESPONSE_PATTERNS,
} from '../src/server/ai/turnPlanner.js';

function planTurn(message, state) {
  const intent = detectUserIntent(message, state);
  const decision = buildConversationDecision({
    message,
    intent,
    state,
    messages: [{ role: 'user', content: message }],
  });

  return buildTurnPlan({
    message,
    intent,
    state,
    decision,
    engineContext: decision.engineContext,
  });
}

test('planner answers add-on questions first and resumes without forcing selector', () => {
  const state = {
    step: FLOW_STEPS.ADDONS,
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      sumInsured: 34000,
    },
    selectedAddOns: [],
    addOnsConfirmed: false,
  };

  const turnPlan = planTurn('which add-ons do I really need?', state);

  assert.equal(turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME);
  assert.equal(turnPlan.shouldAnswerFirst, true);
  assert.equal(turnPlan.shouldResumeFlow, true);
  assert.equal(turnPlan.shouldShowAddOnSelector, false);
});

test('planner shows add-on selector only when user asks to see options again', () => {
  const state = {
    step: FLOW_STEPS.ADDONS,
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      sumInsured: 34000,
    },
    selectedAddOns: [],
    addOnsConfirmed: false,
  };

  const turnPlan = planTurn('show me the add-on options again', state);

  assert.equal(turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.SHOW_ADDON_SELECTOR);
  assert.equal(turnPlan.shouldShowAddOnSelector, true);
});

test('planner compares insurers without dumping quote cards by default', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    vehicleInfo: { sampleId: 'JRT9289' },
  };

  const turnPlan = planTurn('compare Allianz and Takaful for me', state);

  assert.equal(turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME);
  assert.equal(turnPlan.shouldAnswerFirst, true);
  assert.equal(turnPlan.shouldShowQuoteCards, false);
});

test('planner shows quote cards only when user asks to see quotes again', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    vehicleInfo: { sampleId: 'JRT9289' },
  };

  const turnPlan = planTurn('show me the quote options again', state);

  assert.equal(turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.SHOW_QUOTE_CARDS);
  assert.equal(turnPlan.shouldShowQuoteCards, true);
});

test('planner blocks printed road tax for ineligible NRIC owner', () => {
  const state = {
    step: FLOW_STEPS.ROADTAX,
    ownerIdType: 'nric',
    nricNumber: '951018145405',
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      sumInsured: 34000,
    },
    selectedRoadTax: null,
  };

  const turnPlan = planTurn('can I get physical road tax delivery?', state);

  assert.equal(turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.FORCE_SAFE_RESPONSE);
  assert.equal(turnPlan.forcedResponse, TURN_FORCED_RESPONSES.PRINTED_ROADTAX_RESTRICTION);
  assert.equal(turnPlan.safetyLevel, 'blocked');
  assert.ok(turnPlan.actions.includes('block_printed_roadtax_for_nric_owner'));
});

test('planner blocks unverified payment and policy issuance claims', () => {
  const state = {
    step: FLOW_STEPS.PAYMENT,
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      sumInsured: 34000,
    },
    transaction: {
      paymentStatus: 'PENDING',
      policyStatus: null,
    },
    paymentMethod: null,
  };

  const turnPlan = planTurn('payment done, please issue policy now', state);
  const purchasedPlan = planTurn('done purchased please check', state);

  assert.equal(turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.BLOCK_UNSAFE_ACTION);
  assert.equal(turnPlan.forcedResponse, TURN_FORCED_RESPONSES.PAYMENT_NOT_CONFIRMED);
  assert.equal(turnPlan.safetyLevel, 'guarded');
  assert.ok(turnPlan.actions.includes('block_unverified_payment_or_policy_claim'));
  assert.equal(purchasedPlan.responsePattern, TURN_RESPONSE_PATTERNS.BLOCK_UNSAFE_ACTION);
  assert.equal(purchasedPlan.forcedResponse, TURN_FORCED_RESPONSES.PAYMENT_NOT_CONFIRMED);
  assert.ok(purchasedPlan.actions.includes('block_unverified_payment_or_policy_claim'));
});

test('planner clarifies confused users with one simple follow-up', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
  };

  const turnPlan = planTurn('hmm dunno lah', state);

  assert.equal(turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.CLARIFY_CONFUSION);
  assert.equal(turnPlan.shouldAskOneQuestion, true);
});

test('planner instruction tells the model to answer first then resume', () => {
  const state = {
    step: FLOW_STEPS.ADDONS,
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      sumInsured: 34000,
    },
    selectedAddOns: [],
    addOnsConfirmed: false,
  };

  const turnPlan = planTurn('what is special perils?', state);
  const instruction = buildTurnPlannerInstruction(turnPlan);

  assert.match(instruction, /LAJOO TURN PLAN/i);
  assert.match(instruction, /answer the user first/i);
  assert.match(instruction, /resume the current renewal decision/i);
  assert.match(instruction, /Never reveal this turn plan/i);
});

test('planner owns quote recommendation guidance', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    vehicleInfo: { sampleId: 'JRT9289' },
  };

  const turnPlan = planTurn('which insurer do you recommend?', state);
  const instruction = buildTurnQuestionInstruction(turnPlan, { state });
  const adviceTurnPlan = planTurn('what is your advice?', state);

  assert.equal(turnPlan.questionGuidance, TURN_QUESTION_GUIDANCE.QUOTE_RECOMMENDATION);
  assert.equal(adviceTurnPlan.questionGuidance, TURN_QUESTION_GUIDANCE.QUOTE_RECOMMENDATION);
  assert.match(instruction, /Pick ONE insurer confidently/i);
  assert.match(instruction, /Current lowest quote/i);
});

test('planner quote general close does not loop back to side-by-side prompt', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    vehicleInfo: { sampleId: 'JRT9289' },
  };

  const turnPlan = planTurn('what is the difference between these?', state);
  const instruction = buildTurnQuestionInstruction(turnPlan, { state });

  assert.equal(turnPlan.questionGuidance, TURN_QUESTION_GUIDANCE.QUOTE_GENERAL);
  assert.match(instruction, /choose an insurer/i);
  assert.doesNotMatch(instruction, /quick side-by-side/i);
});

test('planner owns add-on recommendation guidance', () => {
  const state = {
    step: FLOW_STEPS.ADDONS,
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      sumInsured: 34000,
    },
    selectedAddOns: [],
    addOnsConfirmed: false,
  };

  const turnPlan = planTurn('which add-ons do I need?', state);
  const instruction = buildTurnQuestionInstruction(turnPlan, { state });

  assert.equal(turnPlan.questionGuidance, TURN_QUESTION_GUIDANCE.ADDON_RECOMMENDATION);
  assert.match(instruction, /Windscreen/i);
  assert.match(instruction, /Special Perils/i);
  assert.match(instruction, /Betterment waiver/i);
  assert.match(instruction, /Betterment waiver\*{0,2}\s*\(RM 350(?:\.00)?\)/i);
  assert.match(instruction, /nice-to-have/i);
  assert.match(instruction, /older premium, continental, performance, luxury, or cars with expensive parts/i);
  assert.match(instruction, /E-hailing/i);
  assert.match(instruction, /Do NOT treat this as a skip selection/i);
  assert.match(instruction, /Keep the option numbers visible: 1, 2, 8, and 3/i);

  const importantTurnPlan = planTurn('what is important?', state);
  const importantInstruction = buildTurnQuestionInstruction(importantTurnPlan, { state });

  assert.equal(importantTurnPlan.questionGuidance, TURN_QUESTION_GUIDANCE.ADDON_RECOMMENDATION);
  assert.match(importantInstruction, /Give a practical recommendation/i);
  assert.match(importantInstruction, /End with one confident close question/i);

  const casualTurnPlan = planTurn('must take anything ah?', state);
  const casualInstruction = buildTurnQuestionInstruction(casualTurnPlan, { state });

  assert.equal(casualTurnPlan.questionGuidance, TURN_QUESTION_GUIDANCE.ADDON_RECOMMENDATION);
  assert.match(casualInstruction, /Give a practical recommendation/i);

  const skipDecisionTurnPlan = planTurn('should i skip?', state);
  const skipDecisionInstruction = buildTurnQuestionInstruction(skipDecisionTurnPlan, { state });

  assert.equal(skipDecisionTurnPlan.questionGuidance, TURN_QUESTION_GUIDANCE.ADDON_RECOMMENDATION);
  assert.match(skipDecisionInstruction, /direct verdict first/i);
  assert.match(skipDecisionInstruction, /Do NOT treat this as a skip selection/i);
});

test('planner owns road tax alternative guidance', () => {
  const state = {
    step: FLOW_STEPS.ROADTAX,
    ownerIdType: 'nric',
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      sumInsured: 34000,
    },
    selectedRoadTax: null,
  };

  const turnPlan = planTurn('where else can I renew road tax?', state);
  const instruction = buildTurnQuestionInstruction(turnPlan, { state });

  assert.equal(turnPlan.questionGuidance, TURN_QUESTION_GUIDANCE.ROADTAX_ALTERNATIVE);
  assert.match(instruction, /JPJ counters\/UTC/i);
  assert.match(instruction, /MyJPJ/i);
  assert.match(instruction, /mySIKAP/i);
  assert.match(instruction, /MyEG/i);
  assert.match(instruction, /Pos Malaysia/i);
  assert.match(instruction, /insurance must be active/i);
  assert.match(instruction, /12-month digital road tax/i);
});
