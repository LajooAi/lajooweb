import { FLOW_STEPS, USER_INTENTS } from '../../lib/conversationState.js';
import {
  AVAILABLE_INSURERS,
  getInsurerKeysFromText,
} from '../../lib/insurerCatalog.js';

export const ADVISOR_INTENTS = {
  NONE: 'none',
  COMMERCIAL_BIAS_CHALLENGE: 'commercial_bias_challenge',
  PRIVACY_CONCERN: 'privacy_concern',
  HUMAN_HANDOFF: 'human_handoff',
  REJECT_RECOMMENDATION: 'reject_recommendation',
  QUOTE_FILTER_PREFERENCE: 'quote_filter_preference',
  QUOTE_OBJECTION: 'quote_objection',
  QUOTE_PRICE_EXPLANATION: 'quote_price_explanation',
  DELEGATE_DECISION: 'delegate_decision',
  ADDON_EXPLANATION: 'addon_explanation',
  COVERAGE_RISK_ADVICE: 'coverage_risk_advice',
  PAYMENT_CONCERN: 'payment_concern',
  DOCUMENT_DELIVERY: 'document_delivery',
  CONFUSED_USER: 'confused_user',
  ROADTAX_ALREADY_RENEWED: 'roadtax_already_renewed',
  ROADTAX_LEGALITY: 'roadtax_legality',
};

export const ADVISOR_TOPICS = {
  ALL_DRIVERS: 'all_drivers',
  LEGAL_LIABILITY_PASSENGERS: 'legal_liability_passengers',
  LLTP: 'lltp_negligence',
  STRIKE_RIOT: 'strike_riot',
  BETTERMENT: 'betterment_waiver',
  WINDSCREEN_AMOUNT: 'windscreen_amount',
  WINDSCREEN: 'windscreen',
  FLOOD: 'flood',
  E_HAILING: 'ehailing',
  NCD_RELIEF: 'ncd_relief',
  BODY_PAINTING: 'body_painting',
  PERSONAL_ACCIDENT: 'personal_accident',
  ADDON_CHANGE_WINDOW: 'addon_change_window',
  LOWEST_TOTAL: 'lowest_total',
  COMMERCIAL_BIAS: 'commercial_bias',
  QUOTE_PRICE_GAP: 'quote_price_gap',
  ADDRESS_PRIVACY: 'address_privacy',
  IC_PRIVACY: 'ic_privacy',
  PAYMENT_AFTER: 'payment_after',
  PAYMENT_STATUS: 'payment_status',
  DIGITAL_ROADTAX: 'digital_roadtax',
  ROADTAX_NEEDED: 'roadtax_needed',
  WHATSAPP_DOCUMENTS: 'whatsapp_documents',
};

const FLOW_ADVANCE_INTENTS = new Set([
  USER_INTENTS.SELECT_QUOTE,
  USER_INTENTS.SELECT_ADDON,
  USER_INTENTS.SELECT_ROADTAX,
  USER_INTENTS.SELECT_PAYMENT,
  USER_INTENTS.SUBMIT_DETAILS,
]);

const STATE_CORRECTION_INTENTS = new Set([
  USER_INTENTS.CHANGE_ADDONS,
  USER_INTENTS.CHANGE_VEHICLE,
  USER_INTENTS.CHANGE_ROADTAX,
  USER_INTENTS.CHANGE_PERSONAL_DETAILS,
  USER_INTENTS.RESET_RENEWAL,
]);

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function advisorResult(intent, options = {}) {
  return {
    intent,
    confidence: Number(options.confidence || 0.85),
    topic: options.topic || null,
    entities: options.entities || {},
    shouldAnswerFirst: options.shouldAnswerFirst !== false,
    shouldPreventFlowAdvance: !!options.shouldPreventFlowAdvance,
    reason: options.reason || intent,
  };
}

