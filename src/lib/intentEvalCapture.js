import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CAPTURE_FILE = 'tests/evals/captured/unknown-intents.jsonl';
const LOW_CONFIDENCE_THRESHOLD = 0.68;

const STEP_LABELS = {
  start: 'start',
  vehicle_lookup: 'start',
  quotes: 'quotes',
  addons: 'addons',
  roadtax: 'roadtax',
  personal_details: 'personal_details',
  otp: 'otp',
  payment: 'payment',
};

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeStep(step) {
  const key = String(step || 'start').toLowerCase();
  return STEP_LABELS[key] || key || 'start';
}

function normalizeMessageForHash(message) {
  return normalizeWhitespace(message).toLowerCase();
}

function sanitizeMessage(text) {
  let out = normalizeWhitespace(text);
  if (!out) return out;

  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  out = out.replace(/\b0?1[0-9][\s\-]?[0-9]{3,4}[\s\-]?[0-9]{4}\b/g, '[phone]');
  out = out.replace(/\b\d{12}\b/g, '[owner_id]');
  out = out.replace(/\b[A-Z]{1,3}\s?\d{1,4}[A-Z]{0,3}\b/gi, '[plate]');
  out = out.replace(/https?:\/\/\S+/gi, '[url]');
  return out;
}

function hasQuestionSignal(message) {
  return /\?|what|why|how|where|which|can i|do i|should i|explain|tell me/i.test(message);
}

function hasRenewalSignal(message) {
  return /renew|insurance|road\s*tax|roadtax|quote|start|begin|continue/i.test(message);
}

function hasGreetingSignal(message) {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening|salam|assalam)\b/i.test(message);
}

function hasTestingSignal(message) {
  return /\b(test|testing|check|checking|ping|trial|demo)\b/i.test(message);
}

function hasVehicleIdentifierSignal(message) {
  return /\b[A-Z]{1,3}\s?\d{1,4}[A-Z]{0,3}\b/i.test(message) || /\b\d{12}\b/.test(message);
}

function hasInsurerSelectionSignal(message) {
  return /(takaful|ikhlas|etiqa|allianz)/i.test(message) &&
    /(choose|pick|go with|select|take|ok maybe|recommend|which)/i.test(message);
}

function hasAddonSignal(message) {
  return /\b(windscreen|special perils|flood|ehailing|e-hailing|skip|add-on|addon)\b/i.test(message) || /\b[1-3]\b/.test(message);
}

function hasRoadTaxSignal(message) {
  return /\b(road tax|roadtax|12\s*month|12m|digital|no road tax|insurance only)\b/i.test(message);
}

function hasDetailsSignal(message) {
  return (
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i.test(message) ||
    /\b0?1[0-9][\s\-]?[0-9]{3,4}[\s\-]?[0-9]{4}\b/.test(message) ||
    /\b(jalan|jln|lorong|taman|persiaran|lebuh)\b/i.test(message)
  );
}

function hasOtpSignal(message) {
  return /^\s*\d{4}\s*$/.test(message) || /\botp\b/i.test(message);
}

function hasPaymentSignal(message) {
  return /\b(pay|payment|card|fpx|e-?wallet|bank|online transfer)\b/i.test(message);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean).map(String))];
}

