import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUserIntent, FLOW_STEPS } from '../src/lib/conversationState.js';
import {
  buildConversationDecision,
  CONVERSATION_ACTIONS,
  CONVERSATION_MODES,
} from '../src/server/ai/orchestrator.js';
import { shouldSuppressStepLine } from '../src/server/ai/responsePolicy.js';

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
