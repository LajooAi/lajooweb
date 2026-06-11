import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationState,
  FLOW_STEPS,
  USER_INTENTS,
} from '../src/lib/conversationState.js';
import { applyDeterministicFlowHandlers } from '../src/server/ai/flowHandlers.js';
import { TURN_QUESTION_GUIDANCE } from '../src/server/ai/turnPlanner.js';
import { ADVISOR_INTENTS, ADVISOR_TOPICS } from '../src/server/ai/advisorIntent.js';

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

test('flow handler restores old vehicle intake before quotes', () => {
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
  assert.match(result.forcedAssistantResponse, /owner identification number/i);
  assert.match(result.forcedAssistantResponse, /2\.\s+\*\*Owner Identification Number/);
  assert.doesNotMatch(result.forcedAssistantResponse, /Reply \*\*I agree\*\*/);
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

  assert.match(result.forcedAssistantResponse, /Great choice/i);
  assert.match(result.forcedAssistantResponse, /ADDONS_STEP_BLOCK/i);
  assert.equal(state.step, FLOW_STEPS.ADDONS);
  assert.match(state.selectedQuote?.insurer || '', /Takaful Ikhlas/i);
  assert.equal(openAiMessages.length, 0);
});

test('advisor forced response does not offer betterment selection before add-ons step', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.START,
    plateNumber: null,
    nricNumber: null,
    vehicleInfo: null,
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
      topic: ADVISOR_TOPICS.BETTERMENT,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'what is zero betterment' }],
    latestMessage: 'what is zero betterment',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /Zero betterment helps reduce/i);
  assert.match(result.forcedAssistantResponse, /add-ons step/i);
  assert.match(result.forcedAssistantResponse, /vehicle plate/i);
  assert.match(result.forcedAssistantResponse, /owner identification number/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /RM 350.00/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Do you want to add/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /or skip it/i);
  assert.equal(state.step, FLOW_STEPS.START);
  assert.equal(openAiMessages.length, 0);
});

test('advisor forced response does not auto-recommend insurer for quote-stage betterment question', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    lastRecommendedInsurer: 'tokio',
    selectedQuote: null,
    vehicleInfo: {
      make: 'Perodua',
      model: 'Myvi',
      variant: '1.5L',
      year: 2019,
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
      topic: ADVISOR_TOPICS.BETTERMENT,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'what is zero betterment' }],
    latestMessage: 'what is zero betterment',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /Zero betterment helps reduce/i);
  assert.match(result.forcedAssistantResponse, /add-ons step later/i);
  assert.match(result.forcedAssistantResponse, /7-year-old Perodua Myvi/i);
  assert.match(result.forcedAssistantResponse, /nice-to-have/i);
  assert.match(result.forcedAssistantResponse, /choose the insurer first/i);
  assert.match(result.forcedAssistantResponse, /ask me to recommend one/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /My earlier advice/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Tokio Marine Insurance - RM 800.00/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Takaful Ikhlas Insurance - RM 796.00/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Shall I select/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Do you want to add \*\*Betterment waiver\*\*/i);
  assert.equal(state.step, FLOW_STEPS.QUOTES);
  assert.equal(state.selectedQuote, null);
  assert.equal(openAiMessages.length, 0);
});

