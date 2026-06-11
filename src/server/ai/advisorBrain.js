import { FLOW_STEPS, USER_INTENTS } from '../../lib/conversationState.js';
import { getInsurerKeysFromText } from '../../lib/insurerCatalog.js';

export const ADVISOR_BRAIN_DOMAINS = {
  GENERAL: 'general',
  VEHICLE: 'vehicle',
  QUOTES: 'quotes',
  ADDONS: 'addons',
  ROADTAX: 'roadtax',
  DETAILS: 'details',
  OTP: 'otp',
  PAYMENT: 'payment',
};

export const ADVISOR_BRAIN_ACTS = {
  NONE: 'none',
  QUESTION: 'question',
  SELECTION: 'selection',
  EXPLORATION: 'exploration',
  CHANGE: 'change',
  CORRECTION: 'correction',
  OBJECTION: 'objection',
  DELEGATION: 'delegation',
  CONFUSION: 'confusion',
  RISK_SIGNAL: 'risk_signal',
};

export const ADVISOR_PLAYBOOKS = {
  NONE: 'none',
  ANSWER_THEN_RESUME: 'answer_then_resume',
  APPLY_SELECTION: 'apply_selection',
  EXPLORE_OPTION: 'explore_option',
  CHANGE_SAFELY: 'change_safely',
  DECISION_GUIDANCE: 'decision_guidance',
  SALES_OBJECTION: 'sales_objection',
  CONFUSION_RECOVERY: 'confusion_recovery',
};

const ADDON_TOPIC_PATTERNS = [
  { topic: 'all_drivers', regex: /\b(wife|husband|spouse|dad|father|mum|mother|parent|family|friend|brother|sister|someone else|other people|all drivers?|additional driver|named driver)\b/i },
  { topic: 'legal_liability_passengers', regex: /\blegal liability to passengers?|llp\b/i },
  { topic: 'lltp_negligence', regex: /\blltp|negligence act|negligence\b/i },
  { topic: 'strike_riot', regex: /\bstrike|riot|civil commotion|protest|demonstration\b/i },
  { topic: 'betterment_waiver', regex: /\bzero betterment|betterment waiver|betterment|depreciation|new parts?|old parts?|expensive parts?|porsche|continental|luxury\b/i },
  { topic: 'windscreen_amount', regex: /\bwindscreen\b.{0,45}\b(amount|coverage|cover|how much|reasonable|pick|choose)|\b(amount|coverage|cover|how much|reasonable|pick|choose)\b.{0,45}\bwindscreen\b/i },
  { topic: 'windscreen', regex: /\bwindscreen|wind screen|glass\b/i },
  { topic: 'daily_driving', regex: /\b(?:drive|driving|commute|use|travel)\b.{0,55}\b(?:daily|every\s*day|everyday|a lot|alot|often|frequent|frequently|long[-\s]?distance|highway|mileage)\b|\b(?:daily|every\s*day|everyday|a lot|alot|often|frequent|frequently|long[-\s]?distance|highway|mileage)\b.{0,55}\b(?:drive|driving|commute|use|travel)\b/i },
  { topic: 'flood', regex: /\bflood|special perils?|natural disaster|landslide|landslip|storm|basement|low[-\s]?lying|klang|shah alam|parking basement|banjir\b/i },
  { topic: 'ehailing', regex: /\be[-\s]?hailing|ehailing|grab|indrive|ride[-\s]?sharing|weekend grab\b/i },
  { topic: 'ncd_relief', regex: /\bncd relief|current year ncd|protect ncd\b/i },
  { topic: 'body_painting', regex: /\bbody painting|paint(?:ing)?\b/i },
  { topic: 'personal_accident', regex: /\bpersonal accident|pa cover\b/i },
];

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasQuestionShape(text) {
  return /\?|^(what|why|how|which|when|where|can|could|should|do|does|is|are|will|would|need)\b/i.test(text);
}

function detectAddonTopic(text) {
  for (const item of ADDON_TOPIC_PATTERNS) {
    if (item.regex.test(text)) return item.topic;
  }
  return null;
}

