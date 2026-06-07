import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationState,
  detectUserIntent,
  FLOW_STEPS,
} from '../src/lib/conversationState.js';
import { buildConversationDecision } from '../src/server/ai/orchestrator.js';
import { buildTurnPlan } from '../src/server/ai/turnPlanner.js';
import {
  buildLiveKnowledgeSnapshot,
} from '../src/server/ai/turnGroundingInstructions.js';
import {
  buildProductionTurnInstructionMessages,
  buildStepStyleInstruction,
} from '../src/server/ai/productionTurnInstructionBuilder.js';
import {
  buildProductionOpenAiMessages,
} from '../src/server/ai/productionOpenAiMessageBuilder.js';

function makeQuoteState(overrides = {}) {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    ownerIdType: 'nric',
    vehicleInfo: {
      plateNumber: 'JRT9289',
      make: 'Perodua',
      model: 'Myvi',
      year: 2019,
    },
    selectedQuote: null,
    ...overrides,
  });
  return state;
}

function makeSelectedAddOnsState(overrides = {}) {
  return makeQuoteState({
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
    ...overrides,
  });
}

function planTurn(message, state, history = []) {
  const messages = [...history, { role: 'user', content: message }];
  const intent = detectUserIntent(message, state);
  const decision = buildConversationDecision({
    message,
    intent,
    state,
    messages,
  });
  const turnPlan = buildTurnPlan({
    message,
    intent,
    state,
    decision,
    engineContext: decision.engineContext,
  });

  return { intent, decision, turnPlan, messages };
}

function joinedInstructionText(result) {
  return result.messages.map((message) => String(message.content || '')).join('\n\n');
}

test('production turn builder centralizes the full consultant instruction stack', async () => {
  const state = makeSelectedAddOnsState({
    userPreferences: {
      budgetFocused: true,
      claimsFocused: false,
      coverageFocused: false,
      concisePreferred: true,
      preferenceScores: {},
    },
  });
  const message = 'what is betterment?';
  const history = [
    {
      role: 'assistant',
      content: 'Takaful is the cheapest option. Which add-ons would you like?',
    },
  ];
  const { intent, decision, turnPlan, messages } = planTurn(message, state, history);

  const result = await buildProductionTurnInstructionMessages({
    latestMessage: message,
    messages,
    state,
    intent,
    decision,
    turnPlan,
    questionKnowledgeMatches: [],
    buildStepContractInstruction: () => 'INTERNAL FLOW CHECKPOINT\nStay on the current safe flow.',
    buildAntiRepetitionInstruction: () => 'DO-NOT-REPEAT MEMORY WINDOW\nAvoid repeating the last quote-selection wording.',
  });
  const text = joinedInstructionText(result);

  assert.ok(result.messages.length > 0);
  assert.match(text, /LAJOO TURN INSTRUCTION STACK/i);
  assert.match(text, /LAJOO PRODUCTION RESPONSE QUALITY CONTRACT/i);
  assert.match(text, /STEP STYLE PROFILE/i);
  assert.match(text, /Practical consultant mode/i);
  assert.match(text, /INTERNAL FLOW CHECKPOINT/i);
  assert.match(text, /DO-NOT-REPEAT MEMORY WINDOW/i);
  assert.match(text, /GENERAL CONCEPT GROUNDING/i);
  assert.match(text, /APPROVED GENERAL INSURANCE CONCEPTS/i);
  assert.match(text, /Ask at most one closing question/i);
});

test('production turn builder uses grounded insurer facts for comparison questions', async () => {
  const state = makeQuoteState();
  const message = 'compare Allianz and Takaful for zero betterment';
  const { intent, decision, turnPlan, messages } = planTurn(message, state);
  const matches = [
    {
      question: 'Allianz private car betterment support',
      answer: 'Zero betterment terms are available only when the applicable approved add-on or policy condition is present.',
      sourceType: 'approved_fact',
    },
    {
      question: 'Takaful Ikhlas betterment support',
      answer: 'Betterment treatment depends on product wording and selected add-ons.',
      sourceType: 'approved_fact',
    },
  ];

  const result = await buildProductionTurnInstructionMessages({
    latestMessage: message,
    messages,
    state,
    intent,
    decision,
    turnPlan,
    questionKnowledgeMatches: matches,
  });
  const text = joinedInstructionText(result);

  assert.match(text, /QUESTION GROUNDING \(MANDATORY\)/i);
  assert.match(text, /Allianz private car betterment support/i);
  assert.match(text, /Takaful Ikhlas betterment support/i);
  assert.match(text, /COMPARISON ANSWER CONTRACT/i);
  assert.match(text, /not found in current insurer database/i);
});

test('step style instruction changes with current renewal stage', () => {
  const quoteState = makeQuoteState();
  const addOnsState = makeSelectedAddOnsState();
  const paymentState = makeSelectedAddOnsState({ step: FLOW_STEPS.PAYMENT });

  assert.match(buildStepStyleInstruction(quoteState), /Advisor mode/i);
  assert.match(buildStepStyleInstruction(addOnsState), /Practical consultant mode/i);
  assert.match(buildStepStyleInstruction(paymentState), /Transaction mode/i);
});

test('live knowledge snapshot is compact and source-labelled', () => {
  const snapshot = buildLiveKnowledgeSnapshot([
    {
      question: 'Allianz towing',
      answer: '24-hour roadside assistance details are described in the selected Allianz roadside assistance wording.',
      sourceType: 'db_approved_fact',
    },
  ]);

  assert.deepEqual(snapshot, [
    'Allianz towing [approved_fact]: 24-hour roadside assistance details are described in the selected Allianz roadside assistance wording.',
  ]);
});

test('production OpenAI message builder returns base prompt, history, and instruction stack', async () => {
  const state = makeQuoteState();
  const message = 'hi';
  const { intent, decision, turnPlan, messages } = planTurn(message, state, [
    { role: 'assistant', content: 'I can help with your renewal.' },
  ]);

  const result = await buildProductionOpenAiMessages({
    latestMessage: message,
    messages,
    state,
    intent,
    decision,
    turnPlan,
    promptVariant: 'A',
    buildSystemPrompt: (_state, _vehicleProfile, variant, liveKnowledgeSnapshot) => (
      `BASE SYSTEM PROMPT variant=${variant} facts=${liveKnowledgeSnapshot.length}`
    ),
    buildStepContractInstruction: () => 'INTERNAL FLOW CHECKPOINT\nKeep the flow safe.',
  });
  const joined = joinedInstructionText({ messages: result.openAiMessages });

  assert.equal(result.openAiMessages[0].role, 'system');
  assert.match(result.openAiMessages[0].content, /BASE SYSTEM PROMPT variant=A facts=0/i);
  assert.ok(result.openAiMessages.some((entry) => entry.role === 'assistant'));
  assert.ok(result.openAiMessages.some((entry) => entry.role === 'user' && entry.content === message));
  assert.match(joined, /LAJOO TURN INSTRUCTION STACK/i);
  assert.match(joined, /INTERNAL FLOW CHECKPOINT/i);
});
