import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUserIntent, FLOW_STEPS, ConversationState } from '../src/lib/conversationState.js';
import { extractVehicleInfo, extractPersonalInfo } from '../src/utils/nlpExtractor.js';

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

test('vehicle info extractor should detect NRIC when plate and NRIC are in one message', () => {
  const withSpaces = extractVehicleInfo('jrt 9289 951018145405');
  assert.equal(withSpaces.registrationNumber, 'JRT9289');
  assert.equal(withSpaces.ownerId, '951018145405');
  assert.equal(withSpaces.ownerIdType, 'nric');

  const dashed = extractVehicleInfo('plate JRT9289, ic 951018-14-5405');
  assert.equal(dashed.registrationNumber, 'JRT9289');
  assert.equal(dashed.ownerId, '951018145405');
  assert.equal(dashed.ownerIdType, 'nric');
});

test('vehicle info extractor should capture plain 12-digit owner ID even with imperfect NRIC date digits', () => {
  const plain12 = extractVehicleInfo('951810145405');
  assert.equal(plain12.registrationNumber, null);
  assert.equal(plain12.ownerId, '951810145405');
  assert.equal(plain12.ownerIdType, 'nric');
});

test('intent detector should treat standalone 12-digit owner ID as provide_info before personal details step', () => {
  const state = {
    step: FLOW_STEPS.VEHICLE_LOOKUP,
    selectedQuote: null,
    addOnsConfirmed: false,
  };
  const intent = detectUserIntent('951810145405', state);
  assert.equal(intent.intent, 'provide_info');
});

test('personal info extractor should detect address with email + phone in same message', () => {
  const info = extractPersonalInfo('jasonyapkarjuen@gmail.com 0126420803 3a, elitis maya, valencia, sungai buloh, 47000 selangor');
  assert.equal(info.email, 'jasonyapkarjuen@gmail.com');
  assert.equal(info.phone, '0126420803');
  assert.equal(info.address, '3a, elitis maya, valencia, sungai buloh, 47000 selangor');
});

test('personal info extractor should still avoid false address detection on short non-address text', () => {
  const info = extractPersonalInfo('deliver to me please');
  assert.equal(info.address, null);
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

test('road tax step should treat "ok" as default 12month-digital selection', () => {
  const state = {
    step: FLOW_STEPS.ROADTAX,
    selectedQuote: { insurer: 'Takaful Ikhlas' },
    addOnsConfirmed: true,
  };
  const intent = detectUserIntent('ok', state);
  assert.equal(intent.intent, 'select_roadtax');
  assert.equal(intent.data.option, '12month-digital');
});

test('otp step should not misclassify "ok" as road tax selection', () => {
  const state = {
    step: FLOW_STEPS.OTP,
    selectedQuote: { insurer: 'Takaful Ikhlas' },
    addOnsConfirmed: true,
    selectedRoadTax: { name: '12 Months Digital', price: 90 },
  };
  const intent = detectUserIntent('ok', state);
  assert.notEqual(intent.intent, 'select_roadtax');
});
