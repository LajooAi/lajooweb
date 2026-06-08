export const PDPA_CONSENT_VERSION = 'pdpa-renewal-v1';
export const PDPA_CONSENT_PENDING_TYPE = 'pdpa_consent';

export function hasPdpaConsent(state) {
  return Boolean(state?.pdpaConsent?.accepted);
}

function normalizeText(message) {
  return String(message || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectPdpaConsentAcceptance(message, options = {}) {
  const text = normalizeText(message);
  if (!text || detectPdpaConsentRejection(text)) return false;

  const explicitAcceptance =
    /\b(i\s+)?(agree|consent|accept)\b/i.test(text) ||
    /\b(setuju|bersetuju|terima)\b/i.test(text);

  if (explicitAcceptance) return true;
  if (options.requireExplicit !== false) return false;

  return /^(yes|yeah|yep|yup|ok|okay|sure|proceed|continue|go ahead|can|boleh)\b/i.test(text);
}

export function isPdpaConsentAmbiguousAcceptance(message) {
  const text = normalizeText(message);
  if (!text || detectPdpaConsentAcceptance(text, { requireExplicit: true }) || detectPdpaConsentRejection(text)) {
    return false;
  }

  return /^(yes|yeah|yep|yup|ok|okay|sure|proceed|continue|go ahead|can|boleh)\b/i.test(text);
}

export function detectPdpaConsentRejection(message) {
  const text = normalizeText(message);
  return /^(no|nope|not now|later|cancel|decline|reject|don'?t agree|do not agree|tak nak|tidak|jangan)\b/i.test(text);
}

export function isPdpaConsentExplanationRequest(message) {
  const text = normalizeText(message);
  return (
    /\b(why|what for|purpose|how.*use|use.*for|data|privacy|pdpa|personal data|safe|secure|need.*ic|need.*owner)\b/i.test(text) ||
    /\b(kenapa|untuk apa|data peribadi)\b/i.test(text)
  );
}

export function hasPersonalContactInfo(personalInfo = {}) {
  return Boolean(personalInfo?.email || personalInfo?.phone || personalInfo?.address);
}

export function buildPdpaConsentState(overrides = {}) {
  return {
    accepted: false,
    acceptedAt: null,
    version: null,
    ...overrides,
  };
}

export function createPdpaPendingAction(reason = 'sensitive_data') {
  return {
    type: PDPA_CONSENT_PENDING_TYPE,
    reason,
    requestedAt: Date.now(),
    version: PDPA_CONSENT_VERSION,
  };
}

export function getPdpaConsentReason({
  state,
  intent,
  vehicleExtract,
  personalInfo,
} = {}) {
  if (hasPdpaConsent(state)) return null;

  if (hasPersonalContactInfo(personalInfo)) return 'personal_details_provided';
  if (vehicleExtract?.ownerId) return 'owner_id_provided';

  const step = state?.step;
  const hasPlate = Boolean(state?.plateNumber || vehicleExtract?.registrationNumber);
  const hasOwnerId = Boolean(state?.nricNumber);
  const wantsRenewal = intent?.intent === 'start_renewal';
  const isVehicleInfoTurn = intent?.intent === 'provide_info';
  const isPersonalDetailsStep = step === 'personal_details' || step === 'otp';

  if (isPersonalDetailsStep) return 'personal_details';
  if (hasPlate && !hasOwnerId && (isVehicleInfoTurn || step === 'start' || step === 'vehicle_lookup')) {
    return 'owner_id';
  }
  if (wantsRenewal && !hasOwnerId) return 'start_renewal';

  return null;
}

export function buildPdpaConsentRequestReply({ state, reason } = {}) {
  const plate = state?.plateNumber;
  const plateLine = plate
    ? `I have your vehicle plate **${plate}**.`
    : 'To start, please share your **vehicle plate number** (e.g. WXY 1234).';

  const targetLine = reason === 'personal_details' || reason === 'personal_details_provided'
    ? 'Before I collect your email, phone number, or address,'
    : 'Before I collect or use your owner identification number,';

  return `**Vehicle Info**

${plateLine}

${targetLine} please confirm you agree for LAJOO to use the information you provide to verify your vehicle, prepare quotes, process this renewal, and contact/send documents for this renewal.

Reply **I agree** to continue.`;
}

export function buildPdpaConsentAcceptedReply(state) {
  if (state?.step === 'personal_details' || state?.selectedRoadTax) {
    return `Thanks — consent recorded for this renewal.

Almost done — please share your **email**, **phone number**, and **address** so I can continue to OTP verification and policy document delivery.`;
  }

  if (state?.plateNumber && !state?.nricNumber) {
    return `Thanks — consent recorded for this renewal.

Please share your **Owner Identification Number** (NRIC / Foreign ID / Army IC / Police IC / Company Reg. No.) so I can verify your vehicle record.`;
  }

  return `Thanks — consent recorded for this renewal.

Please share your **vehicle plate number** and **Owner Identification Number** so I can verify your vehicle record.`;
}

export function buildPdpaConsentExplanationReply(state) {
  const nextLine = state?.plateNumber
    ? 'If you’re comfortable, reply **I agree** and then share your owner identification number.'
    : 'If you’re comfortable, reply **I agree** and share your vehicle plate number.';

  return `LAJOO uses these details only for this renewal journey: to verify the vehicle owner record, prepare quotes, process the renewal, send OTP/document updates, and support you if something goes wrong.

I won’t treat mock quotes or payment as final production confirmation. ${nextLine}`;
}

export function buildPdpaConsentRejectedReply() {
  return `No problem. I can still answer general insurance questions, but I can’t verify your vehicle, prepare renewal quotes, collect contact details, or continue to payment without this consent.`;
}

export function buildPdpaConsentExplicitReply() {
  return `For safety, I need clear consent before using owner ID or contact details.

Please reply **I agree** to continue, or ask me why I need it.`;
}
