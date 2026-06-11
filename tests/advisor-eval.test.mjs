import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationState,
  FLOW_STEPS,
  USER_INTENTS,
  detectUserIntent,
} from '../src/lib/conversationState.js';
import {
  buildConversationDecision,
  CONVERSATION_ACTIONS,
  CONVERSATION_MODES,
} from '../src/server/ai/orchestrator.js';
import {
  applyDeterministicFlowHandlers,
} from '../src/server/ai/flowHandlers.js';
import {
  TURN_QUESTION_GUIDANCE,
  TURN_RESPONSE_PATTERNS,
  buildTurnPlan,
  buildTurnQuestionInstruction,
} from '../src/server/ai/turnPlanner.js';
import {
  ADVISOR_INTENTS,
  ADVISOR_TOPICS,
  buildIntentFromAdvisorIntent,
  detectAdvisorIntent,
} from '../src/server/ai/advisorIntent.js';
import {
  buildAddOnsFromSelection,
  extractWindscreenCoverageAmount,
} from '../src/server/insurance/addonEngine.js';

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

function makeState(overrides = {}) {
  const state = new ConversationState();
  Object.assign(state, {
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
  state.userPreferences = {
    ...state.userPreferences,
    ...(overrides.userPreferences || {}),
    preferenceScores: {
      ...state.userPreferences.preferenceScores,
      ...(overrides.userPreferences?.preferenceScores || {}),
    },
  };
  state.transaction = {
    ...state.transaction,
    ...(overrides.transaction || {}),
  };
  return state;
}

function selectedQuote(overrides = {}) {
  return {
    insurer: 'Tokio Marine Insurance',
    priceAfter: 800,
    priceBefore: 1000,
    ncdPercent: 20,
    sumInsured: 35000,
    coverType: 'Comprehensive',
    ...overrides,
  };
}

function quoteState(overrides = {}) {
  return makeState({
    step: FLOW_STEPS.QUOTES,
    selectedQuote: null,
    lastRecommendedInsurer: 'tokio',
    ...overrides,
  });
}

function startState(overrides = {}) {
  return makeState({
    step: FLOW_STEPS.START,
    plateNumber: null,
    nricNumber: null,
    ownerIdType: null,
    vehicleInfo: null,
    selectedQuote: null,
    lastRecommendedInsurer: null,
    ...overrides,
  });
}

function addOnsState(overrides = {}) {
  return makeState({
    step: FLOW_STEPS.ADDONS,
    selectedQuote: selectedQuote(),
    selectedAddOns: [],
    addOnsConfirmed: false,
    ...overrides,
  });
}

function roadTaxState(overrides = {}) {
  return makeState({
    step: FLOW_STEPS.ROADTAX,
    selectedQuote: selectedQuote(),
    selectedAddOns: [],
    addOnsConfirmed: true,
    selectedRoadTax: null,
    ...overrides,
  });
}

function detailsState(overrides = {}) {
  return makeState({
    step: FLOW_STEPS.PERSONAL_DETAILS,
    selectedQuote: selectedQuote(),
    selectedAddOns: [],
    addOnsConfirmed: true,
    selectedRoadTax: { name: 'No Road Tax', price: 0 },
    personalDetails: null,
    ...overrides,
  });
}

function paymentState(overrides = {}) {
  return makeState({
    step: FLOW_STEPS.PAYMENT,
    selectedQuote: selectedQuote(),
    selectedAddOns: [],
    addOnsConfirmed: true,
    selectedRoadTax: { name: 'No Road Tax', price: 0 },
    personalDetails: {
      email: 'ali@example.com',
      phone: '0123456789',
      address: 'No 1 Jalan Test',
    },
    transaction: {
      paymentStatus: 'PENDING',
      policyStatus: null,
    },
    ...overrides,
  });
}

function runAdvisorTurn(message, state) {
  const rawIntent = detectUserIntent(message, state);
  const advisorIntent = detectAdvisorIntent(message, { state, intent: rawIntent });
  const effectiveIntent = buildIntentFromAdvisorIntent(rawIntent, advisorIntent);
  const decision = buildConversationDecision({
    message,
    intent: effectiveIntent,
    state,
    messages: [{ role: 'user', content: message }],
    advisorIntent,
  });
  const turnPlan = buildTurnPlan({
    message,
    intent: effectiveIntent,
    state,
    decision,
    advisorIntent,
  });
  const openAiMessages = [];
  const flowResult = applyDeterministicFlowHandlers({
    openAiMessages,
    state,
    intent: effectiveIntent,
    advisorIntent,
    turnPlan,
    messages: [{ role: 'user', content: message }],
    latestMessage: message,
    callbacks: makeCallbacks(),
  });
  const responseSurface = [
    flowResult.forcedAssistantResponse || '',
    ...openAiMessages.map((item) => item.content || ''),
  ].join('\n\n');

  return {
    rawIntent,
    advisorIntent,
    effectiveIntent,
    decision,
    turnPlan,
    openAiMessages,
    flowResult,
    responseSurface,
    state,
  };
}

function assertMatchesAll(text, patterns, label) {
  for (const pattern of patterns || []) {
    assert.match(text, pattern, `${label} should match ${pattern}`);
  }
}

function assertMatchesNone(text, patterns, label) {
  for (const pattern of patterns || []) {
    assert.doesNotMatch(text, pattern, `${label} should not match ${pattern}`);
  }
}

const advisorEvalCases = [
  {
    name: 'commercial bias challenge answers trust concern before flow',
    message: 'are you pushing tokio because sponsor?',
    state: quoteState,
    advisorIntent: ADVISOR_INTENTS.COMMERCIAL_BIAS_CHALLENGE,
    topic: ADVISOR_TOPICS.COMMERCIAL_BIAS,
    decisionMode: CONVERSATION_MODES.QUOTE_COMPARISON,
    response: [/not hidden paid placement/i, /disclosed clearly/i, /balanced pick/i],
  },
  {
    name: 'explicit rejection excludes recommended insurer and shows alternatives',
    message: 'anything except tokio',
    state: quoteState,
    advisorIntent: ADVISOR_INTENTS.REJECT_RECOMMENDATION,
    effectiveIntent: USER_INTENTS.ASK_QUESTION,
    response: [/exclude\s+\*\*Tokio Marine/i, /Good alternatives/i, /Which one should I lock in/i],
  },
  {
    name: 'conventional-only preference filters out takaful path',
    message: 'i dont want islamic or takaful, show conventional only',
    state: quoteState,
    advisorIntent: ADVISOR_INTENTS.QUOTE_FILTER_PREFERENCE,
    response: [/conventional-only/i, /Best matching choices/i],
    responseNot: [/Takaful Ikhlas Insurance\s+-/i],
  },
  {
    name: 'social objection about Allianz gets handled as consultant advice',
    message: 'my dad says allianz better, should I listen?',
    state: quoteState,
    advisorIntent: ADVISOR_INTENTS.QUOTE_OBJECTION,
    response: [/would not ignore/i, /Allianz Insurance/i, /worth the comfort/i],
  },
  {
    name: 'direct insurer discount objection sells LAJOO value without auto-picking insurer',
    message: 'i can get 10% from insurers directly why should i go with you',
    state: quoteState,
    advisorIntent: ADVISOR_INTENTS.QUOTE_OBJECTION,
    topic: ADVISOR_TOPICS.DIRECT_INSURER_DISCOUNT,
    response: [
      /real \*\*10% direct discount\*\*/i,
      /same cover, same sum insured, and same add-ons/i,
      /upside of using \*\*LAJOO\*\*/i,
      /compare your direct insurer offer against these quotes/i,
    ],
    responseNot: [/Tokio Marine Insurance - RM 800.00/i, /Takaful Ikhlas Insurance - RM 796.00/i, /Back to your renewal/i],
  },
  {
    name: 'quote price-gap question explains economics before closing',
    message: 'what about other insurers, why is some so expensive and the price so much difference',
    state: quoteState,
    advisorIntent: ADVISOR_INTENTS.QUOTE_PRICE_EXPLANATION,
    topic: ADVISOR_TOPICS.QUOTE_PRICE_GAP,
    decisionMode: CONVERSATION_MODES.QUOTE_COMPARISON,
    response: [
      /price gap/i,
      /premium ranges from \*\*Takaful Ikhlas Insurance - RM 796.00\*\* to \*\*Generali Insurance - RM 1,080.00\*\*/i,
      /higher price does not automatically mean "better"/i,
      /Tokio Marine Insurance - RM 800.00/i,
      /compare all 7/i,
    ],
    responseNot: [/let'?s get back to selecting/i],
  },
  {
    name: 'delegated decision picks instead of looping',
    message: 'hmm idk you pick for me',
    state: quoteState,
    advisorIntent: ADVISOR_INTENTS.DELEGATE_DECISION,
    response: [/My pick is/i, /Why:/i, /Want me to proceed/i],
  },
  {
    name: 'noisy Malaysian delegation still gets a recommendation',
    message: 'asdkjasd choose la anything',
    state: quoteState,
    advisorIntent: ADVISOR_INTENTS.DELEGATE_DECISION,
    response: [/My pick is/i, /balanced/i],
  },
  {
    name: 'unavailable preferred insurer is acknowledged instead of ignored',
    message: 'I want Zurich, I used them before',
    state: quoteState,
    advisorIntent: ADVISOR_INTENTS.NONE,
    rawIntent: USER_INTENTS.ASK_QUESTION,
    response: [/Zurich/i, /not in the current LAJOO panel/i, /Closest available fit/i],
  },
  {
    name: 'exploratory quote mention explains insurer instead of selecting',
    message: 'can we have a look at lonpac as well',
    state: quoteState,
    advisorIntent: ADVISOR_INTENTS.NONE,
    rawIntent: USER_INTENTS.ASK_QUESTION,
    decisionMode: CONVERSATION_MODES.QUOTE_COMPARISON,
    response: [/Lonpac Insurance/i, /not selected it yet/i, /RM 960.00/i, /Tokio Marine Insurance - RM 800.00/i, /RM 160.00 higher/i, /cleaner balanced pick/i],
    responseNot: [/Great choice/i, /Step 3 of 6/i, /Would you like some add-ons/i],
  },
  {
    name: 'general add-on advice does not auto-skip',
    message: 'which do i need ? or i can skip',
    state: addOnsState,
    advisorIntent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    decisionMode: CONVERSATION_MODES.INSURANCE_QUESTION,
    response: [/Special Perils/i, /landslide|landslip/i, /Windscreen/i, /Betterment waiver/i, /skip add-ons/i],
  },
  {
    name: 'general add-on importance question uses advisor shortlist',
    message: 'what is important?',
    state: addOnsState,
    rawIntent: USER_INTENTS.ASK_QUESTION,
    advisorIntent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    decisionMode: CONVERSATION_MODES.INSURANCE_QUESTION,
    response: [/practical advice/i, /My usual shortlist/i, /Special Perils/i, /Windscreen/i, /Betterment waiver/i, /What would you like/i],
  },
  {
    name: 'must-take add-on phrasing uses same advisor path',
    message: 'what are the items that i must take?',
    state: addOnsState,
    rawIntent: USER_INTENTS.ASK_QUESTION,
    advisorIntent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    topic: ADVISOR_TOPICS.ADDON_SKIP_DECISION,
    decisionMode: CONVERSATION_MODES.INSURANCE_QUESTION,
    response: [/^Yes - you can skip add-ons/i, /My practical minimum/i, /Special Perils/i, /Windscreen/i, /E-hailing/i, /skip add-ons/i],
  },
  {
    name: 'casual must-take add-on phrasing uses advisor shortlist instead of generic delegation',
    message: 'must take anything ah?',
    state: addOnsState,
    rawIntent: USER_INTENTS.ASK_QUESTION,
    advisorIntent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    decisionMode: CONVERSATION_MODES.INSURANCE_QUESTION,
    response: [/practical advice/i, /My usual shortlist/i, /Special Perils/i, /Windscreen/i, /What would you like/i],
    responseNot: [/My pick is/i, /balanced pick/i, /choose an insurer/i],
  },
  {
    name: 'help me decide at add-ons uses structured advisor shortlist',
    message: 'help me decide',
    state: addOnsState,
    rawIntent: USER_INTENTS.ASK_QUESTION,
    advisorIntent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    decisionMode: CONVERSATION_MODES.INSURANCE_QUESTION,
    response: [/practical advice/i, /My usual shortlist/i, /2\. Special Perils/i, /1\. Windscreen/i, /8\. Betterment waiver/i, /nice-to-have/i],
    responseNot: [/preventing unexpected repair costs/i, /mandatory/i, /must-buy/i],
  },
  {
    name: 'should I skip add-ons gets a decision-first answer',
    message: 'should i skip?',
    state: addOnsState,
    rawIntent: USER_INTENTS.ASK_QUESTION,
    advisorIntent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    topic: ADVISOR_TOPICS.ADDON_SKIP_DECISION,
    decisionMode: CONVERSATION_MODES.INSURANCE_QUESTION,
    response: [/^Yes - you can skip add-ons/i, /My practical minimum/i, /2\. Special Perils/i, /1\. Windscreen/i, /3\. E-hailing/i, /8\. Betterment waiver/i, /nice-to-have.*not essential/i, /skip add-ons/i],
    responseNot: [/Whether to skip add-ons entirely depends/i, /Which add-on\(s\) would you like to choose/i],
  },
  {
    name: 'necessary add-on phrasing uses minimum decision path',
    message: 'what is necessary tho?',
    state: addOnsState,
    rawIntent: USER_INTENTS.ASK_QUESTION,
    advisorIntent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    topic: ADVISOR_TOPICS.ADDON_SKIP_DECISION,
    decisionMode: CONVERSATION_MODES.INSURANCE_QUESTION,
    response: [/^Yes - you can skip add-ons/i, /My practical minimum/i, /Special Perils/i, /Windscreen/i, /Betterment waiver/i],
    responseNot: [/Based on your needs, you can choose/i],
  },
  {
    name: 'Grab usage recommends e-hailing clearly',
    message: 'I use the car for Grab sometimes, what should I do?',
    state: addOnsState,
    advisorIntent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    topic: ADVISOR_TOPICS.E_HAILING,
    response: [/E-hailing/i, /RM 2,000/i, /private-use only/i],
  },
  {
    name: 'family drivers maps to All Drivers',
    message: 'my wife and dad drive sometimes',
    state: addOnsState,
    advisorIntent: ADVISOR_INTENTS.ADDON_EXPLANATION,
    topic: ADVISOR_TOPICS.ALL_DRIVERS,
    response: [/All Drivers/i, /RM 30.00/i, /family members/i],
  },
  {
    name: 'zero betterment before insurer selection answers quote fit instead of add-on selection',
    message: 'what about zero betterment',
    state: quoteState,
    advisorIntent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    topic: ADVISOR_TOPICS.BETTERMENT,
    response: [/Zero betterment helps reduce/i, /add-ons step/i, /7-year-old Perodua Myvi/i, /nice-to-have/i, /choose the insurer first/i, /ask me to recommend one/i],
    responseNot: [/insurer\/product-fit question first/i, /I should not jump/i, /cannot confirm/i, /verified facts/i, /clearest zero-betterment signal/i, /final availability and price can depend/i, /RM 350.00/i, /Do you want to add \*\*Betterment waiver\*\*/i, /or skip it/i, /do not see a confirmed zero-betterment insurer/i, /My earlier advice/i, /Tokio Marine Insurance - RM 800.00/i, /Takaful Ikhlas Insurance - RM 796.00/i, /Shall I select/i],
  },
  {
    name: 'zero betterment at vehicle-info stage stays advisory and does not select add-on',
    message: 'what is zero betterment',
    state: startState,
    advisorIntent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    topic: ADVISOR_TOPICS.BETTERMENT,
    response: [/Zero betterment helps reduce/i, /actual add-on options/i, /vehicle plate/i, /owner identification number/i],
    responseNot: [/RM 350.00/i, /Do you want to add/i, /or skip it/i, /add \*\*Betterment waiver\*\*/i, /Tokio Marine Insurance/i, /Takaful Ikhlas Insurance/i, /My earlier advice/i],
  },
  {
    name: 'LLTP shorthand is understood',
    message: 'what is lltp?',
    state: addOnsState,
    advisorIntent: ADVISOR_INTENTS.ADDON_EXPLANATION,
    topic: ADVISOR_TOPICS.LLTP,
    response: [/LLTP/i, /Negligence/i, /Do you want to add/i],
  },
  {
    name: 'legal liability to passengers gets direct explanation',
    message: 'legal liability to passengers normal people need it?',
    state: addOnsState,
    advisorIntent: ADVISOR_INTENTS.ADDON_EXPLANATION,
    topic: ADVISOR_TOPICS.LEGAL_LIABILITY_PASSENGERS,
    response: [/Legal Liability To Passengers/i, /Most private-car users/i, /not.*must-have/i],
  },
  {
    name: 'strike riot civil commotion is explained as optional risk',
    message: 'should I take strike riot civil commotion?',
    state: addOnsState,
    advisorIntent: ADVISOR_INTENTS.ADDON_EXPLANATION,
    topic: ADVISOR_TOPICS.STRIKE_RIOT,
    response: [/Strike, riot and civil commotion/i, /relatively expensive/i, /skip it/i],
  },
  {
    name: 'old expensive-parts betterment concern is understood',
    message: 'old porsche low sum insured expensive parts, zero betterment meaning?',
    state: () => addOnsState({ vehicleInfo: { make: 'Porsche', model: 'Cayenne', year: 2010, postcode: '47000' } }),
    advisorIntent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    topic: ADVISOR_TOPICS.BETTERMENT,
    response: [/Betterment waiver/i, /RM 350.00/i, /consider it more seriously/i, /expensive parts/i],
    responseNot: [/nice-to-have/i],
  },
  {
    name: 'windscreen amount delegation gives a practical amount',
    message: 'i dont understand windscreen amount, pick reasonable one',
    state: addOnsState,
    advisorIntent: ADVISOR_INTENTS.ADDON_EXPLANATION,
    topic: ADVISOR_TOPICS.WINDSCREEN_AMOUNT,
    response: [/RM 1,000.00 cover/i, /reasonable starting point/i, /RM 2,000/i],
  },
  {
    name: 'lowest total add-on request recommends skip cleanly',
    message: 'too expensive, make it lowest total',
    state: addOnsState,
    advisorIntent: ADVISOR_INTENTS.COVERAGE_RISK_ADVICE,
    topic: ADVISOR_TOPICS.LOWEST_TOTAL,
    response: [/lowest total/i, /skip optional add-ons/i, /continue to road tax/i],
  },
  {
    name: 'add-on timing question does not add flood immediately',
    message: 'can I still add flood later?',
    state: roadTaxState,
    advisorIntent: ADVISOR_INTENTS.ADDON_EXPLANATION,
    topic: ADVISOR_TOPICS.ADDON_CHANGE_WINDOW,
    response: [/before payment and policy issuance/i, /add it now/i],
  },
  {
    name: 'already-renewed road tax avoids duplicate sale',
    message: 'i already renewed road tax elsewhere',
    state: roadTaxState,
    advisorIntent: ADVISOR_INTENTS.ROADTAX_ALREADY_RENEWED,
    response: [/insurance only/i, /avoid charging road tax again/i, /no road tax/i],
  },
  {
    name: 'digital road tax police question gets yes answer',
    message: 'is digital roadtax enough if police stop me?',
    state: roadTaxState,
    advisorIntent: ADVISOR_INTENTS.ROADTAX_LEGALITY,
    topic: ADVISOR_TOPICS.DIGITAL_ROADTAX,
    response: [/Yes - digital road tax/i, /JPJ\/MyJPJ/i, /12-month digital road tax/i],
  },
  {
    name: 'road tax duration question explains LAJOO only supports 12-month option',
    message: 'can i renew for 6 months ? and what is digital roadtax if police blocks me what do i do',
    state: roadTaxState,
    advisorIntent: ADVISOR_INTENTS.ROADTAX_LEGALITY,
    topic: ADVISOR_TOPICS.DIGITAL_ROADTAX,
    response: [/Yes - digital road tax/i, /6-month road tax/i, /LAJOO currently supports \*\*12-month digital road tax only\*\*/i, /another channel/i, /12-month digital road tax/i, /no road tax/i],
  },
  {
    name: 'address privacy is answered before asking details again',
    message: 'why you need my address, you sending by email only right?',
    state: detailsState,
    advisorIntent: ADVISOR_INTENTS.PRIVACY_CONCERN,
    topic: ADVISOR_TOPICS.ADDRESS_PRIVACY,
    response: [/address is needed/i, /policy\/proposal record/i, /previous policy address/i],
  },
  {
    name: 'IC privacy concern is answered directly',
    message: 'can i not give IC? privacy lah',
    state: detailsState,
    advisorIntent: ADVISOR_INTENTS.PRIVACY_CONCERN,
    topic: ADVISOR_TOPICS.IC_PRIVACY,
    response: [/owner IC\/ID is needed/i, /verification\/issuance/i, /mask it where possible/i],
  },
  {
    name: 'WhatsApp document request does not skip required details',
    message: 'just whatsapp the policy to me',
    state: detailsState,
    advisorIntent: ADVISOR_INTENTS.DOCUMENT_DELIVERY,
    topic: ADVISOR_TOPICS.WHATSAPP_DOCUMENTS,
    response: [/WhatsApp\/email/i, /valid phone number/i, /email\/address/i],
  },
  {
    name: 'human handoff request is acknowledged',
    message: 'can i speak to human agent?',
    state: paymentState,
    advisorIntent: ADVISOR_INTENTS.HUMAN_HANDOFF,
    response: [/speak to a person/i, /staying at the \*\*payment\*\* step/i, /human agent/i],
  },
  {
    name: 'payment timing question stays safe',
    message: 'what happens after payment, will i be covered immediately?',
    state: paymentState,
    advisorIntent: ADVISOR_INTENTS.PAYMENT_CONCERN,
    topic: ADVISOR_TOPICS.PAYMENT_AFTER,
    response: [/payment confirmation first/i, /policy issuance/i, /should not say you are covered/i],
  },
  {
    name: 'cash or bank transfer question is answered directly',
    message: 'can I pay cash or bank transfer?',
    state: paymentState,
    advisorIntent: ADVISOR_INTENTS.PAYMENT_CONCERN,
    response: [/Cash is not available/i, /FPX\/online banking/i, /should not collect card/i],
  },
];

for (const scenario of advisorEvalCases) {
  test(`advisor eval: ${scenario.name}`, () => {
    const state = scenario.state();
    const beforeStep = state.step;
    const result = runAdvisorTurn(scenario.message, state);

    if (scenario.rawIntent) {
      assert.equal(result.rawIntent.intent, scenario.rawIntent);
    }
    assert.equal(result.advisorIntent.intent, scenario.advisorIntent);
    if (scenario.topic) {
      assert.equal(result.advisorIntent.topic, scenario.topic);
    }
    if (scenario.effectiveIntent) {
      assert.equal(result.effectiveIntent.intent, scenario.effectiveIntent);
    }
    if (scenario.decisionMode) {
      assert.equal(result.decision.mode, scenario.decisionMode);
    }
    assert.notEqual(result.decision.action, CONVERSATION_ACTIONS.ADVANCE_FLOW);
    assert.equal(result.state.step, beforeStep);
    assertMatchesAll(result.responseSurface, scenario.response, scenario.name);
    assertMatchesNone(result.responseSurface, scenario.responseNot, scenario.name);
  });
}

test('advisor eval: road tax alternative question is routed to answer-first guidance', () => {
  const state = roadTaxState();
  const result = runAdvisorTurn('where else can I renew road tax?', state);
  const questionInstruction = buildTurnQuestionInstruction(result.turnPlan, { state });

  assert.equal(result.rawIntent.intent, USER_INTENTS.ASK_QUESTION);
  assert.equal(result.turnPlan.questionGuidance, TURN_QUESTION_GUIDANCE.ROADTAX_ALTERNATIVE);
  assert.equal(result.decision.action, CONVERSATION_ACTIONS.ANSWER_THEN_RESUME);
  assert.match(questionInstruction, /MyJPJ/i);
  assert.match(questionInstruction, /MyEG/i);
  assert.match(questionInstruction, /Pos Malaysia/i);
  assert.match(questionInstruction, /insurance must be active/i);
  assert.equal(state.step, FLOW_STEPS.ROADTAX);
});

test('advisor eval: unverified payment claim is blocked', () => {
  const state = paymentState({
    transaction: {
      paymentStatus: 'PENDING',
      policyStatus: null,
    },
  });
  const result = runAdvisorTurn('payment done, send policy now', state);

  assert.equal(result.turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.BLOCK_UNSAFE_ACTION);
  assert.equal(result.turnPlan.shouldBlockUnsafeAction, true);
  assert.ok(result.turnPlan.actions.includes('block_unverified_payment_or_policy_claim'));
  assert.equal(state.step, FLOW_STEPS.PAYMENT);
});

test('advisor eval: casual purchased wording is blocked as unverified payment claim', () => {
  const state = paymentState({
    transaction: {
      paymentStatus: 'PENDING',
      policyStatus: null,
    },
  });
  const result = runAdvisorTurn('done purchased please check', state);

  assert.equal(result.turnPlan.responsePattern, TURN_RESPONSE_PATTERNS.BLOCK_UNSAFE_ACTION);
  assert.equal(result.turnPlan.shouldBlockUnsafeAction, true);
  assert.ok(result.turnPlan.actions.includes('block_unverified_payment_or_policy_claim'));
  assert.equal(state.step, FLOW_STEPS.PAYMENT);
});

test('advisor eval: wrong staging OTP does not advance to payment', () => {
  const state = detailsState({
    step: FLOW_STEPS.OTP,
    personalDetails: {
      email: 'ali@example.com',
      phone: '0123456789',
      address: 'No 1 Jalan Test',
    },
  });
  const result = runAdvisorTurn('9999', state);

  assert.equal(result.rawIntent.intent, USER_INTENTS.VERIFY_OTP);
  assert.equal(result.rawIntent.data.valid, false);
  assert.match(result.responseSurface, /does not match/i);
  assert.doesNotMatch(result.responseSurface, /PAYMENT_STEP_BLOCK/i);
  assert.equal(state.step, FLOW_STEPS.OTP);
});

test('advisor eval: written windscreen amount is parsed as RM 2,000', () => {
  const state = addOnsState();
  const message = 'add windscreen rm two thousand';
  const intent = detectUserIntent(message, state);
  const coverageAmount = extractWindscreenCoverageAmount(message, { allowBareAmount: true });
  const addOns = buildAddOnsFromSelection(intent.data?.addOns || [], { coverageAmount });

  assert.equal(intent.intent, USER_INTENTS.SELECT_ADDON);
  assert.equal(coverageAmount, 2000);
  assert.equal(addOns.length, 1);
  assert.match(addOns[0].name, /Windscreen/i);
  assert.equal(addOns[0].coverageAmount, 2000);
});

test('advisor eval: late vehicle and road-tax corrections are classified before generic flow', () => {
  const payState = paymentState();
  const vehicleCorrection = detectUserIntent('wait wrong car change plate WXY1234', payState);
  const roadTaxCorrection = detectUserIntent('no I mean skip road tax', paymentState());

  assert.equal(vehicleCorrection.intent, USER_INTENTS.CHANGE_VEHICLE);
  assert.equal(vehicleCorrection.data?.plateNumber, 'WXY1234');
  assert.equal(roadTaxCorrection.intent, USER_INTENTS.CHANGE_ROADTAX);
  assert.equal(roadTaxCorrection.data?.option, 'none');
});

test('advisor eval: recent founder QA intent set stays on the intended path', () => {
  const payState = paymentState({
    selectedRoadTax: { name: '12 months digital road tax', price: 90 },
    selectedAddOns: [
      { id: 'flood', name: 'Inclusion of Special Perils', price: 150 },
      { id: 'betterment_waiver', name: 'Betterment waiver', price: 350 },
    ],
  });
  const addOnState = addOnsState();
  const otpState = detailsState({
    step: FLOW_STEPS.OTP,
    personalDetails: {
      email: 'ali@example.com',
      phone: '0123456789',
      address: 'Wrong address',
    },
  });
  const quoteExploreState = quoteState();

  const takeAwayRoadTax = detectUserIntent('take away roadtax', payState);
  const bodyPainting = detectUserIntent('can help to addvehicle body painting', payState);
  const addAllDrivers = detectUserIntent('can add all driver add-on ?', payState);
  const multiAddOns = detectUserIntent('windscreen, special peril, all driver, and betterment', addOnState);
  const addressCorrection = detectUserIntent('no, my address is 3a, elitis maya, valencia, sungai buloh, 47000 selangor', otpState);
  const exploreLonpac = detectUserIntent('can we have a look at lonpac as well', quoteExploreState);

  assert.equal(takeAwayRoadTax.intent, USER_INTENTS.CHANGE_ROADTAX);
  assert.equal(takeAwayRoadTax.data?.option, 'none');
  assert.equal(bodyPainting.intent, USER_INTENTS.CHANGE_ADDONS);
  assert.equal(addAllDrivers.intent, USER_INTENTS.CHANGE_ADDONS);
  assert.equal(multiAddOns.intent, USER_INTENTS.SELECT_ADDON);
  assert.deepEqual(multiAddOns.data?.addOns, ['windscreen', 'flood', 'all_drivers', 'betterment_waiver']);
  assert.equal(addressCorrection.intent, USER_INTENTS.CHANGE_PERSONAL_DETAILS);
  assert.equal(addressCorrection.data?.field, 'address');
  assert.equal(exploreLonpac.intent, USER_INTENTS.ASK_QUESTION);
});
