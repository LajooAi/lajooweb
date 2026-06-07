import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationState,
  detectUserIntent,
  FLOW_STEPS,
} from '../src/lib/conversationState.js';
import { getQuotes } from '../src/lib/insuranceData.js';
import {
  buildConversationDecision,
  CONVERSATION_ACTIONS,
  CONVERSATION_MODES,
} from '../src/server/ai/orchestrator.js';
import {
  buildTurnPlan,
  TURN_FORCED_RESPONSES,
  TURN_QUESTION_GUIDANCE,
  TURN_RESPONSE_PATTERNS,
} from '../src/server/ai/turnPlanner.js';
import {
  buildQuoteRecommendation,
} from '../src/server/insurance/recommendationEngine.js';
import {
  evaluateAssistantResponseQuality,
} from '../src/server/ai/responseQualityEvaluator.js';

function makeState(overrides = {}) {
  const state = new ConversationState();
  Object.assign(state, overrides);
  state.transaction = {
    ...state.transaction,
    ...(overrides.transaction || {}),
  };
  state.userPreferences = {
    ...state.userPreferences,
    ...(overrides.userPreferences || {}),
    preferenceScores: {
      ...state.userPreferences.preferenceScores,
      ...(overrides.userPreferences?.preferenceScores || {}),
    },
  };
  return state;
}

function makeVehicleReadyState(overrides = {}) {
  return makeState({
    step: FLOW_STEPS.QUOTES,
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
}

function simulateTurn(userMessage, state) {
  const intent = detectUserIntent(userMessage, state);
  const decision = buildConversationDecision({
    message: userMessage,
    intent,
    state,
    messages: [{ role: 'user', content: userMessage }],
  });
  const turnPlan = buildTurnPlan({
    message: userMessage,
    intent,
    state,
    decision,
    engineContext: decision.engineContext,
  });
  const quoteRecommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    state,
    userPreferences: state.userPreferences,
    message: userMessage,
  });
  return { intent, decision, turnPlan, quoteRecommendation };
}

function evaluateGolden({ userMessage, assistantResponse, state, expectations }) {
  const simulation = simulateTurn(userMessage, state);
  return {
    simulation,
    result: evaluateAssistantResponseQuality({
      userMessage,
      assistantResponse,
      state,
      decision: simulation.decision,
      turnPlan: simulation.turnPlan,
      expectations,
    }),
  };
}

function assertGoldenPass(context, minimumScore = 8) {
  assert.equal(context.result.pass, true, `Unexpected quality issues: ${context.result.issueIds.join(', ')}`);
  assert.ok(context.result.score >= minimumScore, `Expected score >= ${minimumScore}, got ${context.result.score}`);
}

