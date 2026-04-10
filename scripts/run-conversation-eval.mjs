import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConversationState, detectUserIntent, FLOW_STEPS, USER_INTENTS } from '../src/lib/conversationState.js';
import { extractVehicleInfo, extractPersonalInfo } from '../src/utils/nlpExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const evalPath = path.join(__dirname, '..', 'tests', 'evals', 'conversation-eval.json');

function flowStepFromText(step) {
  return FLOW_STEPS[String(step || 'start').toUpperCase()] || FLOW_STEPS.START;
}

function hydrateState(initialState = {}) {
  const state = new ConversationState();
  state.step = flowStepFromText(initialState.step);
  state.plateNumber = initialState.plateNumber || null;
  state.nricNumber = initialState.nricNumber || null;
  state.ownerIdType = initialState.ownerIdType || null;
  state.selectedQuote = initialState.selectedQuote || null;
  state.selectedAddOns = Array.isArray(initialState.selectedAddOns) ? initialState.selectedAddOns : [];
  state.addOnsConfirmed = !!initialState.addOnsConfirmed;
  state.selectedRoadTax = initialState.selectedRoadTax || null;
  state.personalDetails = initialState.personalDetails || null;
  state.pendingAction = initialState.pendingAction || null;
  state.userPreferences = {
    budgetFocused: !!initialState?.userPreferences?.budgetFocused,
    claimsFocused: !!initialState?.userPreferences?.claimsFocused,
    coverageFocused: !!initialState?.userPreferences?.coverageFocused,
    concisePreferred: typeof initialState?.userPreferences?.concisePreferred === 'boolean'
      ? initialState.userPreferences.concisePreferred
      : null,
    preferenceScores: {
      budgetFocused: Number(initialState?.userPreferences?.preferenceScores?.budgetFocused || 0),
      claimsFocused: Number(initialState?.userPreferences?.preferenceScores?.claimsFocused || 0),
      coverageFocused: Number(initialState?.userPreferences?.preferenceScores?.coverageFocused || 0),
      concisePreferred: Number(initialState?.userPreferences?.preferenceScores?.concisePreferred || 0),
    },
    preferenceTurnCounter: Number(initialState?.userPreferences?.preferenceTurnCounter || 0),
    preferenceUpdatedAt: Number(initialState?.userPreferences?.preferenceUpdatedAt || Date.now()),
  };
  state.experiment = {
    promptVariant: ['A', 'B'].includes(initialState?.experiment?.promptVariant) ? initialState.experiment.promptVariant : 'A',
    experimentMode: initialState?.experiment?.experimentMode || 'off',
    startedAt: Number(initialState?.experiment?.startedAt || Date.now()),
    updatedAt: Number(initialState?.experiment?.updatedAt || Date.now()),
    turns: Number(initialState?.experiment?.turns || 0),
    decisionTurns: Number(initialState?.experiment?.decisionTurns || 0),
    conversionIntentTurns: Number(initialState?.experiment?.conversionIntentTurns || 0),
    conversionRate: Number(initialState?.experiment?.conversionRate || 0),
    milestones: {
      quoteSelected: !!initialState?.experiment?.milestones?.quoteSelected,
      addOnsConfirmed: !!initialState?.experiment?.milestones?.addOnsConfirmed,
      roadTaxSelected: !!initialState?.experiment?.milestones?.roadTaxSelected,
      reachedOtp: !!initialState?.experiment?.milestones?.reachedOtp,
      reachedPayment: !!initialState?.experiment?.milestones?.reachedPayment,
      completedPayment: !!initialState?.experiment?.milestones?.completedPayment,
    },
  };
  return state;
}