test('advisor forced response stores pending add-on review before OTP', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.OTP,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    vehicleInfo: {
      make: 'Perodua',
      model: 'Myvi',
      variant: '1.5L',
      year: 2019,
    },
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      sumInsured: 35000,
    },
    selectedRoadTax: { name: 'No Road Tax', price: 0 },
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
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
      topic: ADVISOR_TOPICS.BETTERMENT,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'what is zero betterment' }],
    latestMessage: 'what is zero betterment',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /Do you want me to go back to add-ons to review it/i);
  assert.equal(state.step, FLOW_STEPS.OTP);
  assert.equal(state.pendingAction?.type, 'confirm_addon_review');
  assert.equal(state.pendingAction?.topic, ADVISOR_TOPICS.BETTERMENT);
  assert.equal(state.pendingAction?.previousStep, FLOW_STEPS.OTP);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler clarifies weak acknowledgement after insurer recommendation', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    lastRecommendedInsurer: 'tokio',
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.CONFIRM, data: {}, confidence: 0.7 },
    turnPlan: {},
    messages: [
      {
        role: 'assistant',
        content: '**My pick:** **Tokio Marine Insurance** — **RM 800.00**\n\n**Next:** Want to go with this option, or do you prefer another insurer?',
      },
      { role: 'user', content: 'ok' },
    ],
    latestMessage: 'ok',
    callbacks: makeCallbacks(),
  });

  assert.equal(state.step, FLOW_STEPS.QUOTES);
  assert.equal(state.selectedQuote, null);
  assert.match(result.forcedAssistantResponse, /proceed with \*\*Tokio Marine Insurance\*\*/i);
  assert.match(result.forcedAssistantResponse, /other insurers/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /QUOTE_SELECTION_REPLY/);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler explains exploratory insurer mention instead of selecting it', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    lastRecommendedInsurer: 'tokio',
    selectedQuote: null,
    vehicleInfo: {
      make: 'Perodua',
      model: 'Myvi',
      variant: '1.5L',
      year: 2019,
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.95 },
    turnPlan: {},
    messages: [
      {
        role: 'assistant',
        content: '**My pick:** **Tokio Marine Insurance - RM 800.00**\n\n**Next:** Want to go with Tokio, or explore others?',
      },
      { role: 'user', content: 'can we have a look at lonpac as well' },
    ],
    latestMessage: 'can we have a look at lonpac as well',
    callbacks: makeCallbacks(),
  });

  assert.equal(state.step, FLOW_STEPS.QUOTES);
  assert.equal(state.selectedQuote, null);
  assert.match(result.forcedAssistantResponse, /look at \*\*Lonpac Insurance\*\*/i);
  assert.match(result.forcedAssistantResponse, /not selected it yet/i);
  assert.match(result.forcedAssistantResponse, /Lonpac Insurance\*\* is \*\*RM 960.00\*\*/i);
  assert.match(result.forcedAssistantResponse, /Tokio Marine Insurance - RM 800.00/i);
  assert.match(result.forcedAssistantResponse, /RM 160.00 higher/i);
  assert.match(result.forcedAssistantResponse, /cleaner balanced pick/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Great choice/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /ADDONS_STEP_BLOCK/i);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler accepts ok after direct single-insurer selection prompt', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    lastRecommendedInsurer: null,
    vehicleInfo: {
      make: 'Perodua',
      model: 'Myvi',
      variant: '1.5L',
      year: 2019,
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.CONFIRM, data: {}, confidence: 0.8 },
    turnPlan: {},
    messages: [
      {
        role: 'assistant',
        content: 'Shall I select **Tokio Marine Insurance - RM 800.00** first, then we review the Betterment waiver option at add-ons?',
      },
      { role: 'user', content: 'ok' },
    ],
    latestMessage: 'ok',
    callbacks: makeCallbacks(),
  });

  assert.equal(state.step, FLOW_STEPS.ADDONS);
  assert.match(state.selectedQuote?.insurer || '', /Tokio Marine Insurance/i);
  assert.match(result.forcedAssistantResponse, /Great choice/i);
  assert.match(result.forcedAssistantResponse, /ADDONS_STEP_BLOCK/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /QUOTE_SELECTION_REPLY/i);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler explains alternatives when user asks for others after recommendation', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    lastRecommendedInsurer: 'tokio',
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.OTHER, data: {}, confidence: 0.5 },
    turnPlan: {},
    messages: [
      {
        role: 'assistant',
        content: '**My pick:** **Tokio Marine Insurance** — **RM 800.00**\n\n**Next:** Want to go with this option, or do you prefer another insurer?',
      },
      { role: 'user', content: 'others' },
    ],
    latestMessage: 'others',
    callbacks: makeCallbacks(),
  });

  assert.equal(state.step, FLOW_STEPS.QUOTES);
  assert.equal(state.selectedQuote, null);
  assert.match(result.forcedAssistantResponse, /sensible alternatives/i);
  assert.match(result.forcedAssistantResponse, /Lowest price alternative/i);
  assert.match(result.forcedAssistantResponse, /Service-confidence alternative/i);
  assert.match(result.forcedAssistantResponse, /Which would you like to go with/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /should I narrow it by/i);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler shows alternatives after recommendation clarification even if memory was cleared', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    lastRecommendedInsurer: null,
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.OTHER, data: {}, confidence: 0.5 },
    turnPlan: {},
    messages: [
      {
        role: 'assistant',
        content: 'Just to confirm - do you want to proceed with **Tokio Marine Insurance**, or would you like me to explain the other insurers first?',
      },
      { role: 'user', content: 'others' },
    ],
    latestMessage: 'others',
    callbacks: makeCallbacks(),
  });

  assert.equal(state.step, FLOW_STEPS.QUOTES);
  assert.equal(state.selectedQuote, null);
  assert.match(result.forcedAssistantResponse, /sensible alternatives/i);
  assert.match(result.forcedAssistantResponse, /Lowest price alternative/i);
  assert.match(result.forcedAssistantResponse, /Higher coverage alternative/i);
  assert.match(result.forcedAssistantResponse, /Service-confidence alternative/i);
  assert.match(result.forcedAssistantResponse, /Which would you like to go with/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /What matters most|should I narrow it by/i);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler acknowledges unavailable preferred insurer and maps to closest option', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, data: {}, confidence: 0.9 },
    turnPlan: { shouldShowQuoteCards: false },
    messages: [{ role: 'user', content: 'I want Zurich, I used them before' }],
    latestMessage: 'I want Zurich, I used them before',
    callbacks: makeCallbacks(),
  });

  assert.equal(state.step, FLOW_STEPS.QUOTES);
  assert.equal(state.selectedQuote, null);
  assert.match(result.forcedAssistantResponse, /Zurich/i);
  assert.match(result.forcedAssistantResponse, /not in the current LAJOO panel/i);
  assert.match(result.forcedAssistantResponse, /Closest available fit:\s+\*\*Tokio Marine Insurance\*\*/i);
  assert.match(result.forcedAssistantResponse, /choose another available insurer|quick comparison/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /cheapest option, highest sum insured, or balanced recommendation/i);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler accepts explicit go-with-it after insurer recommendation', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    lastRecommendedInsurer: 'tokio',
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.OTHER, data: {}, confidence: 0.5 },
    turnPlan: {},
    messages: [
      {
        role: 'assistant',
        content: '**My pick:** **Tokio Marine Insurance** — **RM 800.00**\n\n**Next:** Want to go with this option, or do you prefer another insurer?',
      },
      { role: 'user', content: 'go with it' },
    ],
    latestMessage: 'go with it',
    callbacks: makeCallbacks(),
  });

  assert.equal(state.step, FLOW_STEPS.ADDONS);
  assert.match(state.selectedQuote?.insurer || '', /Tokio Marine/i);
  assert.match(result.forcedAssistantResponse, /Great choice/i);
  assert.match(result.forcedAssistantResponse, /ADDONS_STEP_BLOCK/i);
  assert.equal(openAiMessages.length, 0);
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

