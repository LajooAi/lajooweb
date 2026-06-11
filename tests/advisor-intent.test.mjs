import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationState,
  FLOW_STEPS,
  USER_INTENTS,
  detectUserIntent,
} from '../src/lib/conversationState.js';
import {
  ADVISOR_INTENTS,
  ADVISOR_TOPICS,
  buildIntentFromAdvisorIntent,
  detectAdvisorIntent,
} from '../src/server/ai/advisorIntent.js';

function stateAt(step) {
  const state = new ConversationState();
  state.step = step;
  state.plateNumber = 'JRT9289';
  state.nricNumber = '951018145405';
  state.ownerIdType = 'nric';
  if (step !== FLOW_STEPS.QUOTES) {
    state.selectedQuote = {
      insurer: 'Tokio Marine Insurance',
      priceAfter: 800,
      sumInsured: 35000,
    };
  }
  return state;
}

test('advisor intent blocks accidental quote selection when user rejects an insurer', () => {
  const state = stateAt(FLOW_STEPS.QUOTES);
  const rawIntent = detectUserIntent('anything except tokio', state);
  const advisorIntent = detectAdvisorIntent('anything except tokio', { state, intent: rawIntent });
  const effectiveIntent = buildIntentFromAdvisorIntent(rawIntent, advisorIntent);

  assert.equal(advisorIntent.intent, ADVISOR_INTENTS.REJECT_RECOMMENDATION);
  assert.deepEqual(advisorIntent.entities.excludedInsurerKeys, ['tokio']);
  assert.equal(advisorIntent.shouldPreventFlowAdvance, true);
  assert.equal(effectiveIntent.intent, USER_INTENTS.ASK_QUESTION);
  assert.equal(effectiveIntent.data.blockedOriginalIntent, rawIntent.intent);
});

test('advisor intent detects commercial-bias challenge', () => {
  const state = stateAt(FLOW_STEPS.QUOTES);
  state.lastRecommendedInsurer = 'tokio';
  const advisorIntent = detectAdvisorIntent('are you pushing tokio because sponsor?', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });

  assert.equal(advisorIntent.intent, ADVISOR_INTENTS.COMMERCIAL_BIAS_CHALLENGE);
  assert.equal(advisorIntent.topic, ADVISOR_TOPICS.COMMERCIAL_BIAS);
  assert.equal(advisorIntent.shouldPreventFlowAdvance, true);
});

test('advisor intent detects quote price-gap questions', () => {
  const state = stateAt(FLOW_STEPS.QUOTES);
  const advisorIntent = detectAdvisorIntent('what about other insurers, why is some so expensive and the price so much difference', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });

  assert.equal(advisorIntent.intent, ADVISOR_INTENTS.QUOTE_PRICE_EXPLANATION);
  assert.equal(advisorIntent.topic, ADVISOR_TOPICS.QUOTE_PRICE_GAP);
  assert.equal(advisorIntent.shouldPreventFlowAdvance, true);
});

test('advisor intent detects human handoff and privacy concerns', () => {
  const state = stateAt(FLOW_STEPS.PERSONAL_DETAILS);
  const handoff = detectAdvisorIntent('can i speak to human agent?', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const privacy = detectAdvisorIntent('why you need my address, you sending by email only right?', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });

  assert.equal(handoff.intent, ADVISOR_INTENTS.HUMAN_HANDOFF);
  assert.equal(privacy.intent, ADVISOR_INTENTS.PRIVACY_CONCERN);
  assert.equal(privacy.topic, ADVISOR_TOPICS.ADDRESS_PRIVACY);
});

