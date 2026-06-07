import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationState,
  detectUserIntent,
  FLOW_STEPS,
  USER_INTENTS,
} from '../src/lib/conversationState.js';
import { getQuotes } from '../src/lib/insuranceData.js';
import {
  buildConversationDecision,
  CONVERSATION_ACTIONS,
  CONVERSATION_MODES,
} from '../src/server/ai/orchestrator.js';
import {
  buildTurnKnowledgeInstructions,
  buildTurnKnowledgePlan,
} from '../src/server/ai/turnKnowledgeContext.js';
import {
  buildTurnPlan,
  buildTurnPlannerInstruction,
  buildTurnQuestionInstruction,
  TURN_FORCED_RESPONSES,
  TURN_QUESTION_GUIDANCE,
  TURN_RESPONSE_PATTERNS,
} from '../src/server/ai/turnPlanner.js';
import {
  addTurnInstruction,
  addTurnInstructions,
  buildTurnInstructionMessages,
  createTurnInstructionStack,
  TURN_INSTRUCTION_PRIORITY,
} from '../src/server/ai/turnInstructionStack.js';
import {
  buildAddOnsFromSelection,
  extractWindscreenCoverageAmount,
} from '../src/server/insurance/addonEngine.js';
import {
  buildQuoteRecommendation,
} from '../src/server/insurance/recommendationEngine.js';
import {
  quoteSelectionFromIntent,
} from '../src/server/insurance/quoteEngine.js';

function makeState(overrides = {}) {
  const state = new ConversationState();
  Object.assign(state, overrides);

  state.transaction = {
    ...state.transaction,
    ...(overrides.transaction || {}),
  };
  state.userPreferences = {
    ...state.userPreferences,
    ...(overrides.userPreferences || {}),
    preferenceScores: {
      ...state.userPreferences.preferenceScores,
      ...(overrides.userPreferences?.preferenceScores || {}),
    },
  };

  return state;
}

function makeVehicleReadyState(overrides = {}) {
  return makeState({
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
}

function simulateConsultantTurn(message, stateOverrides = {}) {
  const state = stateOverrides instanceof ConversationState
    ? stateOverrides
    : makeState(stateOverrides);
  const intent = detectUserIntent(message, state);
  const decision = buildConversationDecision({
    message,
    intent,
    state,
    messages: [{ role: 'user', content: message }],
  });
  const turnPlan = buildTurnPlan({
    message,
    intent,
    state,
    decision,
    engineContext: decision.engineContext,
  });
  const quoteRecommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    state,
    userPreferences: state.userPreferences,
    message,
  });
  const turnKnowledgePlan = buildTurnKnowledgePlan({
    message,
    intent,
    state,
    decision,
    turnPlan,
    quoteRecommendation,
  });
  const turnKnowledgeInstructions = buildTurnKnowledgeInstructions(turnKnowledgePlan, {
    message,
    decision,
    state,
    quoteRecommendation,
  });

  return {
    state,
    intent,
    decision,
    turnPlan,
    quoteRecommendation,
    turnKnowledgePlan,
    turnKnowledgeInstructions,
  };
}

function buildSimulationInstructionMessages(simulation) {
  const stack = createTurnInstructionStack();
  addTurnInstruction(stack, 'Do not confirm payment unless payment state confirms success.', {
    id: 'simulation-safety',
    priority: TURN_INSTRUCTION_PRIORITY.SAFETY,
    category: 'safety',
  });
  addTurnInstruction(stack, buildTurnPlannerInstruction(simulation.turnPlan), {
    id: 'simulation-planner',
    priority: TURN_INSTRUCTION_PRIORITY.PLANNER,
    category: 'planner',
  });
  addTurnInstruction(stack, buildTurnQuestionInstruction(simulation.turnPlan, {
    state: simulation.state,
  }), {
    id: 'simulation-question',
    priority: TURN_INSTRUCTION_PRIORITY.PLANNER,
    category: 'planner',
  });
  addTurnInstructions(stack, simulation.turnKnowledgeInstructions, {
    id: 'simulation-knowledge',
    priority: TURN_INSTRUCTION_PRIORITY.KNOWLEDGE,
    category: 'knowledge',
  });
  return buildTurnInstructionMessages(stack);
}

function applySimulatedMutation(message, state, simulation) {
  const { intent } = simulation;

  if (intent.intent === USER_INTENTS.SELECT_QUOTE) {
    const quote = quoteSelectionFromIntent(state, intent.data?.insurer);
    if (quote) state.selectQuote(quote);
  }

  if (intent.intent === USER_INTENTS.SELECT_ADDON) {
    const coverageAmount = extractWindscreenCoverageAmount(message, { allowBareAmount: true }) || 2000;
    const addOns = buildAddOnsFromSelection(intent.data?.addOns || [], { coverageAmount });
    state.selectAddOns(addOns);
  }

  return state;
}