function applyIntentMutation(state, intent, message) {
  if (!intent || !state) return;

  if (intent.intent === USER_INTENTS.SELECT_QUOTE && intent.data?.insurer) {
    const insurerMap = {
      takaful: { insurer: 'Takaful Ikhlas', priceAfter: 796 },
      etiqa: { insurer: 'Etiqa Insurance', priceAfter: 872 },
      allianz: { insurer: 'Allianz Insurance', priceAfter: 920 },
    };
    const quote = insurerMap[intent.data.insurer];
    if (quote) state.selectQuote(quote);
  }

  if (intent.intent === USER_INTENTS.SELECT_ADDON) {
    const addOnMap = {
      windscreen: { name: 'Windscreen', price: 100 },
      flood: { name: 'Special Perils (Flood)', price: 50 },
      ehailing: { name: 'E-hailing Cover', price: 500 },
    };
    const addOns = (intent.data?.addOns || []).map(key => addOnMap[key]).filter(Boolean);
    if (intent.data?.confirmed) state.selectAddOns(addOns);
    else state.preSelectAddOns(addOns);
  }

  if (intent.intent === USER_INTENTS.SELECT_ROADTAX) {
    const roadTaxMap = {
      '12month-digital': { name: '12 Months Digital', price: 90 },
      none: { name: 'No Road Tax', price: 0 },
    };
    const roadTax = roadTaxMap[intent.data?.option];
    if (roadTax) state.selectRoadTax(roadTax);
  }

  if (intent.intent === USER_INTENTS.SUBMIT_DETAILS) {
    const extracted = extractPersonalInfo(String(message || ''));
    const existing = state.personalDetails || {};
    const merged = {
      email: !!(existing.email || extracted.email),
      phone: !!(existing.phone || extracted.phone),
      address: !!(existing.address || extracted.address),
    };
    state.personalDetails = (merged.email || merged.phone || merged.address) ? merged : null;
    state.step = (merged.email && merged.phone && merged.address) ? FLOW_STEPS.OTP : FLOW_STEPS.PERSONAL_DETAILS;
  }

  if (intent.intent === USER_INTENTS.VERIFY_OTP && intent.data?.valid) {
    state.verifyOTP();
  }

  if (intent.intent === USER_INTENTS.SELECT_PAYMENT) {
    state.setPaymentMethod(intent.data?.method || 'any');
  }

  if (intent.intent === USER_INTENTS.PROVIDE_INFO) {
    const extracted = extractVehicleInfo(String(message || ''));
    if (extracted.registrationNumber) state.plateNumber = extracted.registrationNumber;
    if (extracted.ownerId) {
      state.nricNumber = extracted.ownerId;
      state.ownerIdType = extracted.ownerIdType || null;
    }
    state.step = state._determineStep();
  }

  if (intent.intent === USER_INTENTS.CHANGE_QUOTE) {
    state.setPendingAction({ type: 'confirm_quote_change', newInsurer: intent.data?.newInsurer || null });
  }

  if (intent.intent === USER_INTENTS.CONFIRM_CHANGE_QUOTE) {
    if (state.pendingAction?.type === 'confirm_quote_change') state.resetToQuotes();
  }
}

function normalizeExpectedStep(step) {
  return flowStepFromText(step);
}

async function run() {
  const raw = await fs.readFile(evalPath, 'utf8');
  const suites = JSON.parse(raw);

  let totalTurns = 0;
  let intentPass = 0;
  let stepPass = 0;
  let decisionTurns = 0;
  let conversionIntentTurns = 0;
  const failed = [];

  const decisionSteps = new Set([FLOW_STEPS.QUOTES, FLOW_STEPS.ADDONS, FLOW_STEPS.ROADTAX, FLOW_STEPS.PERSONAL_DETAILS, FLOW_STEPS.OTP, FLOW_STEPS.PAYMENT]);
  const conversionIntents = new Set([
    USER_INTENTS.SELECT_QUOTE,
    USER_INTENTS.SELECT_ADDON,
    USER_INTENTS.SELECT_ROADTAX,
    USER_INTENTS.SUBMIT_DETAILS,
    USER_INTENTS.VERIFY_OTP,
    USER_INTENTS.SELECT_PAYMENT,
  ]);

  for (const suite of suites) {
    const state = hydrateState(suite.initialState || {});

    for (const turn of suite.turns || []) {
      totalTurns += 1;
      const intent = detectUserIntent(turn.user, state);

      const intentOk = intent.intent === turn.expectedIntent;
      if (intentOk) intentPass += 1;

      if (decisionSteps.has(state.step)) {
        decisionTurns += 1;
        if (conversionIntents.has(intent.intent)) conversionIntentTurns += 1;
      }

      applyIntentMutation(state, intent, turn.user);
      const expectedStep = normalizeExpectedStep(turn.expectedStepAfter || state.step);
      const stepOk = state.step === expectedStep;
      if (stepOk) stepPass += 1;

      if (!intentOk || !stepOk) {
        failed.push({
          suite: suite.name,
          user: turn.user,
          expectedIntent: turn.expectedIntent,
          actualIntent: intent.intent,
          expectedStep: expectedStep,
          actualStep: state.step,
        });
      }
    }
  }

  const intentAccuracy = totalTurns ? (intentPass / totalTurns) * 100 : 0;
  const stepAccuracy = totalTurns ? (stepPass / totalTurns) * 100 : 0;
  const driftRate = totalTurns ? ((totalTurns - stepPass) / totalTurns) * 100 : 0;
  const conversionReadiness = decisionTurns ? (conversionIntentTurns / decisionTurns) * 100 : 0;

  console.log(`Conversation eval: ${suites.length} suites, ${totalTurns} turns`);
  console.log(`- Intent accuracy: ${intentPass}/${totalTurns} (${intentAccuracy.toFixed(1)}%)`);
  console.log(`- Step accuracy: ${stepPass}/${totalTurns} (${stepAccuracy.toFixed(1)}%)`);
  console.log(`- Drift rate: ${driftRate.toFixed(1)}%`);
  console.log(`- Conversion-intent rate (decision steps): ${conversionReadiness.toFixed(1)}%`);

  if (failed.length > 0) {
    console.log('\nFailed turns:');
    for (const f of failed) {
      console.log(`- [${f.suite}] "${f.user}" -> intent ${f.actualIntent} (expected ${f.expectedIntent}), step ${f.actualStep} (expected ${f.expectedStep})`);
    }
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('Failed to run conversation eval:', err);
  process.exitCode = 1;
});