function noneResult() {
  return advisorResult(ADVISOR_INTENTS.NONE, {
    confidence: 0,
    shouldAnswerFirst: false,
    shouldPreventFlowAdvance: false,
    reason: 'no_advisor_intent_detected',
  });
}

function hasQuestionShape(text) {
  return /\?|^(what|why|how|which|when|where|can|could|should|do|does|is|are|will|would|need)\b/i.test(text);
}

function hasAny(text, pattern) {
  return pattern.test(String(text || ''));
}

function detectsInsurerRejection(text) {
  const mentioned = getInsurerKeysFromText(text);
  if (mentioned.length === 0) return null;

  const negativeNearInsurer = AVAILABLE_INSURERS
    .filter((insurer) => mentioned.includes(insurer.key))
    .map((insurer) => {
      const aliases = [insurer.shortName, insurer.displayName, ...insurer.aliases]
        .filter(Boolean)
        .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'));
      const aliasPattern = `(?:${aliases.join('|')})`;
      const before = new RegExp(`\\b(?:not|no|dont|don't|do not|except|exclude|avoid|anything but|other than|besides|without)\\b.{0,30}${aliasPattern}\\b`, 'i');
      const after = new RegExp(`${aliasPattern}\\b.{0,30}\\b(?:no|not|dont|don't|do not|cannot|can't|exclude|avoid)\\b`, 'i');
      return before.test(text) || after.test(text) ? insurer.key : null;
    })
    .filter(Boolean);

  if (negativeNearInsurer.length === 0) return null;
  return [...new Set(negativeNearInsurer)];
}

