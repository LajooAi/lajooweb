import { FLOW_STEPS, USER_INTENTS } from '../../lib/conversationState.js';
import { CONVERSATION_ACTIONS, CONVERSATION_MODES } from './orchestrator.js';
import { TURN_QUESTION_GUIDANCE, TURN_RESPONSE_PATTERNS } from './turnPlanner.js';
import { ADVISOR_INTENTS, ADVISOR_TOPICS } from './advisorIntent.js';
import {
  findInsuranceConcepts,
  shouldUseGeneralConceptAnswer,
} from './insuranceConcepts.js';
import {
  getQuotesFromState,
} from '../insurance/quoteEngine.js';

const RETRYABLE_OPENAI_CODES = new Set([
  'OPENAI_RATE_LIMIT',
  'OPENAI_UNAVAILABLE',
]);

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function formatRm(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  return `RM ${numeric.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildPreAddOnTopicFallback(state, topic) {
  const close = !state?.plateNumber || !state?.nricNumber
    ? 'Share the vehicle plate and owner identification number first, then I can check the actual quote and show add-on options at the right step.'
    : !state?.selectedQuote
      ? 'Choose the insurer first, then I can show the actual add-on options and pricing in the add-ons step.'
      : 'We can review this safely in the add-ons step before payment or policy issuance.';

  if (topic === ADVISOR_TOPICS.BETTERMENT) {
    return `Zero betterment helps reduce the extra amount you may need to pay when an older damaged part is replaced with a new part during an own-damage repair. I should not show a price or ask you to add it until the add-ons step because availability and pricing depend on the selected insurer/product and vehicle details. ${close}`;
  }

  if (topic === ADVISOR_TOPICS.WINDSCREEN || topic === ADVISOR_TOPICS.WINDSCREEN_AMOUNT) {
    return `Windscreen cover helps with glass repair or replacement. It is worth considering if you drive a lot, especially on highways or long-distance routes, or if the windscreen has sensors, tint, or camera calibration. ${close}`;
  }

  if (topic === ADVISOR_TOPICS.FLOOD) {
    return `Special Perils is the add-on normally used for flood and selected natural-disaster damage such as landslide/landslip or storm, subject to insurer terms. It is worth prioritising if your home, work route, or parking area has flood or landslide exposure. ${close}`;
  }

  if (topic === ADVISOR_TOPICS.E_HAILING) {
    return `If the car is used for Grab, inDrive, or other e-hailing work, that must be handled properly because normal private-car cover may not be enough. ${close}`;
  }

  if (topic === ADVISOR_TOPICS.ALL_DRIVERS) {
    return `All Drivers is relevant if your spouse, family members, or other people may drive the car. It can help avoid driver-restriction issues under the policy terms. ${close}`;
  }

  return `Add-ons are optional protections that should be chosen based on real risk, not automatically added. ${close}`;
}

function isRetryableOpenAiCapacityError(error) {
  const code = String(error?.code || '').toUpperCase();
  if (RETRYABLE_OPENAI_CODES.has(code)) return error?.retryable !== false;

  const message = String(error?.message || '');
  return error?.retryable === true && /rate\s*limit|too many requests|unavailable|could not reach/i.test(message);
}

function getRecommendedQuote(recommendation) {
  const quote = recommendation?.recommendedQuote;
  if (!quote || typeof quote !== 'object') return null;

  const insurerName = quote.insurerName || quote.insurer?.displayName || quote.insurer || null;
  if (!insurerName) return null;

  return {
    insurerName,
    finalPremiumLabel: formatRm(quote.finalPremium ?? quote.priceAfter ?? quote.pricing?.finalPremium),
    sumInsuredLabel: formatRm(quote.sumInsured ?? quote.insuredAmount),
  };
}

function cleanSentence(text) {
  const cleaned = String(text || '')
    .replace(/,\s*so mention\b.*$/i, '')
    .replace(/\s*so mention\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function getQuoteSummary(quote) {
  if (!quote || typeof quote !== 'object') return null;

  const insurerName = quote.insurerName || quote.insurer?.displayName || quote.insurer || null;
  if (!insurerName) return null;
  const finalPremiumValue = Number(quote.finalPremium ?? quote.priceAfter ?? quote.pricing?.finalPremium);
  const sumInsuredValue = Number(quote.sumInsured ?? quote.insuredAmount);

  return {
    insurerName,
    finalPremiumValue: Number.isFinite(finalPremiumValue) ? finalPremiumValue : null,
    sumInsuredValue: Number.isFinite(sumInsuredValue) ? sumInsuredValue : null,
    finalPremiumLabel: Number.isFinite(finalPremiumValue) ? formatRm(finalPremiumValue) : null,
    sumInsuredLabel: Number.isFinite(sumInsuredValue) ? formatRm(sumInsuredValue) : null,
  };
}

function getCheapestRecommendationSummary(recommendation) {
  const scoredQuotes = Array.isArray(recommendation?.scoredQuotes)
    ? recommendation.scoredQuotes
    : [];
  const pool = scoredQuotes.length > 0
    ? scoredQuotes
    : [recommendation?.recommendedQuote, ...(recommendation?.alternatives || [])].filter(Boolean);

  return pool
    .map(getQuoteSummary)
    .filter((quote) => quote && Number(quote.finalPremiumValue) > 0)
    .sort((a, b) => a.finalPremiumValue - b.finalPremiumValue)[0] || null;
}

function buildNamedQuoteChoiceQuestion({ recommended, cheapest, highestCover } = {}) {
  if (recommended?.insurerName && cheapest?.insurerName && highestCover?.insurerName) {
    const choices = [`**${recommended.insurerName}** as my recommendation`];
    if (cheapest.insurerName !== recommended.insurerName) {
      choices.push(`**${cheapest.insurerName}** for lowest price`);
    }
    if (highestCover.insurerName !== recommended.insurerName && highestCover.insurerName !== cheapest.insurerName) {
      choices.push(`**${highestCover.insurerName}** for higher sum insured`);
    }
    if (choices.length === 1) {
      return `**Next:** Do you want to go with **${recommended.insurerName}**, or explore other insurers?`;
    }
    return `**Next:** Do you want ${choices.join(', ').replace(/, ([^,]*)$/, ', or $1')}?`;
  }

  if (recommended?.insurerName && cheapest?.insurerName && cheapest.insurerName !== recommended.insurerName) {
    return `**Next:** Do you want **${recommended.insurerName}**, choose the cheapest option **${cheapest.insurerName}**, or explore others?`;
  }

  if (recommended?.insurerName) {
    return `**Next:** Do you want to go with **${recommended.insurerName}**, or explore other insurers?`;
  }

  if (cheapest?.insurerName && highestCover?.insurerName) {
    const coverChoice = highestCover.insurerName !== cheapest.insurerName
      ? `, **${highestCover.insurerName}** for higher sum insured`
      : '';
    return `**Next:** Do you want **${cheapest.insurerName}** for lowest price${coverChoice}, or should I make a balanced recommendation?`;
  }

  return '**Next:** Do you want my balanced recommendation, the lowest-price insurer, or the higher-coverage option?';
}

function formatQuoteChoiceWithPremium(summary) {
  if (!summary?.insurerName) return null;
  return summary.finalPremiumLabel
    ? `${summary.insurerName} - ${summary.finalPremiumLabel}`
    : summary.insurerName;
}

function isQuoteRecommendationTurn({ state, decision, turnPlan, latestMessage, recommendation }) {
  if (state?.step !== FLOW_STEPS.QUOTES) return false;
  if (!getRecommendedQuote(recommendation)) return false;

  const text = normalizeText(latestMessage);
  return (
    turnPlan?.questionGuidance === TURN_QUESTION_GUIDANCE.QUOTE_RECOMMENDATION ||
    decision?.mode === CONVERSATION_MODES.QUOTE_COMPARISON ||
    /\b(recommend|recommendation|which insurer|which one|which should|best|better|choose for me|your pick|what do you think)\b/i.test(text)
  );
}

function isOtherQuoteOptionsTurn({ state, latestMessage, recommendation }) {
  if (state?.step !== FLOW_STEPS.QUOTES) return false;
  if (!getRecommendedQuote(recommendation)) return false;

  const text = normalizeText(latestMessage);
  return /\b(other|others|alternative|alternatives|compare|comparison|options|all of them|what about)\b/i.test(text);
}

function buildQuoteRecommendationFallback({ recommendation }) {
  const quote = getRecommendedQuote(recommendation);
  if (!quote) return null;

  const reasons = Array.isArray(recommendation?.reasons)
    ? recommendation.reasons.map(cleanSentence).filter(Boolean).slice(0, 2)
    : [];
  const alternatives = Array.isArray(recommendation?.alternatives)
    ? recommendation.alternatives.filter(Boolean).slice(0, 2)
    : [];

  const details = [];
  if (quote.finalPremiumLabel && quote.sumInsuredLabel) {
    details.push(`${quote.finalPremiumLabel} with ${quote.sumInsuredLabel} sum insured`);
  } else if (quote.finalPremiumLabel) {
    details.push(`${quote.finalPremiumLabel} premium`);
  } else if (quote.sumInsuredLabel) {
    details.push(`${quote.sumInsuredLabel} sum insured`);
  }

  const reasonText = reasons.length > 0
    ? reasons.map((reason) => reason.replace(/[.!?]$/g, '')).join('; ')
    : 'it gives the best balance from the current quote set';
  const closeCallText = recommendation?.isCloseCall
    ? ' This is a close call, so the trade-off matters if your priority is strictly lowest price.'
    : '';
  const detailText = details.length > 0
    ? ` It also gives ${details.join(', ')}.`
    : '';
  const pickLine = `**My pick:** **${quote.insurerName}**${quote.finalPremiumLabel ? ` — **${quote.finalPremiumLabel}**` : ''}`;
  const whyLine = `**Why:** ${reasonText}.${detailText}${closeCallText}`;

  let tradeoffLine = null;
  if (recommendation?.tradeoff) {
    tradeoffLine = `**Trade-off:** ${cleanSentence(recommendation.tradeoff)}`;
  } else if (alternatives.length > 0) {
    const alternative = alternatives[0];
    const altPremium = formatRm(alternative.finalPremium ?? alternative.priceAfter ?? alternative.pricing?.finalPremium);
    if (alternative.insurerName && altPremium) {
      tradeoffLine = `**Trade-off:** The closest alternative is **${alternative.insurerName}** at **${altPremium}**.`;
    }
  }

  const cheapest = getCheapestRecommendationSummary(recommendation);
  const cheapestChoice = cheapest?.insurerName && cheapest.insurerName !== quote.insurerName
    ? `, choose the cheapest option **${formatQuoteChoiceWithPremium(cheapest)}**`
    : '';
  const nextLine = `**Next:** Do you want to go with **${formatQuoteChoiceWithPremium(quote)}**${cheapestChoice}, or explore other insurers?`;
  return [pickLine, whyLine, tradeoffLine, nextLine].filter(Boolean).join('\n\n');
}

function buildOtherQuoteOptionsFallback({ recommendation }) {
  const recommended = getRecommendedQuote(recommendation);
  if (!recommended) return null;

  const scoredQuotes = Array.isArray(recommendation?.scoredQuotes)
    ? recommendation.scoredQuotes
    : [];
  const alternatives = Array.isArray(recommendation?.alternatives)
    ? recommendation.alternatives
    : [];

  const optionPool = scoredQuotes.length > 0
    ? scoredQuotes
    : [recommendation.recommendedQuote, ...alternatives].filter(Boolean);

  const options = optionPool
    .map(getQuoteSummary)
    .filter(Boolean)
    .slice(0, 5);

  if (options.length === 0) return buildQuoteRecommendationFallback({ recommendation });

  const cheapest = [...options].sort((a, b) => Number(a.finalPremiumValue || 0) - Number(b.finalPremiumValue || 0))[0];
  const highestCover = [...options].sort((a, b) => Number(b.sumInsuredValue || 0) - Number(a.sumInsuredValue || 0))[0];

  const lines = [
    'Here’s the simple way to look at the other options:',
    ...options.map((option) => {
      const parts = [
        `**${option.insurerName}**`,
        option.finalPremiumLabel,
        option.sumInsuredLabel ? `${option.sumInsuredLabel} sum insured` : null,
      ].filter(Boolean);
      return `- ${parts.join(' — ')}`;
    }),
  ];

  if (cheapest?.insurerName && highestCover?.insurerName) {
    lines.push(
      `**Trade-off:** If you want lowest price, look at **${cheapest.insurerName}**. If you want higher sum insured, look at **${highestCover.insurerName}**. My current recommendation is still **${recommended.insurerName}**.`
    );
  }

  lines.push(buildNamedQuoteChoiceQuestion({ recommended, cheapest, highestCover }));
  return lines.filter(Boolean).join('\n\n');
}

function conceptCloseForStep(concept, state) {
  const step = state?.step;

  if (step === FLOW_STEPS.QUOTES) {
    return 'For your quote decision, do you want my recommendation or a quick side-by-side comparison?';
  }

  if (step === FLOW_STEPS.ADDONS) {
    if (concept.id === 'windscreen') {
      return 'If you want windscreen cover, tell me the coverage amount, for example RM 1,000.00 or RM 2,000.00.';
    }
    if (concept.id === 'flood') {
      return 'Do you want to add Special Perils, add windscreen too, or skip add-ons?';
    }
    if (concept.id === 'e_hailing') {
      return 'Are you using this car for Grab or other e-hailing services?';
    }
    return 'Do you want to add it, choose another add-on, or skip add-ons?';
  }

  if (step === FLOW_STEPS.ROADTAX) {
    return 'For road tax, do you want 12-month digital road tax or no road tax?';
  }

  if (step === FLOW_STEPS.PERSONAL_DETAILS) {
    return 'When you are ready, send the remaining details in one message: email, phone number, and address.';
  }

  return 'Want to continue from here?';
}

function isConceptFallbackTurn({ intent, decision, latestMessage }) {
  if (!shouldUseGeneralConceptAnswer(latestMessage)) return false;

  return (
    intent?.intent === USER_INTENTS.ASK_QUESTION ||
    decision?.mode === CONVERSATION_MODES.INSURANCE_QUESTION ||
    decision?.action === CONVERSATION_ACTIONS.ANSWER_THEN_RESUME
  );
}

function buildConceptFallback({ latestMessage, state }) {
  const [concept] = findInsuranceConcepts(latestMessage, { limit: 1 });
  if (!concept) return null;

  return [
    concept.explanation,
    conceptCloseForStep(concept, state),
  ].filter(Boolean).join('\n\n');
}

function isConfusedTurn({ decision, turnPlan }) {
  return (
    decision?.mode === CONVERSATION_MODES.CONFUSED ||
    turnPlan?.responsePattern === TURN_RESPONSE_PATTERNS.CLARIFY_CONFUSION
  );
}

function buildConfusedFallback(state) {
  if (state?.step === FLOW_STEPS.QUOTES) {
    return 'No worries. The simple choice is: cheapest, higher sum insured, or my recommendation. Which one should I use to guide you?';
  }
  if (state?.step === FLOW_STEPS.ADDONS) {
    return 'No worries. For add-ons, the simple choices are: add windscreen, add flood/Special Perils, or skip add-ons. Which one do you prefer?';
  }
  if (state?.step === FLOW_STEPS.ROADTAX) {
    return 'No worries. For road tax, choose 12-month digital road tax or no road tax. Which one do you want?';
  }
  return 'No worries. Tell me what you want to change or ask, and I will guide you one thing at a time.';
}

function isNeedsGuidanceTurn(latestMessage) {
  const text = normalizeText(latestMessage);
  return /\b(which|what)\s+(do|should)\s+i\s+(need|choose|take|pick)\b/i.test(text) ||
    /\bwhich\s+one\s+(do|should)\s+i\s+(need|choose|take|pick)\b/i.test(text) ||
    /\bwhat\s+would\s+you\s+(recommend|suggest)\b/i.test(text) ||
    /\bcan\s+i\s+skip\b|\bor\s+i\s+can\s+skip\b|\bcan\s+skip\b/i.test(text);
}

function buildNeedsGuidanceFallback(state) {
  if (state?.step === FLOW_STEPS.ADDONS) {
    const vehicleYear = Number(state?.vehicleInfo?.year || 0);
    const vehicleAge = Number.isFinite(vehicleYear) && vehicleYear > 1980
      ? Math.max(0, new Date().getFullYear() - vehicleYear)
      : null;
    const bettermentLine = vehicleAge !== null && vehicleAge >= 5
      ? `- **8 Betterment waiver (RM 350.00)** - because your car is about **${vehicleAge} years old**, treat this as good-to-have if you want to reduce surprise repair costs from new replacement parts.`
      : '- **8 Betterment waiver (RM 350.00)** - more useful for older cars, continental/performance cars, or cars with expensive parts.';

    return [
      'For add-ons, do not buy everything. Choose based on your real risk.',
      [
        '**My practical pick:**',
        '',
        '- **2 Special Perils/Flood (RM 150.00)** - if your home, workplace, usual route, or parking spot can flood, or if you regularly drive/park near landslide or landslip-prone areas.',
        '- **1 Windscreen** - if you drive a lot, especially highway or long-distance routes, or if paying for glass replacement yourself would be painful.',
        '- **3 E-hailing (RM 2,000.00)** - only if this car is used for Grab, inDrive, or similar work.',
        bettermentLine,
      ].join('\n'),
      'You can still skip add-ons if you want the lowest total and none of those risks apply. Do you want **2 only**, **1 and 2**, **1, 2 and 8 (includes Betterment waiver RM 350.00)**, or **skip add-ons**?',
    ].join('\n\n');
  }

  if (state?.step === FLOW_STEPS.QUOTES) {
    return 'For insurer choice, I can guide you in three simple ways: cheapest price, higher sum insured, or balanced recommendation. Which one matters most to you?';
  }

  if (state?.step === FLOW_STEPS.ROADTAX) {
    return 'For road tax, choose **12-month digital road tax** if you want LAJOO to handle it together. Choose **no road tax** if you only want insurance renewal.';
  }

  if (state?.step === FLOW_STEPS.PERSONAL_DETAILS) {
    return 'At this stage, I need your email, phone number, and address so LAJOO can continue to OTP verification and document delivery.';
  }

  return 'Tell me what you are deciding between, and I’ll narrow it down to the safest simple choice.';
}

function isRoadTaxAlternativeTurn({ state, turnPlan, latestMessage }) {
  if (state?.step !== FLOW_STEPS.ROADTAX) return false;
  if (turnPlan?.questionGuidance === TURN_QUESTION_GUIDANCE.ROADTAX_ALTERNATIVE) return true;
  return /\b(where\s+else|elsewhere|other\s+place|besides|outside|where\s+can\s+i\s+renew|renew\s+this\s+where)\b/i.test(String(latestMessage || ''));
}

function buildRoadTaxAlternativeFallback() {
  return [
    'Yes - outside LAJOO, you can usually renew road tax through **JPJ/MyJPJ**, **mySIKAP**, **MyEG**, or **Pos Malaysia** where the service is available.',
    'Insurance must already be active before road tax can be renewed. If you continue here, I can settle **12-month digital road tax (RM 90.00)** together with this renewal, or you can choose **no road tax**.',
    'Would you like me to proceed with **12-month digital road tax**, or skip road tax?',
  ].join('\n\n');
}

function buildAdvisorIntentFallback({ advisorIntent, state }) {
  const key = advisorIntent?.intent || ADVISOR_INTENTS.NONE;
  const topic = advisorIntent?.topic || null;
  if (!key || key === ADVISOR_INTENTS.NONE) return null;

  if (key === ADVISOR_INTENTS.COMMERCIAL_BIAS_CHALLENGE) {
    return 'Fair question. LAJOO recommendations should be based on quote fit, premium, sum insured, coverage facts, and your stated priority - not hidden paid placement. If commercial ranking ever affects results, it should be disclosed clearly. Do you want me to choose by lowest price, balanced value, or higher coverage?';
  }

  if (key === ADVISOR_INTENTS.REJECT_RECOMMENDATION) {
    return 'Understood - I will not push that insurer. I can recommend the best remaining options by lowest premium, higher sum insured, or service/claims comfort. Which priority should I use?';
  }

  if (key === ADVISOR_INTENTS.QUOTE_FILTER_PREFERENCE) {
    return 'Understood - I will respect that insurer preference/filter. I can recommend only from the matching current options. Do you want lowest premium, balanced value, or higher coverage?';
  }

  if (key === ADVISOR_INTENTS.QUOTE_PRICE_EXPLANATION) {
    return 'The price gap usually comes from each insurer\'s own pricing rules, the sum insured, and the policy features shown in the quote. A higher premium is not automatically better; sometimes it means higher sum insured, and sometimes it is simply that insurer\'s pricing. Want me to explain the current quote range or recommend the best balance?';
  }

  if (key === ADVISOR_INTENTS.DELEGATE_DECISION) {
    return 'I can decide for you. My default is the best balanced option from premium, sum insured, and current service/value signals, not just the cheapest. Want me to proceed with my balanced recommendation?';
  }

  if (key === ADVISOR_INTENTS.ADDON_EXPLANATION || key === ADVISOR_INTENTS.COVERAGE_RISK_ADVICE) {
    if (state?.step !== FLOW_STEPS.ADDONS && topic !== ADVISOR_TOPICS.ADDON_CHANGE_WINDOW) {
      return buildPreAddOnTopicFallback(state, topic);
    }
    if (topic === ADVISOR_TOPICS.ALL_DRIVERS) {
      return 'If your wife or family members sometimes drive the car, **All Drivers (RM 30.00)** is the relevant add-on. I would add it if another person drives even occasionally. Want me to add All Drivers?';
    }
    if (topic === ADVISOR_TOPICS.FLOOD) {
      return 'If you live, work, drive, or park in a flood-risk or landslide-risk area, **Special Perils (RM 150.00)** is the add-on I would prioritise. It usually covers flood and selected natural-disaster risks such as landslide/landslip or storm, subject to insurer terms. Add Special Perils or skip add-ons?';
    }
    if (topic === ADVISOR_TOPICS.E_HAILING) {
      return 'If this car is used for Grab, inDrive, or any e-hailing work, even part-time, treat **E-hailing (RM 2,000.00)** as required. If it is private use only, skip it. Are you using this car for e-hailing?';
    }
    if (topic === ADVISOR_TOPICS.BETTERMENT) {
      return 'Betterment waiver helps reduce surprise repair charges when old damaged parts are replaced with new parts. Do you want to add Betterment waiver, or skip it?';
    }
    return buildNeedsGuidanceFallback(state);
  }

  if (key === ADVISOR_INTENTS.PRIVACY_CONCERN) {
    return 'I understand the privacy concern. For renewal, LAJOO should only collect details needed for verification, issuance, contact, and document delivery. Which detail are you concerned about: IC, phone, email, or address?';
  }

  if (key === ADVISOR_INTENTS.HUMAN_HANDOFF) {
    return 'I understand. I can keep helping here while you decide what a human agent should check. What do you want help with: insurer choice, add-ons, road tax, details, or payment?';
  }

  if (key === ADVISOR_INTENTS.PAYMENT_CONCERN) {
    return 'Payment and policy issuance must be confirmed by the system before I say the policy is active. After successful payment, the insurer flow confirms issuance and documents. Do you want to continue payment or change anything first?';
  }

  if (key === ADVISOR_INTENTS.ROADTAX_ALREADY_RENEWED) {
    return 'No problem - if your road tax is already renewed, we should continue insurance-only and avoid charging road tax again here. Should I proceed with no road tax for this LAJOO renewal?';
  }

  if (key === ADVISOR_INTENTS.ROADTAX_LEGALITY) {
    const sixMonthLine = advisorIntent?.entities?.asksSixMonthRoadTax
      ? ' LAJOO currently supports 12-month digital road tax only in this renewal flow; if you specifically need a 6-month option, you may need to renew through another channel that offers it.'
      : '';
    if (advisorIntent?.entities?.asksOnlyDigitalRoadTax) {
      return 'Good question. In this LAJOO flow, the supported option is 12-month digital road tax. Physical + delivery is only available for eligible Foreign ID or Company Registration vehicles, so you can choose 12-month digital road tax or no road tax here.';
    }
    return `Insurance and road tax are separate. Insurance must be active before road tax can be renewed, and digital road tax/e-LKM is meant to be used digitally.${sixMonthLine} Do you want 12-month digital road tax or no road tax?`;
  }

  if (key === ADVISOR_INTENTS.CONFUSED_USER) {
    return buildConfusedFallback(state);
  }

  return null;
}

function buildGenericRenewalFallback(state) {
  if (state?.step === FLOW_STEPS.QUOTES) {
    const options = getQuotesFromState(state).map(getQuoteSummary).filter(Boolean);
    const cheapest = options.slice().sort((a, b) => Number(a.finalPremiumValue || 0) - Number(b.finalPremiumValue || 0))[0];
    const highestCover = options.slice().sort((a, b) => Number(b.sumInsuredValue || 0) - Number(a.sumInsuredValue || 0))[0];
    return `I can still guide you using the current quote list. ${buildNamedQuoteChoiceQuestion({ cheapest, highestCover })}`;
  }

  if (state?.step === FLOW_STEPS.ADDONS) {
    return 'I can still guide you from here. For add-ons, choose windscreen, Special Perils/Flood, both, or skip add-ons.';
  }

  if (state?.step === FLOW_STEPS.ROADTAX) {
    return 'I can still continue from here. For road tax, choose 12-month digital road tax or no road tax.';
  }

  if (state?.step === FLOW_STEPS.PERSONAL_DETAILS) {
    return 'I can still continue from here. Please send your email, phone number, and address in one message.';
  }

  if (state?.step === FLOW_STEPS.PAYMENT || state?.step === FLOW_STEPS.OTP) {
    return 'I can still help you adjust the renewal. Tell me if you want to change insurer, add-ons, road tax, or continue payment.';
  }

  return 'I can still help with the renewal. Tell me what you want to compare, change, or continue.';
}

export function buildAdvisoryFallbackResponse({
  error,
  state,
  intent,
  advisorIntent = null,
  decision,
  turnPlan,
  latestMessage,
  productionTurnInstructions,
} = {}) {
  if (!isRetryableOpenAiCapacityError(error)) return null;

  const recommendation = productionTurnInstructions?.quoteRecommendation;
  const advisorFallback = buildAdvisorIntentFallback({ advisorIntent: advisorIntent || turnPlan?.advisorIntentContext, state });
  if (advisorFallback) return advisorFallback;

  if (isOtherQuoteOptionsTurn({ state, latestMessage, recommendation })) {
    return buildOtherQuoteOptionsFallback({ recommendation });
  }

  if (isQuoteRecommendationTurn({ state, decision, turnPlan, latestMessage, recommendation })) {
    return buildQuoteRecommendationFallback({ recommendation });
  }

  if (isRoadTaxAlternativeTurn({ state, turnPlan, latestMessage })) {
    return buildRoadTaxAlternativeFallback();
  }

  if (isNeedsGuidanceTurn(latestMessage)) {
    return buildNeedsGuidanceFallback(state);
  }

  if (isConceptFallbackTurn({ intent, decision, latestMessage })) {
    const conceptFallback = buildConceptFallback({ latestMessage, state });
    if (conceptFallback) return conceptFallback;
  }

  if (isConfusedTurn({ decision, turnPlan })) {
    return buildConfusedFallback(state);
  }

  return buildGenericRenewalFallback(state);
}

export default buildAdvisoryFallbackResponse;