test('simulation: quote recommendation answers like a consultant without forcing quote cards', () => {
  const state = makeVehicleReadyState({
    userPreferences: { budgetFocused: true },
  });

  const simulation = simulateConsultantTurn('which insurer do you recommend for my Myvi?', state);

  assert.equal(simulation.intent.intent, USER_INTENTS.ASK_QUESTION);
  assert.equal(simulation.decision.mode, CONVERSATION_MODES.QUOTE_COMPARISON);
  assert.equal(simulation.decision.action, CONVERSATION_ACTIONS.ANSWER_THEN_RESUME);
  assert.equal(simulation.turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME);
  assert.equal(simulation.turnPlan.questionGuidance, TURN_QUESTION_GUIDANCE.QUOTE_RECOMMENDATION);
  assert.equal(simulation.turnPlan.shouldShowQuoteCards, false);
  assert.equal(simulation.turnPlan.shouldResumeFlow, true);
  assert.ok(simulation.quoteRecommendation.recommendedQuote);
  assert.ok(simulation.quoteRecommendation.reasons.length > 0);
  assert.equal(simulation.turnKnowledgePlan.shouldInjectRecommendationContext, true);
  assert.ok(simulation.turnKnowledgeInstructions.some((instruction) => /QUOTE RECOMMENDATION ENGINE/i.test(instruction)));
});

test('simulation: add-on side question answers first and resumes the add-on decision', () => {
  const state = makeVehicleReadyState({
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

  const simulation = simulateConsultantTurn('what is special perils and do I need it?', state);

  assert.equal(simulation.intent.intent, USER_INTENTS.ASK_QUESTION);
  assert.equal(simulation.decision.mode, CONVERSATION_MODES.INSURANCE_QUESTION);
  assert.equal(simulation.decision.action, CONVERSATION_ACTIONS.ANSWER_THEN_RESUME);
  assert.equal(simulation.turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME);
  assert.equal(simulation.turnPlan.questionGuidance, TURN_QUESTION_GUIDANCE.ADDON_RECOMMENDATION);
  assert.equal(simulation.turnPlan.shouldShowAddOnSelector, false);
  assert.equal(simulation.turnPlan.shouldResumeFlow, true);
  assert.equal(state.step, FLOW_STEPS.ADDONS);
});

test('simulation: insurer change request is detected as a change, not a normal question', () => {
  const state = makeVehicleReadyState({
    step: FLOW_STEPS.ADDONS,
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      priceBefore: 995,
      ncdPercent: 20,
      sumInsured: 34000,
      coverType: 'Comprehensive',
    },
  });

  const simulation = simulateConsultantTurn('can I switch to Etiqa instead?', state);

  assert.equal(simulation.intent.intent, USER_INTENTS.CHANGE_QUOTE);
  assert.equal(simulation.intent.data.newInsurer, 'etiqa');
  assert.equal(simulation.decision.mode, CONVERSATION_MODES.CHANGE_REQUEST);
  assert.equal(simulation.decision.action, CONVERSATION_ACTIONS.CHANGE_SELECTION);
});

test('simulation: vehicle correction stays in correction mode and asks one follow-up', () => {
  const state = makeVehicleReadyState();

  const simulation = simulateConsultantTurn('actually my postcode should be 47100', state);

  assert.equal(simulation.decision.mode, CONVERSATION_MODES.CORRECTION);
  assert.equal(simulation.decision.action, CONVERSATION_ACTIONS.ASK_FOLLOW_UP);
  assert.equal(simulation.turnPlan.shouldAskOneQuestion, true);
  assert.equal(simulation.turnPlan.shouldAvoidStepLanguage, true);
});

test('simulation: confused quote user gets simplified choices instead of a quote dump', () => {
  const state = makeVehicleReadyState();

  const simulation = simulateConsultantTurn('hmm dunno lah', state);

  assert.equal(simulation.intent.intent, USER_INTENTS.UNCLEAR_OR_PLAYFUL);
  assert.equal(simulation.decision.mode, CONVERSATION_MODES.CONFUSED);
  assert.equal(simulation.decision.action, CONVERSATION_ACTIONS.CLARIFY_CONFUSION);
  assert.equal(simulation.turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.CLARIFY_CONFUSION);
  assert.equal(simulation.turnPlan.shouldAskOneQuestion, true);
  assert.equal(simulation.turnPlan.shouldShowQuoteCards, false);
});

test('simulation: simple yes at quote step is ready-to-proceed, not insurer advice', () => {
  const state = makeVehicleReadyState();

  const simulation = simulateConsultantTurn('yes', state);

  assert.equal(simulation.intent.intent, USER_INTENTS.CONFIRM);
  assert.equal(simulation.decision.mode, CONVERSATION_MODES.READY_TO_PROCEED);
  assert.equal(simulation.decision.action, CONVERSATION_ACTIONS.ADVANCE_FLOW);
  assert.equal(simulation.turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.ADVANCE_FLOW);
  assert.equal(simulation.turnKnowledgePlan.shouldInjectApprovedFacts, false);
});

test('simulation: printed road tax request is safely blocked for NRIC-owned vehicle', () => {
  const state = makeVehicleReadyState({
    step: FLOW_STEPS.ROADTAX,
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      sumInsured: 34000,
    },
    selectedRoadTax: null,
  });

  const simulation = simulateConsultantTurn('can I get the physical road tax delivered?', state);

  assert.equal(simulation.turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.FORCE_SAFE_RESPONSE);
  assert.equal(simulation.turnPlan.forcedResponse, TURN_FORCED_RESPONSES.PRINTED_ROADTAX_RESTRICTION);
  assert.equal(simulation.turnPlan.safetyLevel, 'blocked');
  assert.equal(simulation.turnPlan.shouldShowRoadTaxSelector, false);
  assert.ok(simulation.turnPlan.actions.includes('block_printed_roadtax_for_nric_owner'));
});