function looksLikeAddonDecisionRequest(text) {
  return (
    /\b(which|what)\b.{0,70}\b(add[-\s]?ons?|addons?|need|choose|take|pick|recommend|important|necessary|essential|minimum|must[-\s]?have|must\s+take|priority|skip)\b/i.test(text) ||
    /\b(do|should)\s+i\s+(need|take|choose|skip)\b/i.test(text) ||
    /\bhelp\s+me\b.{0,30}\b(decide|choose|pick|select)\b/i.test(text) ||
    /\b(?:should|can|could)\s+i\s+skip\b/i.test(text) ||
    /\b(just tell me what to take|you pick add[-\s]?ons?|recommend add[-\s]?ons?)\b/i.test(text)
  );
}

function looksLikeDelegation(text) {
  return /\b(you decide|you choose|you pick|pick for me|choose for me|recommend for me|up to you|i trust you|anything la|anything lah|anything|whichever|whatever|your call|you know best)\b/i.test(text);
}

function looksLikeConfusion(text) {
  return /\b(confusing|confused|lost|blur|dont understand|don't understand|not understand|what now|what next|too many options|dunno|idk)\b/i.test(text);
}

function looksLikeChange(text) {
  return /\b(change|switch|edit|update|adjust|modify|redo|go back|back to|remove|delete|take out|take away|take off|drop|add|include|exclude|cancel)\b/i.test(text);
}

function looksLikeQuoteExploration(text) {
  return getInsurerKeysFromText(text).length === 1 &&
    /\b(look at|have a look|what about|how about|tell me|explain|details|compare|also|as well|consider|check)\b/i.test(text);
}

function looksLikeQuoteObjection(text) {
  return (
    /\b(?:direct|directly|from insurer|insurer direct|buy direct|go direct)\b.{0,80}\b(?:discount|cheaper|cheap|lower|save|10\s*%|ten\s*percent)\b/i.test(text) ||
    /\b(?:discount|cheaper|cheap|lower|save|10\s*%|ten\s*percent)\b.{0,80}\b(?:direct|directly|from insurer|insurer direct|buy direct|go direct)\b/i.test(text) ||
    /\b(sponsor|sponsored|commission|paid|kickback|biased|bias|pushing|promote|hidden ranking)\b/i.test(text)
  );
}

function inferDomain(text, state, rawIntent, topic) {
  if (/\b(otp|code|sms)\b/i.test(text)) return ADVISOR_BRAIN_DOMAINS.OTP;
  if (/\b(payment|pay|checkout|receipt|card|fpx|bank transfer|cash|covered immediately|policy issued)\b/i.test(text)) {
    return ADVISOR_BRAIN_DOMAINS.PAYMENT;
  }
  if (/\b(road\s*tax|roadtax|myjpj|jpj|e-lkm|elkm|sticker|digital)\b/i.test(text)) {
    return ADVISOR_BRAIN_DOMAINS.ROADTAX;
  }
  if (/\b(email|phone|address|ic|nric|privacy|pdpa|details)\b/i.test(text)) {
    return ADVISOR_BRAIN_DOMAINS.DETAILS;
  }
  if (topic || /\b(add[-\s]?ons?|addons?|windscreen|flood|special perils?|betterment|all drivers?|e[-\s]?hailing|grab|body painting|personal accident)\b/i.test(text)) {
    return ADVISOR_BRAIN_DOMAINS.ADDONS;
  }
  if (
    rawIntent?.intent === USER_INTENTS.SELECT_QUOTE ||
    rawIntent?.intent === USER_INTENTS.CHANGE_QUOTE ||
    getInsurerKeysFromText(text).length > 0 ||
    /\b(quote|quotes|insurer|premium|sum insured|cheapest|best|recommend|direct discount)\b/i.test(text)
  ) {
    return ADVISOR_BRAIN_DOMAINS.QUOTES;
  }
  if (/\b(plate|vehicle|car|owner id|foreign id|company reg|army|police)\b/i.test(text)) {
    return ADVISOR_BRAIN_DOMAINS.VEHICLE;
  }

  if (state?.step === FLOW_STEPS.ADDONS) return ADVISOR_BRAIN_DOMAINS.ADDONS;
  if (state?.step === FLOW_STEPS.QUOTES) return ADVISOR_BRAIN_DOMAINS.QUOTES;
  if (state?.step === FLOW_STEPS.ROADTAX) return ADVISOR_BRAIN_DOMAINS.ROADTAX;
  if (state?.step === FLOW_STEPS.PERSONAL_DETAILS) return ADVISOR_BRAIN_DOMAINS.DETAILS;
  if (state?.step === FLOW_STEPS.OTP) return ADVISOR_BRAIN_DOMAINS.OTP;
  if (state?.step === FLOW_STEPS.PAYMENT) return ADVISOR_BRAIN_DOMAINS.PAYMENT;
  return ADVISOR_BRAIN_DOMAINS.GENERAL;
}

function inferAct(text, rawIntent, domain, topic) {
  if (looksLikeConfusion(text)) return ADVISOR_BRAIN_ACTS.CONFUSION;
  if (looksLikeQuoteObjection(text)) return ADVISOR_BRAIN_ACTS.OBJECTION;
  if (looksLikeDelegation(text)) return ADVISOR_BRAIN_ACTS.DELEGATION;
  if (domain === ADVISOR_BRAIN_DOMAINS.QUOTES && looksLikeQuoteExploration(text)) return ADVISOR_BRAIN_ACTS.EXPLORATION;

  if (domain === ADVISOR_BRAIN_DOMAINS.ADDONS) {
    if (rawIntent?.intent === USER_INTENTS.SELECT_ADDON || rawIntent?.intent === USER_INTENTS.CHANGE_ADDONS) {
      return ADVISOR_BRAIN_ACTS.CHANGE;
    }
    if (topic === 'daily_driving' || looksLikeAddonDecisionRequest(text)) return ADVISOR_BRAIN_ACTS.RISK_SIGNAL;
  }

  if (looksLikeChange(text)) return ADVISOR_BRAIN_ACTS.CHANGE;
  if ([USER_INTENTS.CHANGE_VEHICLE, USER_INTENTS.CHANGE_ROADTAX, USER_INTENTS.CHANGE_PERSONAL_DETAILS].includes(rawIntent?.intent)) {
    return ADVISOR_BRAIN_ACTS.CORRECTION;
  }
  if ([USER_INTENTS.SELECT_QUOTE, USER_INTENTS.SELECT_ADDON, USER_INTENTS.SELECT_ROADTAX, USER_INTENTS.SELECT_PAYMENT].includes(rawIntent?.intent)) {
    return ADVISOR_BRAIN_ACTS.SELECTION;
  }
  if (hasQuestionShape(text) || rawIntent?.intent === USER_INTENTS.ASK_QUESTION) return ADVISOR_BRAIN_ACTS.QUESTION;
  return ADVISOR_BRAIN_ACTS.NONE;
}

function inferPlaybook(act, domain) {
  if (act === ADVISOR_BRAIN_ACTS.OBJECTION) return ADVISOR_PLAYBOOKS.SALES_OBJECTION;
  if (act === ADVISOR_BRAIN_ACTS.CONFUSION) return ADVISOR_PLAYBOOKS.CONFUSION_RECOVERY;
  if (act === ADVISOR_BRAIN_ACTS.DELEGATION || act === ADVISOR_BRAIN_ACTS.RISK_SIGNAL) return ADVISOR_PLAYBOOKS.DECISION_GUIDANCE;
  if (act === ADVISOR_BRAIN_ACTS.EXPLORATION) return ADVISOR_PLAYBOOKS.EXPLORE_OPTION;
  if (act === ADVISOR_BRAIN_ACTS.CHANGE || act === ADVISOR_BRAIN_ACTS.CORRECTION) return ADVISOR_PLAYBOOKS.CHANGE_SAFELY;
  if (act === ADVISOR_BRAIN_ACTS.SELECTION) return ADVISOR_PLAYBOOKS.APPLY_SELECTION;
  if (act === ADVISOR_BRAIN_ACTS.QUESTION) return ADVISOR_PLAYBOOKS.ANSWER_THEN_RESUME;
  return ADVISOR_PLAYBOOKS.NONE;
}

function shouldAnswerFirst(act, rawIntent) {
  if ([ADVISOR_BRAIN_ACTS.QUESTION, ADVISOR_BRAIN_ACTS.EXPLORATION, ADVISOR_BRAIN_ACTS.OBJECTION, ADVISOR_BRAIN_ACTS.CONFUSION, ADVISOR_BRAIN_ACTS.RISK_SIGNAL, ADVISOR_BRAIN_ACTS.DELEGATION].includes(act)) {
    return true;
  }
  return rawIntent?.intent === USER_INTENTS.ASK_QUESTION;
}

function shouldPreventFlowAdvance(act, rawIntent) {
  if ([ADVISOR_BRAIN_ACTS.EXPLORATION, ADVISOR_BRAIN_ACTS.OBJECTION, ADVISOR_BRAIN_ACTS.CONFUSION, ADVISOR_BRAIN_ACTS.RISK_SIGNAL, ADVISOR_BRAIN_ACTS.DELEGATION].includes(act)) {
    return true;
  }
  return rawIntent?.intent === USER_INTENTS.ASK_QUESTION && act === ADVISOR_BRAIN_ACTS.QUESTION;
}

export function classifyAdvisorBrain(message, { state = {}, rawIntent = null } = {}) {
  const text = normalizeText(message);
  if (!text) {
    return {
      domain: ADVISOR_BRAIN_DOMAINS.GENERAL,
      act: ADVISOR_BRAIN_ACTS.NONE,
      playbook: ADVISOR_PLAYBOOKS.NONE,
      topic: null,
      confidence: 0,
      shouldAnswerFirst: false,
      shouldPreventFlowAdvance: false,
      signals: [],
    };
  }

  const topic = detectAddonTopic(text);
  const domain = inferDomain(text, state, rawIntent, topic);
  const act = inferAct(text, rawIntent, domain, topic);
  const playbook = inferPlaybook(act, domain);
  const confidence = act === ADVISOR_BRAIN_ACTS.NONE ? 0.35 : 0.82;
  const signals = [
    hasQuestionShape(text) ? 'question_shape' : null,
    topic ? `topic:${topic}` : null,
    getInsurerKeysFromText(text).length > 0 ? 'insurer_mentioned' : null,
    looksLikeChange(text) ? 'change_language' : null,
    looksLikeDelegation(text) ? 'delegation_language' : null,
  ].filter(Boolean);

  return {
    domain,
    act,
    playbook,
    topic,
    confidence,
    shouldAnswerFirst: shouldAnswerFirst(act, rawIntent),
    shouldPreventFlowAdvance: shouldPreventFlowAdvance(act, rawIntent),
    signals,
  };
}

export function buildAdvisorBrainInstruction(brain, state) {
  if (!brain || brain.playbook === ADVISOR_PLAYBOOKS.NONE) return null;

  const step = state?.step || 'unknown';
  const lines = [
    'ADVISOR BRAIN V2',
    `Detected human act: ${brain.act}`,
    `Detected domain: ${brain.domain}`,
    `Detected playbook: ${brain.playbook}`,
    brain.topic ? `Detected topic: ${brain.topic}` : null,
    `Current renewal step: ${step}`,
    '',
    'Response rule:',
    '- Understand the human meaning before protecting the form flow.',
    '- Answer or apply the user intent first, then return to the current safe renewal step.',
    '- Ask only one practical next-step question.',
  ].filter(Boolean);

  if (brain.playbook === ADVISOR_PLAYBOOKS.EXPLORE_OPTION) {
    lines.push('- The user is exploring, not selecting. Do not move to add-ons or mark an insurer selected unless the user clearly confirms.');
  } else if (brain.playbook === ADVISOR_PLAYBOOKS.DECISION_GUIDANCE) {
    lines.push('- Give a direct recommendation or decision rule first. Do not answer with a generic menu.');
    lines.push('- Use the current car, quote, add-on, road-tax, or payment context when available.');
  } else if (brain.playbook === ADVISOR_PLAYBOOKS.CHANGE_SAFELY) {
    lines.push('- Apply clear safe changes when the intent is explicit. Preserve unaffected progress and invalidate only stale totals/payment links.');
  } else if (brain.playbook === ADVISOR_PLAYBOOKS.SALES_OBJECTION) {
    lines.push('- Acknowledge the concern without praising competitors. Sell LAJOO value clearly and keep the user moving inside LAJOO.');
  } else if (brain.playbook === ADVISOR_PLAYBOOKS.CONFUSION_RECOVERY) {
    lines.push('- Reduce choices into the smallest useful set. Do not dump all options.');
  }

  return lines.join('\n');
}

export default classifyAdvisorBrain;
