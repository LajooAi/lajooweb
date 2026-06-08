import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationState,
  FLOW_STEPS,
  USER_INTENTS,
} from '../src/lib/conversationState.js';
import { applyDeterministicFlowHandlers } from '../src/server/ai/flowHandlers.js';

function makeCallbacks(overrides = {}) {
  return {
    formatStepLine: (_step, title) => `**${title}**`,
    buildQuoteSelectionReply: () => 'QUOTE_SELECTION_REPLY',
    buildVehicleFoundReply: () => 'VEHICLE_FOUND_REPLY',
    buildVehicleNcdConcernReply: () => 'NCD_CONCERN_REPLY',
    buildVehicleRejectionFollowUpReply: () => 'VEHICLE_REJECTION_REPLY',
    buildSummaryBox: () => 'SUMMARY_BOX',
    buildAddOnsStepBlock: (summary) => `${summary}\nADDONS_STEP_BLOCK`,
    buildRoadTaxStepBlock: (summary) => `${summary}\nROADTAX_STEP_BLOCK`,
    buildAddOnsMenu: () => 'ADDONS_MENU',
    buildPersonalDetailsRequest: () => 'PERSONAL_DETAILS_REQUEST',
    buildPersonalDetailExampleList: () => '- **Email** (e.g. name@email.com)',
    collectPersonalDetailsFromMessages: () => ({}),
    asNonEmptyString: (value) => String(value || '').trim() || null,
    sanitizePersonalDetailExtractionInput: (value) => value,
    detectLikelyPersonalDetailTypos: () => [],
    buildPaymentLink: () => '/my/payment/test',
    buildPaymentStepBlock: (summary, link) => `${summary}\nPAYMENT_STEP_BLOCK ${link}`,
    buildQuestionFirstThenStepCloseInstruction: () => null,
    buildClarifyingQuestionInstruction: () => 'CLARIFY_ONE_QUESTION',
    OTP_PROMPT_COPY: 'OTP_PROMPT',
    formatRmAmount: (value) => `RM ${Number(value || 0).toLocaleString('en-MY')}`,
    ...overrides,
  };
}

test('flow handler forces consent-safe vehicle intake before quotes', () => {
  const state = new ConversationState();
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.PROVIDE_INFO, data: {}, confidence: 1 },
    turnPlan: {},
    messages: [{ role: 'user', content: 'renew insurance' }],
    latestMessage: 'renew insurance',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /vehicle plate number/i);
  assert.match(result.forcedAssistantResponse, /Reply \*\*I agree\*\*/);
  assert.doesNotMatch(result.forcedAssistantResponse, /2\.\s+\*\*Owner Identification Number/);
});

test('flow handler locks recommended insurer and injects add-on transition guidance', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    lastRecommendedInsurer: 'takaful',
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.CONFIRM, data: {}, confidence: 1 },
    turnPlan: {},
    messages: [
      { role: 'assistant', content: 'My recommendation is Takaful Ikhlas.' },
      { role: 'user', content: 'yes' },
    ],
    latestMessage: 'yes',
    callbacks: makeCallbacks(),
  });
  const joined = openAiMessages.map((message) => message.content).join('\n');

  assert.equal(result.forcedAssistantResponse, null);
  assert.equal(state.step, FLOW_STEPS.ADDONS);
  assert.match(state.selectedQuote?.insurer || '', /Takaful Ikhlas/i);
  assert.match(joined, /Great choice/i);
  assert.match(joined, /ADDONS_STEP_BLOCK/i);
});

test('flow handler prepares payment link fallback after valid OTP', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.PAYMENT,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      priceBefore: 995,
      ncdPercent: 20,
      sumInsured: 34000,
      coverType: 'Comprehensive',
    },
    selectedAddOns: [],
    selectedRoadTax: { name: 'No Road Tax', price: 0 },
    otpVerified: true,
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.VERIFY_OTP, data: { valid: true }, confidence: 1 },
    turnPlan: {},
    messages: [{ role: 'user', content: '1234' }],
    latestMessage: '1234',
    callbacks: makeCallbacks(),
  });

  assert.equal(result.paymentLinkFallback, '/my/payment/test');
  assert.equal(result.shouldInjectPaymentLinkFallback, true);
  assert.match(result.forcedAssistantResponse, /PAYMENT_STEP_BLOCK/);
  assert.match(result.forcedAssistantResponse, /\/my\/payment\/test/);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler captures personal details without model dependency', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.OTP,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
    },
    selectedRoadTax: { name: '12 months digital road tax', price: 90 },
    personalDetails: {
      email: 'ali@example.com',
      phone: '0123456789',
      address: 'No 1 Jalan Test, 47000 Shah Alam',
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.SUBMIT_DETAILS, data: {}, confidence: 1 },
    turnPlan: {},
    messages: [
      {
        role: 'user',
        content: 'name Ali Tan, email ali@example.com, phone 0123456789, address No 1 Jalan Test, 47000 Shah Alam Selangor',
      },
    ],
    latestMessage: 'name Ali Tan, email ali@example.com, phone 0123456789, address No 1 Jalan Test, 47000 Shah Alam Selangor',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /ali@example\.com/);
  assert.match(result.forcedAssistantResponse, /0123456789/);
  assert.match(result.forcedAssistantResponse, /Does everything look \*\*correct\*\*/);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler asks for OTP without model dependency after detail confirmation', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.OTP,
    personalDetails: {
      email: 'ali@example.com',
      phone: '0123456789',
      address: 'No 1 Jalan Test, 47000 Shah Alam',
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.CONFIRM, data: {}, confidence: 1 },
    turnPlan: {},
    messages: [{ role: 'user', content: 'yes' }],
    latestMessage: 'yes',
    callbacks: makeCallbacks(),
  });

  assert.equal(result.forcedAssistantResponse, 'OTP_PROMPT');
  assert.equal(openAiMessages.length, 0);
});