test('flow handler refreshes expired quote and proceeds to payment after valid OTP', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.PAYMENT,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      priceBefore: 1000,
      ncdPercent: 20,
      sumInsured: 35000,
      coverType: 'Comprehensive',
    },
    selectedAddOns: [],
    selectedRoadTax: { name: '12 months digital road tax', price: 90 },
    otpVerified: true,
    quoteGeneratedAt: Date.now() - (31 * 60 * 1000),
    quoteValidUntil: Date.now() - 1000,
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

  assert.match(result.forcedAssistantResponse, /generated more than \*\*30 minutes\*\* ago/i);
  assert.match(result.forcedAssistantResponse, /before payment to keep the premium and total valid/i);
  assert.match(result.forcedAssistantResponse, /Quote refreshed\. Same prices apply/i);
  assert.match(result.forcedAssistantResponse, /PAYMENT_STEP_BLOCK/);
  assert.match(result.forcedAssistantResponse, /\/my\/payment\/test/);
  assert.doesNotMatch(result.forcedAssistantResponse, /OTP_PROMPT/);
  assert.doesNotMatch(result.forcedAssistantResponse, /Your quote has expired\. Let me refresh it/i);
  assert.equal(result.paymentLinkFallback, '/my/payment/test');
  assert.equal(result.shouldInjectPaymentLinkFallback, true);
  assert.equal(state.isQuoteExpired(), false);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler preserves route-forced payment method guidance', () => {
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
    intent: { intent: USER_INTENTS.SELECT_PAYMENT, data: { method: 'card' }, confidence: 0.9 },
    turnPlan: {},
    messages: [{ role: 'user', content: 'card' }],
    latestMessage: 'card',
    forcedAssistantResponse: 'OPEN_CHECKOUT_FOR_CARD',
    callbacks: makeCallbacks(),
  });

  assert.equal(result.forcedAssistantResponse, 'OPEN_CHECKOUT_FOR_CARD');
  assert.doesNotMatch(result.forcedAssistantResponse, /PAYMENT_STEP_BLOCK/);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler answers road tax alternative question without advancing state', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.ROADTAX,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    ownerIdType: 'nric',
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
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, data: {}, confidence: 0.9 },
    turnPlan: {
      questionGuidance: TURN_QUESTION_GUIDANCE.ROADTAX_ALTERNATIVE,
    },
    messages: [{ role: 'user', content: 'where else can I renew road tax?' }],
    latestMessage: 'where else can I renew road tax?',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /JPJ\/MyJPJ/i);
  assert.match(result.forcedAssistantResponse, /mySIKAP/i);
  assert.match(result.forcedAssistantResponse, /MyEG/i);
  assert.match(result.forcedAssistantResponse, /Pos Malaysia/i);
  assert.match(result.forcedAssistantResponse, /Insurance must already be active/i);
  assert.match(result.forcedAssistantResponse, /12-month digital road tax \(RM 90.00\)/i);
  assert.match(result.forcedAssistantResponse, /skip road tax/i);
  assert.equal(state.step, FLOW_STEPS.ROADTAX);
  assert.equal(state.selectedRoadTax, null);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler clarifies road tax option when physical delivery is available', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.ROADTAX,
    plateNumber: 'FID5566',
    nricNumber: 'A12345678',
    ownerIdType: 'foreign_id',
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
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: {
      intent: USER_INTENTS.ASK_QUESTION,
      confidence: 0.86,
      data: { topic: 'clarify_roadtax_option' },
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'yes' }],
    latestMessage: 'yes',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /both road tax options are available/i);
  assert.match(result.forcedAssistantResponse, /12-month digital road tax \(RM 90.00\)/i);
  assert.match(result.forcedAssistantResponse, /12-month physical \+ delivery \(RM 100.00\)/i);
  assert.match(result.forcedAssistantResponse, /No road tax/i);
  assert.equal(state.step, FLOW_STEPS.ROADTAX);
  assert.equal(state.selectedRoadTax, null);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler answers 6-month road tax and digital enforcement question together', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.ROADTAX,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    ownerIdType: 'nric',
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
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.ROADTAX_LEGALITY,
      topic: ADVISOR_TOPICS.DIGITAL_ROADTAX,
      confidence: 0.9,
      entities: { asksSixMonthRoadTax: true },
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'can i renew for 6 months ? and what is digital roadtax ? if police blocks me what do i do' }],
    latestMessage: 'can i renew for 6 months ? and what is digital roadtax ? if police blocks me what do i do',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /Yes - digital road tax/i);
  assert.match(result.forcedAssistantResponse, /JPJ\/MyJPJ/i);
  assert.match(result.forcedAssistantResponse, /6-month road tax/i);
  assert.match(result.forcedAssistantResponse, /LAJOO currently supports \*\*12-month digital road tax only\*\*/i);
  assert.match(result.forcedAssistantResponse, /another channel/i);
  assert.match(result.forcedAssistantResponse, /12-month digital road tax \(RM 90.00\)/i);
  assert.match(result.forcedAssistantResponse, /no road tax/i);
  assert.equal(state.step, FLOW_STEPS.ROADTAX);
  assert.equal(state.selectedRoadTax, null);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler answers why only digital road tax without selecting it', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.ROADTAX,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    ownerIdType: 'nric',
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
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.92 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.ROADTAX_LEGALITY,
      topic: ADVISOR_TOPICS.DIGITAL_ROADTAX,
      confidence: 0.93,
      entities: { asksOnlyDigitalRoadTax: true },
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'ok, why only digital ?' }],
    latestMessage: 'ok, why only digital ?',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /Good question/i);
  assert.match(result.forcedAssistantResponse, /12-month digital road tax \(RM 90.00\)/i);
  assert.match(result.forcedAssistantResponse, /physical \+ delivery option is not available/i);
  assert.match(result.forcedAssistantResponse, /NRIC\/private-car renewal/i);
  assert.match(result.forcedAssistantResponse, /no road tax/i);
  assert.equal(state.step, FLOW_STEPS.ROADTAX);
  assert.equal(state.selectedRoadTax, null);
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

  assert.match(result.forcedAssistantResponse, /✓ \*\*Email:\*\* ali@example\.com<br \/>/);
  assert.match(result.forcedAssistantResponse, /✓ \*\*Phone:\*\* 0123456789<br \/>/);
  assert.match(result.forcedAssistantResponse, /✓ \*\*Address:\*\* No 1 Jalan Test, 47000 Shah Alam/);
  assert.doesNotMatch(result.forcedAssistantResponse, /- \*\*Email:\*\*/);
  assert.match(result.forcedAssistantResponse, /Does everything look \*\*correct\*\*/);
  assert.match(result.forcedAssistantResponse, /send the \*\*OTP\*\* now/);
  assert.doesNotMatch(result.forcedAssistantResponse, /send the OTP now/);
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
  assert.ok(state.otpSentAt);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler handles OTP non-receipt with 30-second resend cooldown', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.OTP,
    selectedQuote: { insurer: 'Tokio Marine Insurance', priceAfter: 800 },
    selectedRoadTax: { name: '12 months digital road tax', price: 90 },
    personalDetails: {
      email: 'ali@example.com',
      phone: '0123456789',
      address: 'No 1 Jalan Test, 47000 Shah Alam',
    },
  });
  state.markOtpSent({ sentAt: Date.now() });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.RESEND_OTP, data: {}, confidence: 0.95 },
    turnPlan: {},
    messages: [{ role: 'user', content: 'did not receive' }],
    latestMessage: 'did not receive',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /resend it after \*\*30 seconds\*\*/i);
  assert.match(result.forcedAssistantResponse, /wait about/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Could you key in the \*\*OTP\*\*/i);
  assert.equal(state.otpResendCount, 0);
  assert.equal(state.step, FLOW_STEPS.OTP);
  assert.equal(openAiMessages.length, 0);
});

