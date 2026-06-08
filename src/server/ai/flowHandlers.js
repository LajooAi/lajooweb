import { FLOW_STEPS, USER_INTENTS } from '../../lib/conversationState.js';
import {
  buildPdpaConsentRequestReply,
  createPdpaPendingAction,
  hasPdpaConsent,
} from '../../lib/pdpaConsent.js';
import {
  AVAILABLE_INSURERS,
  AVAILABLE_INSURER_CHOICE_TEXT,
  AVAILABLE_INSURER_NAMES_TEXT,
  UNAVAILABLE_INSURER_REGEX,
  getInsurerByKey,
  getInsurerKeysFromText,
} from '../../lib/insurerCatalog.js';
import {
  parseRecommendedInsurerFromAssistantMessage,
  isVehicleDetailsRejectionMessage,
  wasLastAssistantVehicleConfirmation,
} from '../../lib/flowGuards.js';
import { extractPersonalInfo } from '../../utils/nlpExtractor.js';
import { buildTurnQuestionInstruction } from './turnPlanner.js';
import {
  PRINTED_ROAD_TAX_EFFECTIVE_DATE,
  getRoadTaxDisplayName,
} from '../insurance/roadTaxEngine.js';
import {
  getQuotesFromState,
  quoteSelectionFromIntent,
} from '../insurance/quoteEngine.js';

