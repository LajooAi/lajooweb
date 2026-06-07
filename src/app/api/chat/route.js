/**
 * LAJOO Chat API - Simplified Conversational AI
 *
 * Focus: Pure AI conversation quality and stability
 * - No UI cards or markers
 * - Natural conversational flow
 * - Smart intent detection for insurance guidance
 */

import { NextResponse } from "next/server";
import { ConversationState, detectUserIntent, USER_INTENTS, FLOW_STEPS } from "@/lib/conversationState";
import { getQuotes } from "@/lib/insuranceData";
import {
  AVAILABLE_INSURERS,
  AVAILABLE_INSURER_CHOICE_TEXT,
  AVAILABLE_INSURER_NAMES_TEXT,
  AVAILABLE_INSURER_OPTIONS_WITH_PRICES,
  UNAVAILABLE_INSURER_REGEX,
  getInsurerByKey,
  getInsurerKeysFromText,
  findInsurerKeyByText,
} from "@/lib/insurerCatalog";
import { AI_FUNCTIONS } from "@/lib/aiFunctions";
import {
  searchInsurerKnowledgeFromDb,
} from "@/lib/insurerKnowledgeDb";
import {
  vehicleLookup as gatewayVehicleLookup,
  createQuoteJob,
  getQuoteResult,
  repriceQuote,
  createProposal,
  submitProposal,
  createPaymentIntent,
  confirmPaymentIntent,
  issuePolicy,
  InsurerGatewayError,
} from "@/lib/insurers/platform";
import { extractPersonalInfo, extractVehicleInfo } from "@/utils/nlpExtractor";
import { buildConversationDecision } from "@/server/ai/orchestrator";
import {
  buildTurnPlan,
  TURN_FORCED_RESPONSES,
} from "@/server/ai/turnPlanner";
import {
  applyDeterministicFlowHandlers,
} from "@/server/ai/flowHandlers";
import {
  buildProductionOpenAiMessages,
} from "@/server/ai/productionOpenAiMessageBuilder";
import {
  appendKnowledgeSourceTraceToMetadata,
  logKnowledgeSourceTrace,
} from "@/server/ai/sourceTrace";
import {
  shouldSuppressStepLine,
} from "@/server/ai/responsePolicy";
import {
  parseRecommendedInsurerFromAssistantMessage,
  isVehicleDetailsRejectionMessage,
  wasLastAssistantVehicleConfirmation,
} from "@/lib/flowGuards";
import { appendIntentCaptureSample, getIntentCaptureReason } from "@/lib/intentEvalCapture";
import {
  ADDONS_CLOSE_QUESTION,
  ADD_ON_BY_ID,
  ADD_ON_CATALOG,
  DEFAULT_WINDSCREEN_COVERAGE,
  buildAddOnsFromSelection,
  calculateWindscreenPremium,
  extractWindscreenCoverageAmount,
  getAddOnCatalogItem,
  addOnIdsFromState,
} from "@/server/insurance/addonEngine";
import {
  PRINTED_ROAD_TAX_EFFECTIVE_DATE,
  PRINTED_ROAD_TAX_POLICY_NOTE,
  canUseDeliveredRoadTax,
  getRoadTaxDisplayName,
  roadTaxOptionFromState,
} from "@/server/insurance/roadTaxEngine";
import {
  STAMP_DUTY_AMOUNT,
  calculateCurrentGrandTotal,
  calculateSummaryAmounts,
  getQuoteInsurerKey,
  getQuotesFromState,
  mapGatewayQuotesToInternal,
  quoteIdForCurrentSelection,
  quoteSelectionFromIntent,
} from "@/server/insurance/quoteEngine";
import {
  canFallbackForGatewayError,
  lookupSandboxVehicle,
} from "@/server/insurance/sandboxVehicleGateway";
import {
  appendAssistantMessageForStorage,
  getStateFromSession,
  loadChatSession,
  normalizeChatSessionId,
  resolveMessagesForTurn,
  saveChatSession,
  serializeStateForClient,
} from "@/server/chat/sessionStore";
import { createPayment, PAYMENT_STATUS } from "@/lib/paymentStore";

// ============================================================================
// DETERMINISTIC BLOCK BUILDERS — code-generated markdown the AI must include
// ============================================================================

function formatPlateNumberForDisplay(plate) {
  if (!plate) return '-';
  const compact = String(plate).replace(/\s+/g, '').toUpperCase();
  const match = compact.match(/^([A-Z]{1,3})(\d{1,4})([A-Z]{0,3})$/);
  if (!match) return compact;
  const [, prefix, number, suffix] = match;
  return suffix ? `${prefix} ${number} ${suffix}` : `${prefix} ${number}`;
}

function getPolicyEffectiveRangeDisplay(options = {}) {
  const monthFormat = options?.month === 'long' ? 'long' : 'short';
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() + 30); // roughly next renewal
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1); // inclusive 12-month coverage window
  const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: monthFormat, year: 'numeric' });
  return `${fmt(start)} - ${fmt(end)}`;
}

const PERSONAL_DETAIL_EXAMPLES = {
  Email: 'name@email.com',
  'Phone number': '0123456789',
  Address: 'No 12, Jalan Setia 1, 47000 Shah Alam, Selangor',
};
const OTP_PROMPT_COPY = `Perfect ✅
I’ve sent a **4-digit OTP** to your phone or email.
Please enter it below to verify and continue.`;

const AVAILABLE_INSURER_MENTION_REGEX = new RegExp(
  AVAILABLE_INSURERS
    .flatMap((insurer) => [insurer.shortName, insurer.displayName, ...insurer.aliases])
    .map((value) => String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'))
    .join('|'),
  'i'
);

const DEFAULT_TRANSACTION_STATE = {
  quoteId: null,
  reprice: null,
  proposalId: null,
  proposalStatus: null,
  paymentIntentId: null,
  paymentSnapshotId: null,
  paymentStatus: null,
  policyNumber: null,
  policyStatus: null,
  lastError: null,
};

const GATEWAY_PAYMENT_METHOD_MAP = {
  card: 'card',
  fpx: 'fpx',
  ewallet: 'ewallet',
  'cc-instalment': 'card',
  bnpl: 'bnpl',
};

function getSharedNcdPercent(quotes = []) {
  if (!Array.isArray(quotes) || quotes.length === 0) return null;
  const ncdValues = quotes
    .map((q) => Number(q?.pricing?.ncdPercent))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (ncdValues.length === 0) return null;
  const first = ncdValues[0];
  return ncdValues.every((value) => value === first) ? first : null;
}

function formatNcdPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/\.?0+$/, '');
}

function ensureTransactionState(state) {
  if (!state || typeof state !== 'object') return { ...DEFAULT_TRANSACTION_STATE };
  if (!state.transaction || typeof state.transaction !== 'object') {
    state.transaction = { ...DEFAULT_TRANSACTION_STATE };
  } else {
    state.transaction = {
      ...DEFAULT_TRANSACTION_STATE,
      ...state.transaction,
    };
  }
  return state.transaction;
}

function ensurePaymentSnapshotId(state) {
  const tx = ensureTransactionState(state);
  if (!tx.paymentSnapshotId) {
    tx.paymentSnapshotId = tx.paymentIntentId || `PAY-${Date.now()}`;
  }
  return tx.paymentSnapshotId;
}

function normalizeOwnerIdType(ownerIdType, ownerId) {
  if (ownerIdType) return ownerIdType;
  const raw = String(ownerId || '').replace(/\s+/g, '').replace(/-/g, '');
  if (/^\d{12}$/.test(raw)) return 'nric';
  return 'other_id';
}

function formatOwnerId(ownerId) {
  const raw = String(ownerId || '').replace(/\s+/g, '');
  if (/^\d{12}$/.test(raw)) {
    return `${raw.slice(0, 6)}-${raw.slice(6, 8)}-${raw.slice(8)}`;
  }
  return raw;
}

function maskOwnerId(ownerId) {
  const raw = String(ownerId || '').replace(/\s+/g, '').replace(/-/g, '');
  if (/^\d{12}$/.test(raw)) {
    return `${raw.slice(0, 6)}-${raw.slice(6, 8)}-&bull;&bull;&bull;&bull;`;
  }
  if (raw.length > 4) {
    return `${raw.slice(0, Math.max(0, raw.length - 4))}&bull;&bull;&bull;&bull;`;
  }
  return raw || '-';
}