const goldenCases = [
  {
    name: 'quote recommendation sounds confident and does not dump the quote list',
    state: makeVehicleReadyState({
      userPreferences: { budgetFocused: true },
    }),
    userMessage: 'which insurer do you recommend for my Myvi?',
    expectedMode: CONVERSATION_MODES.QUOTE_COMPARISON,
    expectedPattern: TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME,
    assistantResponse: 'I recommend Takaful Ikhlas Insurance for this quote. It is the lowest current premium at RM 796.00, so it fits your budget focus; the tradeoff is Allianz gives a higher sum insured at RM 36,000. Want to go with Takaful Ikhlas?',
    expectations: {
      answerFirst: true,
      answerPatterns: [/I recommend Takaful Ikhlas/i],
      requiredRecommendation: 'Takaful Ikhlas',
      requireNextQuestion: true,
      resumePatterns: [/Want to go with Takaful/i],
      maxQuestions: 1,
    },
  },
  {
    name: 'betterment explanation is simple and resumes the current flow',
    state: makeVehicleReadyState({
      step: FLOW_STEPS.ADDONS,
      selectedQuote: {
        insurer: 'Allianz Insurance',
        priceAfter: 920,
        priceBefore: 1150,
        ncdPercent: 20,
        sumInsured: 36000,
      },
    }),
    userMessage: 'what is betterment?',
    expectedMode: CONVERSATION_MODES.INSURANCE_QUESTION,
    expectedPattern: TURN_RESPONSE_PATTERNS.ANSWER_THEN_RESUME,
    assistantResponse: 'Betterment is the extra amount you may need to pay when a damaged old part is replaced with a new part. For a 2019 car, it matters because it can become a surprise repair cost during a claim. Do you want me to explain the betterment waiver add-on, or continue with windscreen, special perils, e-hailing, or skip?',
    expectations: {
      answerFirst: true,
      answerPatterns: [/Betterment is/i, /old part/i, /new part/i],
      requireNextQuestion: true,
      resumePatterns: [/windscreen|special perils|e-hailing|skip/i],
      maxQuestions: 1,
    },
  },
  {
    name: 'confused user gets two or three plain choices',
    state: makeVehicleReadyState(),
    userMessage: 'hmm dunno lah',
    expectedMode: CONVERSATION_MODES.CONFUSED,
    expectedPattern: TURN_RESPONSE_PATTERNS.CLARIFY_CONFUSION,
    assistantResponse: 'No worries. Keep it simple: choose the cheapest option, choose the higher-cover option, or let me recommend one for you. Want me to pick the best balance?',
    expectations: {
      answerFirst: true,
      answerPatterns: [/No worries|Keep it simple/i],
      requireNextQuestion: true,
      simpleChoicePatterns: [/cheapest/i, /higher-cover|higher cover/i, /recommend/i],
      maxQuestions: 1,
    },
  },
  {
    name: 'change request explains reset impact and asks one confirmation',
    state: makeVehicleReadyState({
      step: FLOW_STEPS.ADDONS,
      selectedQuote: {
        insurer: 'Takaful Ikhlas Insurance',
        priceAfter: 796,
        priceBefore: 995,
        ncdPercent: 20,
        sumInsured: 34000,
      },
    }),
    userMessage: 'can I switch to Etiqa instead?',
    expectedMode: CONVERSATION_MODES.CHANGE_REQUEST,
    expectedAction: CONVERSATION_ACTIONS.CHANGE_SELECTION,
    assistantResponse: 'Yes, you can switch to Etiqa. Because the insurer changes, I need to refresh the total and any add-ons or road tax choices before payment. Do you want me to switch this renewal to Etiqa now?',
    expectations: {
      answerFirst: true,
      answerPatterns: [/Yes, you can switch to Etiqa/i],
      requireNextQuestion: true,
      resumePatterns: [/switch this renewal to Etiqa/i],
      maxQuestions: 1,
    },
  },
  {
    name: 'flood add-on advice is practical for Malaysian users',
    state: makeVehicleReadyState({
      step: FLOW_STEPS.ADDONS,
      selectedQuote: {
        insurer: 'Takaful Ikhlas Insurance',
        priceAfter: 796,
        priceBefore: 995,
        ncdPercent: 20,
        sumInsured: 34000,
      },
    }),
    userMessage: 'do I need flood cover?',
    expectedMode: CONVERSATION_MODES.INSURANCE_QUESTION,
    assistantResponse: 'Special Perils is the add-on for flood and selected natural disaster damage. In Malaysia, I would consider it if the car is parked outside, in a basement, or in an area that floods during heavy rain. Do you want to add Special Perils, or skip it?',
    expectations: {
      answerFirst: true,
      answerPatterns: [/Special Perils is/i, /flood/i],
      requireNextQuestion: true,
      resumePatterns: [/add Special Perils|skip/i],
      maxQuestions: 1,
    },
  },
  {
    name: 'payment claim is handled safely without hallucinating success',
    state: makeVehicleReadyState({
      step: FLOW_STEPS.PAYMENT,
      selectedQuote: {
        insurer: 'Takaful Ikhlas Insurance',
        priceAfter: 796,
        sumInsured: 34000,
      },
      transaction: {
        paymentStatus: 'PENDING',
        policyStatus: null,
      },
    }),
    userMessage: 'payment done, send policy now',
    expectedPattern: TURN_RESPONSE_PATTERNS.BLOCK_UNSAFE_ACTION,
    expectedForcedResponse: TURN_FORCED_RESPONSES.PAYMENT_NOT_CONFIRMED,
    assistantResponse: 'I cannot mark the payment as confirmed yet because LAJOO has not received a successful payment status. Once the payment status is confirmed, the policy documents can be released safely. Do you want me to show the payment link again?',
    expectations: {
      answerFirst: true,
      answerPatterns: [/cannot mark the payment as confirmed/i, /successful payment status/i],
      requirePaymentSafetyLanguage: true,
      requireNextQuestion: true,
      maxQuestions: 1,
    },
  },
  {
    name: 'Takaful for Myvi recommendation uses quote data, not fake brand claims',
    state: makeVehicleReadyState({
      userPreferences: { budgetFocused: true },
    }),
    userMessage: 'why Takaful for my Myvi?',
    expectedMode: CONVERSATION_MODES.QUOTE_COMPARISON,
    assistantResponse: 'For your Myvi quote, Takaful Ikhlas is strongest mainly because it is the lowest current premium at RM 796.00. The tradeoff is the sum insured is RM 34,000, while Allianz shows RM 36,000 at a higher premium. Want to proceed with Takaful Ikhlas?',
    expectations: {
      answerFirst: true,
      answerPatterns: [/Takaful Ikhlas is strongest/i, /lowest current premium/i],
      requireNextQuestion: true,
      resumePatterns: [/proceed with Takaful/i],
      maxQuestions: 1,
    },
  },
];