export function inferExpectedIntentCandidates({ step, message, detectedIntent }) {
  const normalizedStep = normalizeStep(step);
  const msg = normalizeWhitespace(message).toLowerCase();
  let candidates = [];

  if (normalizedStep === 'start') {
    if (hasVehicleIdentifierSignal(msg)) candidates = ['provide_info'];
    else if (hasGreetingSignal(msg)) candidates = ['greeting', 'ask_question', 'unclear_or_playful'];
    else if (hasTestingSignal(msg)) candidates = ['unclear_or_playful', 'ask_question', 'other'];
    else if (hasRenewalSignal(msg)) candidates = ['start_renewal', 'ask_question'];
    else if (hasQuestionSignal(msg)) candidates = ['ask_question', 'start_renewal'];
    else candidates = ['ask_question', 'unclear_or_playful', 'other'];
  } else if (normalizedStep === 'quotes') {
    if (hasInsurerSelectionSignal(msg)) candidates = ['select_quote', 'ask_question'];
    else if (hasQuestionSignal(msg)) candidates = ['ask_question', 'other'];
    else candidates = ['other', 'unclear_or_playful', 'ask_question'];
  } else if (normalizedStep === 'addons') {
    if (hasAddonSignal(msg)) candidates = ['select_addon', 'ask_question'];
    else if (hasQuestionSignal(msg)) candidates = ['ask_question', 'other'];
    else candidates = ['other', 'unclear_or_playful', 'ask_question'];
  } else if (normalizedStep === 'roadtax') {
    if (hasRoadTaxSignal(msg)) candidates = ['select_roadtax', 'ask_question'];
    else if (hasQuestionSignal(msg)) candidates = ['ask_question', 'other'];
    else candidates = ['other', 'unclear_or_playful', 'ask_question'];
  } else if (normalizedStep === 'personal_details') {
    if (hasDetailsSignal(msg)) candidates = ['submit_details', 'other'];
    else if (hasQuestionSignal(msg)) candidates = ['ask_question', 'other'];
    else candidates = ['other', 'ask_question'];
  } else if (normalizedStep === 'otp') {
    if (hasOtpSignal(msg)) candidates = ['verify_otp', 'ask_question', 'other'];
    else candidates = ['ask_question', 'other'];
  } else if (normalizedStep === 'payment') {
    if (hasPaymentSignal(msg)) candidates = ['select_payment', 'ask_question'];
    else if (hasQuestionSignal(msg)) candidates = ['ask_question', 'other'];
    else candidates = ['other', 'ask_question'];
  } else {
    candidates = ['other', 'ask_question'];
  }

  if (detectedIntent) {
    candidates = unique([detectedIntent, ...candidates]);
  }

  return candidates.slice(0, 5);
}

export function getIntentCaptureReason({ intent, lowConfidenceNeedsClarification }) {
  if (!intent) return null;
  const detected = String(intent.intent || '').toLowerCase();
  const confidence = Number(intent.confidence || 0);

  if (lowConfidenceNeedsClarification) return 'low_confidence_clarification';
  if (detected === 'other' || detected === 'unclear_or_playful') return 'uncertain_intent';
  if (confidence < LOW_CONFIDENCE_THRESHOLD) return 'low_confidence_intent';

  return null;
}

function shouldCaptureEnabled() {
  const explicit = String(process.env.EVAL_CAPTURE_ENABLED || '').toLowerCase();
  if (explicit === '1' || explicit === 'true' || explicit === 'yes') return true;
  if (explicit === '0' || explicit === 'false' || explicit === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}

function getCaptureFilePath() {
  const configured = String(process.env.EVAL_CAPTURE_FILE || '').trim();
  if (!configured) return path.join(process.cwd(), DEFAULT_CAPTURE_FILE);
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

export async function appendIntentCaptureSample({
  reason,
  step,
  userMessage,
  assistantReply,
  intent,
  lowConfidenceNeedsClarification = false,
  state = null,
}) {
  if (!reason || !shouldCaptureEnabled()) return false;

  const rawMessage = normalizeWhitespace(userMessage);
  if (!rawMessage) return false;

  const safeMessage = sanitizeMessage(rawMessage);
  if (!safeMessage) return false;

  const messageHash = crypto
    .createHash('sha256')
    .update(normalizeMessageForHash(rawMessage))
    .digest('hex')
    .slice(0, 16);

  const detectedIntent = String(intent?.intent || 'other');
  const record = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    reason,
    step: normalizeStep(step),
    detectedIntent,
    confidence: Number(intent?.confidence || 0),
    lowConfidenceNeedsClarification: !!lowConfidenceNeedsClarification,
    userMessage: safeMessage,
    userMessageHash: messageHash,
    assistantReplyPreview: sanitizeMessage(String(assistantReply || '')).slice(0, 300),
    suggestedExpectedOneOf: inferExpectedIntentCandidates({
      step,
      message: safeMessage,
      detectedIntent,
    }),
    stateSnapshot: {
      hasVehicleIdentification: !!state?.hasCompleteVehicleIdentification?.(),
      hasSelectedQuote: !!state?.selectedQuote,
      hasRoadTax: !!state?.selectedRoadTax,
      addOnsCount: Array.isArray(state?.selectedAddOns) ? state.selectedAddOns.length : 0,
      hasPersonalDetails: !!state?.personalDetails,
      experimentVariant: state?.experiment?.promptVariant || 'A',
    },
  };

  const captureFile = getCaptureFilePath();
  const dir = path.dirname(captureFile);

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(captureFile, `${JSON.stringify(record)}\n`, 'utf8');
    return true;
  } catch (error) {
    console.error('[EvalCapture] Failed to append capture sample:', error?.message || error);
    return false;
  }
}