test('simulation: payment claim is blocked until payment state confirms success', () => {
  const state = makeVehicleReadyState({
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
  });

  const simulation = simulateConsultantTurn('payment done, send policy now', state);

  assert.equal(simulation.turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.BLOCK_UNSAFE_ACTION);
  assert.equal(simulation.turnPlan.forcedResponse, TURN_FORCED_RESPONSES.PAYMENT_NOT_CONFIRMED);
  assert.equal(simulation.turnPlan.safetyLevel, 'guarded');
  assert.equal(simulation.turnPlan.shouldBlockUnsafeAction, true);
  assert.ok(simulation.turnPlan.actions.includes('block_unverified_payment_or_policy_claim'));
});

test('simulation: instruction stack combines safety, knowledge, and planner instructions in priority order', () => {
  const simulation = simulateConsultantTurn(
    'which insurer do you recommend between Allianz and Takaful for my Myvi?',
    makeVehicleReadyState()
  );

  const messages = buildSimulationInstructionMessages(simulation);
  const content = messages.map((message) => message.content).join('\n\n');
  const safetyIndex = content.indexOf('Do not confirm payment');
  const knowledgeIndex = content.indexOf('LAJOO KNOWLEDGE AND RECOMMENDATION CONTROL');
  const plannerIndex = content.indexOf('LAJOO TURN PLAN');

  assert.match(messages[0].content, /LAJOO TURN INSTRUCTION STACK/i);
  assert.ok(safetyIndex > -1);
  assert.ok(knowledgeIndex > -1);
  assert.ok(plannerIndex > -1);
  assert.ok(safetyIndex < knowledgeIndex);
  assert.ok(knowledgeIndex < plannerIndex);
  assert.match(content, /Never reveal this stack/i);
});

test('simulation: side questions do not move the user forward until they actually select', () => {
  const state = makeVehicleReadyState();

  const quoteAdvice = simulateConsultantTurn('which one is safest but still affordable?', state);
  assert.equal(quoteAdvice.intent.intent, USER_INTENTS.ASK_QUESTION);
  assert.equal(quoteAdvice.decision.action, CONVERSATION_ACTIONS.ANSWER_THEN_RESUME);
  assert.equal(state.step, FLOW_STEPS.QUOTES);

  const quoteSelection = simulateConsultantTurn('takaful', state);
  applySimulatedMutation('takaful', state, quoteSelection);
  assert.equal(quoteSelection.intent.intent, USER_INTENTS.SELECT_QUOTE);
  assert.equal(state.step, FLOW_STEPS.ADDONS);

  const addOnQuestion = simulateConsultantTurn('what is windscreen?', state);
  assert.equal(addOnQuestion.intent.intent, USER_INTENTS.ASK_QUESTION);
  assert.equal(addOnQuestion.decision.action, CONVERSATION_ACTIONS.ANSWER_THEN_RESUME);
  assert.equal(state.step, FLOW_STEPS.ADDONS);

  const addOnSkip = simulateConsultantTurn('skip add-ons', state);
  applySimulatedMutation('skip add-ons', state, addOnSkip);
  assert.equal(addOnSkip.intent.intent, USER_INTENTS.SELECT_ADDON);
  assert.equal(state.step, FLOW_STEPS.ROADTAX);

  const roadTaxQuestion = simulateConsultantTurn('where else can I renew road tax?', state);
  assert.equal(roadTaxQuestion.intent.intent, USER_INTENTS.ASK_QUESTION);
  assert.equal(roadTaxQuestion.decision.action, CONVERSATION_ACTIONS.ANSWER_THEN_RESUME);
  assert.equal(roadTaxQuestion.turnPlan.questionGuidance, TURN_QUESTION_GUIDANCE.ROADTAX_ALTERNATIVE);
  assert.equal(state.step, FLOW_STEPS.ROADTAX);
});