test('flow handler resends OTP after cooldown passes', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.OTP,
    selectedQuote: { insurer: 'Tokio Marine Insurance', priceAfter: 800 },
    selectedRoadTax: { name: '12 months digital road tax', price: 90 },
    personalDetails: {
      email: 'ali@example.com',
      phone: '0123456789',
      address: 'No 1 Jalan Test, 47000 Shah Alam',
    },
  });
  const previousSentAt = Date.now() - 31_000;
  state.markOtpSent({ sentAt: previousSentAt });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.RESEND_OTP, data: {}, confidence: 0.95 },
    turnPlan: {},
    messages: [{ role: 'user', content: 'resend otp please' }],
    latestMessage: 'resend otp please',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /attempted to resend/i);
  assert.match(result.forcedAssistantResponse, /latest OTP/i);
  assert.equal(state.otpResendCount, 1);
  assert.ok(state.otpSentAt >= previousSentAt);
  assert.equal(state.step, FLOW_STEPS.OTP);
  assert.equal(openAiMessages.length, 0);
});

test('advisor forced response respects rejected insurer and shows alternatives', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.94 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.REJECT_RECOMMENDATION,
      confidence: 0.94,
      entities: { excludedInsurerKeys: ['tokio'] },
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'anything except tokio' }],
    latestMessage: 'anything except tokio',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /exclude \*\*Tokio Marine\*\*/i);
  assert.match(result.forcedAssistantResponse, /Good alternatives/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /proceed with \*\*Tokio Marine/i);
  assert.equal(state.selectedQuote, null);
  assert.equal(openAiMessages.length, 0);
});

