import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationState,
  FLOW_STEPS,
  USER_INTENTS,
} from '../src/lib/conversationState.js';
import {
  buildPdpaConsentRequestReply,
  detectPdpaConsentAcceptance,
  getPdpaConsentReason,
} from '../src/lib/pdpaConsent.js';
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

test('PDPA consent acceptance is explicit unless the consent prompt is pending', () => {
  assert.equal(detectPdpaConsentAcceptance('I agree'), true);
  assert.equal(detectPdpaConsentAcceptance('yes', { requireExplicit: true }), false);
  assert.equal(detectPdpaConsentAcceptance('yes', { requireExplicit: false }), true);
});

test('conversation state stores PDPA consent and round-trips it', () => {
  const state = new ConversationState();
  assert.equal(state.hasPdpaConsent(), false);

  state.acceptPdpaConsent({ acceptedAt: 1234567890 });
  const hydrated = ConversationState.fromJSON(state.toStorageJSON());

  assert.equal(hydrated.hasPdpaConsent(), true);
  assert.equal(hydrated.pdpaConsent.acceptedAt, 1234567890);
});

test('conversation history inference does not use owner ID before explicit consent', () => {
  const state = ConversationState.fromMessages([
    { role: 'user', content: 'jrt 9289 951018145405' },
  ]);

  assert.equal(state.plateNumber, 'JRT9289');
  assert.equal(state.nricNumber, null);
  assert.equal(state.step, FLOW_STEPS.VEHICLE_LOOKUP);
});

test('conversation history inference uses owner ID after explicit consent', () => {
  const state = ConversationState.fromMessages([
    { role: 'user', content: 'I agree' },
    { role: 'user', content: 'jrt 9289 951018145405' },
  ]);

  assert.equal(state.hasPdpaConsent(), true);
  assert.equal(state.plateNumber, 'JRT9289');
  assert.equal(state.nricNumber, '951018145405');
  assert.equal(state.step, FLOW_STEPS.QUOTES);
});

test('PDPA gate asks for consent when owner ID is provided too early', () => {
  const state = new ConversationState();
  const reason = getPdpaConsentReason({
    state,
    intent: { intent: USER_INTENTS.PROVIDE_INFO },
    vehicleExtract: { registrationNumber: 'JRT9289', ownerId: '951018145405' },
    personalInfo: {},
  });
  const reply = buildPdpaConsentRequestReply({
    state: { ...state, plateNumber: 'JRT9289' },
    reason,
  });

  assert.equal(reason, 'owner_id_provided');
  assert.match(reply, /I have your vehicle plate \*\*JRT9289\*\*/);
  assert.match(reply, /Reply \*\*I agree\*\*/);
});

test('flow handler starts renewal intake with consent-safe copy', () => {
  const state = new ConversationState();
  const result = applyDeterministicFlowHandlers({
    openAiMessages: [],
    state,
    intent: { intent: USER_INTENTS.START_RENEWAL, data: {}, confidence: 1 },
    turnPlan: {},
    messages: [{ role: 'user', content: 'renew insurance' }],
    latestMessage: 'renew insurance',
    callbacks: makeCallbacks(),
  });

  assert.match(result.forcedAssistantResponse, /vehicle plate number/i);
  assert.match(result.forcedAssistantResponse, /Reply \*\*I agree\*\*/);
  assert.doesNotMatch(result.forcedAssistantResponse, /1\.\s+\*\*Vehicle Plate Number[\s\S]*2\.\s+\*\*Owner Identification Number/);
});

test('flow handler can ask for owner ID after consent is accepted', () => {
  const state = new ConversationState();
  state.plateNumber = 'JRT9289';
  state.acceptPdpaConsent({ acceptedAt: 123 });
  state.step = FLOW_STEPS.VEHICLE_LOOKUP;

  const openAiMessages = [];
  const result = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: { intent: USER_INTENTS.PROVIDE_INFO, data: {}, confidence: 1 },
    turnPlan: {},
    messages: [{ role: 'user', content: 'JRT9289' }],
    latestMessage: 'JRT9289',
    callbacks: makeCallbacks(),
  });

  assert.equal(result.forcedAssistantResponse, null);
  assert.match(openAiMessages.map((message) => message.content).join('\n'), /Owner Identification Number/);
});