function effectiveDateIso(daysFromNow = 30) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function formatMoneyTwoDecimals(value) {
  return Number(value || 0).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildWindscreenCoveragePrompt(summaryBox, pendingAddOnIds = []) {
  const pendingOtherAddOns = pendingAddOnIds
    .filter((id) => id !== 'windscreen')
    .map((id) => getAddOnCatalogItem(id)?.name)
    .filter(Boolean);
  const pendingLine = pendingOtherAddOns.length
    ? `I will keep **${pendingOtherAddOns.join(', ')}** selected too.`
    : '';

  return `${summaryBox}

${formatStepLine(3, 'Add-ons')}

For **Windscreen**, I need to know how much coverage you want first.

Examples:
- RM 500 coverage = RM 75.00
- RM 1,000 coverage = RM 150.00
- RM 2,000 coverage = RM 300.00

${pendingLine ? `${pendingLine}\n\n` : ''}Reply with the windscreen coverage amount, for example **RM 2,000**.`;
}

function mapGatewayVehicleToProfile(state, lookupData, quoteOptions = []) {
  const ownerIdRaw = String(state?.nricNumber || '').replace(/\s+/g, '');
  const ownerIdType = lookupData?.owner_id_type || normalizeOwnerIdType(state?.ownerIdType, ownerIdRaw);

  return {
    plateNumber: lookupData?.plate_number || state?.plateNumber || '',
    ownerNRIC: ownerIdRaw,
    ownerNRICFormatted: formatOwnerId(ownerIdRaw),
    make: lookupData?.vehicle?.make || '',
    model: lookupData?.vehicle?.model || '',
    year: Number(lookupData?.vehicle?.year || 0),
    engineCC: Number(lookupData?.vehicle?.engine_cc || 0),
    marketValueMin: null,
    marketValueMax: null,
    coverType: 'Comprehensive',
    currentInsurer: 'Takaful Ikhlas',
    ncdPercent: Number(lookupData?.ncd_percent || 0),
    eHailing: String(lookupData?.usage_type || '').toLowerCase() === 'ehailing',
    ownerIdType,
    sampleId: lookupData?.sample_id || null,
    vehicleRefId: lookupData?.vehicle_ref_id || null,
    usageType: lookupData?.usage_type || 'private',
    eligibility: lookupData?.eligibility || null,
    address: {
      line1: '',
      line2: '',
      postcode: lookupData?.address?.postcode || '',
      city: lookupData?.address?.city || '',
      state: lookupData?.address?.state || '',
    },
    quoteOptions: Array.isArray(quoteOptions) ? quoteOptions : [],
  };
}

async function syncRepriceFromGateway(state) {
  const tx = ensureTransactionState(state);
  const quoteId = quoteIdForCurrentSelection(state);
  if (!quoteId || !state?.selectedRoadTax) {
    return { ok: false, skipped: true, reason: 'missing_quote_or_roadtax' };
  }

  tx.quoteId = quoteId;

  try {
    const response = await repriceQuote(quoteId, {
      owner_id_type: state.ownerIdType || 'nric',
      selected_addons: addOnIdsFromState(state),
      roadtax_option: roadTaxOptionFromState(state),
    });
    const data = response?.data || null;
    tx.reprice = {
      quoteId,
      grandTotal: Number(data?.grand_total || 0),
      breakdown: data?.breakdown || null,
      currency: data?.currency || 'MYR',
    };
    tx.lastError = null;
    return { ok: true, data };
  } catch (error) {
    tx.lastError = {
      stage: 'reprice',
      code: error?.code || null,
      message: error?.message || 'Failed to reprice quote',
      at: new Date().toISOString(),
    };
    return { ok: false, error };
  }
}

function customerPayloadFromState(state) {
  // We keep sensitive values masked/boolean in state for safety.
  // Proposal API mock requires customer.email to exist, so use placeholders.
  return {
    email: state?.personalDetails?.email ? 'customer@lajoo.test' : 'customer@lajoo.test',
    phone: state?.personalDetails?.phone ? '0123456789' : '0123456789',
    address: state?.personalDetails?.address ? 'Address provided via chat' : 'Address provided via chat',
  };
}

async function ensureProposalSubmittedInGateway(state) {
  const tx = ensureTransactionState(state);
  if (tx.proposalId && tx.proposalStatus === 'SUBMITTED') {
    return { ok: true, proposalId: tx.proposalId };
  }

  const quoteId = tx.quoteId || quoteIdForCurrentSelection(state);
  if (!quoteId) {
    tx.lastError = {
      stage: 'proposal',
      code: 'MISSING_QUOTE_ID',
      message: 'Cannot create proposal without quote_id',
      at: new Date().toISOString(),
    };
    return { ok: false, reason: 'missing_quote_id' };
  }

  tx.quoteId = quoteId;

  try {
    const proposalResponse = await createProposal({
      quote_id: quoteId,
      customer: customerPayloadFromState(state),
      vehicle_ref_id: state?.vehicleInfo?.vehicleRefId || undefined,
    });
    const proposalId = proposalResponse?.data?.proposal_id;
    if (!proposalId) {
      throw new Error('Proposal response missing proposal_id');
    }

    tx.proposalId = proposalId;
    tx.proposalStatus = proposalResponse?.data?.status || 'DRAFT';

    const submitResponse = await submitProposal(proposalId, {});
    tx.proposalStatus = submitResponse?.data?.status || 'SUBMITTED';
    tx.lastError = null;

    return { ok: true, proposalId };
  } catch (error) {
    tx.lastError = {
      stage: 'proposal',
      code: error?.code || null,
      message: error?.message || 'Failed to create/submit proposal',
      at: new Date().toISOString(),
    };
    return { ok: false, error };
  }
}

async function ensurePaymentIntentInGateway(state) {
  const tx = ensureTransactionState(state);
  if (tx.paymentIntentId && ['PENDING', 'PAID'].includes(String(tx.paymentStatus || '').toUpperCase())) {
    return { ok: true, paymentIntentId: tx.paymentIntentId };
  }

  const proposalResult = await ensureProposalSubmittedInGateway(state);
  if (!proposalResult.ok || !proposalResult.proposalId) {
    return { ok: false, error: proposalResult.error || new Error('Proposal is not ready for payment intent') };
  }

  try {
    const computedTotal = calculateCurrentGrandTotal(state);
    const repricedTotal = Number(tx?.reprice?.grandTotal || 0);
    const amount = computedTotal > 0 ? computedTotal : repricedTotal;
    const paymentIntentResponse = await createPaymentIntent({
      proposal_id: proposalResult.proposalId,
      amount,
    });
    tx.paymentIntentId = paymentIntentResponse?.data?.payment_intent_id || null;
    tx.paymentStatus = paymentIntentResponse?.data?.status || 'PENDING';
    tx.lastError = null;

    if (!tx.paymentIntentId) {
      throw new Error('Payment intent response missing payment_intent_id');
    }
    return { ok: true, paymentIntentId: tx.paymentIntentId };
  } catch (error) {
    tx.lastError = {
      stage: 'payment_intent',
      code: error?.code || null,
      message: error?.message || 'Failed to create payment intent',
      at: new Date().toISOString(),
    };
    return { ok: false, error };
  }
}

function normalizeGatewayPaymentMethod(method) {
  const key = String(method || '').toLowerCase();
  return GATEWAY_PAYMENT_METHOD_MAP[key] || 'card';
}

async function processPaymentAndIssuePolicyInGateway(state, method) {
  const tx = ensureTransactionState(state);

  const paymentIntentResult = await ensurePaymentIntentInGateway(state);
  if (!paymentIntentResult.ok || !paymentIntentResult.paymentIntentId) {
    return { ok: false, error: paymentIntentResult.error || new Error('Payment intent unavailable') };
  }

  if (!tx.proposalId) {
    return { ok: false, error: new Error('Proposal ID missing') };
  }

  try {
    const confirmResponse = await confirmPaymentIntent(paymentIntentResult.paymentIntentId, {
      payment_method: normalizeGatewayPaymentMethod(method),
    });
    tx.paymentStatus = confirmResponse?.data?.status || 'PAID';

    const policyResponse = await issuePolicy({
      proposal_id: tx.proposalId,
      payment_status: tx.paymentStatus || 'PAID',
    });
    tx.policyNumber = policyResponse?.data?.policy_number || null;
    tx.policyStatus = policyResponse?.data?.status || 'ISSUED';
    tx.lastError = null;

    return {
      ok: true,
      paymentIntentId: tx.paymentIntentId,
      policyNumber: tx.policyNumber,
      paymentStatus: tx.paymentStatus,
      policyStatus: tx.policyStatus,
    };
  } catch (error) {
    tx.lastError = {
      stage: 'payment_confirm_or_issue',
      code: error?.code || null,
      message: error?.message || 'Failed to confirm payment or issue policy',
      at: new Date().toISOString(),
    };
    return { ok: false, error };
  }
}

function buildPaymentFailureReply(error, state) {
  const code = String(error?.code || '').toUpperCase();
  if (code === 'PAYMENT_DECLINED') {
    return `Payment was declined by the issuer. Please try another payment method.

${buildPaymentStepBlock(buildSummaryBox(state), buildPaymentLink(state))}`;
  }
  if (code === 'DOWNSTREAM_TIMEOUT') {
    return `Payment gateway is taking too long right now. Please retry in a moment.

${buildPaymentStepBlock(buildSummaryBox(state), buildPaymentLink(state))}`;
  }
  if (code === 'RATE_LIMITED') {
    return `We are receiving too many requests right now. Please wait about 30 seconds and try again.`;
  }
  return `I couldn't complete payment processing right now. Please try again.

${buildPaymentStepBlock(buildSummaryBox(state), buildPaymentLink(state))}`;
}

function buildPolicyIssuedReply(state) {
  const tx = ensureTransactionState(state);
  const computedTotal = calculateCurrentGrandTotal(state);
  const repricedTotal = Number(tx?.reprice?.grandTotal || 0);
  const total = computedTotal > 0 ? computedTotal : repricedTotal;
  return `✅ Payment successful and your policy is issued.

**Policy Number:** ${tx.policyNumber || 'POL-ISSUED'}
**Payment Reference:** ${tx.paymentIntentId || 'PAY-INT-0001'}
**Total Paid:** RM ${total.toLocaleString()}

Your policy documents are ready.`;
}

async function loadVehicleAndQuotesFromGateway(state) {
  const ownerId = String(state?.nricNumber || '').replace(/\s+/g, '');
  const ownerIdType = normalizeOwnerIdType(state?.ownerIdType, ownerId);
  const lookupPayload = {
    plate_number: String(state?.plateNumber || '').replace(/\s+/g, '').toUpperCase(),
    owner_id_type: ownerIdType,
    owner_id: ownerId,
    usage_type: state?.vehicleInfo?.usageType || 'private',
  };

  try {
    const lookupResponse = await gatewayVehicleLookup(lookupPayload);
    const lookupData = lookupResponse?.data || null;

    if (!lookupData || !lookupData.vehicle_ref_id) {
      return { vehicleProfile: null, notFound: true };
    }

    let quoteOptions = [];
    try {
      const quoteJobResponse = await createQuoteJob({
        sample_id: lookupData.sample_id,
        vehicle_ref_id: lookupData.vehicle_ref_id,
        coverage_type: 'comprehensive',
        effective_date: effectiveDateIso(30),
      });
      const jobId = quoteJobResponse?.data?.job_id;
      if (jobId) {
        const quoteResultResponse = await getQuoteResult(jobId);
        const gatewayQuotes = quoteResultResponse?.data?.quotes || [];
        quoteOptions = mapGatewayQuotesToInternal(gatewayQuotes);
      }
    } catch (quoteError) {
      if (quoteError instanceof InsurerGatewayError && quoteError.code === 'UW_DECLINED') {
        console.warn('[insurer-gateway] Underwriting declined for vehicle', lookupData?.sample_id || lookupData?.plate_number);
      } else {
        console.warn('[insurer-gateway] Unable to retrieve quote result, using fallback quote catalog.', quoteError?.message || quoteError);
      }
    }

    const vehicleProfile = mapGatewayVehicleToProfile(state, lookupData, quoteOptions);
    return { vehicleProfile, notFound: false };
  } catch (error) {
    if (error instanceof InsurerGatewayError && error.status === 404 && error.code === 'VEHICLE_NOT_FOUND') {
      return { vehicleProfile: null, notFound: true };
    }

    if (canFallbackForGatewayError(error)) {
      const sandboxLookupData = lookupSandboxVehicle(lookupPayload);
      if (sandboxLookupData?.vehicle_ref_id) {
        console.warn(
          '[insurer-gateway] Gateway unavailable; using local/preview sandbox vehicle fallback.',
          sandboxLookupData.sample_id
        );
        return {
          vehicleProfile: mapGatewayVehicleToProfile(state, sandboxLookupData, []),
          notFound: false,
          usedSandboxFallback: true,
        };
      }
    }

    console.warn('[insurer-gateway] Vehicle lookup failed.', error?.message || error);
    return {
      vehicleProfile: null,
      notFound: false,
      serviceUnavailable: true,
      errorCode: error?.code || null,
    };
  }
}

function sanitizePersonalDetailExtractionInput(message) {
  let normalized = String(message || '').toLowerCase();
  normalized = normalized.replace(/[\r\n]+/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  normalized = normalized.replace(/\b(?:ignore|ingore)\s+(?:previous|preivous)\s+(?:instructions?|intsructions?|istructions?)[\s\S]*$/i, '').trim();
  normalized = normalized.replace(/[^\p{L}\p{N}\s?!.,:'"-]+$/gu, '').trim();
  normalized = normalized
    .replace(/\b(?:boleh|obleh|boeh|boelh|bloeh|can|leh)\s*ah\??(?:\s*please)?$/i, '')
    .replace(/\b(?:boleh|obleh|boeh|boelh|bloeh|can|leh)\??(?:\s*please)?$/i, '')
    .trim();
  return normalized || String(message || '').trim();
}

function asNonEmptyString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function collectPersonalDetailsFromMessages(messages = []) {
  const collected = { email: null, phone: null, address: null };
  if (!Array.isArray(messages)) return collected;

  for (const msg of messages) {
    if (msg?.role !== 'user') continue;
    const content = sanitizePersonalDetailExtractionInput(String(msg?.content || ''));
    if (!content) continue;

    const extracted = extractPersonalInfo(content);
    if (extracted.email) collected.email = extracted.email;
    if (extracted.phone) collected.phone = extracted.phone;
    if (extracted.address) collected.address = extracted.address;
  }

  return collected;
}

function buildPersonalDetailExampleList(labels = ['Email', 'Phone number', 'Address']) {
  return labels
    .map((label) => `- **${label}** (e.g. ${PERSONAL_DETAIL_EXAMPLES[label] || 'provided'})`)
    .join('\n');
}

function buildPersonalDetailsRequest(labels = ['Email', 'Phone number', 'Address']) {
  return `Almost done — please **share your details** before payment. I’ll use them for OTP verification and to send your policy documents.

${buildPersonalDetailExampleList(labels)}`;
}

function detectLikelyPersonalDetailTypos(text, extracted = {}) {
  if (!text || typeof text !== 'string') return [];

  const lower = text.toLowerCase();
  const issues = [];
  const hasLikelyEmailToken =
    /\b[a-z0-9._%+-]+\.[a-z]{2,}\b/i.test(text) ||
    /@/.test(text);
  if (hasLikelyEmailToken && !extracted.email) {
    issues.push('Email format looks incomplete.');
  }

  const hasLikelyPhoneToken =
    /\b(phone|tel|hp|contact)\b/i.test(lower) ||
    /(?:\+?60|0?1)\D*\d{5,}/i.test(text);
  if (hasLikelyPhoneToken && !extracted.phone) {
    issues.push('Phone number format looks incomplete.');
  }

  const hasLikelyAddressToken =
    /\b(address|addr|jalan|jln|lorong|taman|seksyen|section|kampung|kg)\b/i.test(lower) ||
    text.includes(',');
  if (hasLikelyAddressToken && !extracted.address) {
    issues.push('Address looks incomplete.');
  }

  return issues;
}

function buildPrintedRoadTaxRestrictionReply(state) {
  const eligibilityLine = canUseDeliveredRoadTax(state)
    ? 'Printed road tax is available only for Foreign ID or Company vehicles, and your registration type is eligible.'
    : 'Printed or physical road tax is not available for individual-owned vehicles.';

  return `${eligibilityLine}

${PRINTED_ROAD_TAX_POLICY_NOTE}

I can proceed with **12 months (Digital) — RM 90** or **no road tax** right now. Which would you like?`;
}

function isPaymentCompletionClaim(message) {
  const text = String(message || '').toLowerCase();
  return (
    /\b(payment|pay|paid|bayar|payment successful|payment success)\b/.test(text) &&
    /\b(done|successful|success|completed|complete|already|paid|settled|made)\b/.test(text)
  );
}

function buildUnverifiedPaymentClaimReply(state) {
  const currentStep = state?.step;
  const base = `I can’t verify payment yet because a secure checkout has not been completed in LAJOO. I also cannot mark a policy as paid from chat alone.`;

  if (currentStep === FLOW_STEPS.PERSONAL_DETAILS) {
    return `${base}

Before payment, I still need your details:

${buildPersonalDetailsRequest()}`;
  }

  if (currentStep === FLOW_STEPS.OTP) {
    return `${base}

Please enter the **4-digit OTP** first. After verification, I’ll show the secure payment step.`;
  }

  if (currentStep === FLOW_STEPS.PAYMENT) {
    return `${base}

Please use the secure checkout link shown above. Once the payment provider confirms success, LAJOO can update the payment status.`;
  }

  if (currentStep === FLOW_STEPS.ROADTAX) {
    return `${base}

Before payment, please choose road tax first: **12 months (Digital) — RM 90** or **no road tax**.`;
  }

  if (currentStep === FLOW_STEPS.ADDONS) {
    return `${base}

Before payment, please confirm your add-ons first, or say **skip add-ons**.`;
  }

  return `${base}

Let’s complete the renewal details first, then I’ll guide you to the secure payment step.`;
}

function updateLastRecommendedInsurerMemory(state, assistantReply) {
  if (!state || state.selectedQuote) {
    if (state) state.lastRecommendedInsurer = null;
    return;
  }

  if (state.step !== FLOW_STEPS.QUOTES) {
    return;
  }

  const recommendedInsurer = parseRecommendedInsurerFromAssistantMessage(assistantReply);
  state.lastRecommendedInsurer = recommendedInsurer || null;
}

function getQuoteForSummary(state) {
  const selectedInsurer = String(state?.selectedQuote?.insurer || '').toLowerCase();
  if (!selectedInsurer) return null;
  return getQuotesFromState(state).find((q) =>
    String(q?.insurer?.displayName || '').toLowerCase() === selectedInsurer
  ) || null;
}

function getInsurerLogoForSummary(insurerName) {
  const insurer = getInsurerByKey(findInsurerKeyByText(insurerName));
  return insurer?.logoUrl || '';
}

function getInsurerDisplayForSummary(insurerName) {
  const insurer = getInsurerByKey(findInsurerKeyByText(insurerName));
  return insurer?.summaryName || insurerName || 'Selected insurer';
}

function getInsuranceSectionTitle(insurerName) {
  const insurer = getInsurerByKey(findInsurerKeyByText(insurerName));
  return insurer?.type === 'takaful' ? 'Insurance/Takaful' : 'Insurance';
}

function getSummaryVehicleLine(state) {
  const profile = state?.vehicleInfo || {};
  const plate = formatPlateNumberForDisplay(profile.plateNumber || state?.plateNumber || '-');
  const baseModelDisplay = [profile.year, profile.make, profile.model].filter(Boolean).join(' ');
  const engineSize = Number.isFinite(Number(profile.engineCC)) && Number(profile.engineCC) > 0
    ? `${(Number(profile.engineCC) / 1000).toFixed(1).replace(/\.0$/, '')}L`
    : '';
  const modelDisplay = baseModelDisplay
    ? [baseModelDisplay, engineSize].filter(Boolean).join(' ')
    : 'Vehicle';
  return `${plate} · ${modelDisplay}`;
}

function getSummaryAddOnName(addOn) {
  const raw = String(addOn?.name || addOn?.shortName || 'Add-on');
  const lower = raw.toLowerCase();
  if (lower.includes('special perils') || lower.includes('flood')) return 'Inclusion of Special Perils';
  if (lower.includes('windscreen')) {
    const coverage = Number(addOn?.coverageAmount || 0);
    return coverage > 0
      ? `Windscreen Coverage RM ${formatMoneyTwoDecimals(coverage)}`
      : 'Windscreen Coverage';
  }
  if (lower.includes('e-hailing') || lower.includes('ehailing')) return 'E-hailing Cover';
  return raw;
}

function buildSummaryCardData(state) {
  if (!state?.selectedQuote) return null;

  const quote = getQuoteForSummary(state);
  const insurerName = state.selectedQuote?.insurer || quote?.insurer?.displayName || 'Selected insurer';
  const coverType = state?.vehicleInfo?.coverType || state?.selectedQuote?.coverType || quote?.coverType || 'Comprehensive';
  const sumInsured = Number(state?.selectedQuote?.sumInsured || quote?.sumInsured || 0);
  const priceBefore = Number(state?.selectedQuote?.priceBefore || quote?.pricing?.basePremium || state?.selectedQuote?.priceAfter || 0);
  const ncdPercent = Number(state?.selectedQuote?.ncdPercent ?? quote?.pricing?.ncdPercent ?? 0);
  const amounts = calculateSummaryAmounts(state);
  const addOns = Array.isArray(state.selectedAddOns)
    ? state.selectedAddOns.map((addOn) => ({
        name: getSummaryAddOnName(addOn),
        price: Number(addOn?.price || 0),
      }))
    : [];
  const selectedRoadTax = state.selectedRoadTax || null;

  return {
    logoUrl: getInsurerLogoForSummary(insurerName),
    insurerName: getInsurerDisplayForSummary(insurerName),
    vehicleLine: getSummaryVehicleLine(state),
    sumInsured,
    policyPeriod: getPolicyEffectiveRangeDisplay({ month: 'long' }),
    coverType,
    insuranceTitle: getInsuranceSectionTitle(insurerName),
    premiumDescription: `Premium RM ${formatMoneyTwoDecimals(priceBefore)} - NCD ${formatNcdPercent(ncdPercent) || '0'}%`,
    insurancePrice: amounts.insurance,
    addOns,
    addOnsSelected: addOns.length > 0,
    addOnsConfirmed: !!state.addOnsConfirmed,
    taxDescription: `SST (8%) + Stamp Duty (RM ${formatMoneyTwoDecimals(STAMP_DUTY_AMOUNT)})`,
    taxPrice: amounts.tax,
    roadTaxSelected: !!selectedRoadTax && Number(selectedRoadTax?.price || 0) > 0,
    roadTaxDescription: selectedRoadTax
      ? getRoadTaxDisplayName(selectedRoadTax)
      : 'Not selected yet',
    roadTaxPrice: amounts.roadTax,
    total: amounts.total,
  };
}

function buildAddOnsCardData(state) {
  if (!state?.selectedQuote) return null;
  const selectedAddOns = Array.isArray(state.selectedAddOns) ? state.selectedAddOns : [];
  const selectedIds = selectedAddOns.map((addOn) => String(addOn?.id || '').toLowerCase()).filter(Boolean);
  const selectedWindscreen = selectedAddOns.find((addOn) => String(addOn?.id || addOn?.name || '').toLowerCase().includes('windscreen'));

  return {
    selectedIds,
    defaultWindscreenCoverage: Number(selectedWindscreen?.coverageAmount ?? 0),
    options: ADD_ON_CATALOG.map((item) => ({
      id: item.id,
      number: item.number,
      name: item.name,
      price: item.hasCoverageInput
        ? calculateWindscreenPremium(selectedWindscreen?.coverageAmount ?? 0)
        : Number(item.price || 0),
      hasCoverageInput: !!item.hasCoverageInput,
      defaultCoverage: item.defaultCoverage || null,
      recommended: !!item.recommended,
      info: item.info,
    })),
  };
}

function buildRoadTaxCardData(state) {
  if (!state?.selectedQuote) return null;
  const physicalAvailable = canUseDeliveredRoadTax(state);

  return {
    defaultOptionId: '12month-digital',
    physicalAvailable,
    options: [
      {
        id: '12month-digital',
        label: '12 months digital road tax',
        description: 'Updates instantly in MYJPJ app',
        price: 90,
        available: true,
        message: '12 months digital road tax',
      },
      {
        id: '12month-physical',
        label: '12 months physical + delivery',
        description: physicalAvailable
          ? 'MYJPJ app and delivered to you'
          : 'Only for Foreign ID or Company Vehicles',
        price: physicalAvailable ? 100 : null,
        available: physicalAvailable,
        unavailableLabel: physicalAvailable ? null : 'Not available',
        message: '12 months physical + delivery',
      },
      {
        id: 'none',
        label: 'No, just insurance',
        price: null,
        available: true,
        message: 'No, just insurance',
      },
    ],
  };
}

function buildPaymentCardData(state, options = {}) {
  if (!state?.selectedQuote) return null;
  const checkout = buildPaymentCheckoutData(state, options);

  return {
    total: checkout.total,
    href: checkout.href,
    icons: {
      card: '/icons/payment-card.svg',
      lock: '/icons/payment-lock.svg',
      guard: '/icons/payment-shield.svg',
    },
  };
}

async function persistPaymentSnapshotForState(state, sessionId) {
  if (!state?.selectedQuote) return null;

  const checkout = buildPaymentCheckoutData(state, { sessionId });
  const tx = ensureTransactionState(state);
  const expiresAt = state.quoteValidUntil && Number.isFinite(Number(state.quoteValidUntil))
    ? Number(state.quoteValidUntil)
    : Date.now() + 30 * 60 * 1000;

  const snapshot = await createPayment({
    paymentId: checkout.paymentId,
    sessionId,
    provider: 'mock',
    providerMode: 'snapshot',
    status: PAYMENT_STATUS.REQUIRES_PROVIDER,
    total: checkout.total,
    currency: 'MYR',
    insurer: checkout.insurer,
    plate: checkout.plate,
    insurance: checkout.insurance,
    addons: checkout.addons,
    tax: checkout.tax,
    roadtax: checkout.roadtax,
    paymentAvailable: false,
    canIssuePolicy: false,
    checkoutData: {
      paymentId: checkout.paymentId,
      href: checkout.href,
      total: checkout.total,
      insurer: checkout.insurer,
      plate: checkout.plate,
      insurance: checkout.insurance,
      addons: checkout.addons,
      tax: checkout.tax,
      roadtax: checkout.roadtax,
      insurerDisplay: checkout.insurerDisplay,
      logo: checkout.logo,
      vehicleLine: checkout.vehicleLine,
      coverType: checkout.coverType,
      sumInsured: checkout.sumInsured,
      priceBefore: checkout.priceBefore,
      ncd: checkout.ncd,
      policyPeriod: checkout.policyPeriod,
      insuranceTitle: checkout.insuranceTitle,
      roadtaxName: checkout.roadtaxName,
      addonsDetail: checkout.addonsDetail,
    },
    breakdown: {
      total: checkout.total,
      insurance: checkout.insurance,
      addons: checkout.addons,
      tax: checkout.tax,
      roadtax: checkout.roadtax,
    },
    expiresAt,
  });

  tx.paymentSnapshotId = checkout.paymentId;
  return snapshot;
}

/** Build the quote summary box from current state */
function buildSummaryBox(state) {
  const insurer = state.selectedQuote?.insurer || 'Not selected';
  const insurerPrice = Number(state.selectedQuote?.priceAfter || 0);
  const plateDisplay = formatPlateNumberForDisplay(state?.vehicleInfo?.plateNumber || state?.plateNumber);
  const policyEffectiveDisplay = getPolicyEffectiveRangeDisplay({ month: 'long' });
  const insurerQuote = getQuoteForSummary(state);
  const coverType = state?.vehicleInfo?.coverType || state?.selectedQuote?.coverType || 'Comprehensive';
  const sumInsured = state?.selectedQuote?.sumInsured || insurerQuote?.sumInsured || null;
  const priceBefore = Number(state?.selectedQuote?.priceBefore || insurerQuote?.pricing?.basePremium || insurerPrice || 0);
  const ncdPercent = Number(state?.selectedQuote?.ncdPercent ?? insurerQuote?.pricing?.ncdPercent ?? 0);
  const amounts = calculateSummaryAmounts(state);

  const logo = getInsurerLogoForSummary(insurer);
  const insurerLine = insurerPrice
    ? `![${insurer}](${logo}) ${insurer} — RM ${formatMoneyTwoDecimals(insurerPrice)}`
    : 'Not selected';

  const addOnsBlock = state.selectedAddOns.length > 0
    ? `**Add-ons:**  \n${state.selectedAddOns.map(a => `${a.name} — RM ${formatMoneyTwoDecimals(a.price || 0)}`).join('  \n')}`
    : state.addOnsConfirmed
      ? '**Add-ons:** None — RM 0.00'
      : '**Add-ons:** Not selected yet — RM 0.00';

  const roadTaxLine = state.selectedRoadTax && state.selectedRoadTax.price > 0
    ? `${getRoadTaxDisplayName(state.selectedRoadTax)} - RM ${formatMoneyTwoDecimals(state.selectedRoadTax.price)}`
    : state.selectedRoadTax ? `${getRoadTaxDisplayName(state.selectedRoadTax)} - RM 0.00` : 'Not selected yet — RM 0.00';

return `<span style="font-size:1.12em;display:block">**✓ Renewal Summary** (${plateDisplay})</span>

**Policy Period:** ${policyEffectiveDisplay}  
**Sum Insured:** ${sumInsured ? `RM ${sumInsured.toLocaleString()}` : 'N/A'}  
**Cover Type:** ${coverType}

**${getInsuranceSectionTitle(insurer)}:** ${insurerLine}  
Premium RM ${formatMoneyTwoDecimals(priceBefore)} - NCD ${formatNcdPercent(ncdPercent) || '0'}%  
${addOnsBlock}  
**Tax:** SST (8%) + Stamp Duty (RM ${formatMoneyTwoDecimals(STAMP_DUTY_AMOUNT)}) — RM ${formatMoneyTwoDecimals(amounts.tax)}  
**Road Tax:** ${roadTaxLine}

**Total:** &nbsp;<u>RM ${formatMoneyTwoDecimals(amounts.total)}</u>`;
}

/** Build the quote cards block */
function buildQuotesBlock(state) {
  const quotes = getQuotesFromState(state);
  const quoteBlocks = quotes.map((q) => {
    const logo = q.insurer.logoUrl;
    const name = q.insurer.displayName;
    const final = q.pricing.finalPremium;
    const base = q.pricing.basePremium;
    const si = q.sumInsured.toLocaleString();
    const ncdDisplay = formatNcdPercent(q?.pricing?.ncdPercent);
    const ncdSuffix = ncdDisplay ? ` (${ncdDisplay}% NCD)` : '';
    const features = q.insurer.features
      .map((f) => `<span style="display:block">✓ ${f}</span>`)
      .join('\n');

    return `<span style="display:block;font-size:1.1em;line-height:1.3"><img src="${logo}" alt="${name}" style="height:1em;vertical-align:-0.08em;margin-right:0.2em" /> <strong>${name}</strong> — <strong>RM ${final}</strong></span>
<span style="display:block">Sum Insured: RM ${si}</span>
${features}
<span style="display:block">~~RM ${base.toLocaleString()}~~ → RM ${final}${ncdSuffix}</span>`;
  });

  return quoteBlocks.join('\n\n');
}

function buildQuoteSelectionReply(state) {
  return `${formatStepLine(2, 'Choose Insurer')}

Great, here's what we have:

${buildQuotesBlock(state)}

Which option would you like to go with, or would you like my recommendation?`;
}

/** Build the add-ons menu */
function buildAddOnsMenu() {
  return `1. **Windscreen** — choose coverage amount
2. **Special Perils (Flood & Natural Disaster)** — RM ${formatMoneyTwoDecimals(ADD_ON_BY_ID.flood.price)}
3. **E-hailing** — RM ${formatMoneyTwoDecimals(ADD_ON_BY_ID.ehailing.price)}

E-hailing add-on is compulsory for vehicles used for e-hailing services like Grab and others.`;
}

/** Build the road tax menu */
function buildRoadTaxMenu(state) {
  const printedRoadTaxNote = PRINTED_ROAD_TAX_POLICY_NOTE;

  return `<span style="display:block">Would you like to renew road tax together ?</span>
<span style="display:block;margin-top:0.45em"><strong>12 months (Digital)</strong> — RM 90</span>
<span style="display:block">✓ Updates instantly in MyJPJ.</span>
<span style="display:block;margin-top:0.2em;opacity:0.7">${printedRoadTaxNote}</span>`;
}

/** Build the vehicle info block from a profile */
function buildVehicleBlock(profile) {
  if (!profile) return '';
  const plateDisplay = formatPlateNumberForDisplay(profile.plateNumber);
  const engineCc = Number.isFinite(Number(profile.engineCC))
    ? Number(profile.engineCC).toLocaleString()
    : String(profile.engineCC || '-');
  const engineSize = Number.isFinite(Number(profile.engineCC))
    ? (Number(profile.engineCC) / 1000).toFixed(1).replace(/\.0$/, '')
    : '';
  const baseModelDisplay = [profile.year, profile.make, profile.model].filter(Boolean).join(' ') || '-';
  const modelDisplay = engineSize && !String(baseModelDisplay).includes(engineSize)
    ? `${baseModelDisplay} ${engineSize} (Auto-${engineCc}cc)`
    : `${baseModelDisplay} (Auto-${engineCc}cc)`;
  const quoteSums = Array.isArray(profile.quoteOptions)
    ? profile.quoteOptions
        .map((quote) => Number(quote?.sumInsured || quote?.coverage?.sum_insured || 0))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const marketMin = Number.isFinite(Number(profile.marketValueMin)) && Number(profile.marketValueMin) > 0
    ? Number(profile.marketValueMin)
    : Math.min(...quoteSums);
  const marketMax = Number.isFinite(Number(profile.marketValueMax)) && Number(profile.marketValueMax) > 0
    ? Number(profile.marketValueMax)
    : Math.max(...quoteSums);
  const marketValue = Number.isFinite(marketMin) && Number.isFinite(marketMax)
    ? `RM ${marketMin.toLocaleString()} - RM ${marketMax.toLocaleString()}`
    : '-';
  const ownerId = maskOwnerId(profile.ownerNRIC || profile.ownerNRICFormatted);
  const ncd = Number.isFinite(Number(profile.ncdPercent))
    ? `${Number(profile.ncdPercent)}%`
    : String(profile.ncdPercent || '-');
  const coverageType = String(profile.coverType || '-');
  const policyPeriod = getPolicyEffectiveRangeDisplay({ month: 'long' });

  return `<span style="display:block;font-size:18px;font-weight:800;color:#000000">${plateDisplay}</span>
<span style="display:block;font-weight:700">${modelDisplay}</span>
<span style="display:block;height:0;width:350px;max-width:100%;border-top:1px solid #e5e7eb;margin:5px 0 7px"></span>
<span style="display:block;font-weight:400"><strong>Policy Period :</strong> ${policyPeriod}</span>
<span style="display:block;font-weight:400"><strong>Market Value :</strong> ${marketValue}</span>
<span style="display:block;font-weight:400"><strong>Owner IC :</strong> ${ownerId}</span>
<span style="display:block;font-weight:400"><strong>Coverage Type:</strong> ${coverageType}</span>
<span style="display:block;font-weight:400"><strong>No Claim Discount (NCD):</strong> ${ncd}</span>`;
}

function buildVehicleFoundReply(profile) {
  return `Found your vehicle!

${buildVehicleBlock(profile)}

Is this correct?`;
}

function buildVehicleNcdConcernReply(profile) {
  return `I understand your concern. The NCD value is sourced directly from insurer/ISM records based on claims history, so it cannot be manually changed here.

${buildVehicleBlock(profile)}

If you believe this NCD is incorrect, please verify or dispute it with your current/previous insurer first. For now, shall we proceed with these details?`;
}

function buildVehicleRejectionFollowUpReply(profile) {
  return `I understand your concern. These details are sourced from insurer/ISM records based on the vehicle identifiers you provided:

${buildVehicleBlock(profile)}

Please let me know which field is incorrect, or share the corrected **vehicle plate** and **owner identification number** so I can verify it.`;
}

/** Build the payment link */
function buildPaymentCheckoutData(state, options = {}) {
  const {
    insurance: insurerPrice,
    addOns: addOnsTotal,
    roadTax: roadTaxTotal,
    tax: taxTotal,
    total,
  } = calculateSummaryAmounts(state);
  const quote = getQuoteForSummary(state);
  const insurerName = state.selectedQuote?.insurer || quote?.insurer?.displayName || '';
  const insurerKey = findInsurerKeyByText(insurerName);
  const insurer = getInsurerByKey(insurerKey);
  const coverType = state?.vehicleInfo?.coverType || state?.selectedQuote?.coverType || quote?.coverType || 'Comprehensive';
  const sumInsured = Number(state?.selectedQuote?.sumInsured || quote?.sumInsured || insurer?.sumInsured || 0);
  const priceBefore = Number(state?.selectedQuote?.priceBefore || quote?.pricing?.basePremium || insurer?.priceBefore || insurerPrice || 0);
  const ncdPercent = Number(state?.selectedQuote?.ncdPercent ?? quote?.pricing?.ncdPercent ?? insurer?.ncdPercent ?? 0);
  const addOns = Array.isArray(state.selectedAddOns)
    ? state.selectedAddOns.map((addOn) => ({
        name: getSummaryAddOnName(addOn),
        price: Number(addOn?.price || 0),
      })).filter((addOn) => addOn.name && addOn.price > 0)
    : [];
  const selectedRoadTax = state.selectedRoadTax || null;
  const payId = ensurePaymentSnapshotId(state);
  const query = new URLSearchParams({
    total: String(total),
    insurer: insurerName,
    plate: state.plateNumber || '',
    insurance: String(insurerPrice),
    addons: String(addOnsTotal),
    tax: String(taxTotal),
    roadtax: String(roadTaxTotal),
    insurerDisplay: insurerKey === 'takaful'
      ? 'Takaful Insurance Berhad'
      : getInsurerDisplayForSummary(insurerName),
    logo: getInsurerLogoForSummary(insurerName),
    vehicleLine: getSummaryVehicleLine(state),
    coverType,
    sumInsured: String(sumInsured),
    priceBefore: String(priceBefore),
    ncd: String(ncdPercent),
    policyPeriod: getPolicyEffectiveRangeDisplay({ month: 'long' }),
    insuranceTitle: getInsuranceSectionTitle(insurerName),
    roadtaxName: selectedRoadTax
      ? getRoadTaxDisplayName(selectedRoadTax)
      : '',
    addonsDetail: JSON.stringify(addOns),
  });
  if (options.sessionId) {
    query.set('session', options.sessionId);
  }

  return {
    paymentId: payId,
    total,
    href: `/my/payment/${payId}?${query.toString()}`,
    insurer: insurerName,
    plate: state.plateNumber || '',
    insurance: insurerPrice,
    addons: addOnsTotal,
    tax: taxTotal,
    roadtax: roadTaxTotal,
    insurerDisplay: query.get('insurerDisplay'),
    logo: query.get('logo'),
    vehicleLine: query.get('vehicleLine'),
    coverType,
    sumInsured,
    priceBefore,
    ncd: ncdPercent,
    policyPeriod: query.get('policyPeriod'),
    insuranceTitle: query.get('insuranceTitle'),
    roadtaxName: query.get('roadtaxName'),
    addonsDetail: addOns,
  };
}

function buildPaymentLink(state, options = {}) {
  const { total, href } = buildPaymentCheckoutData(state, options);
  return `[**Pay securely - RM ${formatMoneyTwoDecimals(total)}**](${href})`;
}

function buildPaymentStepBlock(summaryBox, paymentLink) {
  return `${summaryBox}

${formatStepLine(6, 'Payment')}

Please review your quotation before payment.
If anything needs to be changed, let me know.

${paymentLink}

Credit/Debit card, FPX, E-Wallet, Buy Now Pay Later, and Credit Card Instalments.

Payment opens in a secure checkout page.

After successful payment, your policy documents and payment receipt will be sent to your WhatsApp and email.`;
}

function buildRoadTaxStepBlock(summaryBox, state) {
  const addOnConfirmationLine = state.selectedAddOns.length > 0
    ? `${state.selectedAddOns.map((a) => a.name).join(', ')} added! ✅`
    : null;

  return `${addOnConfirmationLine ? `${addOnConfirmationLine}\n\n` : ''}${summaryBox}

${formatStepLine(4, 'Road Tax')}

${buildRoadTaxMenu(state)}`;
}

function buildAddOnsStepBlock(summaryBox) {
  return `${summaryBox}

${formatStepLine(3, 'Add-ons')}

Optional protection (add-ons):

${buildAddOnsMenu()}

${ADDONS_CLOSE_QUESTION}`;
}

function buildQuoteChangeConfirmationReply(state, intentData = {}) {
  const currentInsurer = state?.selectedQuote?.insurer || 'your current insurer';
  const nextInsurerName = getInsurerByKey(intentData?.newInsurer)?.displayName || 'the new insurer';
  const currentTotal = calculateCurrentGrandTotal(state);
  const totalLine = currentTotal > 0
    ? ` Your current total is **RM ${formatMoneyTwoDecimals(currentTotal)}**.`
    : '';

  return `No problem — I can switch you from **${currentInsurer}** to **${nextInsurerName}**.${totalLine}

Because the insurer affects the premium and total, I’ll clear your add-ons and road tax choices after you confirm.

Reply **yes** to switch to **${nextInsurerName}**, or **keep current** to stay with **${currentInsurer}**.`;
}

function buildQuoteChangeCompletedReply(state, selectedQuote) {
  const insurerName = selectedQuote?.insurer || state?.selectedQuote?.insurer || 'the new insurer';
  return `Done — I’ve switched you to **${insurerName}** and cleared add-ons and road tax so the total stays accurate.

${buildAddOnsStepBlock(buildSummaryBox(state))}`;
}

function buildQuoteChangeCancelledReply(state) {
  const currentInsurer = state?.selectedQuote?.insurer || 'your current insurer';
  const summaryBox = state?.selectedQuote ? buildSummaryBox(state) : null;
  const continuation = state?.step === FLOW_STEPS.ROADTAX && summaryBox
    ? `\n\n${formatStepLine(4, 'Road Tax')}\n\n${buildRoadTaxMenu(state)}`
    : '';

  return `No problem — we’ll keep **${currentInsurer}**.${summaryBox ? `\n\n${summaryBox}` : ''}${continuation}`;
}

function buildDetailsStepBlock(summaryBox, roadTaxName = null) {
  const roadTaxConfirmation = roadTaxName && roadTaxName !== 'No Road Tax'
    ? `${roadTaxName} added! ✅`
    : 'No road tax. ✅';

  return `${roadTaxConfirmation}

${summaryBox}

${formatStepLine(5, 'Your Details')}

${buildPersonalDetailsRequest()}`;
}

const STAGE_HEADING_TITLES = '(?:Vehicle Info|Choose Insurer|Add-ons|Road Tax|Your Details|Payment)';
const OLD_STEP_LINE_PATTERN = String.raw`(?:\*{1,2})?\s*step\s+(?:\*{1,2})?\d+(?:\*{1,2})?\s+of\s+(?:\*{1,2})?6(?:\*{1,2})?\s*[—-]\s*[^\n*]+`;
const NEW_STAGE_HEADING_PATTERN = String.raw`(?:\*{1,2})?\s*${STAGE_HEADING_TITLES}\s*(?:\*{1,2})?`;
const STEP_LINE_REGEX = new RegExp(String.raw`^\s*(?:${OLD_STEP_LINE_PATTERN}|${NEW_STAGE_HEADING_PATTERN})\s*$`, 'im');
const STEP_LINE_CAPTURE_REGEX = new RegExp(String.raw`^\s*(${OLD_STEP_LINE_PATTERN}|${NEW_STAGE_HEADING_PATTERN})\s*$`, 'im');
const STEP_LINE_ONLY_REGEX = new RegExp(String.raw`^\s*(?:${OLD_STEP_LINE_PATTERN}|${NEW_STAGE_HEADING_PATTERN})\s*$`, 'i');

function isStepIndicator(text) {
  if (!text || typeof text !== 'string') return false;
  return STEP_LINE_ONLY_REGEX.test(text.trim());
}

function formatStepLine(step, title) {
  return `**${title}**`;
}

function normalizeStepLine(stepLine) {
  if (!stepLine || typeof stepLine !== 'string') return null;
  return stepLine
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .trim();
}

function extractStepLineFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(STEP_LINE_CAPTURE_REGEX);
  return match ? match[1].trim() : null;
}

function normalizeStepLineFromSingleLine(line) {
  if (!line || typeof line !== 'string') return null;
  if (!STEP_LINE_ONLY_REGEX.test(line.trim())) return null;
  return normalizeStepLine(line);
}

function dedupeConsecutiveStepLines(response) {
  if (!response || typeof response !== 'string') return response;

  const lines = response.split('\n');
  const out = [];

  for (const line of lines) {
    const currentNorm = normalizeStepLineFromSingleLine(line);
    if (!currentNorm) {
      out.push(line);
      continue;
    }

    // Compare with the previous non-empty rendered line.
    let prev = out.length - 1;
    while (prev >= 0 && out[prev].trim() === '') prev -= 1;
    const prevNorm = prev >= 0 ? normalizeStepLineFromSingleLine(out[prev]) : null;

    if (prevNorm && prevNorm === currentNorm) {
      // Skip duplicate step line (same step/title) regardless of blank lines in between.
      continue;
    }

    out.push(line);
  }

  return out.join('\n').trim();
}

function ensureStepLineIfMissing(response, stepLine) {
  if (!stepLine || !response) return response;
  if (STEP_LINE_REGEX.test(response)) return response;
  const text = String(response).trim();
  const lowerStep = String(stepLine).toLowerCase();

  const insertBeforePattern = (pattern) => {
    const idx = text.search(pattern);
    if (idx < 0) return null;
    const before = text.slice(0, idx).trimEnd();
    const after = text.slice(idx).trimStart();
    return `${before}\n\n${stepLine}\n\n${after}`.trim();
  };

  // Prefer placing step labels right above the action prompt section.
  if (lowerStep.includes('add-ons')) {
    const placed = insertBeforePattern(/optional protection \(add-ons\):|optional protection you may want:|would you like to add any of these\?|want add-ons\?/i);
    if (placed) return placed;
  }
  if (lowerStep.includes('road tax')) {
    const placed = insertBeforePattern(/want to renew your .*road tax|reply \*\*ok\*\*|or continue without road tax/i);
    if (placed) return placed;
  }
  if (lowerStep.includes('your details')) {
    const placed = insertBeforePattern(/almost done! i need:|now,\s*please provide your:/i);
    if (placed) return placed;
  }
  if (lowerStep.includes('choose insurer')) {
    const placed = insertBeforePattern(/great,\s*here(?:'s| is)\s*what we have:|here are your options:|which option would you like to go with|which insurer would you like to go with|!\[[^\]]+\]\([^)]+\)/i);
    if (placed) return placed;
  }

  // If summary exists, place step right above the summary block as fallback.
  const summaryStartMatch = text.match(/(?:^|\n)\s*(?:<span[^>]*>\s*)?(?:\*{0,2})?✓?\s*renewal summary(?:\*{0,2})?[^\n]*(?:<\/span>)?/i)
    || text.match(/(?:^|\n)\s*(?:\*{0,2})?Policy (?:Effective|Period):\s*/i);
  if (summaryStartMatch) {
    const hasLeadingNewline = summaryStartMatch[0].startsWith('\n');
    const insertPos = summaryStartMatch.index + (hasLeadingNewline ? 1 : 0);
    const before = text.slice(0, insertPos).trimEnd();
    const after = text.slice(insertPos).trimStart();
    return `${before}\n\n${stepLine}\n\n${after}`.trim();
  }

  // Secondary fallback: insert before total line if summary title wasn't found.
  const totalLineMatch = text.match(/(?:^|\n)\s*(?:💰\s*)?(?:\*\*)?Total:?(?:\*\*)?\s*(?:&nbsp;)?\s*(?:<u>)?\s*RM[^\n]*/i);
  if (totalLineMatch) {
    const hasLeadingNewline = totalLineMatch[0].startsWith('\n');
    const insertPos = totalLineMatch.index + (hasLeadingNewline ? 1 : 0);
    const before = text.slice(0, insertPos).trimEnd();
    const after = text.slice(insertPos).trimStart();
    return `${before}\n\n${stepLine}\n\n${after}`.trim();
  }

  // Last resort.
  return `${stepLine}\n\n${text}`;
}

const PAYMENT_LINK_REGEX = /\/my\/payment\/[a-z0-9-]+/i;
const SUMMARY_BLOCK_REGEX = /(?:^✓\s*(?:\*\*)?renewal summary(?:\*\*)?\s*[—-]\s*[^\n]+|(?:^|\n)\*\*Policy (?:Effective|Period):\*\*|(?:^|\n)(?:💰\s*)?(?:\*\*)?Total:?(?:\*\*)?\s*(?:&nbsp;)?\s*(?:<u>)?\s*RM\s*\d[\d,]*)/im;
const CANONICAL_SUMMARY_MARKER_REGEX = /<span style="font-size:1\.12em[^"]*">\*\*✓ Renewal Summary\*\*/i;
const SUMMARY_SECTION_REGEX = /(?:^|\n)\s*(?:<span[^>]*>\s*)?(?:\*{0,2})?✓?\s*renewal summary(?:\*{0,2})?[^\n]*(?:<\/span>)?[\s\S]*?(?:\n\s*(?:\*{0,2})?(?:💰\s*)?total:?(?:\*{0,2})?\s*(?:&nbsp;)?\s*(?:<u>)?\s*rm[^\n]*)/im;
const ADDONS_HEADING_REGEX_SOURCE = String.raw`(?:(?:\*{0,2})?step\s+(?:\*{0,2})?3(?:\*{0,2})?\s+of\s+(?:\*{0,2})?6(?:\*{0,2})?\s*[—-]\s*add-ons(?:\*{0,2})?|(?:\*{0,2})?add-ons(?:\*{0,2})?)`;
const ROADTAX_HEADING_REGEX_SOURCE = String.raw`(?:(?:\*{0,2})?step\s+(?:\*{0,2})?4(?:\*{0,2})?\s+of\s+(?:\*{0,2})?6(?:\*{0,2})?\s*[—-]\s*road tax(?:\*{0,2})?|(?:\*{0,2})?road tax(?:\*{0,2})?)`;
const PAYMENT_HEADING_REGEX_SOURCE = String.raw`(?:(?:\*{0,2})?step\s+(?:\*{0,2})?6(?:\*{0,2})?\s+of\s+(?:\*{0,2})?6(?:\*{0,2})?\s*[—-]\s*payment(?:\*{0,2})?|(?:\*{0,2})?payment(?:\*{0,2})?)`;
const ADDONS_SECTION_REGEX = new RegExp(String.raw`(?:^|\n)\s*${ADDONS_HEADING_REGEX_SOURCE}\s*\n+[\s\S]*?(?:\n\s*based on your situation,[^\n]*reply skip\.?)`, 'im');
const ROADTAX_SECTION_REGEX = new RegExp(String.raw`(?:^|\n)\s*${ROADTAX_HEADING_REGEX_SOURCE}\s*\n+[\s\S]*?(?:printed road tax is only for Foreign ID or Company vehicles\.?)`, 'im');
const PAYMENT_SECTION_REGEX = new RegExp(String.raw`(?:^|\n)\s*${PAYMENT_HEADING_REGEX_SOURCE}\s*\n+[\s\S]*?(?:policy documents and payment receipt will be sent to your WhatsApp and email\.?)`, 'im');

function ensurePaymentLinkIfMissing(response, paymentLink, shouldInject) {
  if (!shouldInject || !paymentLink) return response;
  if (!response || typeof response !== 'string') return paymentLink;
  if (PAYMENT_LINK_REGEX.test(response)) return response;
  return `${response.trim()}\n\n${paymentLink}`;
}

function ensureSummaryIfMissing(response, summaryBox, shouldInject) {
  if (!shouldInject || !summaryBox) return response;
  if (!response || typeof response !== 'string') return summaryBox;
  if (SUMMARY_BLOCK_REGEX.test(response)) return response;

  const stepIndex = response.search(STEP_LINE_REGEX);
  if (stepIndex > 0) {
    const before = response.slice(0, stepIndex).trimEnd();
    const after = response.slice(stepIndex).trimStart();
    return `${before}\n\n${summaryBox}\n\n${after}`.trim();
  }

  return `${response.trim()}\n\n${summaryBox}`;
}

function ensureSummaryLayoutConsistency(response, summaryBox, shouldCanonicalize) {
  if (!shouldCanonicalize || !summaryBox) return response;
  if (!response || typeof response !== 'string') return response;

  const text = String(response).trim();
  const hasSummarySignal = /renewal summary|policy (?:effective|period):|sum insured:|cover type:|add-ons:|road tax:|(?:💰\s*)?total:/i.test(text);
  if (!hasSummarySignal) return text;

  if (text.includes(summaryBox) || CANONICAL_SUMMARY_MARKER_REGEX.test(text)) {
    return text;
  }

  if (SUMMARY_SECTION_REGEX.test(text)) {
    const replaced = text.replace(SUMMARY_SECTION_REGEX, `\n${summaryBox}\n`);
    return replaced.replace(/\n{3,}/g, '\n\n').trim();
  }

  return text;
}

function getCurrentStageStepLine(state) {
  if (!state.hasCompleteVehicleIdentification()) {
    return formatStepLine(1, 'Vehicle Info');
  }

  if (state.step === FLOW_STEPS.QUOTES) return formatStepLine(2, 'Choose Insurer');
  if (state.step === FLOW_STEPS.ADDONS) return formatStepLine(3, 'Add-ons');
  if (state.step === FLOW_STEPS.ROADTAX) return formatStepLine(4, 'Road Tax');
  if (state.step === FLOW_STEPS.PERSONAL_DETAILS) return formatStepLine(5, 'Your Details');
  if (state.step === FLOW_STEPS.OTP) return formatStepLine(5, 'Your Details');
  if (state.step === FLOW_STEPS.PAYMENT) return formatStepLine(6, 'Payment');

  return null;
}

function getExpectedStepLine(intent, state, messages) {
  // Last shown step from assistant history.
  const lastAssistantStepLine = [...messages]
    .reverse()
    .filter(m => m.role === 'assistant')
    .map(m => extractStepLineFromText(String(m.content || '')))
    .find(Boolean) || null;

  // Vehicle confirmation ("Is this correct?") is still Step 1 context — no step label needed.
  if (intent.intent === USER_INTENTS.PROVIDE_INFO) return null;
  if (
    !state.selectedQuote &&
    state.hasCompleteVehicleIdentification() &&
    wasLastAssistantVehicleConfirmation(messages) &&
    intent.intent !== USER_INTENTS.CONFIRM
  ) return null;

  // Prefer explicit transition triggers.
  let candidate = null;
  if (intent.intent === USER_INTENTS.SELECT_QUOTE) candidate = formatStepLine(3, 'Add-ons');
  else if (intent.intent === USER_INTENTS.SELECT_ADDON) candidate = formatStepLine(4, 'Road Tax');
  else if (intent.intent === USER_INTENTS.SELECT_ROADTAX) candidate = formatStepLine(5, 'Your Details');

  // Fallback: first render or stage changed from previous assistant message.
  if (!candidate) {
    const currentStageLine = getCurrentStageStepLine(state);
    const currentNormalized = normalizeStepLine(currentStageLine);
    const lastNormalized = normalizeStepLine(lastAssistantStepLine);

    if (!lastNormalized && currentStageLine) {
      candidate = currentStageLine; // first time only
    } else if (currentNormalized && lastNormalized && currentNormalized !== lastNormalized) {
      candidate = currentStageLine; // stage transition only
    }
  }

  if (!candidate) return null;

  const candidateNormalized = normalizeStepLine(candidate);
  const lastNormalized = normalizeStepLine(lastAssistantStepLine);
  if (candidateNormalized && lastNormalized && candidateNormalized === lastNormalized) {
    return null;
  }

  return candidate;
}

function isVehicleConfirmationGate(state, intent, messages, vehicleProfile) {
  if (!state || state.selectedQuote) return false;
  if (!state.hasCompleteVehicleIdentification()) return false;

  if (intent?.intent === USER_INTENTS.PROVIDE_INFO && !!vehicleProfile) return true;
  if (wasLastAssistantVehicleConfirmation(messages || []) && intent?.intent !== USER_INTENTS.CONFIRM) return true;

  return false;
}

function getMissingPersonalDetailLabels(state) {
  const details = state.personalDetails || {};
  const missing = [];
  if (!details.email) missing.push('Email');
  if (!details.phone) missing.push('Phone number');
  if (!details.address) missing.push('Address');
  return missing;
}

function getCurrentStepPlaybook(state, context = {}) {
  const { intent = null, messages = [], vehicleProfile = null } = context;

  if (isVehicleConfirmationGate(state, intent, messages, vehicleProfile)) {
    return {
      label: 'Vehicle verification',
      goal: 'Confirm vehicle details before showing insurer options.',
      options: ['Confirm details are correct', 'Share corrected vehicle plate/owner ID', 'Tell which field is wrong'],
      nextAction: 'End with "Is this correct?" and wait for user confirmation.',
      sideQuestionPolicy: 'If user asks a side question, answer briefly and return to vehicle verification.',
    };
  }

  const isStartDiscoveryTurn =
    state.step === FLOW_STEPS.START &&
    !state.plateNumber &&
    !state.nricNumber &&
    (intent?.intent === USER_INTENTS.GREETING || intent?.intent === USER_INTENTS.UNCLEAR_OR_PLAYFUL);

  if (isStartDiscoveryTurn) {
    return {
      label: 'Intro and discovery',
      goal: 'Understand what the user wants before collecting identifiers.',
      options: ['Renew insurance', 'Renew road tax', 'Policy or claims question'],
      nextAction: 'Ask what the user wants today. Do not request plate/owner ID yet unless they choose renewal flow.',
      sideQuestionPolicy: 'Answer briefly and keep the tone human, then ask what they want LAJOO to help with.',
    };
  }

  if (!state.hasCompleteVehicleIdentification()) {
    const missingIdentifiers = [];
    if (!state.plateNumber) missingIdentifiers.push('Vehicle Plate Number');
    if (!state.nricNumber) missingIdentifiers.push('Owner Identification Number');
    return {
      label: 'Vehicle info',
      goal: 'Collect missing vehicle identifiers so quotes can be generated.',
      options: missingIdentifiers.length > 0 ? missingIdentifiers.map(item => `Provide ${item}`) : ['Provide vehicle identifiers'],
      nextAction: missingIdentifiers.length === 1
        ? `Ask for ${missingIdentifiers[0]} only.`
        : 'Ask for both vehicle plate number and owner identification number.',
      sideQuestionPolicy: 'If user asks a general insurance question, answer briefly first, then return and ask for missing identifiers.',
    };
  }

  if (state.step === FLOW_STEPS.QUOTES) {
    const quoteOptions = getQuotesFromState(state).map((quote) =>
      `${quote?.insurer?.displayName || 'Insurer'} (${formatRmAmount(quote?.pricing?.finalPremium || 0)})`
    );
    return {
      label: 'Choose insurer',
      goal: 'Get the user to choose one insurer so we can continue to add-ons.',
      options: quoteOptions.length > 0 ? [...quoteOptions, 'Recommend for me'] : [...AVAILABLE_INSURER_OPTIONS_WITH_PRICES, 'Recommend for me'],
      nextAction: 'Ask the user to pick one insurer option.',
      sideQuestionPolicy: 'After answering any side question, return to insurer choice and ask for a pick.',
    };
  }

  if (state.step === FLOW_STEPS.ADDONS) {
    return {
      label: 'Add-ons',
      goal: 'Confirm add-on selection before moving to road tax.',
      options: [
        'Windscreen (choose coverage amount)',
        `Special Perils (RM ${formatMoneyTwoDecimals(ADD_ON_BY_ID.flood.price)})`,
        `E-hailing (RM ${formatMoneyTwoDecimals(ADD_ON_BY_ID.ehailing.price)})`,
        'Skip all add-ons',
      ],
      nextAction: 'Ask which add-on(s) they want, or if they want to skip.',
      sideQuestionPolicy: 'After answering side questions, return to add-on selection.',
    };
  }

  if (state.step === FLOW_STEPS.ROADTAX) {
    return {
      label: 'Road tax',
      goal: 'Confirm whether user adds road tax in this order.',
      options: ['12-month digital road tax (RM 90)', 'No road tax'],
      nextAction: 'Ask for a clear yes/no road tax decision.',
      sideQuestionPolicy: 'After answering any related question, return to digital road tax vs no road tax.',
    };
  }

  if (state.step === FLOW_STEPS.PERSONAL_DETAILS) {
    const missingDetails = getMissingPersonalDetailLabels(state);
    return {
      label: 'Your details',
      goal: 'Collect required personal details before OTP.',
      options: missingDetails.length > 0 ? missingDetails.map(item => `Provide ${item}`) : ['Confirm details are correct'],
      nextAction: missingDetails.length > 0
        ? `Ask for missing detail(s): ${missingDetails.join(', ')}.`
        : 'Ask user to confirm details before sending OTP.',
      sideQuestionPolicy: 'If user asks side questions, answer briefly then continue collecting missing details.',
    };
  }

  if (state.step === FLOW_STEPS.OTP) {
    return {
      label: 'OTP verification',
      goal: 'Verify OTP before payment step.',
      options: ['Enter OTP now', 'Correct personal details if needed'],
      nextAction: 'Ask user to key in OTP.',
      sideQuestionPolicy: 'After side questions, return to OTP input request.',
    };
  }

  if (state.step === FLOW_STEPS.PAYMENT) {
    return {
      label: 'Payment',
      goal: 'Guide user to complete payment.',
      options: ['Open payment link', 'Choose payment method'],
      nextAction: 'Prompt user to proceed with payment link.',
      sideQuestionPolicy: 'Keep answers brief and always guide back to completing payment.',
    };
  }

  return null;
}

function buildStepContractInstruction(state, context = {}) {
  const playbook = getCurrentStepPlaybook(state, context);
  if (!playbook) return null;
  const optionsList = playbook.options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n');
  return `INTERNAL FLOW CHECKPOINT (MANDATORY)
Current checkpoint: ${playbook.label}
Goal to close now: ${playbook.goal}
Options available right now:
${optionsList}
Required next action in this reply: ${playbook.nextAction}
${playbook.sideQuestionPolicy}

Rule: After answering side questions, return to this checkpoint and ask for the next action.
Rule: Do not move to another checkpoint unless user clearly confirms an available option.`;
}

function getStepCloseRule(state, context = {}) {
  const { intent = null, messages = [], vehicleProfile = null } = context;
  if (!state.hasCompleteVehicleIdentification()) return null;

  if (isVehicleConfirmationGate(state, intent, messages, vehicleProfile)) {
    return {
      mentionRegex: /(is this correct|which field is wrong|corrected (?:car|vehicle) plate|owner identification)/i,
      prompt: 'Is this correct?',
      alternatives: [
        'Is this correct?',
        'Please confirm if these vehicle details are correct.',
      ],
    };
  }

  if (state.step === FLOW_STEPS.QUOTES) {
    return {
      mentionRegex: new RegExp(`(which option|which insurer|specific insurer|${AVAILABLE_INSURER_MENTION_REGEX.source}|recommend(?:ation)?|compare|budget|claims|coverage|go with|lock in|proceed)`, 'i'),
      prompt: 'Would you like a quick side-by-side comparison, or should I recommend one based on your priority (**budget**, **claims**, or **coverage**)?',
      alternatives: [
        'Would you like a quick side-by-side comparison, or should I recommend one based on your priority (**budget**, **claims**, or **coverage**)?',
        `If you’re ready, tell me which insurer to lock in: ${AVAILABLE_INSURER_CHOICE_TEXT}.`,
      ],
    };
  }

  if (state.step === FLOW_STEPS.ADDONS) {
    return {
      mentionRegex: /(windscreen|special perils|e-hailing|skip|\b1\b|\b2\b|\b3\b)/i,
      prompt: `E-hailing add-on is compulsory for vehicles used for e-hailing services like Grab and others.\n\n${ADDONS_CLOSE_QUESTION}`,
      alternatives: [
        `E-hailing add-on is compulsory for vehicles used for e-hailing services like Grab and others.\n\n${ADDONS_CLOSE_QUESTION}`,
        `E-hailing add-on is compulsory for vehicles used for e-hailing services like Grab and others.\n\n${ADDONS_CLOSE_QUESTION}`,
      ],
    };
  }

  if (state.step === FLOW_STEPS.ROADTAX) {
    return {
      mentionRegex: /(digital road tax|no road tax|road tax)/i,
      prompt: 'Would you like to renew road tax together? **12 months (Digital) — RM 90**, or **no road tax**?',
      alternatives: [
        'Would you like to renew road tax together? **12 months (Digital) — RM 90**, or **no road tax**?',
        'Want me to proceed with **12 months (Digital) — RM 90**, or keep **no road tax**?',
      ],
    };
  }

  if (state.step === FLOW_STEPS.PERSONAL_DETAILS) {
    const missingDetails = getMissingPersonalDetailLabels(state);
    return {
      mentionRegex: /(email|phone|address|address)/i,
      prompt: missingDetails.length > 0
        ? `Please share your **${missingDetails.join('**, **')}** to continue.`
        : 'Please confirm your details are correct so I can send the OTP.',
      alternatives: missingDetails.length > 0
        ? [
          `Please share your **${missingDetails.join('**, **')}** to continue.`,
          `I just need your **${missingDetails.join('**, **')}** to proceed.`,
        ]
        : [
          'Please confirm your details are correct so I can send the OTP.',
          'If these details look correct, reply **yes** and I’ll send the OTP.',
        ],
    };
  }

  if (state.step === FLOW_STEPS.OTP) {
    return {
      mentionRegex: /\botp\b/i,
      prompt: OTP_PROMPT_COPY,
      alternatives: [
        OTP_PROMPT_COPY,
      ],
    };
  }

  return null;
}

function ensureStepCloseIfMissing(response, state, context = {}) {
  const rule = getStepCloseRule(state, context);
  if (!rule) return response;
  if (!response || typeof response !== 'string') return rule.prompt;

  const text = response.trim();
  const hasMention = rule.mentionRegex.test(text);
  const hasActionCue = /\?|(?:^|\s)(reply|please|choose|select|key in|enter|confirm)(?:\s|$)/i.test(text);
  if (
    state.step === FLOW_STEPS.QUOTES &&
    hasActionCue &&
    /(insurer|option|recommend|compare|priority|budget|claims|coverage|go with|proceed|lock in)/i.test(text)
  ) {
    return text;
  }
  if (hasMention && hasActionCue) return text;

  const lastAssistant = [...(context.messages || [])]
    .reverse()
    .find(m => m.role === 'assistant')?.content || '';
  const alternatives = Array.isArray(rule.alternatives) && rule.alternatives.length > 0
    ? rule.alternatives
    : [rule.prompt];
  const selectedPrompt = alternatives.find(p => !String(lastAssistant).includes(p)) || alternatives[0];

  return `${text}\n\n${selectedPrompt}`;
}

function buildQuestionFirstThenStepCloseInstruction(state, context = {}) {
  if (context?.intent?.intent !== USER_INTENTS.ASK_QUESTION) return null;

  const closeRule = getStepCloseRule(state, context);
  const closePrompt = closeRule?.prompt || 'What would you like to do next?';

  return `QUESTION RESPONSE ORDER (MANDATORY)
You MUST follow this exact order in the next reply:
1. Answer the user's question first with concrete, useful details (minimum 2 informative sentences).
2. Then add one short bridge sentence back to the current flow step.
3. End with exactly one clear next-action close question for this step.

Do NOT start with the close question.
Do NOT skip step 1 even when the user asks side questions.
Current step close question to use (or paraphrase): ${closePrompt}`;
}

const PREFERENCE_DECAY_PER_TURN = 0.82;
const PREFERENCE_ACTIVATION_THRESHOLD = 0.85;
const PREFERENCE_DEACTIVATION_THRESHOLD = 0.35;
const CONCISE_TRUE_THRESHOLD = 0.75;
const CONCISE_FALSE_THRESHOLD = -0.75;
const EXPERIMENT_DECISION_STEPS = new Set([
  FLOW_STEPS.QUOTES,
  FLOW_STEPS.ADDONS,
  FLOW_STEPS.ROADTAX,
  FLOW_STEPS.PERSONAL_DETAILS,
  FLOW_STEPS.OTP,
  FLOW_STEPS.PAYMENT,
]);
const EXPERIMENT_CONVERSION_INTENTS = new Set([
  USER_INTENTS.SELECT_QUOTE,
  USER_INTENTS.SELECT_ADDON,
  USER_INTENTS.SELECT_ROADTAX,
  USER_INTENTS.SUBMIT_DETAILS,
  USER_INTENTS.VERIFY_OTP,
  USER_INTENTS.SELECT_PAYMENT,
]);

function clampScore(value, min = -4, max = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(min, Math.min(max, numeric));
}

function ensurePreferenceModel(state) {
  if (!state) return null;
  if (!state.userPreferences || typeof state.userPreferences !== 'object') {
    state.userPreferences = {
      budgetFocused: false,
      claimsFocused: false,
      coverageFocused: false,
      concisePreferred: null,
    };
  }

  if (!state.userPreferences.preferenceScores || typeof state.userPreferences.preferenceScores !== 'object') {
    state.userPreferences.preferenceScores = {
      budgetFocused: 0,
      claimsFocused: 0,
      coverageFocused: 0,
      concisePreferred: 0,
    };
  }

  const scores = state.userPreferences.preferenceScores;
  scores.budgetFocused = clampScore(scores.budgetFocused);
  scores.claimsFocused = clampScore(scores.claimsFocused);
  scores.coverageFocused = clampScore(scores.coverageFocused);
  scores.concisePreferred = clampScore(scores.concisePreferred);

  state.userPreferences.preferenceTurnCounter = Number(state.userPreferences.preferenceTurnCounter || 0);
  state.userPreferences.preferenceUpdatedAt = Number(state.userPreferences.preferenceUpdatedAt || Date.now());

  return state.userPreferences;
}

function nextBooleanFromScore(currentValue, score) {
  if (currentValue === true) return score > PREFERENCE_DEACTIVATION_THRESHOLD;
  return score >= PREFERENCE_ACTIVATION_THRESHOLD;
}

function nextConcisePreference(currentValue, score) {
  if (score >= CONCISE_TRUE_THRESHOLD) return true;
  if (score <= CONCISE_FALSE_THRESHOLD) return false;

  if (currentValue === true && score > 0.25) return true;
  if (currentValue === false && score < -0.25) return false;
  return null;
}

function updateUserPreferencesFromMessage(state, message) {
  if (!state) return;
  const preferences = ensurePreferenceModel(state);
  if (!preferences) return;

  preferences.preferenceTurnCounter += 1;
  preferences.preferenceUpdatedAt = Date.now();

  const scores = preferences.preferenceScores;
  scores.budgetFocused *= PREFERENCE_DECAY_PER_TURN;
  scores.claimsFocused *= PREFERENCE_DECAY_PER_TURN;
  scores.coverageFocused *= PREFERENCE_DECAY_PER_TURN;
  scores.concisePreferred *= PREFERENCE_DECAY_PER_TURN;

  const msg = String(message || '').toLowerCase();
  if (!msg) {
    preferences.budgetFocused = nextBooleanFromScore(preferences.budgetFocused, scores.budgetFocused);
    preferences.claimsFocused = nextBooleanFromScore(preferences.claimsFocused, scores.claimsFocused);
    preferences.coverageFocused = nextBooleanFromScore(preferences.coverageFocused, scores.coverageFocused);
    preferences.concisePreferred = nextConcisePreference(preferences.concisePreferred, scores.concisePreferred);
    return;
  }

  if (/(cheap|cheapest|budget|save|saving|lowest price|best price|value for money|affordable)/i.test(msg)) {
    scores.budgetFocused += 1.35;
  }
  if (/(not about price|don't care price|dont care price|not cheapest|price doesn't matter)/i.test(msg)) {
    scores.budgetFocused -= 1.1;
  }

  if (/(claim|claims|easy claim|fast claim|payout|process|support)/i.test(msg)) {
    scores.claimsFocused += 1.35;
  }

  if (/(coverage|cover|max cover|higher cover|sum insured|protection|fully covered)/i.test(msg)) {
    scores.coverageFocused += 1.35;
  }

  if (/(short answer|be brief|briefly|keep it short|concise|simple answer|just answer)/i.test(msg)) {
    scores.concisePreferred += 1.5;
  }
  if (/(more details|detailed|explain more|longer answer|full explanation|in detail)/i.test(msg)) {
    scores.concisePreferred -= 1.5;
  }

  scores.budgetFocused = clampScore(scores.budgetFocused);
  scores.claimsFocused = clampScore(scores.claimsFocused);
  scores.coverageFocused = clampScore(scores.coverageFocused);
  scores.concisePreferred = clampScore(scores.concisePreferred);

  preferences.budgetFocused = nextBooleanFromScore(preferences.budgetFocused, scores.budgetFocused);
  preferences.claimsFocused = nextBooleanFromScore(preferences.claimsFocused, scores.claimsFocused);
  preferences.coverageFocused = nextBooleanFromScore(preferences.coverageFocused, scores.coverageFocused);
  preferences.concisePreferred = nextConcisePreference(preferences.concisePreferred, scores.concisePreferred);
}

function hashToBucket(input) {
  const text = String(input || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function resolvePromptVariant(state, messages) {
  const forcedVariant = String(process.env.LAJOO_PROMPT_VARIANT_FORCE || '').trim().toUpperCase();
  if (forcedVariant === 'A' || forcedVariant === 'B') return forcedVariant;

  const mode = String(process.env.LAJOO_PROMPT_EXPERIMENT || 'off').trim().toLowerCase();
  if (mode !== 'ab') return 'A';

  const existingVariant = String(state?.experiment?.promptVariant || '').toUpperCase();
  if (existingVariant === 'A' || existingVariant === 'B') return existingVariant;

  const firstUserMessage = (messages || []).find(m => m.role === 'user')?.content || '';
  const seed = `${state?.plateNumber || ''}|${state?.nricNumber || ''}|${firstUserMessage}`;
  const bucket = hashToBucket(seed || Date.now());
  return bucket % 2 === 0 ? 'A' : 'B';
}

function ensureExperimentState(state, promptVariant) {
  if (!state) return;
  if (!state.experiment || typeof state.experiment !== 'object') {
    state.experiment = {};
  }

  const mode = String(process.env.LAJOO_PROMPT_EXPERIMENT || 'off').trim().toLowerCase();
  const normalizedMode = mode === 'ab' ? 'ab' : 'off';
  const normalizedVariant = promptVariant === 'B' ? 'B' : 'A';
  const now = Date.now();

  state.experiment.promptVariant = ['A', 'B'].includes(state.experiment.promptVariant)
    ? state.experiment.promptVariant
    : normalizedVariant;
  state.experiment.experimentMode = normalizedMode;
  state.experiment.startedAt = Number(state.experiment.startedAt || now);
  state.experiment.updatedAt = now;
  state.experiment.turns = Number(state.experiment.turns || 0);
  state.experiment.decisionTurns = Number(state.experiment.decisionTurns || 0);
  state.experiment.conversionIntentTurns = Number(state.experiment.conversionIntentTurns || 0);
  state.experiment.conversionRate = Number(state.experiment.conversionRate || 0);

  if (!state.experiment.milestones || typeof state.experiment.milestones !== 'object') {
    state.experiment.milestones = {
      quoteSelected: false,
      addOnsConfirmed: false,
      roadTaxSelected: false,
      reachedOtp: false,
      reachedPayment: false,
      completedPayment: false,
    };
  }
}

function updateExperimentTracking(state, intent, stepBeforeMutation) {
  if (!state || !intent) return;
  ensureExperimentState(state, state?.experiment?.promptVariant || 'A');

  state.experiment.turns += 1;
  if (EXPERIMENT_DECISION_STEPS.has(stepBeforeMutation)) {
    state.experiment.decisionTurns += 1;
    if (EXPERIMENT_CONVERSION_INTENTS.has(intent.intent)) {
      state.experiment.conversionIntentTurns += 1;
    }
  }

  state.experiment.milestones.quoteSelected = !!state.selectedQuote;
  state.experiment.milestones.addOnsConfirmed = !!state.addOnsConfirmed;
  state.experiment.milestones.roadTaxSelected = !!state.selectedRoadTax;
  state.experiment.milestones.reachedOtp = state.step === FLOW_STEPS.OTP || state.step === FLOW_STEPS.PAYMENT || !!state.paymentMethod;
  state.experiment.milestones.reachedPayment = state.step === FLOW_STEPS.PAYMENT || !!state.paymentMethod;
  state.experiment.milestones.completedPayment = !!state.paymentMethod;

  state.experiment.conversionRate = state.experiment.decisionTurns > 0
    ? Number((state.experiment.conversionIntentTurns / state.experiment.decisionTurns).toFixed(4))
    : 0;
  state.experiment.updatedAt = Date.now();
}

function shouldUseClarifyingTurn(intent, state) {
  if (!intent) return false;
  const confidence = Number(intent.confidence || 0);
  if (confidence >= 0.68) return false;

  if (
    intent.intent === USER_INTENTS.OTHER ||
    intent.intent === USER_INTENTS.UNCLEAR_OR_PLAYFUL
  ) return true;

  if (
    intent.intent === USER_INTENTS.CONFIRM &&
    [FLOW_STEPS.QUOTES, FLOW_STEPS.ADDONS, FLOW_STEPS.ROADTAX].includes(state.step)
  ) return true;

  return false;
}

function buildClarifyingQuestionInstruction(state) {
  if (!state.hasCompleteVehicleIdentification()) {
    return `Low intent confidence detected. Ask ONE clarifying question only:
"To proceed, could you share your **vehicle plate** and **owner identification number**?"`;
  }

  if (state.step === FLOW_STEPS.QUOTES) {
    return `Low intent confidence detected at quote selection.
Ask ONE clarifying question only:
"Which insurer would you like: ${AVAILABLE_INSURER_CHOICE_TEXT}, or should I **recommend** one?"`;
  }

  if (state.step === FLOW_STEPS.ADDONS) {
    return `Low intent confidence detected at add-ons.
Ask ONE clarifying question only:
"Would you like **Windscreen**, **Special Perils**, **E-hailing**, or **skip add-ons**?"`;
  }

  if (state.step === FLOW_STEPS.ROADTAX) {
    return `Low intent confidence detected at road tax.
Ask ONE clarifying question only:
"Would you like **12-month digital road tax (RM 90)**, or **no road tax**?"`;
  }

  if (state.step === FLOW_STEPS.PERSONAL_DETAILS) {
    const missing = getMissingPersonalDetailLabels(state);
    const missingExamples = missing.map((label) => `**${label}** (e.g. ${PERSONAL_DETAIL_EXAMPLES[label] || 'provided'})`).join(', ');
    return `Low intent confidence detected while collecting details.
Ask ONE clarifying question only:
"Could you share your ${missing.length > 0 ? missingExamples : '**details**'} so we can continue?"`;
  }

  if (state.step === FLOW_STEPS.OTP) {
    return `Low intent confidence detected at OTP step.
Ask ONE clarifying question only:
"Could you key in the **OTP** now so I can proceed?"`;
  }

  return `Low intent confidence detected. Ask one concise clarifying question based on the current step.`;
}

function normalizePriceFormatSpacing(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/RM(?=\d)/g, 'RM ');
}

const DISALLOWED_STEP2_INTRO_LINE_REGEX = /^\s*(?:let['’]?s|lets)\s+compare\s+your\s+options[:.!?]?\s*$/i;
const VEHICLE_FIELD_LABEL_FRAGMENT = '(?:Vehicle\\s*Reg\\.?\\s*Num|Vehicle\\s*Registration\\s*Number|Registration\\s*Number|Vehicle|Model|Engine\\s*Type|Engine|Postcode|Market\\s*Value|Owner\\s*IC|Owner\\s*Identification|No\\s*Claim\\s*Discount\\s*\\(NCD\\)|NCD|Coverage\\s*Type|Cover\\s*Type|Policy\\s*Period|Policy\\s*Effective)';
const REPEAT_MEMORY_WINDOW_TURNS = 3;
const REPEAT_MEMORY_MAX_SENTENCES = 8;
const REPEAT_SENTENCE_MIN_WORDS = 4;
const REPEAT_SENTENCE_MIN_CHARS = 18;

function stripDisallowedStep2IntroLine(text) {
  if (!text || typeof text !== 'string') return text;
  const lines = text.split('\n');
  let removed = false;
  const filtered = lines.filter((line) => {
    const shouldRemove = DISALLOWED_STEP2_INTRO_LINE_REGEX.test(line.trim());
    if (shouldRemove) removed = true;
    return !shouldRemove;
  });
  if (!removed) return text;
  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripVehicleDetailBullets(text) {
  if (!text || typeof text !== 'string') return text;
  const bulletPrefixRegex = new RegExp(
    `^\\s*(?:[-*•]|\\d+\\.)\\s+(?=(?:\\*{0,2}\\s*)?${VEHICLE_FIELD_LABEL_FRAGMENT}\\b)`,
    'i'
  );

  let changed = false;
  const lines = text.split('\n').map((line) => {
    const cleaned = line.replace(bulletPrefixRegex, '');
    if (cleaned !== line) changed = true;
    return cleaned;
  });

  if (!changed) return text;
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeAddOnsNoteQuestionParagraphs(text) {
  if (!text || typeof text !== 'string') return text;
  const note = 'E-hailing add-on is compulsory for vehicles used for e-hailing services like Grab and others.';
  const question = ADDONS_CLOSE_QUESTION;

  let out = String(text);

  // Enforce note paragraph followed by question paragraph when both appear.
  const mergedNoteThenQuestion = new RegExp(
    `${note.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+${question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'i'
  );
  const mergedQuestionThenNote = new RegExp(
    `${question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+${note.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'i'
  );

  if (mergedQuestionThenNote.test(out)) {
    out = out.replace(mergedQuestionThenNote, `${note}\n\n${question}`);
  }
  if (mergedNoteThenQuestion.test(out)) {
    out = out.replace(mergedNoteThenQuestion, `${note}\n\n${question}`);
  }

  return out;
}

function stripMarkdownForRepeatCheck(text) {
  return String(text || '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`~>#]/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\r/g, '');
}

function normalizeSentenceForRepeatCheck(sentence) {
  return String(sentence || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldIgnoreSentenceForRepeatCheck(sentence) {
  if (!sentence) return true;
  const line = sentence.trim();
  if (!line) return true;
  if (isStepIndicator(line)) return true;
  if (/^[\-_─—–]{8,}$/.test(line)) return true;
  if (/^\d+\.\s+/.test(line)) return true;
  if (/\/my\/payment\/|https?:\/\//i.test(line)) return true;
  if (/rm\s*\d/i.test(line)) return true;
  if (/^(policy effective|policy period|sum insured|cover type|insurer|insurance\/takaful|insurance|add-ons|tax|road tax|total)\s*:/i.test(line)) return true;
  if (/^(which option would you like to go with|which insurer would you like to go with)/i.test(line)) return true;
  if (/^would you like to add\b/i.test(line)) return true;
  if (/^please key in the otp\b/i.test(line)) return true;
  if (/^is this correct\??$/i.test(line)) return true;
  return false;
}

function extractComparableSentences(text) {
  const plain = stripMarkdownForRepeatCheck(text);
  const chunks = plain
    .split('\n')
    .flatMap(line => line.split(/(?<=[.!?])\s+/));

  return chunks
    .map(chunk => chunk.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .filter(chunk => !shouldIgnoreSentenceForRepeatCheck(chunk))
    .filter(chunk => chunk.length >= REPEAT_SENTENCE_MIN_CHARS)
    .filter(chunk => chunk.split(/\s+/).filter(Boolean).length >= REPEAT_SENTENCE_MIN_WORDS);
}

function getRecentAssistantTurnContents(messages, windowTurns = REPEAT_MEMORY_WINDOW_TURNS) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(msg => msg.role === 'assistant')
    .map(msg => String(msg.content || '').trim())
    .filter(Boolean)
    .slice(-windowTurns);
}

function getRecentSentenceMemory(messages, windowTurns = REPEAT_MEMORY_WINDOW_TURNS, maxSentences = REPEAT_MEMORY_MAX_SENTENCES) {
  const recentTurns = getRecentAssistantTurnContents(messages, windowTurns).reverse();
  const seen = new Set();
  const memory = [];

  for (const turn of recentTurns) {
    const sentences = extractComparableSentences(turn);
    for (const sentence of sentences) {
      const normalized = normalizeSentenceForRepeatCheck(sentence);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      memory.push(sentence);
      if (memory.length >= maxSentences) return memory;
    }
  }

  return memory;
}

function findRepeatedSentencesInRecentWindow(response, messages, windowTurns = REPEAT_MEMORY_WINDOW_TURNS) {
  const memory = getRecentSentenceMemory(messages, windowTurns, 32);
  if (!memory.length) return [];

  const memorySet = new Set(memory.map(normalizeSentenceForRepeatCheck).filter(Boolean));
  const repeated = [];
  const seen = new Set();

  for (const sentence of extractComparableSentences(response)) {
    const normalized = normalizeSentenceForRepeatCheck(sentence);
    if (!normalized || seen.has(normalized)) continue;
    if (memorySet.has(normalized)) {
      repeated.push(sentence);
      seen.add(normalized);
    }
  }

  return repeated;
}

function userAskedToRepeatContent(messages) {
  if (!Array.isArray(messages)) return false;
  const latestUser = [...messages].reverse().find(msg => msg.role === 'user')?.content || '';
  return /\b(show|repeat|again|remind me|same|list|options|what are the options|price list)\b/i.test(String(latestUser));
}

function buildAntiRepetitionInstruction(messages, windowTurns = REPEAT_MEMORY_WINDOW_TURNS) {
  const memory = getRecentSentenceMemory(messages, windowTurns, REPEAT_MEMORY_MAX_SENTENCES);
  if (!memory.length) return null;
  const memoryLines = memory.map(sentence => `- "${sentence.replace(/"/g, "'")}"`).join('\n');
  return `DO-NOT-REPEAT MEMORY WINDOW (last ${windowTurns} assistant turns)
Do NOT repeat any sentence below word-for-word in this reply.
If the same meaning is needed, paraphrase naturally while keeping facts, prices, and next action intact.

Recent assistant sentences to avoid repeating exactly:
${memoryLines}`;
}

function evaluateResponseQuality(response, state, context = {}) {
  const issues = [];
  const text = String(response || '').trim();
  const closeRule = getStepCloseRule(state, context);
  const repeatedSentences = findRepeatedSentencesInRecentWindow(text, context.messages || []);
  const userAskedRepeat = userAskedToRepeatContent(context.messages || []);

  if (!text) issues.push('empty_response');
  if (/RM\d/.test(text)) issues.push('price_format_missing_space');
  if (
    context.intent?.intent === USER_INTENTS.PROVIDE_INFO &&
    isVehicleConfirmationGate(state, context.intent, context.messages || [], context.vehicleProfile) &&
    (/(which option|which insurer|recommend for me)/i.test(text) || AVAILABLE_INSURER_MENTION_REGEX.test(text))
  ) {
    issues.push('vehicle_confirmation_should_not_offer_quotes');
  }
  if (
    state.step === FLOW_STEPS.OTP &&
    /renewal summary|policy effective|policy period|sum insured|cover type|add-ons:|road tax:/i.test(text)
  ) {
    issues.push('otp_response_should_not_include_summary');
  }
  if (closeRule) {
    const hasMention = closeRule.mentionRegex.test(text);
    const hasActionCue = /\?|(?:^|\s)(reply|please|choose|select|key in|enter|confirm)(?:\s|$)/i.test(text);
    if (!(hasMention && hasActionCue) && !context.lowConfidenceNeedsClarification) {
      issues.push('missing_next_action_close');
    }
  }

  if (repeatedSentences.length > 0 && !userAskedRepeat) {
    issues.push('repeated_sentence_recent_turns');
  }

  return { issues, needsRewrite: issues.length > 0, repeatedSentences };
}

async function rewriteResponseForQualityOnce({
  apiKey,
  model,
  originalResponse,
  qualityIssues,
  repeatedSentences = [],
  state,
  context = {},
}) {
  const closeRule = getStepCloseRule(state, context);
  const closePrompt = closeRule?.prompt || '';
  const repeatedSentenceInstruction = repeatedSentences.length > 0
    ? `Do not reuse these exact sentences from the last ${REPEAT_MEMORY_WINDOW_TURNS} assistant turns:
${repeatedSentences.slice(0, 6).map(sentence => `- "${sentence.replace(/"/g, "'")}"`).join('\n')}
If needed, keep the same meaning but paraphrase.`
    : '';

  const rewriteInstructions = `Rewrite the assistant response so it satisfies quality rules.
Keep all factual values accurate and do not invent prices.
Preserve any payment link URL exactly if present.
Fix these issues: ${qualityIssues.join(', ')}.
Current step: ${state.step}.
${closePrompt ? `Required close question: ${closePrompt}` : ''}
${repeatedSentenceInstruction}

Return only the final rewritten assistant message.`;

  try {
    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: rewriteInstructions },
          { role: "user", content: originalResponse },
        ],
        temperature: 0.2,
      }),
    });

    if (!completion.ok) return originalResponse;
    const data = await completion.json();
    const rewritten = data?.choices?.[0]?.message?.content;
    if (!rewritten || typeof rewritten !== 'string') return originalResponse;
    return rewritten.trim();
  } catch {
    return originalResponse;
  }
}

function createOpenAiApiError(response, errorText) {
  const text = String(errorText || '');

  if (/invalid_api_key/i.test(text)) {
    const error = new Error('OPENAI_API_KEY is invalid. Update your key and restart the app.');
    error.code = 'OPENAI_INVALID_API_KEY';
    error.retryable = false;
    return error;
  }

  if (
    Number(response?.status || 0) === 429 ||
    /rate[_\s-]?limit|tokens per min|too many requests/i.test(text)
  ) {
    const error = new Error('LAJOO is receiving many AI requests right now. Please wait a few seconds and try again.');
    error.code = 'OPENAI_RATE_LIMIT';
    error.retryable = true;
    return error;
  }

  const error = new Error('LAJOO could not reach the AI service right now. Please try again in a moment.');
  error.code = 'OPENAI_UNAVAILABLE';
  error.retryable = true;
  error.providerMessage = text.slice(0, 1200);
  return error;
}

function buildSafeChatErrorPayload(error) {
  const code = String(error?.code || '').toUpperCase();

  if (code === 'OPENAI_RATE_LIMIT') {
    return {
      type: 'error',
      code: 'OPENAI_RATE_LIMIT',
      retryable: true,
      message: 'LAJOO is receiving many AI requests right now. Please wait a few seconds and try again.',
    };
  }

  if (code === 'OPENAI_INVALID_API_KEY' || /OPENAI_API_KEY/i.test(error?.message || '')) {
    return {
      type: 'error',
      code: 'OPENAI_CONFIGURATION',
      retryable: false,
      message: 'LAJOO is not configured yet. Please set a valid OpenAI API key and restart the app.',
    };
  }

  if (code === 'OPENAI_UNAVAILABLE' || /OpenAI API/i.test(error?.message || '')) {
    return {
      type: 'error',
      code: 'OPENAI_UNAVAILABLE',
      retryable: true,
      message: 'LAJOO could not reach the AI service right now. Please try again in a moment.',
    };
  }

  return {
    type: 'error',
    code: 'CHAT_SERVICE_ERROR',
    retryable: false,
    message: 'LAJOO chat is unavailable right now. Please try again shortly.',
  };
}

export const runtime = "nodejs";

// ============================================================================
// AI SYSTEM PROMPT - Pure conversational focus
// ============================================================================

function getPromptVariantInstruction(promptVariant = 'A') {
  if (promptVariant === 'B') {
    return `Variant B goal: more human-like consultative selling while preserving step discipline.
- Give one short empathy line when user sounds unsure.
- Use one practical benefit tied to convenience/time saved.
- Use one gentle close question that moves to the current step decision.
- Keep persuasion soft, factual, and non-pushy.`;
  }

  return `Variant A goal: concise advisor baseline.
- Keep responses efficient and direct.
- Prioritize clarity and step progression.
- Use persuasive language only when user asks for alternatives or hesitates.`;
}

function formatRmAmount(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "RM 0";
  return `RM ${num.toLocaleString()}`;
}

function buildDynamicPricingPromptSections(state) {
  const quotes = getQuotesFromState(state);
  const insuranceLines = (Array.isArray(quotes) ? quotes : [])
    .map((q) => {
      const insurerName = q?.insurer?.displayName || "Unknown Insurer";
      const finalPremium = formatRmAmount(q?.pricing?.finalPremium || 0);
      const basePremium = formatRmAmount(q?.pricing?.basePremium || 0);
      const sumInsured = formatRmAmount(q?.sumInsured || 0);
      return `- ${insurerName}: ${finalPremium} (was ${basePremium}) — Sum Insured ${sumInsured}`;
    })
    .join("\n");

  const addOnsLine = `Windscreen price depends on coverage amount | Flood/Special Perils ${formatRmAmount(ADD_ON_BY_ID.flood.price)} | E-hailing ${formatRmAmount(ADD_ON_BY_ID.ehailing.price)}`;
  return {
    insuranceLines: insuranceLines || "- Pricing will be shown after vehicle verification and quote retrieval.",
    addOnsLine,
  };
}

function buildDynamicRecommendationRubric(state) {
  const quotes = getQuotesFromState(state)
    .slice()
    .sort((a, b) => Number(a?.pricing?.finalPremium || 0) - Number(b?.pricing?.finalPremium || 0));

  if (quotes.length === 0) {
    return `2. Match known context to rubric:
   - Budget → recommend the lowest premium quote
   - Easy claims / Highway → recommend insurer with stronger assistance/service features
   - Max coverage → recommend quote with higher sum insured
   - Flood-prone → Add Special Perils (${formatRmAmount(ADD_ON_BY_ID.flood.price)})
   - Outdoor parking → Add Windscreen (price depends on selected coverage amount)`;
  }

  const cheapest = quotes[0];
  const mostComprehensive = quotes.reduce((best, current) =>
    Number(current?.sumInsured || 0) > Number(best?.sumInsured || 0) ? current : best
  , quotes[0]);
  const balanced = quotes[Math.floor(quotes.length / 2)] || quotes[0];

  const lineFor = (quote) => `${quote?.insurer?.displayName || "Insurer"} (${formatRmAmount(quote?.pricing?.finalPremium || 0)})`;

  return `2. Match known context to rubric:
   - Budget → ${lineFor(cheapest)}
   - Easy claims / Highway → ${lineFor(balanced)}
   - Max coverage → ${lineFor(mostComprehensive)}
   - Flood-prone → Add Special Perils (${formatRmAmount(ADD_ON_BY_ID.flood.price)})
   - Outdoor parking → Add Windscreen (price depends on selected coverage amount)`;
}

function buildSystemPrompt(state, vehicleProfile, promptVariant = 'A', liveKnowledgeSnapshot = []) {
  const currentQuotes = getQuotesFromState(state);
  const sharedNcdPercent = getSharedNcdPercent(currentQuotes);
  const sharedNcdDisplay = formatNcdPercent(sharedNcdPercent);
  const ncdGuidanceLine = sharedNcdDisplay
    ? `- Current quote set uses the same fixed ${sharedNcdDisplay}% NCD across all insurers.`
    : '- Treat NCD as a pricing input, not an insurer benefit.';
  const roadTaxPricingLine = `**Road Tax:** 12-month Digital Road Tax RM 90. From ${PRINTED_ROAD_TAX_EFFECTIVE_DATE}, printed road tax is only available for vehicles registered under a Foreign ID or Company Registration.`;
  const variantInstruction = getPromptVariantInstruction(promptVariant);
  const dynamicPricing = buildDynamicPricingPromptSections(state);
  const recommendationRubric = buildDynamicRecommendationRubric(state);
  const liveKnowledgeSection = Array.isArray(liveKnowledgeSnapshot) && liveKnowledgeSnapshot.length > 0
    ? liveKnowledgeSnapshot.map((line) => `- ${line}`).join('\n')
    : '- No live insurer fact loaded this turn. Use verified facts only and avoid guessing.';

  return `You are LAJOO, a professional Malaysian motor insurance renewal consultant inside a chat interface.

## COMMUNICATION STYLE
- Be minimal — say less, mean more
- Sound smart — confident, not wordy
- Use simple English — easy for everyone
- Friendly but efficient — warm tone, no fluff
- Vary phrasing naturally; avoid repeating the same stock line across turns
- If user is playful/unclear, acknowledge naturally first, then ask one clarifying question
- Max 2-3 sentences for routine steps; up to 5-6 when helping user decide
- Bold key info (prices, names, action items)

## PERSONALITY
- You're not just an info bot — you're a smart assistant helping the user get the best deal and complete their renewal
- When answering questions about something LAJOO can do (road tax, insurance, claims), always tie it back: answer the question, then remind them you can help right here and now
- Be genuinely helpful first, then gently guide back to the current step — never pushy, always natural
- For objections (price/brand/availability), use this order: acknowledge concern -> give clear factual answer -> offer best next option -> ask one simple close question

## PROMPT VARIANT
${variantInstruction}

## CURRENT STATE
${state.getAIContext()}
${vehicleProfile ? `Vehicle: ${vehicleProfile.make} ${vehicleProfile.model} ${vehicleProfile.year} | ${vehicleProfile.engineCC}cc | ${vehicleProfile.address.city} | NCD: ${vehicleProfile.ncdPercent}%` : ''}

## PRICES (exact amounts — ALWAYS use "RM xxx" with space)
**Insurance:**
${dynamicPricing.insuranceLines}

**Add-Ons:** ${dynamicPricing.addOnsLine}

${roadTaxPricingLine}

## LIVE INSURER KNOWLEDGE (DATABASE)
${liveKnowledgeSection}
- If this section conflicts with older generic wording, prioritize this section.
- For insurer/policy factual answers, use PostgreSQL-grounded references only.
- Never treat quote-card bullets or old generic copy as authoritative policy facts.

## RECOMMENDATION LOGIC
When user asks "which one?" / "help me decide" / "recommend":
1. If user preference is clear, recommend directly. If unclear, ask ONE discovery question: priority (budget/claims/coverage), usage (commute/highway), or risk (parking/flood area)
${recommendationRubric}
3. Give ONE confident recommendation with price, ONE reason, then ask "Want to go with this?"

## NCD POSITIONING (CRITICAL)
- NCD is a shared pricing adjustment, not an insurer-specific benefit.
${ncdGuidanceLine}
- Never use NCD as a differentiator between ${AVAILABLE_INSURER_NAMES_TEXT}.
- If needed, mention NCD once as a shared note, not as per-insurer benefit bullets.

## FORMATTING RULES
- **Price format**: ALWAYS "RM xxx" with space (RM 796, not RM796)
- **Progress wording**: Keep the flow internally, but do not over-expose "Step X of 6". Use natural consultant wording in normal replies. Only show explicit progress headers when a deterministic transaction/selection block requires it.
- **Summary box**: Keep a compact "Order Summary (plate)" block with key lines (Policy Period, Sum Insured, Insurance, Add-ons, Tax, Road tax), then bold "Total: RM xxx"
- **Quote cards**: Each quote on separate lines with logo, features, strikethrough price
- **Vehicle info**: Use this exact compact profile format:
  Plate number on its own line, bold, 18px, #000000
  Year Make Model Engine (Auto-cc), bold
  light grey divider line
  Bold label only: Policy Period : ...
  Bold label only: Market Value : ...
  Bold label only: Owner IC : masked with &bull;&bull;&bull;&bull;
  Bold label only: Coverage Type: ...
  Bold label only: No Claim Discount (NCD): ...
- One emoji per message max

## FLOW RULES
- Flow order: Plate+IC → Confirm vehicle → Quotes → Select insurer → Add-ons → Road tax → Details → OTP → Payment
- Never skip steps or show quotes without vehicle info
- Collect ALL 3 details (email, phone, address) before OTP
- If indirect answer ("I don't drive much"), acknowledge + recommend + confirm before proceeding

## RETENTION
If they mention other insurers/platforms, highlight our value and offer a concise comparison. If they want to think/compare, offer to save progress and continue later.`;
}

// ============================================================================
// AI FUNCTION EXECUTION
// ============================================================================

async function executeFunction(functionName, args) {
  console.log(`[AI Function] ${functionName}`, args);

  switch (functionName) {
    case "search_insurance_knowledge": {
      const query = String(args?.query || '').trim();
      const results = await searchInsurerKnowledgeFromDb(query, { limit: 6, maxChunkCandidates: 320 });
      return results.length > 0
        ? { found: true, source: "postgresql", results: results.slice(0, 6) }
        : { found: false, source: "postgresql", message: "No specific insurer information found in database" };
    }

    case "explain_insurance_term": {
      const term = String(args?.term || '').trim();
      const results = await searchInsurerKnowledgeFromDb(term, { limit: 4, maxChunkCandidates: 280 });
      return results.length > 0
        ? {
            term,
            explanation: results[0].answer,
            references: results.slice(0, 3).map((entry) => entry.question),
            source: "postgresql",
          }
        : { term, explanation: `I couldn't find this term in the insurer database yet.`, source: "postgresql" };
    }

    case "recommend_coverage":
      const recommendations = [];
      if (args.carValue > 30000) {
        recommendations.push({ type: "Comprehensive", priority: "Essential" });
      }
      const floodAreas = ['selangor', 'penang', 'kelantan', 'johor'];
      if (args.location && floodAreas.some(a => args.location.toLowerCase().includes(a))) {
        recommendations.push({ type: "Flood Coverage", priority: "Highly Recommended" });
      }
      if (args.usage === 'daily commute') {
        recommendations.push({ type: "Windscreen", priority: "Recommended" });
      }
      return { recommendations };

    case "calculate_ncd_entitlement":
      const ncdLevels = { 0: 0, 1: 25, 2: 30, 3: 38.33, 4: 45, 5: 55 };
      const years = Math.min(args.yearsNoClaims, 5);
      return {
        yearsNoClaims: args.yearsNoClaims,
        ncdEntitlement: ncdLevels[years] || 55,
        maxNCD: 55,
      };

    case "lookup_previous_policy":
      // Mock lookup - in production, call actual API
      return {
        found: true,
        registrationNumber: args.registrationNumber,
        insurer: "Takaful Ikhlas",
        ncd: 20,
        expiryDate: "2025-03-15",
        coverType: "Comprehensive",
      };

    case "get_insurance_quotes":
      // Return the standard quote panel.
      const quotes = getQuotes();
      return quotes.map(q => ({
        insurer: q.insurer.displayName,
        priceAfter: q.pricing.finalPremium,
        priceBefore: q.pricing.basePremium,
        ncdPercent: q.pricing.ncdPercent,
        sumInsured: q.sumInsured,
      }));

    case "validate_registration_number":
      const plateRegex = /^[A-Z]{1,3}\s?\d{1,4}(\s?[A-Z]{1,3})?$/i;
      const isValid = plateRegex.test(args.registrationNumber?.trim() || '');
      return {
        registrationNumber: args.registrationNumber,
        isValid,
        hasHistory: isValid,
        error: isValid ? null : "Invalid Malaysian plate format",
      };

    case "get_available_addons":
      return {
        addons: ADD_ON_CATALOG.map((addOn) => ({
          id: addOn.id,
          name: addOn.name,
          price: addOn.hasCoverageInput ? null : addOn.price,
          defaultCoverage: addOn.defaultCoverage || null,
          defaultPrice: addOn.hasCoverageInput ? calculateWindscreenPremium(addOn.defaultCoverage) : null,
          description: addOn.info,
        })),
      };

    case "get_roadtax_options":
      return {
        options: [
          { duration: '12 months', digital: 90 },
        ],
      };

    case "calculate_total_premium":
      const addOnsTotal = (args.addOns || []).reduce((sum, price) => sum + price, 0);
      const roadTaxAmount = args.roadTax || 0;
      return {
        basePremium: args.basePremium,
        addOns: addOnsTotal,
        roadTax: roadTaxAmount,
        total: args.basePremium + addOnsTotal + roadTaxAmount,
      };

    case "update_conversation_state":
      // State is managed externally; this is informational only
      return { success: true, step: args.step, action: args.action };

    case "compare_coverage_types":
      const comparisons = {
        'comprehensive-third party': {
          type1: 'Comprehensive',
          type2: 'Third Party',
          differences: [
            'Comprehensive covers your own vehicle damage; Third Party does not',
            'Comprehensive is more expensive but provides full protection',
            'Third Party only covers damage you cause to others',
          ],
          recommendation: 'Comprehensive recommended for vehicles worth > RM 30k',
        },
        'takaful-conventional': {
          type1: 'Takaful',
          type2: 'Conventional',
          differences: [
            'Takaful is Shariah-compliant Islamic insurance',
            'Takaful uses risk-sharing model; conventional uses risk-transfer',
            'Surplus in Takaful may be shared with participants',
          ],
          recommendation: 'Choose based on personal preference; coverage is similar',
        },
      };
      const key = `${args.type1?.toLowerCase()}-${args.type2?.toLowerCase()}`;
      return comparisons[key] || { type1: args.type1, type2: args.type2, differences: ['Both provide motor insurance coverage'], recommendation: 'Consult for specific differences' };

    case "explain_claims_process":
      const claimProcesses = {
        accident: {
          steps: ['Lodge police report within 24 hours', 'Take photos of damage', 'Call insurer hotline', 'Send car to panel workshop', 'Submit claim form'],
          timeline: '5-14 working days for approval',
          documents: ['Police report', 'IC copy', 'Driving license', 'Claim form'],
        },
        theft: {
          steps: ['Lodge police report immediately', 'Notify insurer within 24 hours', 'Submit all documents', 'Wait for investigation'],
          timeline: '1-3 months for settlement',
          documents: ['Police report', 'IC copy', 'Car grant', 'All car keys'],
        },
        windscreen: {
          steps: ['Take photo of damage', 'Call insurer', 'Visit panel workshop', 'Pay excess if any'],
          timeline: '1-3 working days',
          documents: ['IC copy', 'Photo of damage'],
        },
        flood: {
          steps: ['Document damage with photos/video', 'Do not start engine', 'Call insurer', 'Tow to workshop'],
          timeline: '7-21 working days',
          documents: ['Police report', 'Photos', 'Claim form'],
        },
        general: {
          steps: ['Report to insurer', 'Submit required documents', 'Follow insurer instructions'],
          timeline: 'Varies by claim type',
          documents: ['IC copy', 'Policy details', 'Relevant proof'],
        },
      };
      return claimProcesses[args.claimType] || claimProcesses.general;

    case "estimate_premium_savings":
      const savingsWithNCD = args.basePremium * (args.ncdPercent / 100);
      return {
        basePremium: args.basePremium,
        ncdPercent: args.ncdPercent,
        savings: Math.round(savingsWithNCD),
        finalPremium: Math.round(args.basePremium - savingsWithNCD),
      };

    case "check_renewal_eligibility":
      const today = new Date();
      const expiry = args.policyExpiryDate ? new Date(args.policyExpiryDate) : null;
      const daysUntilExpiry = expiry ? Math.ceil((expiry - today) / (1000 * 60 * 60 * 24)) : null;
      return {
        eligible: !args.hasActiveClaims && (daysUntilExpiry === null || daysUntilExpiry <= 60),
        daysUntilExpiry,
        hasActiveClaims: args.hasActiveClaims || false,
        message: args.hasActiveClaims ? 'Please settle active claims first' : 'Eligible for renewal',
      };

    default:
      return { error: `Unknown function: ${functionName}` };
  }
}

// ============================================================================
// MAIN API HANDLER
// ============================================================================

export async function POST(request) {
  try {
    const requestBody = await request.json();
    const requestMessages = Array.isArray(requestBody?.messages) ? requestBody.messages : [];
    const sessionId = normalizeChatSessionId(requestBody?.sessionId);
    const serverSession = await loadChatSession(sessionId);
    const clientState = requestBody?.state || null;
    const messages = resolveMessagesForTurn({
      serverMessages: serverSession?.messages || [],
      requestMessages,
    });

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Missing messages array" }, { status: 400 });
    }

    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    const looksLikePlaceholderKey =
      !apiKey ||
      apiKey === "sk-..." ||
      apiKey.includes("...") ||
      apiKey.length < 20;
    if (looksLikePlaceholderKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is missing or invalid. Set a real key in .env.local (localhost) or Vercel Environment Variables, then restart." },
        { status: 500 }
      );
    }

    // ========================================================================
    // 1. BUILD STATE — prefer server session state, fall back to legacy client state/text inference
    // ========================================================================
    const serverState = await getStateFromSession(serverSession);
    const state = serverState || ConversationState.fromJSON(clientState) || ConversationState.fromMessages(messages);
    const stepBeforeMutation = state.step;
    const latestMessage = messages[messages.length - 1]?.content || "";
    const intent = detectUserIntent(latestMessage, state);
    const promptVariant = resolvePromptVariant(state, messages);
    ensureExperimentState(state, promptVariant);
    state.experiment.promptVariant = promptVariant;
    let roadTaxDeliveryBlocked = false;
    let blockedRoadTaxOption = null;
    let shouldInjectPaymentLinkFallback = false;
    let paymentLinkFallback = null;
    let lowConfidenceNeedsClarification = false;
    let forcedAssistantResponse = null;

    console.log('Session ID:', sessionId);
    console.log('State source:', serverState ? 'server session' : (clientState ? 'legacy client fallback' : 'inferred from messages'));
    console.log('[AI_INTENT_TRACE]', JSON.stringify({
      step: state.step,
      intent: intent.intent,
      confidence: intent.confidence,
      hasPendingAction: !!state.pendingAction,
      promptVariant: state?.experiment?.promptVariant || 'A',
      experimentMode: state?.experiment?.experimentMode || 'off',
      timestamp: new Date().toISOString(),
    }));

    // ========================================================================
    // 1b. APPLY INTENT-DRIVEN STATE MUTATIONS
    // The persisted state does not include the latest user action yet.
    // Apply it now based on the detected intent.
    // ========================================================================
    if (intent.intent === USER_INTENTS.SELECT_QUOTE && intent.data?.insurer) {
      const quote = quoteSelectionFromIntent(state, intent.data.insurer);
      if (quote) {
        state.selectQuote(quote);
        const tx = ensureTransactionState(state);
        tx.quoteId = quote.quoteId || tx.quoteId || null;
      }
    }

    if (state.pendingAction?.type === 'collect_windscreen_coverage') {
      const coverageAmount = extractWindscreenCoverageAmount(latestMessage, { allowBareAmount: true });
      const pendingAddOnIds = Array.isArray(state.pendingAction.addOnIds)
        ? state.pendingAction.addOnIds
        : ['windscreen'];
      const skipWindscreen = /\b(skip|no|none|without|cancel)\b/i.test(latestMessage);

      if (coverageAmount || skipWindscreen) {
        const finalAddOnIds = skipWindscreen
          ? pendingAddOnIds.filter((id) => id !== 'windscreen')
          : pendingAddOnIds;
        const addOns = buildAddOnsFromSelection(finalAddOnIds, { coverageAmount: coverageAmount || DEFAULT_WINDSCREEN_COVERAGE });
        state.selectAddOns(addOns);
        forcedAssistantResponse = buildRoadTaxStepBlock(buildSummaryBox(state), state);
      } else {
        forcedAssistantResponse = buildWindscreenCoveragePrompt(buildSummaryBox(state), pendingAddOnIds);
      }
    }

    if (intent.intent === USER_INTENTS.SELECT_ADDON && intent.data && !forcedAssistantResponse) {
      const addOnIds = Array.isArray(intent.data.addOns) ? intent.data.addOns : [];
      const coverageAmount = intent.data.windscreenCoverage ||
        extractWindscreenCoverageAmount(latestMessage, { allowBareAmount: addOnIds.includes('windscreen') });
      if (addOnIds.includes('windscreen') && !coverageAmount) {
        state.setPendingAction({
          type: 'collect_windscreen_coverage',
          addOnIds,
        });
        forcedAssistantResponse = buildWindscreenCoveragePrompt(buildSummaryBox(state), addOnIds);
      } else {
        const addOns = buildAddOnsFromSelection(addOnIds, { coverageAmount });
        if (intent.data.confirmed) {
          state.selectAddOns(addOns);
        } else {
          state.preSelectAddOns(addOns);
        }
      }
    }

    if (intent.intent === USER_INTENTS.SELECT_ROADTAX && intent.data?.option) {
      const roadTaxMap = {
        '12month-digital': { name: '12 months digital road tax', price: 90 },
        '12month-physical': { name: '12 months physical + delivery', price: 100 },
        'none': { name: 'No Road Tax', price: 0 },
      };
      const selectedOption = intent.data.option;
      const isDeliveredOption = selectedOption.includes('deliver') || selectedOption.includes('physical');
      if (isDeliveredOption && !canUseDeliveredRoadTax(state)) {
        roadTaxDeliveryBlocked = true;
        blockedRoadTaxOption = selectedOption;
      } else {
        const roadTax = roadTaxMap[selectedOption];
        if (roadTax) state.selectRoadTax(roadTax);
      }
    }

    if (intent.intent === USER_INTENTS.VERIFY_OTP && intent.data?.valid) {
      state.verifyOTP();
    }

    if (intent.intent === USER_INTENTS.CHANGE_QUOTE) {
      // Ask for confirmation before destructive reset.
      state.setPendingAction({
        type: 'confirm_quote_change',
        newInsurer: intent.data?.newInsurer || null,
        currentInsurer: intent.data?.currentInsurer || getQuoteInsurerKey(state.selectedQuote) || null,
      });
      forcedAssistantResponse = buildQuoteChangeConfirmationReply(state, intent.data);
    }

    if (intent.intent === USER_INTENTS.CONFIRM_CHANGE_QUOTE) {
      // Guard against accidental "yes/ok" in non-change contexts.
      if (state.pendingAction?.type === 'confirm_quote_change' && intent.confidence >= 0.85) {
        const pendingQuoteChange = state.pendingAction;
        const selectedQuote = pendingQuoteChange?.newInsurer
          ? quoteSelectionFromIntent(state, pendingQuoteChange.newInsurer)
          : null;

        state.resetToQuotes();

        if (selectedQuote) {
          state.selectQuote(selectedQuote);
          const tx = ensureTransactionState(state);
          tx.quoteId = selectedQuote.quoteId || tx.quoteId || null;
          forcedAssistantResponse = buildQuoteChangeCompletedReply(state, selectedQuote);
        } else {
          forcedAssistantResponse = `No problem — please choose the insurer you want again.

${buildQuoteSelectionReply(state)}`;
        }
      }
    }

    if (intent.data?.cancelPendingAction) {
      forcedAssistantResponse = buildQuoteChangeCancelledReply(state);
      state.setPendingAction(null);
    }

    if (intent.intent === USER_INTENTS.CHANGE_ADDONS) {
      state.resetToAddOns();
      forcedAssistantResponse = `No problem — we can adjust your add-ons before continuing.

${buildAddOnsStepBlock(buildSummaryBox(state))}`;
    }

    // Pending quote-change confirmation is one-turn scoped. If user moves on, clear it.
    if (state.pendingAction?.type === 'confirm_quote_change' &&
        intent.intent !== USER_INTENTS.CHANGE_QUOTE &&
        intent.intent !== USER_INTENTS.CONFIRM_CHANGE_QUOTE &&
        !intent.data?.cancelPendingAction) {
      state.setPendingAction(null);
    }

    if (intent.intent === USER_INTENTS.SUBMIT_DETAILS &&
        (state.step === FLOW_STEPS.PERSONAL_DETAILS || state.step === FLOW_STEPS.OTP)) {
      const extracted = extractPersonalInfo(sanitizePersonalDetailExtractionInput(latestMessage));
      const existing = (state.personalDetails && typeof state.personalDetails === 'object') ? state.personalDetails : {};
      const recovered = collectPersonalDetailsFromMessages(messages);
      const merged = {
        email: extracted.email || asNonEmptyString(existing.email) || recovered.email || null,
        phone: extracted.phone || asNonEmptyString(existing.phone) || recovered.phone || null,
        address: extracted.address || asNonEmptyString(existing.address) || recovered.address || null,
      };

      const hasAny = !!(merged.email || merged.phone || merged.address);
      const hasAll = !!(merged.email && merged.phone && merged.address);

      state.personalDetails = hasAny ? merged : null;
      state.step = hasAll ? FLOW_STEPS.OTP : FLOW_STEPS.PERSONAL_DETAILS;
    }

    // Extract or update vehicle identifiers from latest message.
    // Allow updates before quote selection so users can correct wrong vehicle details.
    const vehicleExtract = extractVehicleInfo(latestMessage);
    const canUpdateVehicleIdentity = !state.selectedQuote &&
      [FLOW_STEPS.START, FLOW_STEPS.VEHICLE_LOOKUP, FLOW_STEPS.QUOTES].includes(state.step);

    // Skip vehicle update if user is just complaining about a field (NCD, engine, etc.) — not providing new plate/IC
    const isFieldComplaint = /\b(ncd|engine|postcode|cover type|policy)\b.*\b(wrong|incorrect|change|should be|supposed to|actually)\b|\b(wrong|incorrect|change)\b.*\b(ncd|engine|postcode|cover type|policy)\b|\bmy ncd is \d/i.test(latestMessage);

    if (canUpdateVehicleIdentity && intent.intent === USER_INTENTS.PROVIDE_INFO && !isFieldComplaint) {
      if (vehicleExtract.registrationNumber) {
        state.plateNumber = vehicleExtract.registrationNumber;
      }
      if (vehicleExtract.ownerId) {
        state.nricNumber = vehicleExtract.ownerId;
        state.ownerIdType = vehicleExtract.ownerIdType || null;
      }
      state.step = state._determineStep();
    } else if (!state.plateNumber || !state.nricNumber) {
      if (!state.plateNumber && vehicleExtract.registrationNumber) {
        state.plateNumber = vehicleExtract.registrationNumber;
      }
      if (!state.nricNumber && vehicleExtract.ownerId) {
        state.nricNumber = vehicleExtract.ownerId;
        state.ownerIdType = vehicleExtract.ownerIdType || null;
      }
      state.step = state._determineStep();
    }

    updateUserPreferencesFromMessage(state, latestMessage);
    updateExperimentTracking(state, intent, stepBeforeMutation);
    lowConfidenceNeedsClarification = shouldUseClarifyingTurn(intent, state);
    const conversationDecision = buildConversationDecision({
      message: latestMessage,
      intent,
      state,
      messages,
      stepBeforeMutation,
    });
    const turnPlan = buildTurnPlan({
      message: latestMessage,
      intent,
      state,
      decision: conversationDecision,
      engineContext: conversationDecision.engineContext,
    });

    console.log('=== LAJOO API ===');
    console.log('Intent:', intent.intent);
    console.log('Conversation mode:', conversationDecision.mode);
    console.log('Conversation action:', conversationDecision.action);
    console.log('Turn plan:', turnPlan.responsePattern);
    console.log('Turn safety:', turnPlan.safetyLevel);
    console.log('Step:', state.step);
    console.log('Prompt variant:', state?.experiment?.promptVariant || 'A');
    console.log('Experiment mode:', state?.experiment?.experimentMode || 'off');
    console.log('Conversion rate (decision turns):', `${((state?.experiment?.conversionRate || 0) * 100).toFixed(1)}%`);
    console.log('Low-confidence clarify mode:', lowConfidenceNeedsClarification);
    console.log('=================');

    // Deterministic policy guard: prevent incorrect "physical road tax" guidance.
    if (turnPlan.forcedResponse === TURN_FORCED_RESPONSES.PRINTED_ROADTAX_RESTRICTION) {
      forcedAssistantResponse = buildPrintedRoadTaxRestrictionReply(state);
    }

    // ========================================================================
    // 2. GET VEHICLE PROFILE IF WE HAVE BOTH IDENTIFIERS
    // ========================================================================
    let vehicleProfile = null;
    if (state.hasCompleteVehicleIdentification()) {
      const normalizedPlate = String(state.plateNumber || '').replace(/\s+/g, '').toUpperCase();
      const normalizedOwnerId = String(state.nricNumber || '').replace(/[\s-]+/g, '').toUpperCase();
      const looksLikePlateValue = /^[A-Z0-9]{4,10}$/.test(normalizedOwnerId);
      const samePlateAndOwner = normalizedPlate && normalizedOwnerId && normalizedPlate === normalizedOwnerId;

      if (samePlateAndOwner && looksLikePlateValue) {
        state.nricNumber = null;
        state.ownerIdType = null;
        state.step = state._determineStep();
        forcedAssistantResponse = `${formatStepLine(1, 'Vehicle Info')}

I received the same value for both **vehicle plate** and **owner identification number**.

Please share your **owner identification number** (NRIC / Foreign ID / Army IC / Police IC / Company Reg. No.) so I can verify your vehicle record.`;
      } else {
        const gatewayVehicleContext = await loadVehicleAndQuotesFromGateway(state);
        let vehicleLookupServiceUnavailable = false;

        if (gatewayVehicleContext?.vehicleProfile) {
          vehicleProfile = gatewayVehicleContext.vehicleProfile;
          if (vehicleProfile.ownerIdType) {
            state.ownerIdType = vehicleProfile.ownerIdType;
          }
        } else if (gatewayVehicleContext?.notFound) {
          vehicleProfile = null;
        } else {
          vehicleLookupServiceUnavailable = true;
        }

        state.vehicleInfo = vehicleProfile;
        if (!vehicleProfile) {
          state.selectedQuote = null;
          state.lastRecommendedInsurer = null;
          state.selectedAddOns = [];
          state.addOnsConfirmed = false;
          state.selectedRoadTax = null;
          state.personalDetails = null;
          state.otpVerified = false;
          state.paymentMethod = null;
          state.pendingAction = null;
          state.step = FLOW_STEPS.VEHICLE_LOOKUP;

          const plateDisplay = formatPlateNumberForDisplay(state.plateNumber);
          if (vehicleLookupServiceUnavailable) {
            forcedAssistantResponse = `${formatStepLine(1, 'Vehicle Info')}

I couldn't reach the insurer verification service just now, so I couldn't verify **${plateDisplay}** yet.

Please try again in a moment. If this keeps happening, make sure your Mockoon insurer API is running, then resend your **vehicle plate** and **owner identification number**.`;
          } else {
            forcedAssistantResponse = `${formatStepLine(1, 'Vehicle Info')}

I couldn't verify a vehicle record for **${plateDisplay}** with owner ID **${state.nricNumber}**.

Please double-check both details and try again.

Please re-enter your **vehicle plate** and **owner identification number** to continue.`;
          }
        }
      }
    }

    // ========================================================================
    // 2b. TRANSACTION SIDE EFFECTS (Mockoon backend integration)
    // Keep conversational flow unchanged; these run behind the scenes.
    // ========================================================================
    if (intent.intent === USER_INTENTS.SELECT_ROADTAX && state.selectedRoadTax && !roadTaxDeliveryBlocked) {
      const repriceResult = await syncRepriceFromGateway(state);
      if (!repriceResult.ok && repriceResult.error) {
        const code = String(repriceResult.error?.code || '').toUpperCase();
        if (code === 'ROADTAX_PRINTED_NOT_ELIGIBLE') {
          state.selectedRoadTax = null;
          state.step = FLOW_STEPS.ROADTAX;
          forcedAssistantResponse = buildPrintedRoadTaxRestrictionReply(state);
        } else if (code === 'RATE_LIMITED') {
          forcedAssistantResponse = 'We are receiving too many requests right now. Please wait about 30 seconds and try again.';
        } else {
          console.warn('[insurer-gateway] Reprice failed, continue with local totals.', repriceResult.error?.message || repriceResult.error);
        }
      }
    }

    if (intent.intent === USER_INTENTS.CONFIRM && state.step === FLOW_STEPS.OTP) {
      const proposalResult = await ensureProposalSubmittedInGateway(state);
      if (!proposalResult.ok) {
        console.warn('[insurer-gateway] Proposal preparation failed at OTP confirm step.', proposalResult.error?.message || proposalResult.reason || proposalResult.error);
      }
    }

    if (intent.intent === USER_INTENTS.VERIFY_OTP) {
      const paymentIntentResult = await ensurePaymentIntentInGateway(state);
      if (!paymentIntentResult.ok) {
        console.warn('[insurer-gateway] Payment intent prepare failed after OTP verification.', paymentIntentResult.error?.message || paymentIntentResult.error);
      }
    }

    if (intent.intent === USER_INTENTS.SELECT_PAYMENT) {
      const selectedMethod = String(intent?.data?.method || '').toLowerCase();
      const shouldFinalizePayment = selectedMethod && selectedMethod !== 'any';
      if (shouldFinalizePayment) {
        const paymentResult = await processPaymentAndIssuePolicyInGateway(state, selectedMethod);
        if (paymentResult.ok) {
          state.setPaymentMethod(selectedMethod);
          forcedAssistantResponse = buildPolicyIssuedReply(state);
        } else if (paymentResult.error) {
          forcedAssistantResponse = buildPaymentFailureReply(paymentResult.error, state);
          state.step = FLOW_STEPS.PAYMENT;
        }
      }
    }

    if (
      isPaymentCompletionClaim(latestMessage) &&
      String(ensureTransactionState(state).paymentStatus || '').toUpperCase() !== 'PAID'
    ) {
      forcedAssistantResponse = buildUnverifiedPaymentClaimReply(state);
    }

    // ========================================================================
    // 3. BUILD AI MESSAGES
    // ========================================================================
    const { openAiMessages, knowledgeSourceTrace } = await buildProductionOpenAiMessages({
      sessionId,
      latestMessage,
      messages,
      state,
      decision: conversationDecision,
      turnPlan,
      intent,
      vehicleProfile,
      promptVariant,
      buildSystemPrompt,
      buildStepContractInstruction,
      buildAntiRepetitionInstruction,
    });
    const deterministicFlowResult = applyDeterministicFlowHandlers({
      openAiMessages,
      state,
      intent,
      turnPlan,
      messages,
      latestMessage,
      vehicleProfile,
      forcedAssistantResponse,
      roadTaxDeliveryBlocked,
      blockedRoadTaxOption,
      lowConfidenceNeedsClarification,
      paymentLinkFallback,
      shouldInjectPaymentLinkFallback,
      callbacks: {
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
        buildPaymentLink: (stateForPaymentLink) => buildPaymentLink(stateForPaymentLink, { sessionId }),
        buildPaymentStepBlock,
        buildQuestionFirstThenStepCloseInstruction,
        buildClarifyingQuestionInstruction,
        OTP_PROMPT_COPY,
        formatRmAmount,
      },
    });
    forcedAssistantResponse = deterministicFlowResult.forcedAssistantResponse;
    paymentLinkFallback = deterministicFlowResult.paymentLinkFallback;
    shouldInjectPaymentLinkFallback = deterministicFlowResult.shouldInjectPaymentLinkFallback;

    // ========================================================================
    // GLOBAL SUMMARY BOX INJECTION
    // After an insurer is selected, ALWAYS include the summary box in the
    // system prompt - regardless of user wording or detected intent.
    // This ensures the summary is never missing due to regex detection failures.
    // ========================================================================
    const shouldInjectSummary =
      state.selectedQuote &&
      state.step !== FLOW_STEPS.QUOTES &&
      state.step !== FLOW_STEPS.PERSONAL_DETAILS &&
      state.step !== FLOW_STEPS.OTP &&
      !lowConfidenceNeedsClarification &&
      intent.intent !== USER_INTENTS.ASK_QUESTION &&
      intent.intent !== USER_INTENTS.UNCLEAR_OR_PLAYFUL &&
      intent.intent !== USER_INTENTS.OTHER &&
      intent.intent !== USER_INTENTS.SUBMIT_DETAILS &&
      intent.intent !== USER_INTENTS.VERIFY_OTP &&
      intent.intent !== USER_INTENTS.SELECT_PAYMENT &&
      intent.intent !== USER_INTENTS.CHANGE_QUOTE;
    const summaryBoxCanonical = state.selectedQuote ? buildSummaryBox(state) : null;
    const summaryBoxFallback = shouldInjectSummary ? buildSummaryBox(state) : null;
    const shouldCanonicalizeSummaryLayout =
      !!summaryBoxCanonical &&
      state.step !== FLOW_STEPS.QUOTES &&
      state.step !== FLOW_STEPS.OTP;
    const shouldForcePaymentStepStructure =
      state.step === FLOW_STEPS.PAYMENT &&
      (intent.intent === USER_INTENTS.VERIFY_OTP || intent.intent === USER_INTENTS.SELECT_PAYMENT) &&
      !state.isQuoteExpired() &&
      !!summaryBoxCanonical &&
      !!paymentLinkFallback;
    const shouldForceRoadTaxStepStructure =
      state.step === FLOW_STEPS.ROADTAX &&
      intent.intent === USER_INTENTS.SELECT_ADDON &&
      !!summaryBoxCanonical;
    const shouldForceAddOnsStepStructure =
      state.step === FLOW_STEPS.ADDONS &&
      (intent.intent === USER_INTENTS.SELECT_QUOTE || intent.intent === USER_INTENTS.CONFIRM) &&
      !!summaryBoxCanonical;
    const shouldForceDetailsStepStructure =
      state.step === FLOW_STEPS.PERSONAL_DETAILS &&
      intent.intent === USER_INTENTS.SELECT_ROADTAX &&
      !!summaryBoxCanonical;

    if (shouldInjectSummary) {
      openAiMessages.push({
        role: "system",
        content: `IMPORTANT: User has selected an insurer. Your response MUST ALWAYS include this summary box somewhere in your response:

${summaryBoxFallback}

This summary box must appear in EVERY response from now on until payment is complete. Do not skip it regardless of what the user asks or says.`,
      });
    }

    // ========================================================================
    // 4. CALL OPENAI
    // ========================================================================
    let aiResponse = "";
    let functionCalls = [];

    if (forcedAssistantResponse) {
      aiResponse = forcedAssistantResponse;
    } else {
      const MAX_ITERATIONS = 5;
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const completion = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            messages: openAiMessages,
            functions: AI_FUNCTIONS,
            function_call: "auto",
            temperature: 0.7,
          }),
        });

        if (!completion.ok) {
          const errorText = await completion.text();
          throw createOpenAiApiError(completion, errorText);
        }

        const data = await completion.json();
        const message = data.choices[0].message;
        openAiMessages.push(message);

        if (message.function_call) {
          const result = await executeFunction(
            message.function_call.name,
            JSON.parse(message.function_call.arguments)
          );
          functionCalls.push({ name: message.function_call.name, result });
          openAiMessages.push({
            role: "function",
            name: message.function_call.name,
            content: JSON.stringify(result),
          });
          continue;
        }

        if (message.content) {
          aiResponse = message.content;
          break;
        }
      }
    }

    // Enforce visible step indicator on all renewal stages if AI omits it.
    const postProcessContext = { intent, messages, vehicleProfile, lowConfidenceNeedsClarification, conversationDecision };
    if (!forcedAssistantResponse) {
      const expectedStepLine = shouldSuppressStepLine(conversationDecision)
        ? null
        : getExpectedStepLine(intent, state, messages);
      aiResponse = normalizePriceFormatSpacing(aiResponse);
      aiResponse = stripDisallowedStep2IntroLine(aiResponse);
      aiResponse = stripVehicleDetailBullets(aiResponse);
      aiResponse = normalizeAddOnsNoteQuestionParagraphs(aiResponse);
      aiResponse = ensureSummaryIfMissing(aiResponse, summaryBoxFallback, shouldInjectSummary);
      aiResponse = ensureSummaryLayoutConsistency(aiResponse, summaryBoxCanonical, shouldCanonicalizeSummaryLayout);
      aiResponse = ensureStepLineIfMissing(aiResponse, expectedStepLine);
      aiResponse = dedupeConsecutiveStepLines(aiResponse);
      aiResponse = ensurePaymentLinkIfMissing(aiResponse, paymentLinkFallback, shouldInjectPaymentLinkFallback);
      if (!lowConfidenceNeedsClarification) {
        const responseBeforeStepCloseGuard = aiResponse;
        aiResponse = ensureStepCloseIfMissing(aiResponse, state, postProcessContext);
        if (aiResponse !== responseBeforeStepCloseGuard) {
          console.log('Step close guard applied for step:', state.step);
        }
      }
      aiResponse = normalizePriceFormatSpacing(aiResponse);

      const quality = evaluateResponseQuality(aiResponse, state, postProcessContext);
      if (quality.needsRewrite) {
        const model = process.env.OPENAI_MODEL || "gpt-4o";
        const rewritten = await rewriteResponseForQualityOnce({
          apiKey,
          model,
          originalResponse: aiResponse,
          qualityIssues: quality.issues,
          repeatedSentences: quality.repeatedSentences || [],
          state,
          context: postProcessContext,
        });

        if (rewritten !== aiResponse) {
          console.log('Quality rewrite applied. Issues:', quality.issues.join(', '));
        }

        aiResponse = normalizePriceFormatSpacing(rewritten);
        aiResponse = stripDisallowedStep2IntroLine(aiResponse);
        aiResponse = stripVehicleDetailBullets(aiResponse);
        aiResponse = normalizeAddOnsNoteQuestionParagraphs(aiResponse);
        aiResponse = ensureSummaryIfMissing(aiResponse, summaryBoxFallback, shouldInjectSummary);
        aiResponse = ensureSummaryLayoutConsistency(aiResponse, summaryBoxCanonical, shouldCanonicalizeSummaryLayout);
        aiResponse = ensureStepLineIfMissing(aiResponse, expectedStepLine);
        aiResponse = dedupeConsecutiveStepLines(aiResponse);
        aiResponse = ensurePaymentLinkIfMissing(aiResponse, paymentLinkFallback, shouldInjectPaymentLinkFallback);
        if (!lowConfidenceNeedsClarification) {
          aiResponse = ensureStepCloseIfMissing(aiResponse, state, postProcessContext);
        }
        aiResponse = normalizePriceFormatSpacing(aiResponse);
      }

      if (shouldForcePaymentStepStructure) {
        const paymentStepBlock = buildPaymentStepBlock(summaryBoxCanonical, paymentLinkFallback);
        aiResponse = paymentStepBlock;
      }

      if (shouldForceRoadTaxStepStructure) {
        aiResponse = buildRoadTaxStepBlock(summaryBoxCanonical, state);
      }

      if (shouldForceAddOnsStepStructure) {
        aiResponse = `Great choice! ✅\n\n${buildAddOnsStepBlock(summaryBoxCanonical)}`;
      }

      if (shouldForceDetailsStepStructure) {
        aiResponse = buildDetailsStepBlock(summaryBoxCanonical, state.selectedRoadTax?.name || null);
      }
    }

    updateLastRecommendedInsurerMemory(state, aiResponse);
    const summaryCard = state.selectedQuote && SUMMARY_SECTION_REGEX.test(aiResponse)
      ? buildSummaryCardData(state)
      : null;
    const addOnsCard = state.selectedQuote && ADDONS_SECTION_REGEX.test(aiResponse)
      ? buildAddOnsCardData(state)
      : null;
    const roadTaxCard = state.selectedQuote && ROADTAX_SECTION_REGEX.test(aiResponse)
      ? buildRoadTaxCardData(state)
      : null;
    if (state.selectedQuote && PAYMENT_SECTION_REGEX.test(aiResponse)) {
      await persistPaymentSnapshotForState(state, sessionId);
    }
    const paymentCard = state.selectedQuote && PAYMENT_SECTION_REGEX.test(aiResponse)
      ? buildPaymentCardData(state, { sessionId })
      : null;

    const captureReason = getIntentCaptureReason({
      intent,
      lowConfidenceNeedsClarification,
    });
    if (captureReason) {
      await appendIntentCaptureSample({
        reason: captureReason,
        step: state.step,
        userMessage: latestMessage,
        assistantReply: aiResponse,
        intent,
        lowConfidenceNeedsClarification,
        state,
      });
    }

    const persistedMessages = appendAssistantMessageForStorage(messages, {
      content: aiResponse,
      summaryCard,
      addOnsCard,
      roadTaxCard,
      paymentCard,
      knowledgeTrace: knowledgeSourceTrace,
    });
    logKnowledgeSourceTrace(knowledgeSourceTrace);
    const sessionMetadata = appendKnowledgeSourceTraceToMetadata(
      serverSession?.metadata || {},
      knowledgeSourceTrace,
      {
        step: state.step,
        conversationMode: conversationDecision.mode,
        turnPlan: turnPlan.responsePattern,
        promptVariant: state?.experiment?.promptVariant || 'A',
      }
    );
    const savedSession = await saveChatSession({
      sessionId,
      state,
      messages: persistedMessages,
      lastIntent: intent,
      metadata: sessionMetadata,
    });

    // ========================================================================
    // 5. STREAM RESPONSE
    // ========================================================================
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Stream message word by word
        const words = aiResponse.split(' ');
        words.forEach((word, index) => {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: "chunk", content: (index > 0 ? ' ' : '') + word })}\n\n`
          ));
        });

        // Send done with full response
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            type: "done",
            reply: aiResponse,
            sessionId: savedSession.sessionId,
            state: serializeStateForClient(state),
            summaryCard,
            addOnsCard,
            roadTaxCard,
            paymentCard,
          })}\n\n`
        ));

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });

  } catch (error) {
    console.error("Chat API Error:", error);
    const safeErrorPayload = buildSafeChatErrorPayload(error);
    return new Response(
      `data: ${JSON.stringify(safeErrorPayload)}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      }
    );
  }
}