test('advisor forced response answers commercial bias challenge', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    lastRecommendedInsurer: 'tokio',
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.95 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.COMMERCIAL_BIAS_CHALLENGE,
      topic: ADVISOR_TOPICS.COMMERCIAL_BIAS,
      confidence: 0.95,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'are you pushing tokio because sponsor?' }],
    latestMessage: 'are you pushing tokio because sponsor?',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /not hidden paid placement/i);
  assert.match(result.forcedAssistantResponse, /Tokio Marine Insurance/i);
  assert.match(result.forcedAssistantResponse, /cheapest available option/i);
  assert.match(result.forcedAssistantResponse, /cheapest option \*\*Takaful Ikhlas Insurance\*\*/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /choose the cheapest option, or/i);
});

test('advisor forced response explains quote price gaps with current quote economics', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    lastRecommendedInsurer: 'tokio',
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.QUOTE_PRICE_EXPLANATION,
      topic: ADVISOR_TOPICS.QUOTE_PRICE_GAP,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'what about other insurers, why is some so expensive and the price so much difference' }],
    latestMessage: 'what about other insurers, why is some so expensive and the price so much difference',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /premium ranges from \*\*Takaful Ikhlas Insurance - RM 796.00\*\* to \*\*Generali Insurance - RM 1,080.00\*\*/i);
  assert.match(result.forcedAssistantResponse, /highest sum insured at \*\*RM 40,000.00\*\*/i);
  assert.match(result.forcedAssistantResponse, /lowest premium with \*\*RM 34,000.00\*\*/i);
  assert.match(result.forcedAssistantResponse, /does not automatically mean "better"/i);
  assert.match(result.forcedAssistantResponse, /Tokio Marine Insurance - RM 800.00/i);
  assert.match(result.forcedAssistantResponse, /Takaful Ikhlas Insurance - RM 796.00/i);
  assert.match(result.forcedAssistantResponse, /compare all 7/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /let'?s get back to selecting/i);
  assert.equal(state.selectedQuote, null);
  assert.equal(openAiMessages.length, 0);
});

