import { FLOW_STEPS, USER_INTENTS } from '../../lib/conversationState.js';
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
  canUseDeliveredRoadTaxByOwnerType,
} from '../../lib/flowGuards.js';
import { extractPersonalInfo } from '../../utils/nlpExtractor.js';
import {
  TURN_QUESTION_GUIDANCE,
  buildTurnQuestionInstruction,
} from './turnPlanner.js';
import {
  ADVISOR_INTENTS,
  ADVISOR_TOPICS,
} from './advisorIntent.js';
import {
  PRINTED_ROAD_TAX_EFFECTIVE_DATE,
  getRoadTaxDisplayName,
} from '../insurance/roadTaxEngine.js';
import {
  ADD_ON_BY_ID,
  calculateWindscreenPremium,
} from '../insurance/addonEngine.js';
import {
  getQuoteInsurerKey,
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
const OTP_RESEND_COOLDOWN_MS = 30_000;

function pushSystem(openAiMessages, content) {
  if (!content) return;
  openAiMessages.push({ role: 'system', content });
}

function buildOtpResendReply(state) {
  const waitMs = typeof state.getOtpResendWaitMs === 'function'
    ? state.getOtpResendWaitMs({ cooldownMs: OTP_RESEND_COOLDOWN_MS })
    : 0;

  if (waitMs > 0) {
    const seconds = Math.max(1, Math.ceil(waitMs / 1000));
    return `I hear you — sometimes the OTP can take a short while to arrive.

For security, I can resend it after **30 seconds**. Please wait about **${seconds} second${seconds === 1 ? '' : 's'}**, then type **resend OTP** and I’ll send a new one.

If it arrives before then, key in the latest **4-digit OTP** here.`;
  }

  if (typeof state.markOtpSent === 'function') {
    state.markOtpSent({ resent: true });
  }

  return `No problem — I’ve attempted to resend the **4-digit OTP** to your phone or email.

Please key in the latest OTP here. If it still does not arrive, tell me if you want to check or change your phone/email.`;
}

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getLastAssistantMessage(messages = []) {
  return [...messages].reverse().find((message) => message.role === 'assistant' && message.content)?.content || '';
}

function isWeakRecommendationAcknowledgement(text) {
  const normalized = normalizeText(text).replace(/[.!?]+$/g, '').trim();
  return /^(?:hmm+ |umm+ |uhh+ |eh+ )?(?:ok+|okay+|sure+|alright|noted|got it|understood|i see)(?:\s+(?:please|pls|lah|la|ah|leh|boleh|can|thanks|tq))*$/i.test(normalized);
}

function wantsRecommendationAlternative(text) {
  return /\b(other|others|another|alternative|different|else|more options?|explore|compare more|show me more)\b/i.test(String(text || ''));
}

function explicitlyAcceptsRecommendation(text) {
  const normalized = normalizeText(text);
  if (!normalized || wantsRecommendationAlternative(normalized)) return false;
  if (/^(?:yes+|ya+|yah+|yep+|yup+)(?:\s+(?:please|pls|lah|la|ah|leh|boleh|can|thanks|tq))*[.!?]*$/i.test(normalized)) {
    return true;
  }
  return /\b(go with|choose|select|pick|take|proceed|continue|lock|confirm)\b.*\b(it|this|that|recommendation|recommended|your pick|your choice)\b/i.test(normalized) ||
    /\b(proceed|continue|lock it|confirm it|go ahead)\b/i.test(normalized);
}

function lastAssistantAskedToSelectSingleInsurer(lastAIMessage) {
  const text = String(lastAIMessage || '');
  if (!text.trim()) return false;
  const insurerMentions = getInsurerKeysFromText(text);
  if (insurerMentions.length !== 1) return false;
  return /\b(?:shall\s+i|should\s+i|want\s+me\s+to|would\s+you\s+like\s+me\s+to|can\s+i)\s+(?:select|choose|lock(?:\s+in)?|go\s+with|proceed\s+with)\b/i.test(text);
}

function formatMoney(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 'RM 0.00';
  return `RM ${numeric.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function summarizeQuoteOption(quote) {
  if (!quote) return null;
  const insurerName = quote?.insurer?.displayName || quote?.insurer || 'Unknown insurer';
  const price = Number(quote?.pricing?.finalPremium ?? quote?.priceAfter ?? 0);
  const sumInsured = Number(quote?.sumInsured ?? 0);
  const featureText = Array.isArray(quote?.insurer?.features) && quote.insurer.features.length > 0
    ? quote.insurer.features.slice(0, 2).join(', ')
    : '';
  return {
    key: getQuoteInsurerKey(quote),
    insurerName,
    shortName: quote?.insurer?.shortName || insurerName,
    insurerType: quote?.insurer?.type || null,
    price,
    sumInsured,
    featureText,
  };
}

function buildRecommendationClarificationReply(recommendedQuote) {
  const insurerName = recommendedQuote?.insurer || 'the recommended insurer';
  return `Just to confirm - do you want to proceed with **${insurerName}**, or would you like me to explain the other insurers first?

If you want to explore, I can narrow it by **lowest price**, **claims/service confidence**, or **higher coverage**.`;
}

function buildRecommendationAlternativesReply(state, recommendedQuote) {
  const recommendedKey = getQuoteInsurerKey(recommendedQuote);
  const quoteOptions = getQuotesFromState(state)
    .map(summarizeQuoteOption)
    .filter((quote) => quote && quote.key && quote.key !== recommendedKey);

  const selected = [];
  const addUnique = (label, quote, reason) => {
    if (!quote || selected.some((item) => item.quote.key === quote.key)) return;
    selected.push({ label, quote, reason });
  };

  const cheapest = [...quoteOptions].sort((a, b) => a.price - b.price)[0] || null;
  const highestCoverage = [...quoteOptions].sort((a, b) => b.sumInsured - a.sumInsured || a.price - b.price)[0] || null;
  const serviceCandidates = [...quoteOptions]
    .map((quote) => ({
      quote,
      score: /\b(claim|claims|service|support|towing|workshop|established|international|local)\b/i.test(quote.featureText) ? 1 : 0,
    }))
    .sort((a, b) => b.score - a.score || a.quote.price - b.quote.price);

  addUnique('Lowest price alternative', cheapest, 'best if you want to minimize premium');
  addUnique('Higher coverage alternative', highestCoverage, 'best if you want more sum insured');
  const serviceSignal = serviceCandidates.find((candidate) =>
    candidate.score > 0 && !selected.some((item) => item.quote.key === candidate.quote.key)
  )?.quote || null;
  addUnique('Service-confidence alternative', serviceSignal, 'worth considering from the service signals shown in the current quote set');

  const lines = selected.slice(0, 3).map(({ label, quote, reason }) => {
    const feature = quote.featureText ? ` Features shown: ${quote.featureText}.` : '';
    return `- **${label}: ${quote.insurerName}** - ${formatMoney(quote.price)}, sum insured ${formatMoney(quote.sumInsured)}; ${reason}.${feature}`;
  });

  const recommendedName = recommendedQuote?.insurer || 'my recommended option';
  const fallbackLines = lines.length > 0
    ? lines.join('\n')
    : `- I can compare the available panel by premium, sum insured, and verified coverage facts.`;
  const choiceNames = selected.length > 0
    ? selected.slice(0, 3).map(({ quote }) => `**${quote.insurerName}**`).join(', ').replace(/, ([^,]*)$/, ', or $1')
    : 'one of the available insurers';

  return `Sure - **${recommendedName}** is still my balanced pick, but these are the sensible alternatives:

${fallbackLines}

Which would you like to go with: **${recommendedName}**, ${choiceNames}?`;
}

function getUnavailableInsurerName(text) {
  const match = String(text || '').match(UNAVAILABLE_INSURER_REGEX);
  if (!match?.[1]) return 'that insurer';
  const value = match[1].toLowerCase();
  const labels = {
    axa: 'AXA',
    bsompo: 'Berjaya Sompo',
    sompo: 'Sompo',
    rhb: 'RHB',
    amassurance: 'AmAssurance',
    berjaya: 'Berjaya',
  };
  return labels[value] || value.charAt(0).toUpperCase() + value.slice(1);
}

function pickClosestAvailableInsurerForUnavailablePreference(state) {
  const quoteOptions = getQuotesFromState(state)
    .map((rawQuote) => {
      const quote = summarizeQuoteOption(rawQuote);
      if (!quote) return null;
      const fullFeatureText = Array.isArray(rawQuote?.insurer?.features)
        ? rawQuote.insurer.features.join(', ')
        : quote.featureText;
      return { ...quote, fullFeatureText };
    })
    .filter((quote) => quote && quote.key);
  if (quoteOptions.length === 0) return null;

  const cheapestPrice = Math.min(...quoteOptions.map((quote) => quote.price || Number.POSITIVE_INFINITY));
  const highestSumInsured = Math.max(...quoteOptions.map((quote) => quote.sumInsured || 0));

  return quoteOptions
    .map((quote) => {
      const features = String(quote.fullFeatureText || quote.featureText || '').toLowerCase();
      const internationalSignal = /\b(international|established|global)\b/.test(features) ? 1 : 0;
      const serviceSignal = /\b(claim|claims|service|support|reliable|workshop|network|towing)\b/.test(features) ? 1 : 0;
      const priceScore = quote.price > 0 && Number.isFinite(cheapestPrice) ? cheapestPrice / quote.price : 0;
      const coverageScore = highestSumInsured > 0 ? quote.sumInsured / highestSumInsured : 0;
      return {
        quote,
        score: internationalSignal * 1.8 + serviceSignal * 1.2 + priceScore * 0.8 + coverageScore * 0.45,
      };
    })
    .sort((a, b) => b.score - a.score || a.quote.price - b.quote.price)[0]?.quote || null;
}

function buildUnavailablePreferredInsurerReply(state, latestMessage) {
  const unavailableName = getUnavailableInsurerName(latestMessage);
  const closest = pickClosestAvailableInsurerForUnavailablePreference(state);
  const cheapest = getQuotesFromState(state)
    .map(summarizeQuoteOption)
    .filter(Boolean)
    .sort((a, b) => a.price - b.price)[0] || null;

  if (!closest) {
    return `I understand - if you've used **${unavailableName}** before, it makes sense to prefer a familiar insurer. **${unavailableName}** is not in the current LAJOO panel for this quote, so I cannot select it here.

Would you like me to recommend the closest available option, or choose from ${AVAILABLE_INSURER_CHOICE_TEXT}?`;
  }

  const featureReason = closest.featureText
    ? ` The current quote set shows: ${closest.featureText}.`
    : '';
  const cheapestTradeoff = cheapest && cheapest.key !== closest.key
    ? ` If your priority is the lowest premium, **${cheapest.insurerName}** is **${formatMoney(cheapest.price)}** with sum insured **${formatMoney(cheapest.sumInsured)}**.`
    : '';

  return `I understand - if you've used **${unavailableName}** before, it makes sense to prefer a familiar insurer. **${unavailableName}** is not in the current LAJOO panel for this quote, so I cannot select it here.

Closest available fit: **${closest.insurerName}** at **${formatMoney(closest.price)}**, sum insured **${formatMoney(closest.sumInsured)}**.${featureReason}${cheapestTradeoff}

Would you like to go with **${closest.insurerName}**, choose another available insurer, or see a quick comparison first?`;
}

function buildRoadTaxAlternativeReply() {
  return `Yes - outside LAJOO, you can usually renew road tax through **JPJ/MyJPJ**, **mySIKAP**, **MyEG**, or **Pos Malaysia** where the service is available.

Insurance must already be active before road tax can be renewed. Pos Malaysia counter availability can vary by outlet, and from ${PRINTED_ROAD_TAX_EFFECTIVE_DATE}, printed road tax is only for Foreign ID or Company vehicles.

Here, I can still settle **12-month digital road tax (RM 90.00)** together with this renewal, or you can choose **no road tax**.

Would you like me to proceed with **12-month digital road tax**, or skip road tax?`;
}

function getQuoteOptionsForAdvisor(state, { excludeKeys = [], conventionalOnly = false } = {}) {
  const rememberedExcluded = Array.isArray(state?.userPreferences?.excludedInsurerKeys)
    ? state.userPreferences.excludedInsurerKeys
    : [];
  const excluded = new Set([...(excludeKeys || []), ...rememberedExcluded].filter(Boolean));
  const useConventionalOnly = conventionalOnly || !!state?.userPreferences?.conventionalOnly;
  return getQuotesFromState(state)
    .map(summarizeQuoteOption)
    .filter((quote) => {
      if (!quote?.key) return false;
      if (excluded.has(quote.key)) return false;
      if (useConventionalOnly && quote.insurerType === 'takaful') return false;
      return true;
    });
}

function pickBalancedQuoteForAdvisor(state, options = {}) {
  const quoteOptions = getQuoteOptionsForAdvisor(state, options);
  if (quoteOptions.length === 0) return null;

  const minPrice = Math.min(...quoteOptions.map((quote) => quote.price || Number.POSITIVE_INFINITY));
  const maxPrice = Math.max(...quoteOptions.map((quote) => quote.price || 0));
  const minSum = Math.min(...quoteOptions.map((quote) => quote.sumInsured || 0));
  const maxSum = Math.max(...quoteOptions.map((quote) => quote.sumInsured || 0));
  const range = (value, min, max) => (max > min ? (Number(value || 0) - min) / (max - min) : 0.5);

  return quoteOptions
    .map((quote) => {
      const priceScore = 1 - range(quote.price, minPrice, maxPrice);
      const coverageScore = range(quote.sumInsured, minSum, maxSum);
      const featureScore = /\b(claim|claims|service|support|towing|workshop|established|international|network)\b/i.test(quote.featureText) ? 0.22 : 0;
      const valueScore = quote.price > 0 ? quote.sumInsured / quote.price : 0;
      return {
        quote,
        score: priceScore * 0.42 + coverageScore * 0.28 + featureScore + valueScore * 0.004,
      };
    })
    .sort((a, b) => b.score - a.score || a.quote.price - b.quote.price)[0]?.quote || null;
}

function pickAdvisorAlternatives(state, options = {}) {
  const quoteOptions = getQuoteOptionsForAdvisor(state, options);
  const selected = [];
  const addUnique = (label, quote, reason) => {
    if (!quote || selected.some((item) => item.quote.key === quote.key)) return;
    selected.push({ label, quote, reason });
  };

  addUnique(
    'Lowest premium',
    quoteOptions.slice().sort((a, b) => a.price - b.price)[0],
    'best if budget is the priority'
  );
  addUnique(
    'Higher coverage',
    quoteOptions.slice().sort((a, b) => b.sumInsured - a.sumInsured || a.price - b.price)[0],
    'best if you want more sum insured'
  );
  addUnique(
    'Balanced pick',
    pickBalancedQuoteForAdvisor(state, options),
    'best balance of premium, sum insured, and shown service signals'
  );

  return selected.slice(0, 3);
}

function formatAdvisorQuoteLines(items) {
  return items.map(({ label, quote, reason }) => {
    const feature = quote.featureText ? ` Shown signal: ${quote.featureText}.` : '';
    return `- **${label}: ${quote.insurerName}** - ${formatMoney(quote.price)}, sum insured ${formatMoney(quote.sumInsured)}; ${reason}.${feature}`;
  }).join('\n');
}

function getVehicleAgeFromState(state) {
  const vehicleYear = Number(state?.vehicleInfo?.year || state?.vehicleInfo?.manufactureYear || 0);
  if (!Number.isFinite(vehicleYear) || vehicleYear <= 1980) return null;
  return Math.max(0, new Date().getFullYear() - vehicleYear);
}

function formatVehicleName(state) {
  const parts = [
    state?.vehicleInfo?.make,
    state?.vehicleInfo?.model,
    state?.vehicleInfo?.variant,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'your car';
}

function isPremiumOrExpensiveVehicle(state) {
  const vehicleLabel = [
    state?.vehicleInfo?.make,
    state?.vehicleInfo?.model,
    state?.vehicleInfo?.variant,
  ].filter(Boolean).join(' ');
  const sumInsured = Number(
    state?.selectedQuote?.sumInsured ||
    state?.selectedQuote?.insuredAmount ||
    state?.selectedQuote?.sum_insured ||
    0
  );

  return sumInsured >= 80000 ||
    /\b(bmw|mercedes|mercedes-benz|audi|porsche|volvo|lexus|mini|tesla|jaguar|land rover|range rover|maserati|bentley|ferrari|lamborghini)\b/i.test(vehicleLabel);
}

function buildQuoteStageBettermentAdvisorReply(state) {
  const vehicleAge = getVehicleAgeFromState(state);
  const vehicleName = formatVehicleName(state);
  const premiumOrExpensiveVehicle = isPremiumOrExpensiveVehicle(state);
  const recommended = state?.lastRecommendedInsurer
    ? summarizeQuoteOption(quoteSelectionFromIntent(state, state.lastRecommendedInsurer))
    : pickBalancedQuoteForAdvisor(state);
  const vehicleLine = premiumOrExpensiveVehicle
    ? `For your **${vehicleAge !== null ? `${vehicleAge}-year-old ` : ''}${vehicleName}**, I would consider it more seriously because older premium, continental, performance, luxury, or cars with expensive parts can have bigger repair-cost surprises.`
    : vehicleAge !== null
      ? `For your **${vehicleAge}-year-old ${vehicleName}**, I would treat it as **nice-to-have** if you want extra repair-cost comfort. It matters more for older premium, continental, performance, luxury, or cars with expensive parts.`
      : `For **${vehicleName}**, I would treat it as useful if repair-cost surprises matter. It matters more for older premium, continental, performance, luxury, or cars with expensive parts.`;
  const recommendationLine = recommended
    ? `My earlier advice still stands: **${recommended.insurerName} - ${formatMoney(recommended.price)}** is the balanced pick. Choose the insurer first, then I’ll help you review Betterment waiver / zero-betterment in the add-ons step.`
    : `Choose the insurer first, then I’ll help you review Betterment waiver / zero-betterment in the add-ons step.`;
  const closeLine = recommended
    ? `Shall I select **${recommended.insurerName} - ${formatMoney(recommended.price)}** first, then we review the Betterment waiver option at add-ons?`
    : `Would you like my recommendation now, or do you want to compare the available insurers first?`;

  return `Zero betterment helps reduce the extra amount you may need to pay when an older damaged part is replaced with a new part during an own-damage repair.

You can review **Betterment waiver / zero-betterment** in the add-ons step later. I won’t show the price here because it belongs with the actual add-on options after the insurer is selected.

${vehicleLine}

${recommendationLine}

${closeLine}`;
}

function buildPreAddOnsAdvisorReply(state, advisorIntent) {
  const topic = advisorIntent?.topic || 'general_addon_recommendation';
  const vehicleAge = getVehicleAgeFromState(state);
  const vehicleName = formatVehicleName(state);

  const stageClose = (() => {
    if (!state?.hasCompleteVehicleIdentification?.()) {
      return 'To continue the renewal, send me the **vehicle plate** and **owner identification number** first. After I check the quote, I can show the actual add-on options at the right step.';
    }
    if (!state?.selectedQuote) {
      return 'Choose the insurer first, then I’ll show the actual add-on options and pricing in the add-ons step.';
    }
    return 'We can still review this safely in the add-ons step before payment or policy issuance. Do you want me to go back to add-ons to review it?';
  })();

  if (topic === ADVISOR_TOPICS.BETTERMENT) {
    const premiumOrExpensiveVehicle = isPremiumOrExpensiveVehicle(state);
    const ageLine = premiumOrExpensiveVehicle
      ? `For your **${vehicleAge !== null ? `${vehicleAge}-year-old ` : ''}${vehicleName}**, I would consider it more seriously because older premium, continental, performance, luxury, or cars with expensive parts can have bigger repair-cost surprises.`
      : vehicleAge !== null
        ? `For your **${vehicleAge}-year-old ${vehicleName}**, I would treat it as **nice-to-have** if you want extra repair-cost comfort. It becomes more important for older premium, continental, performance, luxury, or cars with expensive parts.`
        : `For **${vehicleName}**, I would treat it as useful if repair-cost surprises matter. It matters more for older premium, continental, performance, luxury, or cars with expensive parts.`;

    return `Zero betterment helps reduce the extra amount you may need to pay when an older damaged part is replaced with a new part during an own-damage repair.

You can review **Betterment waiver / zero-betterment** in the add-ons step later. I won’t show the price here because it belongs with the actual add-on options after the insurer is selected.

${ageLine}

${stageClose}`;
  }

  if (topic === ADVISOR_TOPICS.WINDSCREEN || topic === ADVISOR_TOPICS.WINDSCREEN_AMOUNT) {
    return `Windscreen cover helps with repair or replacement of the car glass, subject to the coverage amount selected later.

I would consider it if you drive a lot, especially highways or long-distance routes, because stones and road debris can chip or crack glass. It is also more useful if the windscreen has sensors, tint, camera calibration, or would be painful to replace out-of-pocket.

${stageClose}`;
  }

  if (topic === ADVISOR_TOPICS.FLOOD) {
    return `Special Perils is the add-on normally used for flood and selected natural-disaster damage such as landslide/landslip or storm, subject to insurer terms.

I would prioritise it if you live, work, drive through, or park in flood-prone or landslide-risk areas, low-lying roads, or basement parking. If your area is low risk and you want the lowest total, it may be optional.

${stageClose}`;
  }

  if (topic === ADVISOR_TOPICS.E_HAILING) {
    return `If the car is used for Grab, inDrive, or other e-hailing work, that must be handled properly because normal private-car use may not be enough.

If it is strictly private use only, e-hailing cover is usually not needed. If you use it for e-hailing even part-time, tell me before we proceed so I can keep the renewal advice safe.

${stageClose}`;
  }

  if (topic === ADVISOR_TOPICS.ALL_DRIVERS) {
    return `All Drivers is relevant when your spouse, family members, or other people may drive the car.

It can help avoid driver-restriction issues under the policy terms. If only you drive, it may be optional; if family members drive sometimes, it is worth reviewing later.

${stageClose}`;
  }

  if (topic === ADVISOR_TOPICS.LEGAL_LIABILITY_PASSENGERS || topic === ADVISOR_TOPICS.LLTP) {
    return `Passenger legal-liability add-ons are extra protections for selected liability situations involving passengers, subject to the policy wording.

For a normal private car, I would not treat them as the first must-have. They become more relevant if you regularly carry passengers and want extra legal-liability comfort.

${stageClose}`;
  }

  if (topic === ADVISOR_TOPICS.STRIKE_RIOT) {
    return `Strike, riot and civil commotion cover is for selected damage from those events, subject to the policy wording.

I would treat it as optional unless the car is often parked or used near protest-prone, high-risk, or public-event areas.

${stageClose}`;
  }

  return `Add-ons are optional protections that should be chosen based on real risk, not automatically added.

The common ones to review later are flood/Special Perils, windscreen, All Drivers, e-hailing if the car is used for Grab or similar work, and Betterment waiver for older or expensive-to-repair cars.

${stageClose}`;
}

function buildQuotePriceGapAdvisorReply(state) {
  const quoteOptions = getQuoteOptionsForAdvisor(state)
    .filter((quote) => Number.isFinite(quote.price) && quote.price > 0);

  if (quoteOptions.length === 0) {
    return `The price gap usually comes from each insurer's own pricing rules, the sum insured, and the product features offered.

Once the quote list is loaded, I can explain which insurer is cheaper or more expensive using the actual premiums and sum insured.

Would you like me to show the quote list again?`;
  }

  const byPrice = quoteOptions.slice().sort((a, b) => a.price - b.price);
  const cheapest = byPrice[0];
  const priciest = byPrice[byPrice.length - 1];
  const highestCoverage = quoteOptions.slice().sort((a, b) => b.sumInsured - a.sumInsured || a.price - b.price)[0];
  const recommended = state?.lastRecommendedInsurer
    ? summarizeQuoteOption(quoteSelectionFromIntent(state, state.lastRecommendedInsurer))
    : pickBalancedQuoteForAdvisor(state);
  const practicalPick = recommended || pickBalancedQuoteForAdvisor(state) || cheapest;

  const rangeLine = cheapest && priciest && cheapest.key !== priciest.key
    ? `In this quote set, the premium ranges from **${cheapest.insurerName} - ${formatMoney(cheapest.price)}** to **${priciest.insurerName} - ${formatMoney(priciest.price)}**.`
    : `In this quote set, the available premium is around **${formatMoney(cheapest.price)}**.`;

  const coverageLine = highestCoverage
    ? ` **${highestCoverage.insurerName}** shows the highest sum insured at **${formatMoney(highestCoverage.sumInsured)}**, while **${cheapest.insurerName}** is the lowest premium with **${formatMoney(cheapest.sumInsured)}** sum insured.`
    : '';

  const practicalLine = practicalPick
    ? `My practical advice: **${practicalPick.insurerName} - ${formatMoney(practicalPick.price)}** still looks like the best balance at **${formatMoney(practicalPick.sumInsured)}** sum insured.`
    : '';
  const budgetLine = cheapest && practicalPick && cheapest.key !== practicalPick.key
    ? ` If you only want the lowest price, **${cheapest.insurerName} - ${formatMoney(cheapest.price)}** is the budget pick.`
    : '';
  const compareCount = quoteOptions.length;
  const close = practicalPick && cheapest && cheapest.key !== practicalPick.key
    ? `Want me to select **${practicalPick.shortName || practicalPick.insurerName}**, choose **${cheapest.shortName || cheapest.insurerName}**, or compare all ${compareCount}?`
    : `Want me to select **${practicalPick?.shortName || practicalPick?.insurerName || 'this insurer'}**, or compare all ${compareCount}?`;

  return `The price gap is mostly from each insurer's own pricing rules, the sum insured, brand/service positioning, and the specific policy features shown in the quote.

${rangeLine}${coverageLine} So a higher price does not automatically mean "better" - sometimes it means more sum insured, and sometimes it is simply that insurer's pricing.

${practicalLine}${budgetLine}

${close}`;
}

function buildRoadTaxOptionClarificationReply(state) {
  if (!canUseDeliveredRoadTaxByOwnerType(state?.ownerIdType)) {
    return `For this renewal, I can add **12-month digital road tax (RM 90.00)** or proceed with **no road tax**.

Which one would you like?`;
  }

  return `For this vehicle, both road tax options are available, so I need you to choose which one you want.

- **12-month digital road tax (RM 90.00)** - updates in MYJPJ
- **12-month physical + delivery (RM 100.00)** - MYJPJ plus delivered copy
- **No road tax** - insurance only

Which one should I add?`;
}

function formatDelta(value, { positive = 'higher', negative = 'lower', same = 'the same' } = {}) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric === 0) return same;
  return `${formatMoney(Math.abs(numeric))} ${numeric > 0 ? positive : negative}`;
}

function buildKnownInsurerExplorationReply(state, latestMessage) {
  if (state?.step !== FLOW_STEPS.QUOTES || state?.selectedQuote) return null;

  const text = String(latestMessage || '');
  const mentionedKeys = getInsurerKeysFromText(text);
  if (mentionedKeys.length !== 1) return null;
  if (!/\b(look at|have a look|what about|how about|tell me|explain|details|compare|also|as well)\b/i.test(text)) {
    return null;
  }

  const [mentionedKey] = mentionedKeys;
  const quote = summarizeQuoteOption(quoteSelectionFromIntent(state, mentionedKey));
  if (!quote) return null;

  const rememberedRecommended = state?.lastRecommendedInsurer
    ? summarizeQuoteOption(quoteSelectionFromIntent(state, state.lastRecommendedInsurer))
    : null;
  const balanced = rememberedRecommended || pickBalancedQuoteForAdvisor(state);
  const cheapest = getQuoteOptionsForAdvisor(state).slice().sort((a, b) => a.price - b.price)[0] || null;

  const comparisonLines = [];
  if (balanced && balanced.key !== quote.key) {
    comparisonLines.push(`Compared with my earlier balanced pick **${balanced.insurerName} - ${formatMoney(balanced.price)}**, **${quote.insurerName}** is **${formatDelta(quote.price - balanced.price)}** and gives **${formatDelta(quote.sumInsured - balanced.sumInsured)} sum insured**.`);
  }
  if (cheapest && cheapest.key !== quote.key && (!balanced || cheapest.key !== balanced.key)) {
    comparisonLines.push(`Compared with the cheapest option **${cheapest.insurerName} - ${formatMoney(cheapest.price)}**, it is **${formatDelta(quote.price - cheapest.price)}** with **${formatDelta(quote.sumInsured - cheapest.sumInsured)} sum insured**.`);
  }

  const featureLine = quote.featureText
    ? `The quote card signals: ${quote.featureText}.`
    : 'I would judge it mainly by the current premium and sum insured shown here.';
  const viewLine = balanced && balanced.key !== quote.key
    ? `My view: **${quote.insurerName}** is worth considering if you specifically want the higher sum insured, but **${balanced.insurerName}** still looks like the cleaner balanced pick unless you prefer paying more for extra cover.`
    : `My view: **${quote.insurerName}** is already the balanced option I would focus on from this quote set.`;
  const cheapestClose = cheapest && cheapest.key !== quote.key
    ? `, choose the cheapest **${cheapest.insurerName} - ${formatMoney(cheapest.price)}**`
    : '';
  const balancedClose = balanced
    ? `keep **${balanced.insurerName} - ${formatMoney(balanced.price)}**`
    : 'keep my balanced pick';

  return `Sure - we can look at **${quote.insurerName}**, but I have **not selected it yet**.

**${quote.insurerName}** is **${formatMoney(quote.price)}** with sum insured **${formatMoney(quote.sumInsured)}**. ${featureLine}

${comparisonLines.join('\n\n')}

${viewLine}

Do you want to ${balancedClose}, choose **${quote.insurerName} - ${formatMoney(quote.price)}**${cheapestClose}, or compare all insurers?`;
}

function formatInsurerNames(keys = []) {
  return keys
    .map((key) => getInsurerByKey(key)?.shortName || getInsurerByKey(key)?.displayName || key)
    .filter(Boolean)
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1');
}

function buildCommercialBiasAdvisorReply(state) {
  const recommendedKey = state?.lastRecommendedInsurer || getQuoteInsurerKey(state?.selectedQuote);
  const recommendedQuote = recommendedKey ? quoteSelectionFromIntent(state, recommendedKey) : state?.selectedQuote;
  const recommendedSummary = summarizeQuoteOption(recommendedQuote);
  const cheapest = getQuoteOptionsForAdvisor(state).slice().sort((a, b) => a.price - b.price)[0] || null;

  if (!recommendedSummary) {
    return `Fair question. LAJOO should recommend based on user fit, live quote economics, and verified coverage facts - not hidden paid placement.

If commercial ranking ever affects results, it should be disclosed clearly. For this renewal, I can compare by **lowest price**, **higher coverage**, or **claims/service confidence**.

Which priority should I use to recommend an insurer?`;
  }

  const priceTradeoff = cheapest && cheapest.key !== recommendedSummary.key
    ? ` The cheapest available option is **${cheapest.insurerName}** at **${formatMoney(cheapest.price)}**, so if lowest price is your priority, that is the better budget pick.`
    : '';
  const cheapestChoice = cheapest && cheapest.key !== recommendedSummary.key
    ? `, choose the cheapest option **${cheapest.insurerName}**`
    : '';

  return `Fair question. My recommendation should be based on quote fit - premium, sum insured, coverage facts, and your stated priority - not hidden paid placement. If commercial ranking ever affects results, it should be disclosed clearly.

For this quote, **${recommendedSummary.insurerName}** is being treated as the balanced pick at **${formatMoney(recommendedSummary.price)}** with sum insured **${formatMoney(recommendedSummary.sumInsured)}**.${priceTradeoff}

Do you want to go with **${recommendedSummary.shortName || recommendedSummary.insurerName}**${cheapestChoice}, or compare another insurer?`;
}

function buildRejectRecommendationAdvisorReply(state, advisorIntent) {
  const excluded = advisorIntent?.entities?.excludedInsurerKeys || [];
  const alternatives = pickAdvisorAlternatives(state, { excludeKeys: excluded });
  const excludedText = formatInsurerNames(excluded) || 'that insurer';

  if (alternatives.length === 0) {
    return `Got it - I will not push **${excludedText}**.

I do not have enough remaining quote options to make a clean alternative recommendation from the current panel.

Would you like me to show the available quote list again?`;
  }

  return `Got it - I will exclude **${excludedText}** from my recommendation.

Good alternatives from the current panel:
${formatAdvisorQuoteLines(alternatives)}

Which one should I lock in, or should I make the final pick for you?`;
}

function buildQuoteFilterAdvisorReply(state, advisorIntent) {
  const conventionalOnly = !!advisorIntent?.entities?.conventionalOnly;
  const excluded = advisorIntent?.entities?.excludedInsurerKeys || [];
  const alternatives = pickAdvisorAlternatives(state, { excludeKeys: excluded, conventionalOnly });
  const filterText = conventionalOnly ? 'conventional-only' : 'filtered';

  if (alternatives.length === 0) {
    return `Understood - I will respect that ${filterText} preference.

I cannot find a matching insurer in the current quote panel after applying that filter.

Would you like to see all available insurers again, or choose a different preference?`;
  }

  return `Understood - I will keep this ${filterText} and avoid the excluded option.

Best matching choices now:
${formatAdvisorQuoteLines(alternatives)}

Which one would you like to proceed with?`;
}

function buildQuoteObjectionAdvisorReply(state, advisorIntent) {
  const [mentionedKey] = advisorIntent?.entities?.insurerKeys || [];
  const mentionedQuote = mentionedKey ? summarizeQuoteOption(quoteSelectionFromIntent(state, mentionedKey)) : null;
  const balanced = pickBalancedQuoteForAdvisor(state);

  if (!mentionedQuote) {
    return `That kind of advice is worth considering, especially if it comes from someone who has claimed before or dealt with workshops.

For this quote, I would compare it using premium, sum insured, and the service signals shown in the current panel rather than brand memory alone.

Do you want me to compare that insurer against my balanced pick, or should I recommend one now?`;
  }

  const balancedLine = balanced && balanced.key !== mentionedQuote.key
    ? ` My balanced pick from the current panel is **${balanced.insurerName}** at **${formatMoney(balanced.price)}** with sum insured **${formatMoney(balanced.sumInsured)}**.`
    : '';

  return `I would not ignore that. If someone you trust prefers **${mentionedQuote.insurerName}**, the practical question is whether the extra premium is worth the comfort.

**${mentionedQuote.insurerName}** is **${formatMoney(mentionedQuote.price)}** with sum insured **${formatMoney(mentionedQuote.sumInsured)}**.${mentionedQuote.featureText ? ` The quote card shows: ${mentionedQuote.featureText}.` : ''}${balancedLine}

Do you want to go with **${mentionedQuote.insurerName}**, keep my balanced pick, or compare side by side?`;
}

function buildDelegateDecisionAdvisorReply(state) {
  const rememberedExcluded = Array.isArray(state?.userPreferences?.excludedInsurerKeys)
    ? state.userPreferences.excludedInsurerKeys
    : [];
  const lastRecommendedAllowed = state?.lastRecommendedInsurer &&
    !rememberedExcluded.includes(state.lastRecommendedInsurer) &&
    !(state?.userPreferences?.conventionalOnly && state.lastRecommendedInsurer === 'takaful');
  const recommended = lastRecommendedAllowed
    ? summarizeQuoteOption(quoteSelectionFromIntent(state, state.lastRecommendedInsurer))
    : pickBalancedQuoteForAdvisor(state);
  const cheapest = getQuoteOptionsForAdvisor(state).slice().sort((a, b) => a.price - b.price)[0] || null;

  if (!recommended) {
    return `I can decide for you, but I need the current quote options first.

Would you like me to show the available insurers again?`;
  }

  const tradeoff = cheapest && cheapest.key !== recommended.key
    ? ` Trade-off: **${cheapest.insurerName}** is cheaper at **${formatMoney(cheapest.price)}**, but **${recommended.insurerName}** gives a stronger balanced fit from the current quote set.`
    : '';

  return `My pick is **${recommended.insurerName}** at **${formatMoney(recommended.price)}**.

Why: it gives a practical balance of premium, sum insured **${formatMoney(recommended.sumInsured)}**, and the service/value signals shown in the current quote set.${tradeoff}

Want me to proceed with **${recommended.insurerName}**?`;
}

function addOnPriceLabel(id) {
  const addOn = ADD_ON_BY_ID?.[id];
  if (!addOn) return 'price shown in the add-on list';
  if (addOn.hasCoverageInput) return 'price depends on selected coverage amount';
  return formatMoney(addOn.price || 0);
}

function buildAddOnAdvisorReply(state, advisorIntent) {
  const topic = advisorIntent?.topic || 'general_addon_recommendation';
  const vehicleAge = getVehicleAgeFromState(state);
  const vehicleName = formatVehicleName(state);
  const premiumOrExpensiveVehicle = isPremiumOrExpensiveVehicle(state);
  const selectedInsurer = state?.selectedQuote?.insurer || 'your selected insurer';

  if (topic === ADVISOR_TOPICS.ADDON_CHANGE_WINDOW) {
    return `Yes - you can still add or change add-ons **before payment and policy issuance**.

After payment/issuance, changes may need insurer endorsement or a separate adjustment, so it is cleaner to decide now if you already know you want it.

Do you want to add it now, or keep the current add-ons unchanged?`;
  }

  if (state?.step !== FLOW_STEPS.ADDONS) {
    return buildPreAddOnsAdvisorReply(state, advisorIntent);
  }

  if (topic === ADVISOR_TOPICS.ALL_DRIVERS) {
    return `If your wife or family members sometimes drive the car, **All Drivers (${addOnPriceLabel('all_drivers')})** is the relevant add-on.

It helps avoid a problem where only certain drivers are accepted under the policy wording. For **${selectedInsurer}**, I would add it if another person drives even occasionally.

Want me to add **All Drivers**, or keep the add-ons unchanged?`;
  }

  if (topic === ADVISOR_TOPICS.LEGAL_LIABILITY_PASSENGERS) {
    return `**Legal Liability To Passengers (${addOnPriceLabel('legal_liability_passengers')})** is for selected legal liability involving passengers, subject to the policy wording.

Most private-car users do not treat it as a must-have unless they regularly carry passengers and want the extra legal-liability comfort.

Do you want to add it, or skip this one?`;
  }

  if (topic === ADVISOR_TOPICS.LLTP) {
    return `**LLTP for Negligence Acts (${addOnPriceLabel('lltp_negligence')})** is an extra passenger-liability protection for negligence-related situations.

It is cheap, but it is also quite specific. I would not call it essential for every driver; it is more relevant if you often carry passengers and want extra legal-liability comfort.

Do you want to add **LLTP**, or leave it out?`;
  }

  if (topic === ADVISOR_TOPICS.STRIKE_RIOT) {
    return `**Strike, riot and civil commotion (${addOnPriceLabel('strike_riot')})** covers selected damage from those events, subject to policy wording.

It is relatively expensive compared with flood or All Drivers, so I would only take it if the car is often parked near protest-prone, high-risk, or public-event areas.

Do you want to add it, or skip it?`;
  }

  if (topic === ADVISOR_TOPICS.BETTERMENT) {
    const ageLine = premiumOrExpensiveVehicle
      ? ` For your **${vehicleAge !== null ? `${vehicleAge}-year-old ` : ''}${vehicleName}**, I would consider it more seriously because older premium, continental, performance, luxury, or cars with expensive parts can have bigger repair-cost surprises.`
      : vehicleAge !== null
        ? ` For your **${vehicleAge}-year-old ${vehicleName}**, I would treat it as **nice-to-have** if you want extra repair-cost comfort.`
        : '';
    return `**Betterment waiver (${addOnPriceLabel('betterment_waiver')})** helps reduce surprise betterment charges during own-damage repairs.${ageLine}

I would recommend it more strongly for older premium, continental, performance, luxury, or cars with expensive parts. If you want the lowest total, you can skip it; if you want extra repair-cost comfort, it is worth considering.

Do you want to add **Betterment waiver**, or skip it?`;
  }

  if (topic === ADVISOR_TOPICS.WINDSCREEN_AMOUNT || topic === ADVISOR_TOPICS.WINDSCREEN) {
    const coverage1000 = calculateWindscreenPremium(1000);
    const coverage2000 = calculateWindscreenPremium(2000);
    return `For windscreen, the premium depends on the coverage amount. **RM 1,000.00 cover costs ${formatMoney(coverage1000)}**; **RM 2,000.00 cover costs ${formatMoney(coverage2000)}**.

I would lean towards windscreen if you drive a lot, especially on highways or long-distance routes, because road stones and debris can chip or crack glass. For a normal daily car, **RM 1,000.00** is a reasonable starting point. Choose **RM 2,000.00** if the windscreen has sensors, tint, camera calibration, or you just want more buffer.

What windscreen coverage amount should I use: **RM 1,000.00**, **RM 2,000.00**, or skip windscreen?`;
  }

  if (topic === ADVISOR_TOPICS.FLOOD) {
    return `If you live, work, drive through, or park in flood-risk or landslide-risk areas - especially low-lying roads, hillside routes, or basement parking - **Special Perils (${addOnPriceLabel('flood')})** is the add-on I would prioritise.

It covers flood and selected natural-disaster damage such as landslide/landslip or storm, subject to insurer terms. If your area has very low flood/landslide exposure and you want the lowest total, skipping is reasonable; otherwise RM 150.00 is a sensible risk hedge.

Do you want me to add **Special Perils**, add it with windscreen, or skip add-ons?`;
  }

  if (topic === ADVISOR_TOPICS.E_HAILING) {
    return `If this car is used for Grab, inDrive, or any e-hailing work - even weekend or part-time - treat **E-hailing (${addOnPriceLabel('ehailing')})** as required.

If the car is strictly private use only, skip it because it is expensive and not needed for normal personal driving.

Do you want me to add **E-hailing (${addOnPriceLabel('ehailing')})** now, or confirm the car will be private-use only?`;
  }

  if (topic === ADVISOR_TOPICS.NCD_RELIEF) {
    return `**Current year NCD relief (${addOnPriceLabel('ncd_relief')})** is meant to protect the current-year NCD benefit, subject to insurer terms.

It is useful if preserving NCD matters a lot to you, but it is not usually the first add-on I would recommend before flood or windscreen.

Do you want to add NCD relief, or skip it?`;
  }

  if (topic === ADVISOR_TOPICS.BODY_PAINTING) {
    return `**Full vehicle body painting (${addOnPriceLabel('body_painting')})** is a specific protection for selected body-painting situations, subject to insurer acceptance and wording.

For most users, I would prioritise flood, windscreen, or All Drivers before this unless paint/body repair is a real concern.

Do you want to add body painting, or skip it?`;
  }

  if (topic === ADVISOR_TOPICS.PERSONAL_ACCIDENT) {
    return `**Personal accident for all (${addOnPriceLabel('personal_accident')})** adds selected personal accident protection for covered persons.

It is affordable, but it is separate from repairing the car. If your priority is motor repair risk, flood/windscreen usually comes first.

Do you want to add personal accident, or skip it?`;
  }

  if (topic === ADVISOR_TOPICS.ADDON_SKIP_DECISION) {
    const bettermentAdvice = vehicleAge !== null && vehicleAge >= 5
      ? premiumOrExpensiveVehicle
        ? `- **8. Betterment waiver (${addOnPriceLabel('betterment_waiver')})** - more worth considering for your **${vehicleAge}-year-old ${vehicleName}** because premium, continental, performance, luxury, or expensive-parts cars can have bigger repair-cost surprises.`
        : `- **8. Betterment waiver (${addOnPriceLabel('betterment_waiver')})** - for your **${vehicleAge}-year-old ${vehicleName}**, treat this as **nice-to-have**, not essential. It is more worth it for older premium, continental, performance, luxury, or expensive-parts cars.`
      : `- **8. Betterment waiver (${addOnPriceLabel('betterment_waiver')})** - nice-to-have for repair-cost comfort, and stronger for older premium, continental, performance, luxury, or expensive-parts cars.`;

    return `Yes - you can skip add-ons if you want the lowest total and none of the main risks apply.

My practical minimum:

- **2. Special Perils (${addOnPriceLabel('flood')})** - take this if your home, workplace, route, or parking can flood, or has landslide/landslip exposure.
- **1. Windscreen** - add this if you drive highways or long-distance often, or if glass replacement would hurt your budget.
- **3. E-hailing (${addOnPriceLabel('ehailing')})** - only if the car is used for Grab/inDrive or similar work.
${bettermentAdvice}

If none of those apply, I’m comfortable helping you skip add-ons and continue.

Do you want to **skip add-ons**, take **2. Special Perils only**, or take **1 and 2**?`;
  }

  if (topic === ADVISOR_TOPICS.LOWEST_TOTAL) {
    return `If your goal is the **lowest total**, the cleanest choice is to **skip optional add-ons**.

Trade-off: you would pay less now, but flood, windscreen breakage, extra-driver issues, and betterment charges may become out-of-pocket costs later if they happen.

Do you want me to skip all add-ons and continue to road tax?`;
  }

  const bettermentLine = vehicleAge !== null && vehicleAge >= 5
    ? premiumOrExpensiveVehicle
      ? `- **8. Betterment waiver (${addOnPriceLabel('betterment_waiver')})** - for your **${vehicleAge}-year-old ${vehicleName}**, I would consider this more seriously because older premium, continental, performance, luxury, or cars with expensive parts can have bigger repair-cost surprises.`
      : `- **8. Betterment waiver (${addOnPriceLabel('betterment_waiver')})** - for your **${vehicleAge}-year-old ${vehicleName}**, treat this as **nice-to-have** if you want extra repair-cost comfort. It is more worth considering for older premium, continental, performance, luxury, or cars with expensive parts.`
    : `- **8. Betterment waiver (${addOnPriceLabel('betterment_waiver')})** - more useful for older premium, continental, performance, luxury, or cars with expensive parts.`;

  return `You can skip add-ons, but my practical advice is not to buy everything - choose based on real risk.

My usual shortlist:

- **2. Special Perils (${addOnPriceLabel('flood')})** - if your area or parking can flood, or has landslide/landslip exposure.
- **1. Windscreen** - if you drive a lot, especially highway or long-distance routes, or if glass replacement would hurt your budget.
- **3. E-hailing (${addOnPriceLabel('ehailing')})** - only if the car is used for Grab/inDrive.
${bettermentLine}

What would you like: **2. Special Perils**, **1. Windscreen**, **1 and 2**, **8. Betterment waiver**, or **skip add-ons**?`;
}

function buildPrivacyAdvisorReply(state, advisorIntent) {
  const topic = advisorIntent?.topic;
  if (topic === ADVISOR_TOPICS.IC_PRIVACY) {
    return `I understand the concern. The owner IC/ID is needed to verify that the vehicle record belongs to the right owner and to prepare the renewal correctly.

For privacy, LAJOO should use it only for verification/issuance, mask it where possible in chat, and avoid collecting payment card or banking details inside chat. This is also why I pause before payment if something looks wrong.

Do you want to continue with the current renewal, or pause before payment?`;
  }

  if (topic === ADVISOR_TOPICS.ADDRESS_PRIVACY) {
    return `Good question. The address is needed for the policy/proposal record, insurer compliance, and contact/delivery records tied to the renewal, even if the final policy documents are digital.

LAJOO should use it only for this renewal flow and document/servicing purposes. If you want to use the previous policy address, tell me and I will treat it as your address confirmation for this flow.

Would you like to provide the address now, or use the address from your previous policy if it is still correct?`;
  }

  return `I understand the privacy concern. For renewal, LAJOO should only collect details needed for verification, issuance, contact, and document delivery, and should keep sensitive data purpose-limited.

You can ask me why any specific detail is needed before continuing.

Which detail are you concerned about: IC, phone, email, or address?`;
}

function buildHumanHandoffAdvisorReply(state) {
  const step = state?.step || FLOW_STEPS.START;
  const stepHint = {
    [FLOW_STEPS.QUOTES]: 'insurer choice',
    [FLOW_STEPS.ADDONS]: 'add-ons',
    [FLOW_STEPS.ROADTAX]: 'road tax',
    [FLOW_STEPS.PERSONAL_DETAILS]: 'personal details',
    [FLOW_STEPS.PAYMENT]: 'payment',
  }[step] || 'renewal';

  return `I understand - sometimes it is better to speak to a person.

I can keep helping here while staying at the **${stepHint}** step, and you can also share exactly what you want a human agent to check so it can be handled cleanly.

What do you want the human agent to help with: insurer choice, add-ons, road tax, details, or payment?`;
}

function buildPaymentAdvisorReply(state, advisorIntent) {
  const hasPaymentLink = !!state?.transaction?.paymentIntentId || state?.step === FLOW_STEPS.PAYMENT;
  if (advisorIntent?.topic === ADVISOR_TOPICS.PAYMENT_AFTER) {
    return `After payment, the safe sequence is: payment confirmation first, then insurer confirmation/policy issuance, then receipt and policy documents are made available by WhatsApp/email where supported.

If road tax is included, that renewal follows after the insurance/payment status is confirmed. I should not say you are covered or the policy is issued until the payment and insurer status are confirmed in the system.${hasPaymentLink ? ' If you are ready, use the secure checkout link shown in this chat.' : ''}

Do you want to continue to payment now, or change anything before paying?`;
  }

  return `For payment, use the secure checkout link when you are ready. Cash is not available in this chat flow; for bank payment, choose **FPX/online banking** inside checkout if it is available.

I should not collect card, banking, or wallet details in chat, and I should not mark the policy or road tax as completed until payment status is confirmed by the system.

Do you want to open checkout, or change insurer/add-ons/road tax before paying?`;
}

function buildDocumentDeliveryAdvisorReply(state) {
  const details = state?.personalDetails && typeof state.personalDetails === 'object'
    ? state.personalDetails
    : {};
  const needsDetails = !details.email || !details.phone || !details.address;
  const detailsLine = needsDetails
    ? 'I still need the required email, phone number, and address first so the renewal can be prepared correctly.'
    : 'I already have the required contact details for this renewal, so the next step is OTP/payment before documents can be sent.';

  return `Yes, policy documents/receipt can be sent digitally where the insurer and LAJOO flow support it, including WhatsApp/email after payment and issuance are confirmed.

${detailsLine} WhatsApp delivery still needs a valid phone number, and email/address are still part of the issuance/record requirements.

Do you want to send the required details now, or change anything before we continue?`;
}

function buildRoadTaxAlreadyRenewedAdvisorReply() {
  return `No problem - if your road tax is already renewed, we should continue this as **insurance only** and avoid charging road tax again here.

I will keep the renewal flow safe and only mark road tax as skipped when you confirm.

Should I proceed with **no road tax** for this LAJOO renewal?`;
}

function buildRoadTaxLegalityAdvisorReply(state, advisorIntent) {
  const sixMonthLine = advisorIntent?.entities?.asksSixMonthRoadTax
    ? `\n\nFor the **6-month road tax** question: LAJOO currently supports **12-month digital road tax only** in this renewal flow. If you specifically need a 6-month option, you may need to renew through another channel that offers it.`
    : '';
  const asksOnlyDigital = !!advisorIntent?.entities?.asksOnlyDigitalRoadTax;

  if (asksOnlyDigital) {
    const ownerType = String(state?.ownerIdType || '').toLowerCase();
    const ownershipLine = ownerType === 'nric'
      ? 'For this NRIC/private-car renewal, the physical + delivery option is not available in LAJOO.'
      : 'Physical + delivery is only available here for eligible Foreign ID or Company Registration vehicles.';

    return `Good question. In this LAJOO flow, the supported road-tax option for your renewal is **12-month digital road tax (RM 90.00)**.

${ownershipLine} The digital e-LKM is meant to sit in the JPJ/MyJPJ record, so if it is checked, you can show the digital record instead of relying on a sticker.

If you prefer to handle road tax elsewhere, choose **no road tax** here and continue with insurance only.

Do you want **12-month digital road tax (RM 90.00)**, or **no road tax**?`;
  }

  if (advisorIntent?.topic === ADVISOR_TOPICS.DIGITAL_ROADTAX) {
    return `Yes - digital road tax/e-LKM is meant to be used digitally, and you can show it through the relevant JPJ/MyJPJ record if checked.${sixMonthLine}

Insurance and road tax are still separate: insurance must be active before road tax can be renewed. Here, I can add **12-month digital road tax (RM 90.00)** or skip it if you already handle road tax elsewhere.

Do you want **12-month digital road tax**, or **no road tax**?`;
  }

  return `Insurance alone is not the same as road tax. In Malaysia, you normally need valid insurance first, then road tax/e-LKM can be renewed separately.${sixMonthLine}

Since you are already here, LAJOO can include **12-month digital road tax (RM 90.00)** for convenience, or you can skip if you want insurance only.

Do you want digital road tax, or no road tax?`;
}

function buildConfusedAdvisorReply(state) {
  if (state?.step === FLOW_STEPS.QUOTES && !state?.selectedQuote) {
    return `No worries - we are at the insurer choice.

The simple options are: cheapest premium, higher sum insured, stronger service/claims comfort, or I can pick the balanced option for you.

Do you want **cheapest**, **higher coverage**, or **my recommendation**?`;
  }

  if (state?.step === FLOW_STEPS.ADDONS) {
    return `No worries - we are at add-ons.

You can add only what fits your risk: **Special Perils** for flood/landslide risk, **Windscreen** for glass damage, **All Drivers** if family drives, or skip all for the lowest total.

Do you want my practical add-on pick, or skip add-ons?`;
  }

  if (state?.step === FLOW_STEPS.ROADTAX) {
    return `No worries - we are at road tax.

Choose **12-month digital road tax (RM 90.00)** if you want LAJOO to settle it together, or **no road tax** if you only want insurance.

Which one should I use?`;
  }

  if (state?.step === FLOW_STEPS.PERSONAL_DETAILS) {
    return `No worries - we are at your details.

I need email, phone number, and address before OTP/payment, so the renewal can be prepared correctly.

Can you send those details in one message?`;
  }

  if (state?.step === FLOW_STEPS.PAYMENT) {
    return `No worries - we are at payment.

You can pay through checkout, or tell me what to change before paying: insurer, add-ons, or road tax.

Do you want to continue payment, or change something first?`;
  }

  return `No worries - tell me what you want to do: renew insurance, compare quotes, ask about coverage, or check road tax.

What should we handle first?`;
}

function buildAdvisorForcedResponse({ state, latestMessage, advisorIntent }) {
  const key = advisorIntent?.intent || ADVISOR_INTENTS.NONE;
  if (!key || key === ADVISOR_INTENTS.NONE) return null;

  switch (key) {
    case ADVISOR_INTENTS.COMMERCIAL_BIAS_CHALLENGE:
      return buildCommercialBiasAdvisorReply(state);
    case ADVISOR_INTENTS.REJECT_RECOMMENDATION:
      return buildRejectRecommendationAdvisorReply(state, advisorIntent);
    case ADVISOR_INTENTS.QUOTE_FILTER_PREFERENCE:
      return buildQuoteFilterAdvisorReply(state, advisorIntent);
    case ADVISOR_INTENTS.QUOTE_OBJECTION:
      return buildQuoteObjectionAdvisorReply(state, advisorIntent);
    case ADVISOR_INTENTS.QUOTE_PRICE_EXPLANATION:
      return buildQuotePriceGapAdvisorReply(state);
    case ADVISOR_INTENTS.DELEGATE_DECISION:
      return buildDelegateDecisionAdvisorReply(state);
    case ADVISOR_INTENTS.ADDON_EXPLANATION:
    case ADVISOR_INTENTS.COVERAGE_RISK_ADVICE:
      if (
        advisorIntent?.topic === ADVISOR_TOPICS.BETTERMENT &&
        state?.step === FLOW_STEPS.QUOTES &&
        !state?.selectedQuote
      ) {
        return buildQuoteStageBettermentAdvisorReply(state);
      }
      return buildAddOnAdvisorReply(state, advisorIntent);
    case ADVISOR_INTENTS.PRIVACY_CONCERN:
      return buildPrivacyAdvisorReply(state, advisorIntent);
    case ADVISOR_INTENTS.HUMAN_HANDOFF:
      return buildHumanHandoffAdvisorReply(state);
    case ADVISOR_INTENTS.PAYMENT_CONCERN:
      return buildPaymentAdvisorReply(state, advisorIntent);
    case ADVISOR_INTENTS.DOCUMENT_DELIVERY:
      return buildDocumentDeliveryAdvisorReply(state);
    case ADVISOR_INTENTS.ROADTAX_ALREADY_RENEWED:
      return buildRoadTaxAlreadyRenewedAdvisorReply();
    case ADVISOR_INTENTS.ROADTAX_LEGALITY:
      return buildRoadTaxLegalityAdvisorReply(state, advisorIntent);
    case ADVISOR_INTENTS.CONFUSED_USER:
      return buildConfusedAdvisorReply(state);
    default:
      return null;
  }
}

export function applyDeterministicFlowHandlers({
  openAiMessages,
  state,
  intent,
  advisorIntent = null,
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

  const effectiveAdvisorIntent = advisorIntent || turnPlan?.advisorIntentContext || null;

  if (!nextForcedAssistantResponse) {
    nextForcedAssistantResponse = buildAdvisorForcedResponse({
      state,
      latestMessage,
      advisorIntent: effectiveAdvisorIntent,
    });
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
After answering, add one short line: "If you'd like renewal quotes, share your **vehicle plate** and **owner identification number**."`);
    } else if (isGreetingStart) {
      pushSystem(openAiMessages, `User sent a greeting at the start. Reply naturally in 1-2 short lines (warm, human, non-robotic).
Do NOT show the full numbered intake list yet.
Briefly mention what LAJOO can help with (renew insurance, road tax, compare options, and payment).
Then ask one discovery question: what do they want to do today?
Only ask for **vehicle plate** and **owner identification number** after they clearly say they want to start renewal now.`);
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

      if (!hasPlate && !hasNRIC) {
        nextForcedAssistantResponse = `${formatStepLine(1, 'Vehicle Info')}

To get started, please provide your:

1. **Vehicle Plate Number** (e.g. WXY 1234)
2. **Owner Identification Number** (NRIC / Foreign ID / Army IC / Police IC / Company Reg. No.)`;
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

  const isQuoteTurnAfterRecommendation =
    state.hasCompleteVehicleIdentification() &&
    state.step === FLOW_STEPS.QUOTES &&
    !state.selectedQuote &&
    !wasLastAssistantVehicleConfirmation(messages);

  if (isQuoteTurnAfterRecommendation && !nextForcedAssistantResponse) {
    const lastAIMessage = getLastAssistantMessage(messages);
    const recommendedInsurerKey = state.lastRecommendedInsurer || parseRecommendedInsurerFromAssistantMessage(lastAIMessage);
    const recommendedInsurer = recommendedInsurerKey ? quoteSelectionFromIntent(state, recommendedInsurerKey) : null;
    const acceptsDirectSelectionPrompt =
      recommendedInsurer &&
      isWeakRecommendationAcknowledgement(latestMessage) &&
      lastAssistantAskedToSelectSingleInsurer(lastAIMessage);

    if (recommendedInsurer && wantsRecommendationAlternative(latestMessage)) {
      nextForcedAssistantResponse = buildRecommendationAlternativesReply(state, recommendedInsurer);
    } else if (recommendedInsurer && (acceptsDirectSelectionPrompt || explicitlyAcceptsRecommendation(latestMessage))) {
      state.selectQuote(recommendedInsurer);
      const summaryBox = buildSummaryBox(state);
      nextForcedAssistantResponse = `Great choice! ✅

${buildAddOnsStepBlock(summaryBox)}`;
    } else if (recommendedInsurer && isWeakRecommendationAcknowledgement(latestMessage)) {
      nextForcedAssistantResponse = buildRecommendationClarificationReply(recommendedInsurer);
    }
  }

  if (
    intent.intent === USER_INTENTS.CONFIRM &&
    state.step === FLOW_STEPS.QUOTES &&
    !state.selectedQuote &&
    !wasLastAssistantVehicleConfirmation(messages) &&
    !nextForcedAssistantResponse
  ) {
    const lastAIMessage = getLastAssistantMessage(messages);
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
    !nextForcedAssistantResponse &&
    intent.intent === USER_INTENTS.ASK_QUESTION &&
    [FLOW_STEPS.QUOTES, FLOW_STEPS.ADDONS, FLOW_STEPS.ROADTAX].includes(state.step)
  ) {
    const mentionsUnavailablePreferredInsurer = UNAVAILABLE_INSURER_REGEX.test(String(latestMessage || ''));
    const quoteExplorationReply = state.step === FLOW_STEPS.QUOTES && !state.selectedQuote
      ? buildKnownInsurerExplorationReply(state, latestMessage)
      : null;
    if (quoteExplorationReply) {
      nextForcedAssistantResponse = quoteExplorationReply;
    } else if (
      state.step === FLOW_STEPS.QUOTES &&
      !state.selectedQuote &&
      mentionsUnavailablePreferredInsurer
    ) {
      nextForcedAssistantResponse = buildUnavailablePreferredInsurerReply(state, latestMessage);
    } else if (
      state.step === FLOW_STEPS.ROADTAX &&
      intent.data?.topic === 'clarify_roadtax_option'
    ) {
      nextForcedAssistantResponse = buildRoadTaxOptionClarificationReply(state);
    } else if (
      state.step === FLOW_STEPS.ROADTAX &&
      turnPlan?.questionGuidance === TURN_QUESTION_GUIDANCE.ROADTAX_ALTERNATIVE
    ) {
      nextForcedAssistantResponse = buildRoadTaxAlternativeReply();
    } else if (turnPlan.shouldShowQuoteCards && state.step === FLOW_STEPS.QUOTES) {
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
    state.step !== FLOW_STEPS.QUOTES &&
    !nextForcedAssistantResponse
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
      pushSystem(openAiMessages, `STOP. User hasn't provided vehicle info yet. Ask for the missing vehicle plate number or owner identification number only. Nothing else.`);
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
    pushSystem(openAiMessages, `User selected road tax: ${roadTaxName}. Your response MUST include:

${roadTaxName !== 'No Road Tax' ? `${roadTaxName} added!` : 'No road tax.'} ✅

${formatStepLine(5, 'Your Details')}

${summaryBox}

${buildPersonalDetailsRequest()}

Do NOT alter the summary. MUST include all 3 items to collect.`);
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

    nextForcedAssistantResponse = missing.length === 0
      ? `Thanks — here are the details I captured:

- **Email:** ${canonicalDetails.email || '(provided)'}
- **Phone:** ${canonicalDetails.phone || '(provided)'}
- **Address:** ${canonicalDetails.address || '(provided)'}

Does everything look **correct** ?
If yes, I will send the OTP now. If not, tell me what to change.
`
      : `Thanks — I’ve captured what you shared.

I still need:
${buildPersonalDetailExampleList(missing)}
${typoSignals.length > 0 ? `\n${typoSignals.join(' ')}` : ''}`;
  }

  if (intent.intent === USER_INTENTS.CONFIRM && state.step === FLOW_STEPS.OTP) {
    if (typeof state.markOtpSent === 'function') {
      state.markOtpSent();
    }
    nextForcedAssistantResponse = OTP_PROMPT_COPY;
  }

  if (intent.intent === USER_INTENTS.RESEND_OTP && state.step === FLOW_STEPS.OTP) {
    nextForcedAssistantResponse = buildOtpResendReply(state);
  }

  if (intent.intent === USER_INTENTS.VERIFY_OTP && intent.data?.valid === false) {
    nextForcedAssistantResponse = `That OTP does not match, so I have not moved you to payment.

Please re-enter the 4-digit OTP. For this staging mock flow, use **1234**.`;
  }

  if (intent.intent === USER_INTENTS.VERIFY_OTP && intent.data?.valid !== false) {
    if (state.isQuoteExpired()) {
      state.refreshQuoteTimestamps();
      const paymentLink = buildPaymentLink(state);
      nextPaymentLinkFallback = paymentLink;
      nextShouldInjectPaymentLinkFallback = true;
      const summaryBox = buildSummaryBox(state);
      const paymentStepBlock = buildPaymentStepBlock(summaryBox, paymentLink);
      nextForcedAssistantResponse = `This quote was generated more than **30 minutes** ago, so I refreshed it before payment to keep the premium and total valid.

✅ **Quote refreshed. Same prices apply.**

${paymentStepBlock}`;
    } else {
      const paymentLink = buildPaymentLink(state);
      nextPaymentLinkFallback = paymentLink;
      nextShouldInjectPaymentLinkFallback = true;
      const summaryBox = buildSummaryBox(state);
      const paymentStepBlock = buildPaymentStepBlock(summaryBox, paymentLink);
      nextForcedAssistantResponse = `✅ All set!

${paymentStepBlock}`;
    }
  }

  if (intent.intent === USER_INTENTS.SELECT_PAYMENT && !nextForcedAssistantResponse) {
    if (state.isQuoteExpired()) {
      state.refreshQuoteTimestamps();
      const paymentLink = buildPaymentLink(state);
      nextPaymentLinkFallback = paymentLink;
      nextShouldInjectPaymentLinkFallback = true;
      const summaryBox = buildSummaryBox(state);
      const paymentStepBlock = buildPaymentStepBlock(summaryBox, paymentLink);
      nextForcedAssistantResponse = `This quote was generated more than **30 minutes** ago, so I refreshed it before payment to keep the premium and total valid.

✅ **Quote refreshed. Same prices apply.**

${paymentStepBlock}`;
    } else {
      const paymentLink = buildPaymentLink(state);
      nextPaymentLinkFallback = paymentLink;
      nextShouldInjectPaymentLinkFallback = true;
      const summaryBox = buildSummaryBox(state);
      const paymentStepBlock = buildPaymentStepBlock(summaryBox, paymentLink);
      nextForcedAssistantResponse = paymentStepBlock;
    }
  }

  if (intent.intent === USER_INTENTS.CHANGE_QUOTE && intent.data) {
    const currentInsurer = state.selectedQuote?.insurer || 'current insurer';
    const newKey = intent.data.newInsurer;
    const nextInsurerName = getInsurerByKey(newKey)?.displayName || newKey;
    pushSystem(openAiMessages, `User wants to change from ${currentInsurer} to ${nextInsurerName}. This will reset all selections (add-ons, road tax). Ask for confirmation: "Switching from **${currentInsurer}** to **${nextInsurerName}** will restart from the insurer step. Are you sure?"`);
  }

  if (intent.intent === USER_INTENTS.UNCLEAR_OR_PLAYFUL && !nextForcedAssistantResponse) {
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
2) recommend **12-month digital (RM 90.00)** as default convenience,
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

  if (intent.intent === USER_INTENTS.OTHER && !nextForcedAssistantResponse) {
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
        nextForcedAssistantResponse = buildUnavailablePreferredInsurerReply(state, latestMsg);
      } else {
        pushSystem(openAiMessages, `User response is unclear. Reply naturally:
1) brief acknowledgement,
2) answer/clarify their point first in one helpful line,
3) ask one consultative next action that keeps them engaged, for example:
"Would you like my recommendation, or do you already want to choose an insurer from the current options?"`);
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
"Would you like **Windscreen** (choose coverage amount), **Special Perils (RM 150.00)**, **Betterment waiver (RM 350.00)**, **E-hailing (RM 2,000.00)**, or **skip add-ons**?"`);
      } else {
        pushSystem(openAiMessages, `User response is unclear at add-ons step. Reply naturally in one short line, then ask one clear next-step question.
Use compact options only: "Windscreen (choose coverage amount), special perils (RM 150.00), betterment waiver (RM 350.00), e-hailing (RM 2,000.00), or skip?"
Do NOT paste the full add-ons menu unless user explicitly asks to see the options.`);
      }
    } else if (state.step === FLOW_STEPS.ROADTAX) {
      pushSystem(openAiMessages, `User response is unclear at road tax step. Reply naturally in one short line, then ask one clear next-step question.
Use compact options only: "12-month digital road tax (RM 90.00) or no road tax?"
Do NOT paste the full road tax menu unless user explicitly asks to see the options.`);
    }
  }

  const questionOrderInstruction = buildQuestionFirstThenStepCloseInstruction(state, { intent, messages, vehicleProfile });
  if (questionOrderInstruction && !lowConfidenceNeedsClarification && !nextForcedAssistantResponse) {
    pushSystem(openAiMessages, questionOrderInstruction);
  }

  if (lowConfidenceNeedsClarification && !nextForcedAssistantResponse) {
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
