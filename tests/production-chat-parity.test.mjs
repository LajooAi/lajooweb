import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationState,
  detectUserIntent,
  FLOW_STEPS,
  USER_INTENTS,
} from '../src/lib/conversationState.js';
import {
  buildConversationDecision,
  CONVERSATION_ACTIONS,
  CONVERSATION_MODES,
} from '../src/server/ai/orchestrator.js';
import {
  buildTurnPlan,
  TURN_RESPONSE_PATTERNS,
} from '../src/server/ai/turnPlanner.js';
import {
  addTurnInstruction,
  buildTurnInstructionMessages,
  createTurnInstructionStack,
  TURN_INSTRUCTION_PRIORITY,
} from '../src/server/ai/turnInstructionStack.js';
import {
  buildProductionResponseQualityInstruction,
} from '../src/server/ai/productionResponseContract.js';

function makeSelectedRoadTaxState(overrides = {}) {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.ROADTAX,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    ownerIdType: 'nric',
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      priceBefore: 995,
      ncdPercent: 20,
      sumInsured: 34000,
      coverType: 'Comprehensive',
    },
    selectedAddOns: [
      { id: 'windscreen', name: 'Windscreen', price: 150, coverageAmount: 1000 },
    ],
    addOnsConfirmed: true,
    selectedRoadTax: { id: '12month-digital', label: '12 months digital road tax', price: 90 },
    personalDetails: {
      email: 'test@example.com',
      phone: '0123456789',
      address: 'No 1, Jalan Test, Selangor',
    },
    otpVerified: true,
    paymentMethod: 'fpx',
    transaction: {
      quoteId: 'quote_123',
      reprice: { total: 986 },
      proposalId: 'proposal_123',
      proposalStatus: 'CREATED',
      paymentIntentId: 'pay_123',
      paymentStatus: 'PENDING',
      policyNumber: null,
      policyStatus: null,
      lastError: null,
    },
    ...overrides,
  });
  return state;
}

function planTurn(message, state) {
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
  return { intent, decision, turnPlan };
}

test('later-stage add-on edit is treated as a flexible change request', () => {
  const state = makeSelectedRoadTaxState();
  const { intent, decision, turnPlan } = planTurn('can I add flood cover now?', state);

  assert.equal(intent.intent, USER_INTENTS.CHANGE_ADDONS);
  assert.equal(decision.mode, CONVERSATION_MODES.CHANGE_REQUEST);
  assert.equal(decision.action, CONVERSATION_ACTIONS.CHANGE_SELECTION);
  assert.equal(turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.ASK_ONE_FOLLOW_UP);
});

test('add-on explanation from a later stage does not incorrectly reset the flow', () => {
  const state = makeSelectedRoadTaxState();
  const { intent, decision } = planTurn('do I need flood cover?', state);

  assert.equal(intent.intent, USER_INTENTS.ASK_QUESTION);
  assert.equal(decision.mode, CONVERSATION_MODES.INSURANCE_QUESTION);
  assert.equal(decision.action, CONVERSATION_ACTIONS.ANSWER_THEN_RESUME);
});

test('resetToAddOns preserves selected insurer but clears downstream price-sensitive state', () => {
  const state = makeSelectedRoadTaxState();

  state.resetToAddOns();

  assert.equal(state.step, FLOW_STEPS.ADDONS);
  assert.equal(state.selectedQuote.insurer, 'Takaful Ikhlas Insurance');
  assert.equal(state.selectedAddOns.length, 1);
  assert.equal(state.addOnsConfirmed, false);
  assert.equal(state.selectedRoadTax, null);
  assert.equal(state.personalDetails, null);
  assert.equal(state.otpVerified, false);
  assert.equal(state.paymentMethod, null);
  assert.equal(state.transaction.quoteId, 'quote_123');
  assert.equal(state.transaction.reprice, null);
  assert.equal(state.transaction.proposalId, null);
  assert.equal(state.transaction.paymentIntentId, null);
  assert.equal(state.transaction.paymentStatus, null);
});

test('production response contract hides step wording and preserves consultant flexibility', () => {
  const state = makeSelectedRoadTaxState();
  const { intent, decision, turnPlan } = planTurn('can I add windscreen also?', state);
  const instruction = buildProductionResponseQualityInstruction({
    state,
    decision,
    turnPlan,
    intent,
  });

  assert.match(instruction, /LAJOO PRODUCTION RESPONSE QUALITY CONTRACT/i);
  assert.match(instruction, /Do not show "Step X of 6"/i);
  assert.match(instruction, /Answer the user's actual message first/i);
  assert.match(instruction, /change insurer, add-ons, road tax, or personal details/i);
  assert.match(instruction, /Do not invent insurer facts/i);
  assert.match(instruction, /Ask at most one closing question/i);
});

test('production quality instruction can be injected into the turn instruction stack', () => {
  const state = makeSelectedRoadTaxState();
  const { intent, decision, turnPlan } = planTurn('payment done', state);
  const stack = createTurnInstructionStack();

  addTurnInstruction(stack, {
    id: 'production-response-quality',
    category: 'quality',
    priority: TURN_INSTRUCTION_PRIORITY.QUALITY,
    content: buildProductionResponseQualityInstruction({
      state,
      decision,
      turnPlan,
      intent,
    }),
  });

  const messages = buildTurnInstructionMessages(stack);
  const joined = messages.map((message) => message.content).join('\n');

  assert.match(joined, /LAJOO TURN INSTRUCTION STACK/i);
  assert.match(joined, /LAJOO PRODUCTION RESPONSE QUALITY CONTRACT/i);
  assert.match(joined, /If payment is not confirmed in state, say it is not confirmed yet/i);
});