test('advisor forced response answers direct-insurer discount objection without auto-recommendation', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    lastRecommendedInsurer: 'tokio',
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.QUOTE_OBJECTION,
      topic: ADVISOR_TOPICS.DIRECT_INSURER_DISCOUNT,
      confidence: 0.92,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'i can get 10% from insurers directly why should i go with you' }],
    latestMessage: 'i can get 10% from insurers directly why should i go with you',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /A 10% direct discount can exist/i);
  assert.match(result.forcedAssistantResponse, /headline discount is not the full renewal decision/i);
  assert.match(result.forcedAssistantResponse, /With \*\*LAJOO\*\*/i);
  assert.match(result.forcedAssistantResponse, /guided quote comparison, add-on advice, road tax handling, and a cleaner renewal flow/i);
  assert.match(result.forcedAssistantResponse, /avoid missing coverage details/i);
  assert.match(result.forcedAssistantResponse, /Let’s continue with LAJOO/i);
  assert.match(result.forcedAssistantResponse, /best-fit insurer now/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /saving matters/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /consider it/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /compare (?:the )?direct offer/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /apples-to-apples/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Tokio Marine Insurance - RM 800.00/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Takaful Ikhlas Insurance - RM 796.00/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Back to your renewal/i);
  assert.equal(state.selectedQuote, null);
  assert.equal(openAiMessages.length, 0);
});

test('advisor forced response recommends All Drivers for spouse driving', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.ADDONS,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      sumInsured: 35000,
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.ADDON_EXPLANATION,
      topic: ADVISOR_TOPICS.ALL_DRIVERS,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'my wife sometimes drives, what addon?' }],
    latestMessage: 'my wife sometimes drives, what addon?',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /All Drivers \(RM 30.00\)/i);
  assert.match(result.forcedAssistantResponse, /wife or family/i);
  assert.equal(state.step, FLOW_STEPS.ADDONS);
  assert.equal(state.selectedAddOns.length, 0);
});

test('advisor forced response formats general add-on shortlist as readable list', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.ADDONS,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    vehicleInfo: {
      make: 'Perodua',
      model: 'Myvi',
      year: 2019,
    },
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      sumInsured: 35000,
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.ADDON_EXPLANATION,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'which do i need' }],
    latestMessage: 'which do i need',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /My usual shortlist:\n\n- \*\*2\. Special Perils/i);
  assert.match(result.forcedAssistantResponse, /\n- \*\*1\. Windscreen\*\*/i);
  assert.match(result.forcedAssistantResponse, /\n- \*\*3\. E-hailing \(RM 2,000.00\)\*\*/i);
  assert.match(result.forcedAssistantResponse, /\n- \*\*8\. Betterment waiver \(RM 350.00\)\*\*/i);
  assert.match(result.forcedAssistantResponse, /7-year-old Perodua Myvi/i);
  assert.match(result.forcedAssistantResponse, /nice-to-have/i);
  assert.match(result.forcedAssistantResponse, /older premium, continental, performance, luxury, or cars with expensive parts/i);
  assert.equal(state.step, FLOW_STEPS.ADDONS);
  assert.equal(state.selectedAddOns.length, 0);
  assert.equal(openAiMessages.length, 0);
});