test('advisor intent detects concrete add-on advisor topics', () => {
  const state = stateAt(FLOW_STEPS.ADDONS);
  const allDrivers = detectAdvisorIntent('my wife sometimes drives, what addon?', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const lltp = detectAdvisorIntent('what is lltp?', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const flood = detectAdvisorIntent('i stay shah alam and always park basement, just tell me what to take', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const landslide = detectAdvisorIntent('does special perils cover landslide?', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const important = detectAdvisorIntent('what is important?', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const mustTake = detectAdvisorIntent('what are the items that i must take?', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const casualMustTake = detectAdvisorIntent('must take anything ah?', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const helpMeDecide = detectAdvisorIntent('help me decide', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const shouldSkip = detectAdvisorIntent('should i skip?', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const necessary = detectAdvisorIntent('what is necessary tho?', {
    state,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });

  assert.equal(allDrivers.intent, ADVISOR_INTENTS.ADDON_EXPLANATION);
  assert.equal(allDrivers.topic, ADVISOR_TOPICS.ALL_DRIVERS);
  assert.equal(lltp.topic, ADVISOR_TOPICS.LLTP);
  assert.equal(flood.intent, ADVISOR_INTENTS.COVERAGE_RISK_ADVICE);
  assert.equal(flood.topic, ADVISOR_TOPICS.FLOOD);
  assert.equal(landslide.intent, ADVISOR_INTENTS.COVERAGE_RISK_ADVICE);
  assert.equal(important.intent, ADVISOR_INTENTS.COVERAGE_RISK_ADVICE);
  assert.equal(important.topic, 'general_addon_recommendation');
  assert.equal(mustTake.intent, ADVISOR_INTENTS.COVERAGE_RISK_ADVICE);
  assert.equal(mustTake.topic, ADVISOR_TOPICS.ADDON_SKIP_DECISION);
  assert.equal(casualMustTake.intent, ADVISOR_INTENTS.COVERAGE_RISK_ADVICE);
  assert.equal(casualMustTake.topic, 'general_addon_recommendation');
  assert.equal(helpMeDecide.intent, ADVISOR_INTENTS.COVERAGE_RISK_ADVICE);
  assert.equal(helpMeDecide.topic, 'general_addon_recommendation');
  assert.equal(shouldSkip.intent, ADVISOR_INTENTS.COVERAGE_RISK_ADVICE);
  assert.equal(shouldSkip.topic, ADVISOR_TOPICS.ADDON_SKIP_DECISION);
  assert.equal(necessary.intent, ADVISOR_INTENTS.COVERAGE_RISK_ADVICE);
  assert.equal(necessary.topic, ADVISOR_TOPICS.ADDON_SKIP_DECISION);
  assert.equal(landslide.topic, ADVISOR_TOPICS.FLOOD);
});

test('advisor intent detects road tax and payment advisor questions', () => {
  const roadTaxState = stateAt(FLOW_STEPS.ROADTAX);
  const renewed = detectAdvisorIntent('i already renewed road tax myself', {
    state: roadTaxState,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.8 },
  });
  const legality = detectAdvisorIntent('is digital roadtax enough if police stop me?', {
    state: roadTaxState,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const sixMonthQuestion = detectAdvisorIntent('can i renew for 6 months? and what is digital roadtax if police blocks me?', {
    state: roadTaxState,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const onlyDigitalQuestion = detectAdvisorIntent('ok, why only digital?', {
    state: roadTaxState,
    intent: detectUserIntent('ok, why only digital?', roadTaxState),
  });
  const payment = detectAdvisorIntent('what happens after payment, will i be covered immediately?', {
    state: stateAt(FLOW_STEPS.PAYMENT),
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });

  assert.equal(renewed.intent, ADVISOR_INTENTS.ROADTAX_ALREADY_RENEWED);
  assert.equal(legality.intent, ADVISOR_INTENTS.ROADTAX_LEGALITY);
  assert.equal(sixMonthQuestion.intent, ADVISOR_INTENTS.ROADTAX_LEGALITY);
  assert.equal(sixMonthQuestion.topic, ADVISOR_TOPICS.DIGITAL_ROADTAX);
  assert.equal(sixMonthQuestion.entities.asksSixMonthRoadTax, true);
  assert.equal(onlyDigitalQuestion.intent, ADVISOR_INTENTS.ROADTAX_LEGALITY);
  assert.equal(onlyDigitalQuestion.topic, ADVISOR_TOPICS.DIGITAL_ROADTAX);
  assert.equal(onlyDigitalQuestion.entities.asksOnlyDigitalRoadTax, true);
  assert.equal(payment.intent, ADVISOR_INTENTS.PAYMENT_CONCERN);
});

test('advisor intent detects noisy delegated quote decisions', () => {
  const state = stateAt(FLOW_STEPS.QUOTES);
  const rawIntent = detectUserIntent('asdkjasd choose la anything', state);
  const advisorIntent = detectAdvisorIntent('asdkjasd choose la anything', {
    state,
    intent: rawIntent,
  });

  assert.equal(advisorIntent.intent, ADVISOR_INTENTS.DELEGATE_DECISION);
});

test('advisor intent answers add-on timing and WhatsApp document questions', () => {
  const addOnState = stateAt(FLOW_STEPS.ROADTAX);
  const addLater = detectAdvisorIntent('can I still add flood later?', {
    state: addOnState,
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });
  const docs = detectAdvisorIntent('just whatsapp the policy to me', {
    state: stateAt(FLOW_STEPS.PERSONAL_DETAILS),
    intent: { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 },
  });

  assert.equal(addLater.intent, ADVISOR_INTENTS.ADDON_EXPLANATION);
  assert.equal(addLater.topic, ADVISOR_TOPICS.ADDON_CHANGE_WINDOW);
  assert.equal(docs.intent, ADVISOR_INTENTS.DOCUMENT_DELIVERY);
  assert.equal(docs.topic, ADVISOR_TOPICS.WHATSAPP_DOCUMENTS);
});

test('advisor intent does not block clear add-on or payment selections', () => {
  const addOnState = stateAt(FLOW_STEPS.ADDONS);
  const addIntent = detectUserIntent('add all drivers', addOnState);
  const addAdvisor = detectAdvisorIntent('add all drivers', { state: addOnState, intent: addIntent });
  const addEffective = buildIntentFromAdvisorIntent(addIntent, addAdvisor);
  const multiAddOnIntent = detectUserIntent('windscreen, special peril, all driver, and betterment', addOnState);
  const multiAddOnAdvisor = detectAdvisorIntent('windscreen, special peril, all driver, and betterment', {
    state: addOnState,
    intent: multiAddOnIntent,
  });
  const multiAddOnEffective = buildIntentFromAdvisorIntent(multiAddOnIntent, multiAddOnAdvisor);

  const paymentState = stateAt(FLOW_STEPS.PAYMENT);
  const payIntent = detectUserIntent('pay now', paymentState);
  const payAdvisor = detectAdvisorIntent('pay now', { state: paymentState, intent: payIntent });
  const payEffective = buildIntentFromAdvisorIntent(payIntent, payAdvisor);

  assert.equal(addIntent.intent, USER_INTENTS.SELECT_ADDON);
  assert.equal(addAdvisor.intent, ADVISOR_INTENTS.NONE);
  assert.equal(addEffective.intent, USER_INTENTS.SELECT_ADDON);
  assert.equal(multiAddOnIntent.intent, USER_INTENTS.SELECT_ADDON);
  assert.equal(multiAddOnAdvisor.intent, ADVISOR_INTENTS.NONE);
  assert.equal(multiAddOnEffective.intent, USER_INTENTS.SELECT_ADDON);
  assert.equal(payIntent.intent, USER_INTENTS.SELECT_PAYMENT);
  assert.equal(payAdvisor.intent, ADVISOR_INTENTS.NONE);
  assert.equal(payEffective.intent, USER_INTENTS.SELECT_PAYMENT);
});

test('advisor intent does not block late explicit add-on changes', () => {
  const state = stateAt(FLOW_STEPS.PAYMENT);
  state.selectedRoadTax = { name: '12 months digital road tax', price: 90 };
  state.personalDetails = {
    email: 'test@example.com',
    phone: '0123456789',
    address: 'No 1, Jalan Test, Selangor',
  };
  state.otpVerified = true;
  state.selectedAddOns = [
    { id: 'windscreen', name: 'Windscreen Coverage RM 3,000.00', price: 450, coverageAmount: 3000 },
    { id: 'flood', name: 'Inclusion of Special Perils', price: 150 },
  ];

  const rawIntent = detectUserIntent('can add all driver add-on ?', state);
  const advisorIntent = detectAdvisorIntent('can add all driver add-on ?', {
    state,
    intent: rawIntent,
  });
  const effectiveIntent = buildIntentFromAdvisorIntent(rawIntent, advisorIntent);

  assert.equal(rawIntent.intent, USER_INTENTS.CHANGE_ADDONS);
  assert.equal(advisorIntent.intent, ADVISOR_INTENTS.ADDON_EXPLANATION);
  assert.equal(advisorIntent.topic, ADVISOR_TOPICS.ALL_DRIVERS);
  assert.equal(effectiveIntent.intent, USER_INTENTS.CHANGE_ADDONS);
});

test('conversation state preserves advisor quote preference memory', () => {
  const state = new ConversationState();
  state.userPreferences.excludedInsurerKeys = ['tokio'];
  state.userPreferences.conventionalOnly = true;

  const hydrated = ConversationState.fromJSON(state.toJSON());

  assert.deepEqual(hydrated.userPreferences.excludedInsurerKeys, ['tokio']);
  assert.equal(hydrated.userPreferences.conventionalOnly, true);
});