for (const goldenCase of goldenCases) {
  test(`golden response: ${goldenCase.name}`, () => {
    const context = evaluateGolden(goldenCase);

    if (goldenCase.expectedMode) {
      assert.equal(context.simulation.decision.mode, goldenCase.expectedMode);
    }
    if (goldenCase.expectedAction) {
      assert.equal(context.simulation.decision.action, goldenCase.expectedAction);
    }
    if (goldenCase.expectedPattern) {
      assert.equal(context.simulation.turnPlan.responsePattern, goldenCase.expectedPattern);
    }
    if (goldenCase.expectedForcedResponse) {
      assert.equal(context.simulation.turnPlan.forcedResponse, goldenCase.expectedForcedResponse);
    }

    assertGoldenPass(context);
  });
}

test('quality evaluator rejects robotic step-first recommendation replies', () => {
  const state = makeVehicleReadyState();
  const context = evaluateGolden({
    state,
    userMessage: 'which insurer do you recommend?',
    assistantResponse: 'Step 2 of 6 - Choose Insurer. Which option do you want? I recommend Takaful Ikhlas Insurance because it is cheap.',
    expectations: {
      answerFirst: true,
      answerPatterns: [/I recommend Takaful Ikhlas/i],
      requiredRecommendation: 'Takaful Ikhlas',
      requireNextQuestion: true,
      maxQuestions: 1,
    },
  });

  assert.equal(context.result.pass, false);
  assert.ok(context.result.issueIds.includes('visible_step_language'));
  assert.ok(context.result.issueIds.includes('question_before_answer'));
});

test('quality evaluator rejects unsupported insurer policy claims', () => {
  const state = makeVehicleReadyState();
  const context = evaluateGolden({
    state,
    userMessage: 'why Takaful for my Myvi?',
    assistantResponse: 'I recommend Takaful Ikhlas because it has the best Perodua workshop network and guaranteed fast claim payout for Myvi owners. Want to go with Takaful?',
    expectations: {
      answerFirst: true,
      answerPatterns: [/I recommend Takaful/i],
      requiredRecommendation: 'Takaful',
      requireNextQuestion: true,
      maxQuestions: 1,
    },
  });

  assert.equal(context.result.pass, false);
  assert.ok(context.result.issueIds.includes('unsupported_policy_fact_claim'));
  assert.ok(context.result.issues.some((issue) => issue.details?.id === 'brand_program'));
  assert.ok(context.result.issues.some((issue) => issue.details?.id === 'fast_claim_payout'));
});

test('quality evaluator allows insurer facts only when explicitly grounded for the scenario', () => {
  const state = makeVehicleReadyState();
  const context = evaluateGolden({
    state,
    userMessage: 'does Takaful have a shariah option?',
    assistantResponse: 'Takaful Ikhlas is the takaful insurance option in the current quote set. It can suit users who prefer a Shariah-compliant structure. Want to continue with this option?',
    expectations: {
      answerFirst: true,
      answerPatterns: [/Takaful Ikhlas is the takaful insurance option/i],
      allowedPolicyFactClaims: ['shariah_compliant'],
      requireNextQuestion: true,
      maxQuestions: 1,
    },
  });

  assertGoldenPass(context);
});

test('quality evaluator rejects unsafe payment success hallucination', () => {
  const state = makeVehicleReadyState({
    step: FLOW_STEPS.PAYMENT,
    transaction: { paymentStatus: 'PENDING', policyStatus: null },
  });
  const context = evaluateGolden({
    state,
    userMessage: 'payment done',
    assistantResponse: 'Payment successful. Your policy is issued and active now.',
    expectations: {
      answerFirst: true,
      answerPatterns: [/payment/i],
      requirePaymentSafetyLanguage: true,
      paymentConfirmed: false,
      maxQuestions: 1,
    },
  });

  assert.equal(context.result.pass, false);
  assert.ok(context.result.issueIds.includes('unsafe_payment_or_policy_confirmation'));
  assert.ok(context.result.issueIds.includes('missing_payment_safety_language'));
});

test('quality evaluator rejects repeated sentences from recent assistant turns', () => {
  const state = makeVehicleReadyState();
  const repeated = 'I recommend Takaful Ikhlas because it is the lowest current premium at RM 796.00.';
  const context = evaluateGolden({
    state,
    userMessage: 'which insurer do you recommend?',
    assistantResponse: `${repeated} Want to go with Takaful Ikhlas?`,
    expectations: {
      answerFirst: true,
      answerPatterns: [/I recommend Takaful Ikhlas/i],
      requiredRecommendation: 'Takaful Ikhlas',
      requireNextQuestion: true,
      previousAssistantMessages: [repeated],
      maxQuestions: 1,
    },
  });

  assert.equal(context.result.pass, false);
  assert.ok(context.result.issueIds.includes('repeated_sentence_recent_turns'));
});