test('advisor forced response gives daily-driving add-on recommendation', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.ADDONS,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    vehicleInfo: {
      make: 'Perodua',
      model: 'Myvi',
      year: 2019,
    },
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      sumInsured: 35000,
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
      topic: ADVISOR_TOPICS.DAILY_DRIVING,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'i drive my car a lot daily' }],
    latestMessage: 'i drive my car a lot daily',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /Since you drive a lot daily/i);
  assert.match(result.forcedAssistantResponse, /start with 1\. Windscreen/i);
  assert.match(result.forcedAssistantResponse, /stone chips|road debris/i);
  assert.match(result.forcedAssistantResponse, /7-year-old Perodua Myvi/i);
  assert.match(result.forcedAssistantResponse, /RM 1,000.00.*sensible starting cover/i);
  assert.match(result.forcedAssistantResponse, /Special Perils \(RM 150.00\)/i);
  assert.match(result.forcedAssistantResponse, /flood or landslide risk applies/i);
  assert.match(result.forcedAssistantResponse, /RM 1,000.00/i);
  assert.match(result.forcedAssistantResponse, /RM 2,000.00/i);
  assert.match(result.forcedAssistantResponse, /Would you like to add \*\*1\. Windscreen\*\*/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Since you drive daily, would you like/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Windscreen, Special Perils, E-hailing, or skip add-ons/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /What windscreen coverage should I use/i);
  assert.equal(state.step, FLOW_STEPS.ADDONS);
  assert.equal(state.selectedAddOns.length, 0);
  assert.equal(openAiMessages.length, 0);
});

test('advisor forced daily-driving response adjusts windscreen guidance for premium vehicles', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.ADDONS,
    plateNumber: 'ABC911',
    nricNumber: '951018145405',
    vehicleInfo: {
      make: 'Porsche',
      model: '911',
      year: 2018,
    },
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 3000,
      sumInsured: 320000,
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
      topic: ADVISOR_TOPICS.DAILY_DRIVING,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'i drive my car a lot daily' }],
    latestMessage: 'i drive my car a lot daily',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /8-year-old Porsche 911/i);
  assert.match(result.forcedAssistantResponse, /lean closer to \*\*RM 2,000.00\*\* or more/i);
  assert.match(result.forcedAssistantResponse, /premium\/continental cars, EVs, sensors, tint, and camera calibration/i);
  assert.match(result.forcedAssistantResponse, /Would you like to add \*\*1\. Windscreen\*\*/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /What windscreen coverage should I use/i);
  assert.equal(state.step, FLOW_STEPS.ADDONS);
  assert.equal(state.selectedAddOns.length, 0);
  assert.equal(openAiMessages.length, 0);
});

test('advisor forced response answers add-on skip decisions with a direct verdict', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.ADDONS,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    vehicleInfo: {
      make: 'Perodua',
      model: 'Myvi',
      year: 2019,
    },
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      sumInsured: 35000,
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
      topic: ADVISOR_TOPICS.ADDON_SKIP_DECISION,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'should i skip?' }],
    latestMessage: 'should i skip?',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /^Yes - you can skip add-ons/i);
  assert.match(result.forcedAssistantResponse, /My practical minimum/i);
  assert.match(result.forcedAssistantResponse, /2\. Special Perils \(RM 150.00\)/i);
  assert.match(result.forcedAssistantResponse, /1\. Windscreen/i);
  assert.match(result.forcedAssistantResponse, /3\. E-hailing \(RM 2,000.00\)/i);
  assert.match(result.forcedAssistantResponse, /8\. Betterment waiver \(RM 350.00\)/i);
  assert.match(result.forcedAssistantResponse, /7-year-old Perodua Myvi/i);
  assert.match(result.forcedAssistantResponse, /nice-to-have.*not essential/i);
  assert.match(result.forcedAssistantResponse, /Do you want to \*\*skip add-ons\*\*, take \*\*2\. Special Perils only\*\*, or take \*\*1 and 2\*\*/i);
  assert.equal(state.step, FLOW_STEPS.ADDONS);
  assert.equal(state.selectedAddOns.length, 0);
  assert.equal(openAiMessages.length, 0);
});