const AVAILABLE_INSURER_MENTION_REGEX = new RegExp(
  AVAILABLE_INSURERS
    .flatMap((insurer) => [insurer.shortName, insurer.displayName, ...insurer.aliases])
    .map((value) => String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'))
    .join('|'),
  'i'
);

function pushSystem(openAiMessages, content) {
  if (!content) return;
  openAiMessages.push({ role: 'system', content });
}

export function applyDeterministicFlowHandlers({
  openAiMessages,
  state,
  intent,
  turnPlan,
  messages = [],
  latestMessage = '',
  vehicleProfile = null,
  forcedAssistantResponse = null,
  roadTaxDeliveryBlocked = false,
  blockedRoadTaxOption = null,
  lowConfidenceNeedsClarification = false,
  paymentLinkFallback = null,
  shouldInjectPaymentLinkFallback = false,
  callbacks = {},
} = {}) {
  let nextForcedAssistantResponse = forcedAssistantResponse;
  let nextPaymentLinkFallback = paymentLinkFallback;
  let nextShouldInjectPaymentLinkFallback = shouldInjectPaymentLinkFallback;
  let vehicleRejectionHandled = false;

  const {
    formatStepLine,
    buildQuoteSelectionReply,
    buildVehicleFoundReply,
    buildVehicleNcdConcernReply,
    buildVehicleRejectionFollowUpReply,
    buildSummaryBox,
    buildAddOnsStepBlock,
    buildRoadTaxStepBlock,
    buildAddOnsMenu,
    buildPersonalDetailsRequest,
    buildPersonalDetailExampleList,
    collectPersonalDetailsFromMessages,
    asNonEmptyString,
    sanitizePersonalDetailExtractionInput,
    detectLikelyPersonalDetailTypos,
    buildPaymentLink,
    buildPaymentStepBlock,
    buildQuestionFirstThenStepCloseInstruction,
    buildClarifyingQuestionInstruction,
    OTP_PROMPT_COPY,
    formatRmAmount,
  } = callbacks;

  if (!Array.isArray(openAiMessages)) {
    throw new TypeError('applyDeterministicFlowHandlers requires openAiMessages array');
  }

  // GLOBAL GUARD: no quotes or pricing before both vehicle identifiers.
  if (!state.hasCompleteVehicleIdentification() && !nextForcedAssistantResponse) {
    const canAnswerGeneralQuestion = intent.intent === USER_INTENTS.ASK_QUESTION;
    const isPlayfulStart = intent.intent === USER_INTENTS.UNCLEAR_OR_PLAYFUL && state.step === FLOW_STEPS.START;
    const isGreetingStart = intent.intent === USER_INTENTS.GREETING && state.step === FLOW_STEPS.START;
    const isNeutralStartProbe =
      intent.intent === USER_INTENTS.OTHER &&
      state.step === FLOW_STEPS.START &&
      !state.plateNumber &&
      !state.nricNumber &&
      /^(?:just\s+)?(hi|hello|hey|yo|salam|assalam|test|testing|check|checking|ping|trial|demo)\b/i.test(String(latestMessage || '').trim().toLowerCase());

    if (canAnswerGeneralQuestion) {
      pushSystem(openAiMessages, `User asked a general insurance question before sharing complete vehicle details.
Answer the question helpfully first (no quotes/pricing cards).
After answering, add one short line: "If you'd like renewal quotes, share your **vehicle plate** first. I’ll ask for consent before owner ID or contact details."`);
    } else if (isGreetingStart) {
      pushSystem(openAiMessages, `User sent a greeting at the start. Reply naturally in 1-2 short lines (warm, human, non-robotic).
Do NOT show the full numbered intake list yet.
Briefly mention what LAJOO can help with (renew insurance, road tax, compare options, and payment).
Then ask one discovery question: what do they want to do today?
Only ask for **vehicle plate** after they clearly say they want to start renewal now. Get consent before owner ID or contact details.`);
    } else if (isPlayfulStart) {
      pushSystem(openAiMessages, `User is playful/unclear at start. Reply naturally in 1-2 short lines:
1) brief friendly acknowledgement
2) ask what they need today and what LAJOO can help with (renewal quote, policy check, claims help, road tax).
Do NOT ask for plate/owner ID yet unless they choose to start renewal.`);
    } else if (isNeutralStartProbe) {
      pushSystem(openAiMessages, `User sent a neutral probe/test message at start.
Reply like a human (short, natural), then ask what they want LAJOO to help with today.
Do NOT show the strict intake list yet.
Do NOT ask for plate/owner ID yet unless user confirms renewal intent.`);
    } else {
      const hasPlate = !!state.plateNumber;
      const hasNRIC = !!state.nricNumber;
      const consentAccepted = hasPdpaConsent(state);

      if (!hasPlate && !hasNRIC) {
        if (consentAccepted) {
          nextForcedAssistantResponse = `${formatStepLine(1, 'Vehicle Info')}

To get started, please provide your:

1. **Vehicle Plate Number** (e.g. WXY 1234)
2. **Owner Identification Number** (NRIC / Foreign ID / Army IC / Police IC / Company Reg. No.)`;
        } else {
          state.setPendingAction?.(createPdpaPendingAction('start_renewal'));
          nextForcedAssistantResponse = buildPdpaConsentRequestReply({ state, reason: 'start_renewal' });
        }
      } else if (hasPlate && !hasNRIC && !consentAccepted) {
        state.setPendingAction?.(createPdpaPendingAction('owner_id'));
        nextForcedAssistantResponse = buildPdpaConsentRequestReply({ state, reason: 'owner_id' });
      } else {
        const missingItem = !hasPlate ? 'Vehicle Plate Number' : 'Owner Identification Number';
        const missingExample = !hasPlate ? '(e.g. WXY 1234)' : '(NRIC / Foreign ID / Army IC / Police IC / Company Reg. No.)';
        pushSystem(openAiMessages, `CRITICAL RESTRICTION: User has NOT provided both plate + IC yet. You MUST NOT:
- Show any insurance quotes or prices
- Discuss specific insurers (${AVAILABLE_INSURER_NAMES_TEXT})
- Talk about add-ons, road tax, or any pricing details

Ask for the missing item only. Keep it brief: "Please provide your **${missingItem}** ${missingExample} to proceed with the insurance renewal."`);
      }
    }
  }

  if (
    intent.intent === USER_INTENTS.CONFIRM &&
    state.hasCompleteVehicleIdentification() &&
    !state.selectedQuote &&
    wasLastAssistantVehicleConfirmation(messages)
  ) {
    nextForcedAssistantResponse = buildQuoteSelectionReply(state);
  }

  if (intent.intent === USER_INTENTS.PROVIDE_INFO && state.hasCompleteVehicleIdentification() && vehicleProfile) {
    nextForcedAssistantResponse = buildVehicleFoundReply(vehicleProfile);
  }

  if (state.hasCompleteVehicleIdentification() && vehicleProfile && !state.selectedQuote) {
    const latestMsg = messages[messages.length - 1]?.content || '';
    const isNcdComplaint = /\bncd\b.*\b(wrong|incorrect|not right|different|should be|supposed to|change|update|actually)\b|\b(wrong|incorrect|change|update)\b.*\bncd\b|\bmy ncd is \d/i.test(latestMsg);

    if (isNcdComplaint) {
      vehicleRejectionHandled = true;
      nextForcedAssistantResponse = buildVehicleNcdConcernReply(vehicleProfile);
    }
  }

  if (
    state.hasCompleteVehicleIdentification() &&
    vehicleProfile &&
    !state.selectedQuote &&
    !vehicleRejectionHandled
  ) {
    const latestMsg = messages[messages.length - 1]?.content || '';
    const isRejection = isVehicleDetailsRejectionMessage(latestMsg);
    const isVehicleConfirmationContext = wasLastAssistantVehicleConfirmation(messages);

    if (isRejection && isVehicleConfirmationContext) {
      vehicleRejectionHandled = true;
      nextForcedAssistantResponse = buildVehicleRejectionFollowUpReply(vehicleProfile);
    }
  }

  if (
    intent.intent === USER_INTENTS.CONFIRM &&
    state.step === FLOW_STEPS.QUOTES &&
    !state.selectedQuote &&
    !wasLastAssistantVehicleConfirmation(messages)
  ) {
    const lastAIMessage = [...messages].reverse().find((message) => message.role === 'assistant')?.content || '';
    const recommendedInsurerKey = state.lastRecommendedInsurer || parseRecommendedInsurerFromAssistantMessage(lastAIMessage);
    const recommendedInsurer = recommendedInsurerKey ? quoteSelectionFromIntent(state, recommendedInsurerKey) : null;
    const lowerLastAI = String(lastAIMessage).toLowerCase();
    const mentionedInsurerCount = getInsurerKeysFromText(lowerLastAI).length;
    const confirmedComparisonOffer =
      /side-?by-?side|recommend one now|should i recommend/i.test(lowerLastAI) &&
      mentionedInsurerCount >= 2;
    const confirmedBettermentOffer = confirmedComparisonOffer && /betterment|zero betterment|waiver|depreciation/i.test(lowerLastAI);

    if (recommendedInsurer) {
      state.selectQuote(recommendedInsurer);
      const summaryBox = buildSummaryBox(state);
      const addOnsStepBlock = buildAddOnsStepBlock(summaryBox);
      pushSystem(openAiMessages, `User confirmed your recommendation of ${recommendedInsurer.insurer}. Your response MUST include:

Great choice! ✅

${addOnsStepBlock}

Do NOT alter prices. You may add a brief line but MUST include the Step 3 block exactly.`);
    } else if (confirmedBettermentOffer) {
      pushSystem(openAiMessages, `User replied "ok" to a zero-betterment comparison offer. Do NOT show full quotes list.
Give a direct side-by-side answer using PostgreSQL-grounded facts only (from QUESTION GROUNDING / LIVE DATABASE context).
If PostgreSQL evidence is missing for any insurer, say that clearly instead of guessing.
Then close consultatively in one line: ask if user wants your recommendation based on current total premium, or if they want to pick ${AVAILABLE_INSURER_CHOICE_TEXT}.
Do NOT move to next step until insurer is selected.`);
    } else if (confirmedComparisonOffer) {
      pushSystem(openAiMessages, `User replied "ok" to your comparison offer. Do NOT re-show full quotes list.
Provide a concise side-by-side comparison in 3 short bullets:
- Best budget value
- Best documented claims/service confidence (PostgreSQL-grounded only)
- Best higher-coverage option

Then ask one clear close question: "Would you like my recommendation, or do you want one of these: ${AVAILABLE_INSURER_NAMES_TEXT}?"
Do NOT move to next step until insurer is selected.`);
    } else {
      nextForcedAssistantResponse = buildQuoteSelectionReply(state);
    }
  }

  if (
    intent.intent === USER_INTENTS.ASK_QUESTION &&
    [FLOW_STEPS.QUOTES, FLOW_STEPS.ADDONS, FLOW_STEPS.ROADTAX].includes(state.step)
  ) {
    if (turnPlan.shouldShowQuoteCards && state.step === FLOW_STEPS.QUOTES) {
      nextForcedAssistantResponse = buildQuoteSelectionReply(state);
    } else {
      const plannerQuestionInstruction = buildTurnQuestionInstruction(turnPlan, {
        state,
        addOnsMenu: buildAddOnsMenu(),
      });
      if (plannerQuestionInstruction) {
        pushSystem(openAiMessages, plannerQuestionInstruction);
      }
    }
  }

  if (
    intent.intent === USER_INTENTS.ASK_QUESTION &&
    state.step !== FLOW_STEPS.ADDONS &&
    state.step !== FLOW_STEPS.ROADTAX &&
    state.step !== FLOW_STEPS.QUOTES
  ) {
    pushSystem(openAiMessages, `Answer the question briefly and helpfully. If it relates to something LAJOO can do (insurance, road tax, claims), answer first then naturally remind them you can help right here — e.g. "Good thing is, I can sort that out for you right now!" Keep it warm, not pushy. End by guiding back to the current step.`);
  }

  if (intent.intent === USER_INTENTS.SELECT_QUOTE && state.selectedQuote) {
    const summaryBox = buildSummaryBox(state);
    const addOnsStepBlock = buildAddOnsStepBlock(summaryBox);
    pushSystem(openAiMessages, `User selected ${state.selectedQuote.insurer}. Your response MUST include:

Great choice! ✅

${addOnsStepBlock}

Do NOT alter prices. You may add a brief line but MUST include the Step 3 block exactly.`);
  }

  if (intent.intent === USER_INTENTS.SELECT_ADDON) {
    if (!state.hasCompleteVehicleIdentification()) {
      pushSystem(openAiMessages, `STOP. User hasn't provided vehicle info yet. Ask for the vehicle plate first. If owner ID is still needed, get consent before collecting it. Nothing else.`);
    } else if (!state.selectedQuote) {
      nextForcedAssistantResponse = buildQuoteSelectionReply(state);
    } else {
      const summaryBox = buildSummaryBox(state);
      const roadTaxStepBlock = buildRoadTaxStepBlock(summaryBox, state);
      const addOnNames = state.selectedAddOns.length > 0
        ? state.selectedAddOns.map((addOn) => `**${addOn.name}**`).join(', ')
        : 'no add-ons';
      pushSystem(openAiMessages, `User confirmed ${addOnNames}. Your response MUST follow this exact structure and order:

${roadTaxStepBlock}

Rules:
- First line must be a compact add-on confirmation (example: "Windscreen added! ✅").
- Then show the renewal summary block.
- Then show "${formatStepLine(4, 'Road Tax')}".
- Then show the road tax question/menu block exactly.
- Do NOT alter prices or wording in the road tax menu block.`);
    }
  }

  if (intent.intent === USER_INTENTS.SELECT_ROADTAX && roadTaxDeliveryBlocked) {
    const summaryBox = buildSummaryBox(state);
    const roadTaxStepBlock = buildRoadTaxStepBlock(summaryBox, state);
    const attemptedLabel = blockedRoadTaxOption?.includes('deliver')
      ? 'printed + delivered road tax'
      : 'road tax delivery';
    pushSystem(openAiMessages, `User asked for ${attemptedLabel}, but it is not eligible for this ownership type.
Explain briefly and politely: from ${PRINTED_ROAD_TAX_EFFECTIVE_DATE}, printed delivery is available only for vehicles registered under a Foreign ID or Company Registration.
Then ask them to choose the 12-month digital option or no road tax.

${roadTaxStepBlock}

Ask clearly: "Reply **ok** for 12-month digital, or **no road tax**."`);
  }

  if (intent.intent === USER_INTENTS.SELECT_ROADTAX && state.selectedRoadTax && !roadTaxDeliveryBlocked) {
    const summaryBox = buildSummaryBox(state);
    const rawRoadTaxName = state.selectedRoadTax?.name || 'No Road Tax';
    const roadTaxName = rawRoadTaxName === 'No Road Tax' ? rawRoadTaxName : getRoadTaxDisplayName(state.selectedRoadTax);
    if (!hasPdpaConsent(state)) {
      state.setPendingAction?.(createPdpaPendingAction('personal_details'));
      nextForcedAssistantResponse = buildPdpaConsentRequestReply({ state, reason: 'personal_details' });
    } else {
      pushSystem(openAiMessages, `User selected road tax: ${roadTaxName}. Your response MUST include:

${roadTaxName !== 'No Road Tax' ? `${roadTaxName} added!` : 'No road tax.'} ✅

${formatStepLine(5, 'Your Details')}

${summaryBox}

${buildPersonalDetailsRequest()}

Do NOT alter the summary. MUST include all 3 items to collect.`);
    }
  }

  if (intent.intent === USER_INTENTS.SUBMIT_DETAILS) {
    const details = (state.personalDetails && typeof state.personalDetails === 'object') ? state.personalDetails : {};
    const recoveredDetails = collectPersonalDetailsFromMessages(messages);
    const canonicalDetails = {
      email: asNonEmptyString(details.email) || recoveredDetails.email || null,
      phone: asNonEmptyString(details.phone) || recoveredDetails.phone || null,
      address: asNonEmptyString(details.address) || recoveredDetails.address || null,
    };
    const missing = [];
    const latestDetails = extractPersonalInfo(sanitizePersonalDetailExtractionInput(latestMessage));
    const typoSignals = detectLikelyPersonalDetailTypos(latestMessage, latestDetails);
    if (!canonicalDetails.email) missing.push('Email');
    if (!canonicalDetails.phone) missing.push('Phone number');
    if (!canonicalDetails.address) missing.push('Address');

    pushSystem(openAiMessages, missing.length === 0
      ? `All 3 required details are collected. Ask the user to confirm before sending OTP. Your response MUST follow this format:

Thanks — here are the details I captured:

- **Email:** ${canonicalDetails.email || '(provided)'}
- **Phone:** ${canonicalDetails.phone || '(provided)'}
- **Address:** ${canonicalDetails.address || '(provided)'}

Does everything look **correct** ?
If yes, I will send the OTP now. If not, tell me what to change.

Do NOT send OTP yet. Wait for user confirmation first.`
      : `User is submitting personal details.
Currently still missing: ${missing.join(', ')}.
Acknowledge what was received, then ask ONLY for missing item(s) in this exact bullet format:
${buildPersonalDetailExampleList(missing)}
${typoSignals.length > 0 ? `If relevant, briefly mention likely format issue(s): ${typoSignals.join(' ')}` : ''}
Do NOT proceed to OTP until all 3 are collected.`);
  }

  if (intent.intent === USER_INTENTS.CONFIRM && state.step === FLOW_STEPS.OTP) {
    pushSystem(openAiMessages, `User confirmed their personal details are correct. Now ask for OTP. Your response MUST be:

"${OTP_PROMPT_COPY}"`);
  }

  if (intent.intent === USER_INTENTS.VERIFY_OTP) {
    if (state.isQuoteExpired()) {
      const summaryBox = buildSummaryBox(state);
      pushSystem(openAiMessages, `⚠️ Quote expired. Respond with:

"Your quote has expired. Let me refresh it for you...

✅ **Quote refreshed!** Same prices apply.

${summaryBox}

${OTP_PROMPT_COPY}"`);
      state.refreshQuoteTimestamps();
    } else {
      const paymentLink = buildPaymentLink(state);
      nextPaymentLinkFallback = paymentLink;
      nextShouldInjectPaymentLinkFallback = true;
      const summaryBox = buildSummaryBox(state);
      const paymentStepBlock = buildPaymentStepBlock(summaryBox, paymentLink);
      pushSystem(openAiMessages, `OTP verified! Your response MUST include:

✅ All set!

${paymentStepBlock}

Do NOT alter the payment link URL or amounts.`);
    }
  }

  if (intent.intent === USER_INTENTS.SELECT_PAYMENT) {
    if (state.isQuoteExpired()) {
      const summaryBox = buildSummaryBox(state);
      const paymentLink = buildPaymentLink(state);
      nextPaymentLinkFallback = paymentLink;
      nextShouldInjectPaymentLinkFallback = true;
      pushSystem(openAiMessages, `⚠️ Quote expired. Respond with:

"Your quote has expired. Let me refresh it for you...

✅ **Quote refreshed!** Same prices still apply.

${summaryBox}

${paymentLink}"`);
      state.refreshQuoteTimestamps();
    } else {
      const paymentLink = buildPaymentLink(state);
      nextPaymentLinkFallback = paymentLink;
      nextShouldInjectPaymentLinkFallback = true;
      const summaryBox = buildSummaryBox(state);
      const paymentStepBlock = buildPaymentStepBlock(summaryBox, paymentLink);
      pushSystem(openAiMessages, `User is ready to pay. Your response MUST include:

${paymentStepBlock}

Do NOT alter the payment link URL or amounts.`);
    }
  }

  if (intent.intent === USER_INTENTS.CHANGE_QUOTE && intent.data) {
    const currentInsurer = state.selectedQuote?.insurer || 'current insurer';
    const newKey = intent.data.newInsurer;
    const nextInsurerName = getInsurerByKey(newKey)?.displayName || newKey;
    pushSystem(openAiMessages, `User wants to change from ${currentInsurer} to ${nextInsurerName}. This will reset all selections (add-ons, road tax). Ask for confirmation: "Switching from **${currentInsurer}** to **${nextInsurerName}** will restart from the insurer step. Are you sure?"`);
  }

  if (intent.intent === USER_INTENTS.UNCLEAR_OR_PLAYFUL) {
    const latest = latestMessage.toLowerCase();

    if (state.step === FLOW_STEPS.QUOTES && !state.selectedQuote) {
      const isBudgetSignal = /cheap|cheapest|save|saving|budget|broke|lower|lowest|value/.test(latest);
      if (isBudgetSignal) {
        const lowestQuote = getQuotesFromState(state)
          .slice()
          .sort((a, b) => Number(a?.pricing?.finalPremium || 0) - Number(b?.pricing?.finalPremium || 0))[0];
        const lowestName = lowestQuote?.insurer?.displayName || 'the lowest premium option';
        const lowestPrice = formatRmAmount(lowestQuote?.pricing?.finalPremium || 0);
        pushSystem(openAiMessages, `User gave a playful/unclear response with budget signal. Reply naturally:
1) acknowledge casually in one short line,
2) give one confident recommendation: **${lowestName} (${lowestPrice})** with one reason,
3) ask: "Want me to lock this in?"`);
      } else {
        pushSystem(openAiMessages, `User reply is playful/unclear at quote selection. Keep tone human:
1) short acknowledgement (friendly, not robotic),
2) ask ONE decision question: "What matters most: lowest price, easier claims, or higher coverage?",
3) offer direct shortcut: "Or say **pick for me**."`);
      }
    } else if (state.step === FLOW_STEPS.ADDONS) {
      pushSystem(openAiMessages, `User reply is playful/unclear at add-ons. Keep it human and practical:
1) acknowledge briefly,
2) give one default suggestion: **Windscreen** for most drivers, then ask for the coverage amount if they choose it,
3) ask one clear action: "Add windscreen, add flood too, or skip all?"`);
    } else if (state.step === FLOW_STEPS.ROADTAX) {
      pushSystem(openAiMessages, `User reply is playful/unclear at road tax. Keep response simple:
1) acknowledge briefly,
2) recommend **12-month digital (RM 90)** as default convenience,
3) ask confirmation: "Reply **ok** to proceed with 12-month digital, or reply **no road tax**."`);
    } else if (state.step === FLOW_STEPS.PERSONAL_DETAILS) {
      pushSystem(openAiMessages, `User reply is playful/unclear while collecting details. Stay warm, then redirect:
"No worries 😄 I just need these to issue your policy:"
${buildPersonalDetailExampleList()}
Ask for whichever is missing first.`);
    } else {
      pushSystem(openAiMessages, 'User reply is playful/unclear. Acknowledge naturally and ask one clear next-step question based on current step.');
    }
  }

  if (intent.intent === USER_INTENTS.OTHER) {
    if (intent.data?.cancelPendingAction) {
      pushSystem(openAiMessages, 'User canceled insurer switch confirmation. Acknowledge and continue with the CURRENT selected insurer and current step. Do not reset flow.');
    } else if (state.step === FLOW_STEPS.QUOTES && !state.selectedQuote && !vehicleRejectionHandled) {
      const latestMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
      const mentionsUnavailablePreferredInsurer = UNAVAILABLE_INSURER_REGEX.test(latestMsg);
      const asksToSeeQuotesAgain =
        /(?:show|list|repeat|remind(?: me)?|display)\b.*\b(?:quote|quotes|options|price|prices)\b|\b(?:quote|quotes|options|price list)\b.*\b(?:again|repeat)\b|what are the options|show me (?:the )?quotes/i.test(latestMsg);
      if (asksToSeeQuotesAgain) {
        nextForcedAssistantResponse = buildQuoteSelectionReply(state);
      } else if (mentionsUnavailablePreferredInsurer) {
        pushSystem(openAiMessages, `User prefers an insurer not in current available options.
Do NOT ignore this. Do NOT dump full quote list.
Answer in 3-5 sentences:
1) acknowledge trust in their previous insurer,
2) explain it is not available in current panel,
3) recommend ONE best-fit available option with one concrete reason (price-based or PostgreSQL-grounded benefit),
4) ask if they want you to lock it in now.
Keep tone persuasive but respectful, non-pushy.`);
      } else {
        pushSystem(openAiMessages, `User response is unclear. Reply naturally:
1) brief acknowledgement,
2) answer/clarify their point first in one helpful line,
3) ask one consultative next action that keeps them engaged, for example:
"Would you like a quick side-by-side, or should I recommend one based on your priority (budget, claims, or coverage)?"`);
      }
    } else if (state.step === FLOW_STEPS.ADDONS) {
      const latestMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
      const looksLikeInsuranceQuestion =
        (
          /^(which|what|how|why|when|where|can|could|would|is|are|do|does|should)\b/i.test(latestMsg) &&
          (/\b(insurer|policy|coverage|cover|claims?|betterment|waiver|depreciation|premium|sum insured|ncd)\b/i.test(latestMsg) || AVAILABLE_INSURER_MENTION_REGEX.test(latestMsg))
        ) ||
        /betterment|zero betterment|clarify this|direct|directly|save\s*\d+%|cheaper|discount/i.test(latestMsg) ||
        UNAVAILABLE_INSURER_REGEX.test(latestMsg) ||
        AVAILABLE_INSURER_MENTION_REGEX.test(latestMsg);

      if (looksLikeInsuranceQuestion) {
        pushSystem(openAiMessages, `User asked a policy/insurer question during add-ons.
Do NOT ignore the question. Answer it directly first in 2-4 clear sentences with PostgreSQL-grounded facts only.
If the needed insurer detail is missing in PostgreSQL, say so clearly and ask one short clarifying follow-up.
Then add one short consultative bridge that gives confidence to continue with LAJOO now (non-pushy).
If appropriate, offer to compare or switch insurer before continuing add-ons.
End with exactly one clear add-ons close question:
"Would you like **Windscreen** (choose coverage amount), **Special Perils (RM 150.00)**, **E-hailing (RM 2,000.00)**, or **skip add-ons**?"`);
      } else {
        pushSystem(openAiMessages, `User response is unclear at add-ons step. Reply naturally in one short line, then ask one clear next-step question.
Use compact options only: "Windscreen (choose coverage amount), special perils (RM 150.00), e-hailing (RM 2,000.00), or skip?"
Do NOT paste the full add-ons menu unless user explicitly asks to see the options.`);
      }
    } else if (state.step === FLOW_STEPS.ROADTAX) {
      pushSystem(openAiMessages, `User response is unclear at road tax step. Reply naturally in one short line, then ask one clear next-step question.
Use compact options only: "12-month digital road tax (RM 90) or no road tax?"
Do NOT paste the full road tax menu unless user explicitly asks to see the options.`);
    }
  }

  const questionOrderInstruction = buildQuestionFirstThenStepCloseInstruction(state, { intent, messages, vehicleProfile });
  if (questionOrderInstruction && !lowConfidenceNeedsClarification) {
    pushSystem(openAiMessages, questionOrderInstruction);
  }

  if (lowConfidenceNeedsClarification) {
    pushSystem(openAiMessages, `${buildClarifyingQuestionInstruction(state)}

Response rule for this turn:
- Ask exactly ONE clarifying question.
- Do not advance to the next flow step yet.
- Do not dump long menus or long summaries.`);
  }

  return {
    forcedAssistantResponse: nextForcedAssistantResponse,
    paymentLinkFallback: nextPaymentLinkFallback,
    shouldInjectPaymentLinkFallback: nextShouldInjectPaymentLinkFallback,
  };
}

export default applyDeterministicFlowHandlers;
