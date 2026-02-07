import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUserIntent, FLOW_STEPS, ConversationState } from '../src/lib/conversationState.js';
import { extractVehicleInfo } from '../src/utils/nlpExtractor.js';

test('payment confirmation should not trigger quote-change reset', () => {
  const state = {
    step: FLOW_STEPS.PAYMENT,
    selectedQuote: { insurer: 'Takaful Ikhlas' },
    addOnsConfirmed: true,
  };
  const intent = detectUserIntent('yes please', state);
  assert.equal(intent.intent, 'select_payment');
});

test('payment method question should be routed as payment selection intent', () => {
  const state = {
    step: FLOW_STEPS.PAYMENT,
    selectedQuote: { insurer: 'Takaful Ikhlas' },
    addOnsConfirmed: true,
  };
  const intent = detectUserIntent('can i pay by card?', state);
  assert.equal(intent.intent, 'select_payment');
  assert.equal(intent.data.method, 'card');
});

test('quote-change confirmation should only happen when pending action exists', () => {
  const state = {
    step: FLOW_STEPS.PAYMENT,
    selectedQuote: { insurer: 'Takaful Ikhlas' },
    addOnsConfirmed: true,
    pendingAction: { type: 'confirm_quote_change' },
  };
  const confirmIntent = detectUserIntent('yes', state);
  const cancelIntent = detectUserIntent('no', state);

  assert.equal(confirmIntent.intent, 'confirm_change');
  assert.equal(cancelIntent.intent, 'other');
  assert.equal(cancelIntent.data.cancelPendingAction, true);
});

test('playful uncertainty at quotes should be recognized explicitly', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    addOnsConfirmed: false,
  };
  const intent = detectUserIntent('lol whichever cheaper lah', state);
  assert.equal(intent.intent, 'unclear_or_playful');
});

test('vehicle info extractor should support foreign/passport and company IDs', () => {
  const foreign = extractVehicleInfo('plate WXY1234, passport A1234567');
  assert.equal(foreign.registrationNumber, 'WXY1234');
  assert.equal(foreign.ownerId, 'A1234567');
  assert.equal(foreign.ownerIdType, 'foreign_id');

  const company = extractVehicleInfo('plate VEV8899 company reg SSM 202301234567');
  assert.equal(company.registrationNumber, 'VEV8899');
  assert.equal(company.ownerId, '202301234567');
  assert.equal(company.ownerIdType, 'company_reg');
});

test('conversation state should stay at personal_details until all details are collected', () => {
  const state = new ConversationState();
  state.selectedRoadTax = { name: 'No Road Tax', price: 0 };
  state.personalDetails = { email: true, phone: false, address: false };
  assert.equal(state._determineStep(), FLOW_STEPS.PERSONAL_DETAILS);

  state.personalDetails = { email: true, phone: true, address: true };
  assert.equal(state._determineStep(), FLOW_STEPS.OTP);
});

test('quotes step should not treat bare "no" as quote selection', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    addOnsConfirmed: false,
  };
  const intent = detectUserIntent('no', state);
  assert.equal(intent.intent, 'other');
});

test('quotes step should tolerate insurer typo on explicit selection', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    addOnsConfirmed: false,
  };
  const intent = detectUserIntent('i choose etiqqa', state);
  assert.equal(intent.intent, 'select_quote');
  assert.equal(intent.data.insurer, 'etiqa');
});

test('payment step should not treat "no" as payment selection', () => {
  const state = {
    step: FLOW_STEPS.PAYMENT,
    selectedQuote: { insurer: 'Takaful Ikhlas' },
    addOnsConfirmed: true,
  };
  const intent = detectUserIntent('no', state);
  assert.equal(intent.intent, 'other');
});

test('quotes step should treat "which is better" as ask_question', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    addOnsConfirmed: false,
  };
  const intent = detectUserIntent('which is better', state);
  assert.equal(intent.intent, 'ask_question');
});

test('quotes step should treat bare insurer name as quote selection', () => {
  const state = {
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    addOnsConfirmed: false,
  };
  const intent = detectUserIntent('takaful', state);
  assert.equal(intent.intent, 'select_quote');
  assert.equal(intent.data.insurer, 'takaful');
});

test('road tax step should treat plain "12 months" as 12month-digital selection', () => {
  const state = {
    step: FLOW_STEPS.ROADTAX,
    selectedQuote: { insurer: 'Takaful Ikhlas' },
    addOnsConfirmed: true,
  };
  const intent = detectUserIntent('12 months', state);
  assert.equal(intent.intent, 'select_roadtax');
  assert.equal(intent.data.option, '12month-digital');
});