test('advisor forced response explains Special Perils with landslide scope', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.ADDONS,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      sumInsured: 35000,
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
      topic: ADVISOR_TOPICS.FLOOD,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'what is special perils? does it cover landslide?' }],
    latestMessage: 'what is special perils? does it cover landslide?',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /Special Perils \(RM 150.00\)/i);
  assert.match(result.forcedAssistantResponse, /landslide\/landslip|landslide/i);
  assert.match(result.forcedAssistantResponse, /subject to insurer terms/i);
  assert.match(result.forcedAssistantResponse, /add \*\*Special Perils\*\*/i);
  assert.equal(state.step, FLOW_STEPS.ADDONS);
  assert.equal(state.selectedAddOns.length, 0);
  assert.equal(openAiMessages.length, 0);
});

test('advisor forced response answers address privacy before details collection', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.PERSONAL_DETAILS,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      sumInsured: 35000,
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.94 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.PRIVACY_CONCERN,
      topic: ADVISOR_TOPICS.ADDRESS_PRIVACY,
      confidence: 0.94,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'why you need my address?' }],
    latestMessage: 'why you need my address?',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /address is needed/i);
  assert.match(result.forcedAssistantResponse, /policy\/proposal record/i);
  assert.equal(state.step, FLOW_STEPS.PERSONAL_DETAILS);
});

test('advisor forced response handles payment coverage timing safely', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.PAYMENT,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      sumInsured: 35000,
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.PAYMENT_CONCERN,
      topic: ADVISOR_TOPICS.PAYMENT_AFTER,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'what happens after payment, covered immediately?' }],
    latestMessage: 'what happens after payment, covered immediately?',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /payment confirmation first/i);
  assert.match(result.forcedAssistantResponse, /should not say you are covered/i);
  assert.equal(state.step, FLOW_STEPS.PAYMENT);
});

test('advisor delegated decision respects remembered quote exclusions', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.QUOTES,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    lastRecommendedInsurer: 'tokio',
    userPreferences: {
      ...state.userPreferences,
      excludedInsurerKeys: ['tokio'],
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.DELEGATE_DECISION,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'you decide, I trust you' }],
    latestMessage: 'you decide, I trust you',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /My pick is/i);
  assert.doesNotMatch(result.forcedAssistantResponse, /Tokio Marine Insurance/i);
  assert.equal(state.selectedQuote, null);
});

test('invalid OTP does not render payment step', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.OTP,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      sumInsured: 35000,
    },
    selectedRoadTax: { name: 'No Road Tax', price: 0 },
    personalDetails: {
      email: 'ali@example.com',
      phone: '0123456789',
      address: 'No 1, Jalan Test',
    },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.VERIFY_OTP, data: { otp: '9999', valid: false }, confidence: 1 },
    turnPlan: {},
    messages: [{ role: 'user', content: '9999' }],
    latestMessage: '9999',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /does not match/i);
  assert.match(result.forcedAssistantResponse, /1234/);
  assert.doesNotMatch(result.forcedAssistantResponse, /PAYMENT_STEP_BLOCK/i);
  assert.equal(state.step, FLOW_STEPS.OTP);
});

test('advisor forced response answers WhatsApp document delivery without advancing details', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.PERSONAL_DETAILS,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    selectedQuote: {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      sumInsured: 35000,
    },
    selectedRoadTax: { name: 'No Road Tax', price: 0 },
  });
  const openAiMessages = [];

  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
    advisorIntent: {
      intent: ADVISOR_INTENTS.DOCUMENT_DELIVERY,
      topic: ADVISOR_TOPICS.WHATSAPP_DOCUMENTS,
      confidence: 0.9,
      shouldAnswerFirst: true,
      shouldPreventFlowAdvance: true,
    },
    turnPlan: {},
    messages: [{ role: 'user', content: 'just whatsapp the policy to me' }],
    latestMessage: 'just whatsapp the policy to me',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /WhatsApp\/email/i);
  assert.match(result.forcedAssistantResponse, /valid phone number/i);
  assert.equal(state.step, FLOW_STEPS.PERSONAL_DETAILS);
});