function detectsConventionalOnlyPreference(text) {
  return /\b(?:no|not|dont|don't|do not|avoid|exclude)\b.{0,30}\b(?:islamic|takaful|shariah|syariah)\b/i.test(text) ||
    /\b(?:conventional only|non[-\s]?takaful|not islamic)\b/i.test(text);
}

function detectAddOnTopic(text) {
  if (
    /\bcan\s+i\b.{0,35}\b(still|later|after|before payment|before paying)\b.{0,35}\b(add|include|change)\b/i.test(text) ||
    /\bcan\s+i\b.{0,35}\b(add|include|change)\b.{0,35}\b(still|later|after|before payment|before paying)\b/i.test(text)
  ) {
    return ADVISOR_TOPICS.ADDON_CHANGE_WINDOW;
  }
  if (/\b(wife|husband|spouse|dad|father|mum|mother|parent|family|friend|brother|sister|someone else|other people).{0,45}\b(drive|drives|driving|use|uses)\b|\b(all drivers?|named driver|additional driver)\b/i.test(text)) {
    return ADVISOR_TOPICS.ALL_DRIVERS;
  }
  if (/\blegal liability to passengers?|llp\b/i.test(text)) {
    return ADVISOR_TOPICS.LEGAL_LIABILITY_PASSENGERS;
  }
  if (/\blltp|negligence act|negligence\b/i.test(text)) {
    return ADVISOR_TOPICS.LLTP;
  }
  if (/\bstrike|riot|civil commotion|protest|demonstration\b/i.test(text)) {
    return ADVISOR_TOPICS.STRIKE_RIOT;
  }
  if (/\bzero betterment|betterment waiver|betterment|depreciation|new parts?|old parts?|expensive parts?|porsche|continental|luxury\b/i.test(text)) {
    return ADVISOR_TOPICS.BETTERMENT;
  }
  if (/\bwindscreen\b.{0,45}\b(amount|coverage|cover|how much|reasonable|pick|choose)|\b(amount|coverage|cover|how much|reasonable|pick|choose)\b.{0,45}\bwindscreen\b/i.test(text)) {
    return ADVISOR_TOPICS.WINDSCREEN_AMOUNT;
  }
  if (/\bwindscreen|wind screen|glass\b/i.test(text)) {
    return ADVISOR_TOPICS.WINDSCREEN;
  }
  if (/\bflood|special perils?|natural disaster|landslide|landslip|storm|basement|low[-\s]?lying|klang|shah alam|parking basement|banjir\b/i.test(text)) {
    return ADVISOR_TOPICS.FLOOD;
  }
  if (/\be[-\s]?hailing|ehailing|grab|indrive|ride[-\s]?sharing|weekend grab\b/i.test(text)) {
    return ADVISOR_TOPICS.E_HAILING;
  }
  if (/\bncd relief|current year ncd|protect ncd\b/i.test(text)) {
    return ADVISOR_TOPICS.NCD_RELIEF;
  }
  if (/\bbody painting|paint(?:ing)?\b/i.test(text)) {
    return ADVISOR_TOPICS.BODY_PAINTING;
  }
  if (/\bpersonal accident|pa cover\b/i.test(text)) {
    return ADVISOR_TOPICS.PERSONAL_ACCIDENT;
  }
  if (/\btoo expensive|lowest total|make it cheapest|minimum total|save money|budget only|cheap only|dont need add[-\s]?ons|don't need add[-\s]?ons\b/i.test(text)) {
    return ADVISOR_TOPICS.LOWEST_TOTAL;
  }
  return null;
}

function isAddOnAdviceRequest(text) {
  return /\b(which|what)\b.{0,40}\b(add[-\s]?ons?|need|choose|take|pick|recommend|skip)\b/i.test(text) ||
    /\b(do|should)\s+i\s+(need|take|choose)\b/i.test(text) ||
    /\b(?:what|which)\b.{0,70}\b(?:important|essential|must[-\s]?have|must\s+take|must\s+buy|must\s+add|priority|prioritise|prioritize|required|compulsory)\b/i.test(text) ||
    /\b(?:items?|add[-\s]?ons?|addons?|ones?)\b.{0,60}\b(?:important|essential|must[-\s]?have|must|priority|prioritise|prioritize|required|compulsory)\b/i.test(text) ||
    /\b(?:must|should)\s+i\s+(?:take|add|buy|choose|get)\b/i.test(text) ||
    /\b(?:must\s+take|must[-\s]?have|important\s+(?:items?|ones?|add[-\s]?ons?|addons?)|essential\s+(?:items?|ones?|add[-\s]?ons?|addons?))\b/i.test(text) ||
    /\b(just tell me what to take|you pick add[-\s]?ons?|recommend add[-\s]?ons?|can i skip add[-\s]?ons?)\b/i.test(text);
}

function isDelegateDecision(text) {
  return /\b(you decide|you choose|you pick|pick for me|choose for me|recommend for me|up to you|i trust you|anything la|anything lah|anything|whichever|whatever|your call|you know best)\b/i.test(text) ||
    /\b(choose|pick|decide)\b.{0,18}\b(anything|whatever|whichever|la|lah)\b/i.test(text) ||
    /\b(anything|whatever|whichever)\b.{0,18}\b(choose|pick|decide)\b/i.test(text);
}

function isPaymentConcern(text) {
  return /\b(after payment|after i pay|once i pay|covered immediately|coverage start|when covered|policy issued|issue policy|payment link|checkout|receipt|paid already|payment failed|bank transfer|cash|installment|card safe)\b/i.test(text);
}

function isPrivacyConcern(text) {
  return /\b(privacy|safe|secure|scam|data|pdpa|why (?:do )?you need|why need|dont want to give|don't want to give|can i not give|must i give)\b.{0,80}\b(ic|nric|address|phone|email|details|data)\b/i.test(text) ||
    /\b(ic|nric|address|phone|email|details|data)\b.{0,80}\b(privacy|safe|secure|scam|why need|why (?:do )?you need|dont want to give|don't want to give|can i not give|must i give)\b/i.test(text);
}

function privacyTopic(text) {
  if (/\baddress\b/i.test(text)) return ADVISOR_TOPICS.ADDRESS_PRIVACY;
  if (/\b(ic|nric)\b/i.test(text)) return ADVISOR_TOPICS.IC_PRIVACY;
  return 'personal_details_privacy';
}

function paymentTopic(text) {
  if (/\b(after payment|after i pay|once i pay|covered immediately|coverage start|when covered|policy issued|issue policy|receipt)\b/i.test(text)) {
    return ADVISOR_TOPICS.PAYMENT_AFTER;
  }
  return ADVISOR_TOPICS.PAYMENT_STATUS;
}

function detectsConfusion(text) {
  return /\b(confusing|confused|lost|blur|dont understand|don't understand|not understand|what now|what next|too many options|dunno|idk)\b/i.test(text);
}

function isQuotePriceGapQuestion(text) {
  return (
    /\b(?:why|how come|how|what about)\b.{0,90}\b(?:price|prices|premium|premiums|insurer|insurers|quote|quotes)\b.{0,90}\b(?:different|difference|vary|varies|gap|expensive|costly|high|higher|so much)\b/i.test(text) ||
    /\b(?:price|prices|premium|premiums)\b.{0,60}\b(?:different|difference|vary|varies|gap|so much|expensive|costly|high|higher)\b/i.test(text) ||
    /\b(?:some|one|other insurers?|generali|allianz|msig|lonpac)\b.{0,70}\b(?:so expensive|more expensive|costly|higher price|higher premium)\b/i.test(text)
  );
}

export function shouldAdvisorIntentOverrideFlow(advisorIntent, rawIntent) {
  if (!advisorIntent || advisorIntent.intent === ADVISOR_INTENTS.NONE) return false;
  if (STATE_CORRECTION_INTENTS.has(rawIntent?.intent)) return false;
  if (advisorIntent.shouldPreventFlowAdvance) return true;
  return FLOW_ADVANCE_INTENTS.has(rawIntent?.intent) && advisorIntent.shouldAnswerFirst;
}

export function buildIntentFromAdvisorIntent(rawIntent, advisorIntent) {
  if (!shouldAdvisorIntentOverrideFlow(advisorIntent, rawIntent)) return rawIntent;
  return {
    intent: USER_INTENTS.ASK_QUESTION,
    confidence: Math.max(Number(rawIntent?.confidence || 0), Number(advisorIntent?.confidence || 0)),
    data: {
      ...(rawIntent?.data || {}),
      advisorIntent: advisorIntent.intent,
      advisorTopic: advisorIntent.topic || null,
      advisorEntities: advisorIntent.entities || {},
      blockedOriginalIntent: rawIntent?.intent || null,
    },
  };
}

export function detectAdvisorIntent(message, { state = {}, intent = null } = {}) {
  const text = normalizeText(message);
  if (!text) return noneResult();

  const step = state?.step || null;

  if (/\b(human|agent|real person|person|staff|customer service|call me|whatsapp me|speak to someone|talk to someone|live chat)\b/i.test(text)) {
    return advisorResult(ADVISOR_INTENTS.HUMAN_HANDOFF, {
      confidence: 0.95,
      shouldPreventFlowAdvance: true,
      reason: 'user_requested_human_handoff',
    });
  }

  if (/\b(whatsapp|wa)\b.{0,60}\b(policy|document|docs|receipt|cover note)\b|\b(policy|document|docs|receipt|cover note)\b.{0,60}\b(whatsapp|wa)\b/i.test(text)) {
    return advisorResult(ADVISOR_INTENTS.DOCUMENT_DELIVERY, {
      confidence: 0.9,
      topic: ADVISOR_TOPICS.WHATSAPP_DOCUMENTS,
      shouldPreventFlowAdvance: true,
      reason: 'user_asked_for_whatsapp_document_delivery',
    });
  }

  if (/\b(?:old|previous|last)\s+(?:policy\s+)?address\b|\baddress\s+from\s+(?:old|previous|last)\s+policy\b/i.test(text)) {
    return advisorResult(ADVISOR_INTENTS.PRIVACY_CONCERN, {
      confidence: 0.88,
      topic: ADVISOR_TOPICS.ADDRESS_PRIVACY,
      shouldPreventFlowAdvance: true,
      reason: 'user_asked_to_use_previous_policy_address',
    });
  }

  if (isPrivacyConcern(text)) {
    return advisorResult(ADVISOR_INTENTS.PRIVACY_CONCERN, {
      confidence: 0.94,
      topic: privacyTopic(text),
      shouldPreventFlowAdvance: true,
      reason: 'user_has_privacy_or_data_collection_concern',
    });
  }

  if (/\b(sponsor|sponsored|commission|paid|pay you|kickback|biased|bias|pushing|promote|advertis(?:e|ing)|partner ranking|hidden ranking)\b/i.test(text)) {
    return advisorResult(ADVISOR_INTENTS.COMMERCIAL_BIAS_CHALLENGE, {
      confidence: 0.95,
      topic: ADVISOR_TOPICS.COMMERCIAL_BIAS,
      shouldPreventFlowAdvance: true,
      reason: 'user_challenged_recommendation_fairness',
    });
  }

  if (detectsConventionalOnlyPreference(text)) {
    return advisorResult(ADVISOR_INTENTS.QUOTE_FILTER_PREFERENCE, {
      confidence: 0.93,
      entities: { excludedInsurerKeys: ['takaful'], conventionalOnly: true },
      shouldPreventFlowAdvance: true,
      reason: 'user_requested_conventional_only_quote_filter',
    });
  }

  const rejectedInsurers = detectsInsurerRejection(text);
  if (rejectedInsurers) {
    return advisorResult(ADVISOR_INTENTS.REJECT_RECOMMENDATION, {
      confidence: 0.94,
      entities: { excludedInsurerKeys: rejectedInsurers },
      shouldPreventFlowAdvance: true,
      reason: 'user_rejected_specific_insurer',
    });
  }

  if (
    step === FLOW_STEPS.QUOTES &&
    /\b(my dad|my father|my wife|my husband|friend|mechanic|workshop|someone)\b.{0,80}\b(says?|said|told)\b.{0,80}\b(better|good|bad|avoid|trust)\b/i.test(text)
  ) {
    return advisorResult(ADVISOR_INTENTS.QUOTE_OBJECTION, {
      confidence: 0.87,
      entities: { insurerKeys: getInsurerKeysFromText(text) },
      shouldPreventFlowAdvance: true,
      reason: 'user_has_social_or_trust_objection_about_quote',
    });
  }

  if (step === FLOW_STEPS.QUOTES && isQuotePriceGapQuestion(text)) {
    return advisorResult(ADVISOR_INTENTS.QUOTE_PRICE_EXPLANATION, {
      confidence: 0.9,
      topic: ADVISOR_TOPICS.QUOTE_PRICE_GAP,
      shouldPreventFlowAdvance: true,
      reason: 'user_asked_why_quote_prices_differ',
    });
  }

  if (isDelegateDecision(text)) {
    return advisorResult(ADVISOR_INTENTS.DELEGATE_DECISION, {
      confidence: 0.9,
      shouldPreventFlowAdvance: FLOW_ADVANCE_INTENTS.has(intent?.intent),
      reason: 'user_delegated_decision_to_lajoo',
    });
  }

  const addonTopic = detectAddOnTopic(text);
  const explicitAddOnSelection = intent?.intent === USER_INTENTS.SELECT_ADDON &&
    !hasQuestionShape(text) &&
    !/\b(explain|what is|what's|why|need|should|recommend|worth|important|necessary|how does|meaning)\b/i.test(text);
  if (
    addonTopic &&
    !explicitAddOnSelection &&
    (step === FLOW_STEPS.ADDONS || hasQuestionShape(text) || isAddOnAdviceRequest(text) || addonTopic === ADVISOR_TOPICS.LOWEST_TOTAL)
  ) {
    const isRiskAdvice = [ADVISOR_TOPICS.FLOOD, ADVISOR_TOPICS.E_HAILING, ADVISOR_TOPICS.BETTERMENT, ADVISOR_TOPICS.LOWEST_TOTAL].includes(addonTopic);
    return advisorResult(isRiskAdvice ? ADVISOR_INTENTS.COVERAGE_RISK_ADVICE : ADVISOR_INTENTS.ADDON_EXPLANATION, {
      confidence: 0.9,
      topic: addonTopic,
      shouldPreventFlowAdvance: true,
      reason: `user_needs_addon_advice_${addonTopic}`,
    });
  }

  if (step === FLOW_STEPS.ADDONS && isAddOnAdviceRequest(text)) {
    return advisorResult(ADVISOR_INTENTS.COVERAGE_RISK_ADVICE, {
      confidence: 0.9,
      topic: 'general_addon_recommendation',
      shouldPreventFlowAdvance: true,
      reason: 'user_asked_which_addons_are_needed',
    });
  }

  if (/\b(already|done|settled|renewed)\b.{0,40}\b(road\s*tax|roadtax)\b|\b(road\s*tax|roadtax)\b.{0,40}\b(already|done|settled|renewed)\b/i.test(text)) {
    return advisorResult(ADVISOR_INTENTS.ROADTAX_ALREADY_RENEWED, {
      confidence: 0.93,
      shouldPreventFlowAdvance: true,
      reason: 'user_says_roadtax_already_renewed',
    });
  }

  const asksOnlyDigitalRoadTax =
    /\bwhy\b.{0,50}\b(only|just)\b.{0,35}\b(digital|road\s*tax|roadtax|12\s*(?:month|months)|one option)\b/i.test(text) ||
    /\bwhy\b.{0,60}\b(no|not available|cannot|can't|cant|disabled)\b.{0,35}\b(physical|delivery|deliver|printed|sticker)\b/i.test(text) ||
    /\b(why|how come)\b.{0,50}\b(digital only|only digital)\b/i.test(text);

  const asksSixMonthRoadTax = /\b(?:6|six)[-\s]*months?\b/i.test(text) &&
    /\b(road\s*tax|roadtax|renew)\b/i.test(text);
  if (
    asksOnlyDigitalRoadTax ||
    asksSixMonthRoadTax ||
    /\b(police|jpj|digital enough|digital roadtax enough|why need road\s*tax|why roadtax|insurance enough|road\s*tax.*need|need road\s*tax)\b/i.test(text)
  ) {
    return advisorResult(ADVISOR_INTENTS.ROADTAX_LEGALITY, {
      confidence: asksOnlyDigitalRoadTax ? 0.93 : 0.88,
      topic: (asksOnlyDigitalRoadTax || /police|digital enough/i.test(text)) ? ADVISOR_TOPICS.DIGITAL_ROADTAX : ADVISOR_TOPICS.ROADTAX_NEEDED,
      entities: { asksSixMonthRoadTax, asksOnlyDigitalRoadTax },
      shouldPreventFlowAdvance: true,
      reason: 'user_asked_roadtax_legality_or_practicality',
    });
  }

  if (isPaymentConcern(text)) {
    return advisorResult(ADVISOR_INTENTS.PAYMENT_CONCERN, {
      confidence: 0.9,
      topic: paymentTopic(text),
      shouldPreventFlowAdvance: true,
      reason: 'user_has_payment_or_issuance_question',
    });
  }

  if (detectsConfusion(text)) {
    return advisorResult(ADVISOR_INTENTS.CONFUSED_USER, {
      confidence: 0.82,
      shouldPreventFlowAdvance: true,
      reason: 'user_is_confused_or_lost',
    });
  }

  return noneResult();
}

export default detectAdvisorIntent;
