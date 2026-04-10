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
import { getQuotes, ADDONS } from "@/lib/insuranceData";
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
import {
  parseRecommendedInsurerFromAssistantMessage,
  isVehicleDetailsRejectionMessage,
  wasLastAssistantVehicleConfirmation,
  canUseDeliveredRoadTaxByOwnerType,
} from "@/lib/flowGuards";
import { appendIntentCaptureSample, getIntentCaptureReason } from "@/lib/intentEvalCapture";

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

const PRINTED_ROAD_TAX_EFFECTIVE_DATE = '1 Feb 2026';
const PRINTED_ROAD_TAX_POLICY_NOTE = `Please note that from ${PRINTED_ROAD_TAX_EFFECTIVE_DATE}, printed road tax is only for Foreign ID or Company vehicles.`;
const ADDONS_CLOSE_QUESTION = 'Based on your situation, which would you like? You can type 1, 2, 3, or a combo like 1 and 3. Or reply skip.';
const PERSONAL_DETAIL_EXAMPLES = {
  Email: 'name@email.com',
  'Phone number': '0123456789',
  Address: 'No 12, Jalan Setia 1, 47000 Shah Alam, Selangor',
};

const INSURER_UI_META = {
  TAKAFUL: {
    id: 'takaful-ikhlas',
    displayName: 'Takaful Ikhlas',
    logoUrl: '/partners/takaful.svg',
    features: ['Shariah-compliant (Islamic insurance)', 'Fast claim payout', 'Great value for money'],
  },
  ETIQA: {
    id: 'etiqa',
    displayName: 'Etiqa Insurance',
    logoUrl: '/partners/etiqa.svg',
    features: ['Free towing service up to 200km', 'Good customer service', 'Well-established local insurer'],
  },
  ALLIANZ: {
    id: 'allianz',
    displayName: 'Allianz Insurance',
    logoUrl: '/partners/allianz.svg',
    features: ['Premium service quality', 'Excellent claims network', 'Best customer service ratings'],
  },
};

const DEFAULT_TRANSACTION_STATE = {
  quoteId: null,
  reprice: null,
  proposalId: null,
  proposalStatus: null,
  paymentIntentId: null,
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

function getQuotesFromState(state) {
  const gatewayQuotes = state?.vehicleInfo?.quoteOptions;
  if (Array.isArray(gatewayQuotes) && gatewayQuotes.length > 0) {
    return gatewayQuotes;
  }
  return getQuotes();
}

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

function effectiveDateIso(daysFromNow = 30) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function calculateCurrentGrandTotal(state) {
  const insurance = Number(state?.selectedQuote?.priceAfter || 0);
  const addOns = (state?.selectedAddOns || []).reduce((sum, item) => sum + Number(item?.price || 0), 0);
  const roadTax = Number(state?.selectedRoadTax?.price || 0);
  return insurance + addOns + roadTax;
}

function insurerMetaFromGatewayQuote(quote) {
  const code = String(quote?.insurer?.code || '').toUpperCase();
  if (INSURER_UI_META[code]) return INSURER_UI_META[code];

  const name = String(quote?.insurer?.name || '').toLowerCase();
  if (name.includes('takaful') || name.includes('ikhlas')) return INSURER_UI_META.TAKAFUL;
  if (name.includes('etiqa')) return INSURER_UI_META.ETIQA;
  if (name.includes('allianz')) return INSURER_UI_META.ALLIANZ;

  return {
    id: code ? code.toLowerCase() : 'unknown-insurer',
    displayName: quote?.insurer?.name || 'Unknown Insurer',
    logoUrl: '',
    features: [],
  };
}

function mapGatewayQuoteToInternal(quote) {
  if (!quote || typeof quote !== 'object') return null;
  const meta = insurerMetaFromGatewayQuote(quote);

  const basePremium = Number(quote?.premium?.base || 0);
  const finalPremium = Number(quote?.premium?.final || 0);
  const ncdPercent = Number(quote?.premium?.ncd_percent || 0);
  const ncdDiscount = Number(quote?.premium?.ncd_amount || Math.max(0, basePremium - finalPremium));

  return {
    id: quote.quote_id || `${meta.id}-${Date.now()}`,
    insurer: {
      id: meta.id,
      displayName: meta.displayName,
      logoUrl: meta.logoUrl,
      features: meta.features,
    },
    sumInsured: Number(quote?.coverage?.sum_insured || 0),
    coverType: String(quote?.coverage?.type || 'COMPREHENSIVE').replace(/_/g, ' '),
    pricing: {
      basePremium,
      ncdPercent,
      ncdDiscount,
      finalPremium,
    },
    benefits: [...meta.features],
    addonsCatalog: Array.isArray(quote?.addons_catalog) ? quote.addons_catalog : [],
  };
}

function mapGatewayQuotesToInternal(gatewayQuotes = []) {
  const mapped = gatewayQuotes.map(mapGatewayQuoteToInternal).filter(Boolean);
  mapped.sort((a, b) => a.pricing.finalPremium - b.pricing.finalPremium);
  return mapped;
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

function quoteSelectionFromIntent(state, insurerKey) {
  const key = String(insurerKey || '').toLowerCase();
  const quotes = getQuotesFromState(state);
  const selected = quotes.find((q) => {
    const id = String(q?.insurer?.id || '').toLowerCase();
    const name = String(q?.insurer?.displayName || '').toLowerCase();
    if (key === 'takaful') return id.includes('takaful') || name.includes('takaful') || name.includes('ikhlas');
    if (key === 'etiqa') return id.includes('etiqa') || name.includes('etiqa');
    if (key === 'allianz') return id.includes('allianz') || name.includes('allianz');
    return false;
  });

  if (!selected) return null;
  return {
    insurer: selected.insurer.displayName,
    priceAfter: Number(selected.pricing?.finalPremium || 0),
    priceBefore: Number(selected.pricing?.basePremium || 0),
    ncdPercent: Number(selected.pricing?.ncdPercent || 0),
    sumInsured: Number(selected.sumInsured || 0),
    coverType: selected.coverType || 'Comprehensive',
    quoteId: selected.id || null,
  };
}

function quoteIdForCurrentSelection(state) {
  if (state?.selectedQuote?.quoteId) return state.selectedQuote.quoteId;

  const selectedInsurer = String(state?.selectedQuote?.insurer || '').toLowerCase();
  const fromLoadedQuotes = getQuotesFromState(state).find((q) =>
    String(q?.insurer?.displayName || '').toLowerCase() === selectedInsurer
  );
  if (fromLoadedQuotes?.id) return fromLoadedQuotes.id;

  const sampleId = state?.vehicleInfo?.sampleId;
  if (!sampleId) return null;

  if (selectedInsurer.includes('takaful') || selectedInsurer.includes('ikhlas')) {
    return `QT-${sampleId}-TAK-001`;
  }
  if (selectedInsurer.includes('etiqa')) {
    return `QT-${sampleId}-ETI-001`;
  }
  if (selectedInsurer.includes('allianz')) {
    return `QT-${sampleId}-ALL-001`;
  }
  return null;
}

function addOnIdsFromState(state) {
  return (state?.selectedAddOns || [])
    .map((item) => String(item?.id || item?.name || '').toLowerCase())
    .map((name) => {
      if (name.includes('windscreen')) return 'windscreen';
      if (name.includes('flood') || name.includes('special perils')) return 'flood';
      if (name.includes('e-hailing') || name.includes('ehailing')) return 'ehailing';
      return null;
    })
    .filter(Boolean);
}

function roadTaxOptionFromState(state) {
  const name = String(state?.selectedRoadTax?.name || '').toLowerCase();
  if (!name) return 'digital_12m';
  if (name.includes('no road tax') || name === 'none') return 'none';
  if (name.includes('printed') || name.includes('deliver')) return 'printed_12m';
  return 'digital_12m';
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

/** Build the quote summary box from current state */
function buildSummaryBox(state) {
  const insurer = state.selectedQuote?.insurer || 'Not selected';
  const insurerPrice = state.selectedQuote?.priceAfter || 0;
  const plateDisplay = formatPlateNumberForDisplay(state?.vehicleInfo?.plateNumber || state?.plateNumber);
  const policyEffectiveDisplay = getPolicyEffectiveRangeDisplay();
  const insurerQuote = getQuotesFromState(state).find((q) => q.insurer.displayName === insurer);
  const coverType = state?.vehicleInfo?.coverType || state?.selectedQuote?.coverType || 'Comprehensive';
  const sumInsured = state?.selectedQuote?.sumInsured || insurerQuote?.sumInsured || null;

  // Resolve logo from insurer name
  const logoMap = {
    'Takaful Ikhlas': '/partners/takaful.svg',
    'Etiqa Insurance': '/partners/etiqa.svg',
    'Allianz Insurance': '/partners/allianz.svg',
  };
  const logo = logoMap[insurer] || '';
  const insurerLine = insurerPrice
    ? `![${insurer}](${logo}) ${insurer} — RM ${insurerPrice.toLocaleString()}`
    : 'Not selected';

  const addOnsBlock = state.selectedAddOns.length > 0
    ? `**Add-ons:**  \n${state.selectedAddOns.map(a => `${a.name} — RM ${Number(a.price || 0).toLocaleString()}`).join('  \n')}`
    : '**Add-ons:** Not selected';
  const addOnsTotal = state.selectedAddOns.reduce((sum, a) => sum + (a.price || 0), 0);

  const roadTaxLine = state.selectedRoadTax && state.selectedRoadTax.price > 0
    ? `${state.selectedRoadTax.name} - RM ${state.selectedRoadTax.price}`
    : state.selectedRoadTax ? state.selectedRoadTax.name : 'Not selected';
  const roadTaxTotal = state.selectedRoadTax?.price || 0;

  const total = insurerPrice + addOnsTotal + roadTaxTotal;

return `<span style="font-size:1.12em;display:block">**✓ Renewal Summary** (${plateDisplay})</span>

**Policy Effective:** ${policyEffectiveDisplay}  
**Sum Insured:** ${sumInsured ? `RM ${sumInsured.toLocaleString()}` : 'N/A'}  
**Cover Type:** ${coverType}

**Insurer:** ${insurerLine}  
${addOnsBlock}  
**Road Tax:** ${roadTaxLine}

**Total:** &nbsp;<u>RM ${total.toLocaleString()}</u>`;
}

/** Build the 3-quote cards block */
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

/** Build the add-ons menu */
function buildAddOnsMenu() {
  return `1. **Windscreen** — RM ${ADDONS.WINDSCREEN.price}
2. **Special Perils (Flood & Natural Disaster)** — RM ${ADDONS.FLOOD.price}
3. **E-hailing** — RM ${ADDONS.EHAILING.price}

E-hailing add-on is compulsory for vehicles used for e-hailing services like Grab and others.`;
}

function canUseDeliveredRoadTax(state) {
  return canUseDeliveredRoadTaxByOwnerType(state?.ownerIdType || null);
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
  const modelDisplay = [profile.year, profile.make, profile.model].filter(Boolean).join(' ') || '-';
  const engineCc = Number.isFinite(Number(profile.engineCC))
    ? Number(profile.engineCC).toLocaleString()
    : String(profile.engineCC || '-');
  const postcode = profile?.address?.postcode || '-';
  const ncd = Number.isFinite(Number(profile.ncdPercent))
    ? `${Number(profile.ncdPercent)}%`
    : String(profile.ncdPercent || '-');
  const coverageType = String(profile.coverType || '-');
  const policyPeriod = getPolicyEffectiveRangeDisplay({ month: 'long' });

  return `<span style="display:block"><strong>Vehicle Registration Number:</strong> ${profile.plateNumber}</span>
<span style="display:block"><strong>Model:</strong> ${modelDisplay}</span>
<span style="display:block"><strong>Engine Type:</strong> Automatic - ${engineCc}cc</span>
<span style="display:block"><strong>Postcode:</strong> ${postcode}</span>
<span style="display:block"><strong>No Claim Discount (NCD):</strong> ${ncd}</span>
<span style="display:block"><strong>Coverage Type:</strong> ${coverageType}</span>
<span style="display:block"><strong>Policy Period:</strong> ${policyPeriod}</span>`;
}

function buildVehicleFoundReply(profile) {
  return `Found your vehicle! 🚗

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
function buildPaymentLink(state) {
  const tx = ensureTransactionState(state);
  const insurerPrice = Number(state?.selectedQuote?.priceAfter || 0);
  const addOnsTotal = (state?.selectedAddOns || []).reduce((sum, a) => sum + Number(a?.price || 0), 0);
  const roadTaxTotal = Number(state?.selectedRoadTax?.price || 0);
  const total = insurerPrice + addOnsTotal + roadTaxTotal;
  const insurer = encodeURIComponent(state.selectedQuote?.insurer || '');
  const plate = encodeURIComponent(state.plateNumber || '');
  const payId = tx.paymentIntentId || `PAY-${Date.now()}`;
  return `[**Pay RM ${total.toLocaleString()} Now ->**](/my/payment/${payId}?total=${total}&insurer=${insurer}&plate=${plate}&insurance=${insurerPrice}&addons=${addOnsTotal}&roadtax=${roadTaxTotal})`;
}

function buildPaymentStepBlock(summaryBox, paymentLink) {
  return `${summaryBox}

${formatStepLine(6, 'Payment')}

Please check the quotation above before making payment via link below.

${paymentLink}

Credit/Debit Card, FPX, E-wallet, Instalment, Pay Later or Cash - your choice.`;
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

function buildDetailsStepBlock(summaryBox, roadTaxName = null) {
  const roadTaxConfirmation = roadTaxName && roadTaxName !== 'No Road Tax'
    ? `${roadTaxName} added! ✅`
    : 'No road tax. ✅';

  return `${roadTaxConfirmation}

${summaryBox}

${formatStepLine(5, 'Your Details')}

Almost done! Please share:
${buildPersonalDetailExampleList()}`;
}

const STEP_LINE_REGEX = /^\s*(?:\*{1,2})?\s*step\s+(?:\*{1,2})?\d+(?:\*{1,2})?\s+of\s+(?:\*{1,2})?6(?:\*{1,2})?\s*[—-]/im;
const STEP_LINE_CAPTURE_REGEX = /^\s*(?:\*{1,2})?\s*(step\s+(?:\*{1,2})?\d+(?:\*{1,2})?\s+of\s+(?:\*{1,2})?6(?:\*{1,2})?\s*[—-]\s*[^\n*]+)\s*(?:\*{1,2})?/im;
const STEP_LINE_ONLY_REGEX = /^\s*(?:\*{1,2})?\s*step\s+(?:\*{1,2})?\d+(?:\*{1,2})?\s+of\s+(?:\*{1,2})?6(?:\*{1,2})?\s*[—-]\s*[^\n]*$/i;

function isStepIndicator(text) {
  if (!text || typeof text !== 'string') return false;
  return STEP_LINE_ONLY_REGEX.test(text.trim());
}

function formatStepLine(step, title) {
  return `Step **${step}** of **6** — ${title}`;
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
    || text.match(/(?:^|\n)\s*(?:\*{0,2})?Policy Effective:\s*/i);
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
const SUMMARY_BLOCK_REGEX = /(?:^✓\s*(?:\*\*)?renewal summary(?:\*\*)?\s*[—-]\s*[^\n]+|(?:^|\n)\*\*Policy Effective:\*\*|(?:^|\n)(?:💰\s*)?(?:\*\*)?Total:?(?:\*\*)?\s*(?:&nbsp;)?\s*(?:<u>)?\s*RM\s*\d[\d,]*)/im;
const CANONICAL_SUMMARY_MARKER_REGEX = /<span style="font-size:1\.12em[^"]*">\*\*✓ Renewal Summary\*\*/i;
const SUMMARY_SECTION_REGEX = /(?:^|\n)\s*(?:<span[^>]*>\s*)?(?:\*{0,2})?✓?\s*renewal summary(?:\*{0,2})?[^\n]*(?:<\/span>)?[\s\S]*?(?:\n\s*(?:\*{0,2})?(?:💰\s*)?total:?(?:\*{0,2})?\s*(?:&nbsp;)?\s*(?:<u>)?\s*rm[^\n]*)/im;

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
  const hasSummarySignal = /renewal summary|policy effective:|sum insured:|cover type:|add-ons:|road tax:|(?:💰\s*)?total:/i.test(text);
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
      label: 'STEP 1.5: Vehicle Verification',
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
      label: 'STEP 1: Intro and Discovery',
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
      label: 'STEP 1: Vehicle Info',
      goal: 'Collect missing vehicle identifiers so quotes can be generated.',
      options: missingIdentifiers.length > 0 ? missingIdentifiers.map(item => `Provide ${item}`) : ['Provide vehicle identifiers'],
      nextAction: missingIdentifiers.length === 1
        ? `Ask for ${missingIdentifiers[0]} only.`
        : 'Ask for both vehicle plate number and owner identification number.',
      sideQuestionPolicy: 'If user asks a general insurance question, answer briefly first, then return and ask for missing identifiers.',
    };
  }

  if (state.step === FLOW_STEPS.QUOTES) {
    return {
      label: 'STEP 2: Choose Insurer',
      goal: 'Get the user to choose one insurer so we can continue to add-ons.',
      options: ['Takaful Ikhlas (RM 796)', 'Etiqa Insurance (RM 872)', 'Allianz Insurance (RM 920)', 'Recommend for me'],
      nextAction: 'Ask the user to pick one insurer option.',
      sideQuestionPolicy: 'After answering any side question, return to insurer choice and ask for a pick.',
    };
  }

  if (state.step === FLOW_STEPS.ADDONS) {
    return {
      label: 'STEP 3: Add-ons',
      goal: 'Confirm add-on selection before moving to road tax.',
      options: ['Windscreen (RM 100)', 'Special Perils (RM 50)', 'E-hailing (RM 500)', 'Skip all add-ons'],
      nextAction: 'Ask which add-on(s) they want, or if they want to skip.',
      sideQuestionPolicy: 'After answering side questions, return to add-on selection.',
    };
  }

  if (state.step === FLOW_STEPS.ROADTAX) {
    return {
      label: 'STEP 4: Road Tax Upsell',
      goal: 'Confirm whether user adds road tax in this order.',
      options: ['12-month digital road tax (RM 90)', 'No road tax'],
      nextAction: 'Ask for a clear yes/no road tax decision.',
      sideQuestionPolicy: 'After answering any related question, return to digital road tax vs no road tax.',
    };
  }

  if (state.step === FLOW_STEPS.PERSONAL_DETAILS) {
    const missingDetails = getMissingPersonalDetailLabels(state);
    return {
      label: 'STEP 5: Your Details',
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
      label: 'STEP 5: OTP Verification',
      goal: 'Verify OTP before payment step.',
      options: ['Enter OTP now', 'Correct personal details if needed'],
      nextAction: 'Ask user to key in OTP.',
      sideQuestionPolicy: 'After side questions, return to OTP input request.',
    };
  }

  if (state.step === FLOW_STEPS.PAYMENT) {
    return {
      label: 'STEP 6: Payment',
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
  return `STEP AWARENESS CONTRACT (MANDATORY)
Current step: ${playbook.label}
Goal to close now: ${playbook.goal}
Options available right now:
${optionsList}
Required next action in this reply: ${playbook.nextAction}
${playbook.sideQuestionPolicy}

Rule: After answering side questions, return to this step and ask for the next action.
Rule: Do not move to another step unless user clearly confirms an available option.`;
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
      mentionRegex: /(which option|which insurer|specific insurer|takaful|etiqa|allianz|recommend(?:ation)?|compare|budget|claims|coverage|go with|lock in|proceed)/i,
      prompt: 'Would you like a quick side-by-side comparison, or should I recommend one based on your priority (**budget**, **claims**, or **coverage**)?',
      alternatives: [
        'Would you like a quick side-by-side comparison, or should I recommend one based on your priority (**budget**, **claims**, or **coverage**)?',
        'If you’re ready, tell me which insurer to lock in: **Takaful**, **Etiqa**, or **Allianz**.',
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
      prompt: 'Please key in the **OTP** sent to your phone or email now. 📱📧',
      alternatives: [
        'Please key in the **OTP** sent to your phone or email now. 📱📧',
        'Please enter the **OTP** now so we can continue to payment. 📱📧',
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

function buildStepStyleInstruction(state) {
  const prefs = state?.userPreferences || {};
  const preferenceHints = [];
  if (prefs.budgetFocused) preferenceHints.push('Emphasize value-for-money when comparing options.');
  if (prefs.claimsFocused) preferenceHints.push('Highlight claim process convenience and support reliability.');
  if (prefs.coverageFocused) preferenceHints.push('Highlight protection scope and higher coverage tradeoffs.');
  if (prefs.concisePreferred === true) preferenceHints.push('Keep replies concise (1-2 short paragraphs).');
  if (prefs.concisePreferred === false) preferenceHints.push('User accepts more detail when needed, but stay clear.');

  if (!state.hasCompleteVehicleIdentification()) {
    return `STEP STYLE PROFILE
Mode: Intake mode
Style: concise, guided, one clear request at a time.
${preferenceHints.join('\n')}`;
  }

  if (state.step === FLOW_STEPS.QUOTES) {
    return `STEP STYLE PROFILE
Mode: Advisor mode
Style: compare clearly, be decisive when recommending, ask one decision question.
${preferenceHints.join('\n')}`;
  }

  if (state.step === FLOW_STEPS.ADDONS) {
    return `STEP STYLE PROFILE
Mode: Practical consultant mode
Style: explain usefulness quickly, avoid jargon, then ask for add-on choice.
${preferenceHints.join('\n')}`;
  }

  if (state.step === FLOW_STEPS.ROADTAX) {
    return `STEP STYLE PROFILE
Mode: Consultative close mode
Style: short answer + light convenience pitch + direct yes/no road tax close.
${preferenceHints.join('\n')}`;
  }

  if (state.step === FLOW_STEPS.PERSONAL_DETAILS) {
    return `STEP STYLE PROFILE
Mode: Checklist mode
Style: structured bullets, clear missing fields, no unnecessary explanation.
${preferenceHints.join('\n')}`;
  }

  if (state.step === FLOW_STEPS.OTP || state.step === FLOW_STEPS.PAYMENT) {
    return `STEP STYLE PROFILE
Mode: Transaction mode
Style: clear, trust-building, action-oriented.
${preferenceHints.join('\n')}`;
  }

  return null;
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
"Which insurer would you like: **Takaful**, **Etiqa**, **Allianz**, or should I **recommend** one?"`;
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

function truncateKnowledgeFact(text, maxLen = 280) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

function isComparisonQuestion(text) {
  const msg = String(text || '').toLowerCase();
  if (!msg) return false;

  if (/\b(compare|comparison|versus|vs\.?|difference|differentiate)\b/i.test(msg)) return true;
  if (/\b(zero\s+betterment|waiver(?:\s+of)?\s+betterment|betterment)\b/i.test(msg)) return true;
  if (/\bwhich insurer\b/i.test(msg)) return true;
  if (/\bbetween\b.+\b(?:and|vs)\b/i.test(msg)) return true;

  return false;
}

async function loadKnowledgeMatchesForQuestion(latestMessage, intent, options = {}) {
  if (intent?.intent !== USER_INTENTS.ASK_QUESTION) return [];
  const query = String(latestMessage || '').trim();
  if (!query) return [];

  const limit = Number(options.limit || 6);
  const maxChunkCandidates = Number(options.maxChunkCandidates || 320);
  const matches = await searchInsurerKnowledgeFromDb(query, { limit, maxChunkCandidates });
  return Array.isArray(matches) ? matches : [];
}

function buildLiveKnowledgeSnapshot(matches = [], limit = 4) {
  if (!Array.isArray(matches) || matches.length === 0) return [];
  return matches.slice(0, limit).map((entry) => {
    const sourceType = String(entry.sourceType || 'db_unknown').replace(/^db_/, '');
    const sourceLabel = String(entry.question || 'Insurer knowledge').trim();
    const fact = truncateKnowledgeFact(entry.answer, 180);
    return `${sourceLabel} [${sourceType}]: ${fact}`;
  });
}

function buildComparisonQuestionInstruction(latestMessage, intent, state) {
  if (intent?.intent !== USER_INTENTS.ASK_QUESTION) return null;
  const query = String(latestMessage || '').trim();
  if (!query || !isComparisonQuestion(query)) return null;

  return `COMPARISON ANSWER CONTRACT
User asked a comparison-style insurance question.
Format your answer in this order:
1) One-line direct summary.
2) A compact side-by-side list with one line per insurer/policy being compared.
3) If a claim is not in PostgreSQL references, write: "not found in current insurer database".
4) One practical recommendation line tied to user intent (budget, claims ease, or coverage).
5) One clear close question that brings user back to current step (${state.step}).

Style:
- Up to 6 short lines total (not counting the close question).
- Be specific and factual; no generic marketing claims.
- Keep pricing/selection flow unchanged.`;
}

async function buildKnowledgeGroundingInstruction(latestMessage, intent, state, preloadedMatches = null) {
  if (intent?.intent !== USER_INTENTS.ASK_QUESTION) return null;
  const query = String(latestMessage || '').trim();
  if (!query) return null;

  const matches = Array.isArray(preloadedMatches)
    ? preloadedMatches
    : await loadKnowledgeMatchesForQuestion(query, intent, { limit: 6, maxChunkCandidates: 320 });
  if (!Array.isArray(matches) || matches.length === 0) {
    return `QUESTION HANDLING CONTRACT
No relevant PostgreSQL insurer knowledge was found for this question.
- Do NOT guess or use generic memory for insurer-specific facts.
- Say clearly that this detail is not found in the current insurer database.
- Ask one short clarifying follow-up (insurer name, plan name, or exact term) so you can search again.
- Then guide back to the current flow step with one clear next-action question.
Current step: ${state.step}.`;
  }

  const factLines = matches.slice(0, 3).map((entry, index) => {
    const question = String(entry.question || '').trim();
    const answer = truncateKnowledgeFact(entry.answer, 260);
    const sourceType = String(entry.sourceType || 'db_unknown').replace(/^db_/, '');
    return `${index + 1}. ${question}\n   Source: PostgreSQL (${sourceType})\n   Key fact: ${answer}`;
  }).join('\n');

  return `QUESTION GROUNDING (MANDATORY)
User asked: "${query}"
Use ONLY the PostgreSQL grounded references below before adding advice:
${factLines}

Rules:
- Answer the question first with concrete facts from these references only.
- Do not use quote-card marketing bullets as policy truth.
- Do not invent policy/regulatory details not supported by these references.
- Then bridge back to the current step with one concise next-action question.`;
}

function normalizePriceFormatSpacing(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/RM(?=\d)/g, 'RM ');
}

const DISALLOWED_STEP2_INTRO_LINE_REGEX = /^\s*(?:let['’]?s|lets)\s+compare\s+your\s+options[:.!?]?\s*$/i;
const VEHICLE_FIELD_LABEL_FRAGMENT = '(?:Vehicle\\s*Reg\\.?\\s*Num|Vehicle\\s*Registration\\s*Number|Registration\\s*Number|Vehicle|Model|Engine\\s*Type|Engine|Postcode|No\\s*Claim\\s*Discount\\s*\\(NCD\\)|NCD|Coverage\\s*Type|Cover\\s*Type|Policy\\s*Period|Policy\\s*Effective)';
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
  if (/^(policy effective|sum insured|cover type|insurer|add-ons|road tax|total)\s*:/i.test(line)) return true;
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
    /(which option|which insurer|takaful|etiqa|allianz|recommend for me)/i.test(text)
  ) {
    issues.push('vehicle_confirmation_should_not_offer_quotes');
  }
  if (
    state.step === FLOW_STEPS.OTP &&
    /renewal summary|policy effective|sum insured|cover type|add-ons:|road tax:/i.test(text)
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

  const addOnsLine = `Windscreen ${formatRmAmount(ADDONS.WINDSCREEN.price)} | Flood ${formatRmAmount(ADDONS.FLOOD.price)} | E-hailing ${formatRmAmount(ADDONS.EHAILING.price)}`;
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
   - Flood-prone → Add Special Perils (${formatRmAmount(ADDONS.FLOOD.price)})
   - Outdoor parking → Add Windscreen (${formatRmAmount(ADDONS.WINDSCREEN.price)})`;
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
   - Flood-prone → Add Special Perils (${formatRmAmount(ADDONS.FLOOD.price)})
   - Outdoor parking → Add Windscreen (${formatRmAmount(ADDONS.WINDSCREEN.price)})`;
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

  return `You are LAJOO, a smart car insurance assistant in Malaysia.

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
- Never use NCD as a differentiator between Takaful, Etiqa, and Allianz.
- If needed, mention NCD once as a shared note, not as per-insurer benefit bullets.

## FORMATTING RULES
- **Price format**: ALWAYS "RM xxx" with space (RM 796, not RM796)
- **Step indicators**: Show Step **X** of **6** — Title at transitions only (bold the step numbers only), including Step 2 above the quote list.
- **Summary box**: Keep a compact "Order Summary (plate)" block with 5 key lines (Policy Effective, Sum Insured, Insurer, Add-ons, Road tax), then bold "Total: RM xxx"
- **Quote cards**: Each quote on separate lines with logo, features, strikethrough price
- **Vehicle info**: Use this exact 7-line label format:
  **Vehicle Registration Number:** ...
  **Model:** ...
  **Engine Type:** ...
  **Postcode:** ...
  **No Claim Discount (NCD):** ...
  **Coverage Type:** ...
  **Policy Period:** ...
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
      // Return our 3 standard quotes
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
        addons: [
          { id: 'windscreen', name: 'Windscreen Protection', price: ADDONS.WINDSCREEN.price, description: ADDONS.WINDSCREEN.description },
          { id: 'flood', name: 'Special Perils (Flood)', price: ADDONS.FLOOD.price, description: ADDONS.FLOOD.description },
          { id: 'ehailing', name: 'E-hailing Cover', price: ADDONS.EHAILING.price, description: ADDONS.EHAILING.description },
        ],
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
    const { messages, state: clientState } = await request.json();

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
    // 1. BUILD STATE — prefer round-tripped state, fall back to text inference
    // ========================================================================
    const state = ConversationState.fromJSON(clientState) || ConversationState.fromMessages(messages);
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

    console.log('State source:', clientState ? 'round-tripped from client' : 'inferred from messages');
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
    // When state is round-tripped, the latest user action hasn't been applied yet.
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

    if (intent.intent === USER_INTENTS.SELECT_ADDON && intent.data) {
      const addOnMap = {
        windscreen: { name: 'Windscreen', price: 100 },
        flood: { name: 'Special Perils (Flood)', price: 50 },
        ehailing: { name: 'E-hailing Cover', price: 500 },
      };
      const addOns = (intent.data.addOns || []).map(key => addOnMap[key]).filter(Boolean);
      if (intent.data.confirmed) {
        state.selectAddOns(addOns);
      } else {
        state.preSelectAddOns(addOns);
      }
    }

    if (intent.intent === USER_INTENTS.SELECT_ROADTAX && intent.data?.option) {
      const roadTaxMap = {
        '12month-digital': { name: '12 Months Digital', price: 90 },
        'none': { name: 'No Road Tax', price: 0 },
      };
      const selectedOption = intent.data.option;
      const isDeliveredOption = selectedOption.includes('deliver');
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
      });
    }

    if (intent.intent === USER_INTENTS.CONFIRM_CHANGE_QUOTE) {
      // Guard against accidental "yes/ok" in non-change contexts.
      if (state.pendingAction?.type === 'confirm_quote_change' && intent.confidence >= 0.85) {
        state.resetToQuotes();
      }
    }

    if (intent.data?.cancelPendingAction) {
      state.setPendingAction(null);
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

    console.log('=== LAJOO API ===');
    console.log('Intent:', intent.intent);
    console.log('Step:', state.step);
    console.log('Prompt variant:', state?.experiment?.promptVariant || 'A');
    console.log('Experiment mode:', state?.experiment?.experimentMode || 'off');
    console.log('Conversion rate (decision turns):', `${((state?.experiment?.conversionRate || 0) * 100).toFixed(1)}%`);
    console.log('Low-confidence clarify mode:', lowConfidenceNeedsClarification);
    console.log('=================');

    // Deterministic policy guard: prevent incorrect "physical road tax" guidance.
    if (intent.intent === USER_INTENTS.ASK_QUESTION && state.step === FLOW_STEPS.ROADTAX) {
      const asksPrintedRoadTax = /\b(printed|physical|hard\s*copy|hardcopy|sticker|paper)\b/i.test(latestMessage);
      if (asksPrintedRoadTax) {
        forcedAssistantResponse = buildPrintedRoadTaxRestrictionReply(state);
      }
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

    // ========================================================================
    // 3. BUILD AI MESSAGES
    // ========================================================================
    const questionKnowledgeMatches = await loadKnowledgeMatchesForQuestion(latestMessage, intent, {
      limit: 6,
      maxChunkCandidates: 320,
    });
    const liveKnowledgeSnapshot = buildLiveKnowledgeSnapshot(questionKnowledgeMatches, 4);
    const systemPrompt = buildSystemPrompt(state, vehicleProfile, promptVariant, liveKnowledgeSnapshot);

    const openAiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map(msg => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: String(msg.content || ""),
      })),
    ];
    const stepStyleInstruction = buildStepStyleInstruction(state);
    if (stepStyleInstruction) {
      openAiMessages.push({ role: "system", content: stepStyleInstruction });
    }
    const stepContractInstruction = buildStepContractInstruction(state, { intent, messages, vehicleProfile });
    if (stepContractInstruction) {
      openAiMessages.push({ role: "system", content: stepContractInstruction });
    }
    const antiRepetitionInstruction = buildAntiRepetitionInstruction(messages);
    if (antiRepetitionInstruction) {
      openAiMessages.push({ role: "system", content: antiRepetitionInstruction });
    }
    const knowledgeGroundingInstruction = await buildKnowledgeGroundingInstruction(
      latestMessage,
      intent,
      state,
      questionKnowledgeMatches
    );
    if (knowledgeGroundingInstruction) {
      openAiMessages.push({ role: "system", content: knowledgeGroundingInstruction });
    }
    const comparisonQuestionInstruction = buildComparisonQuestionInstruction(latestMessage, intent, state);
    if (comparisonQuestionInstruction) {
      openAiMessages.push({ role: "system", content: comparisonQuestionInstruction });
    }
    let vehicleRejectionHandled = false;

    // ========================================================================
    // DETERMINISTIC FLOW HINTS — code-built blocks the AI must include
    // ========================================================================

    // GLOBAL GUARD: No quotes or pricing without vehicle info
    if (!state.hasCompleteVehicleIdentification()) {
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
        openAiMessages.push({
          role: "system",
          content: `User asked a general insurance question before sharing plate/owner ID.
Answer the question helpfully first (no quotes/pricing cards).
After answering, add one short line: "If you'd like renewal quotes, share your **vehicle plate** and **owner identification number**."`,
        });
      } else if (isGreetingStart) {
        openAiMessages.push({
          role: "system",
          content: `User sent a greeting at the start. Reply naturally in 1-2 short lines (warm, human, non-robotic).
Do NOT show the full numbered intake list yet.
Briefly mention what LAJOO can help with (renew insurance, road tax, compare options, and payment).
Then ask one discovery question: what do they want to do today?
Only ask for **vehicle plate** and **owner identification number** after they clearly say they want to start renewal now.`,
        });
      } else if (isPlayfulStart) {
        openAiMessages.push({
          role: "system",
          content: `User is playful/unclear at start. Reply naturally in 1-2 short lines:
1) brief friendly acknowledgement
2) ask what they need today and what LAJOO can help with (renewal quote, policy check, claims help, road tax).
Do NOT ask for plate/owner ID yet unless they choose to start renewal.`,
        });
      } else if (isNeutralStartProbe) {
        openAiMessages.push({
          role: "system",
          content: `User sent a neutral probe/test message at start.
Reply like a human (short, natural), then ask what they want LAJOO to help with today.
Do NOT show the strict intake list yet.
Do NOT ask for plate/owner ID yet unless user confirms renewal intent.`,
        });
      } else {
      // Determine what's still needed
      const hasPlate = !!state.plateNumber;
      const hasNRIC = !!state.nricNumber;

      if (!hasPlate && !hasNRIC) {
        // Use deterministic text to avoid LLM collapsing "1." and "2." onto one line.
        forcedAssistantResponse = `${formatStepLine(1, 'Vehicle Info')}

To get started, please provide your:

1. **Vehicle Plate Number** (e.g. WXY 1234)
2. **Owner Identification Number** (NRIC / Foreign ID / Army IC / Police IC / Company Reg. No.)`;
      } else {
        // One item provided, ask for the other
        const missingItem = !hasPlate ? 'Vehicle Plate Number' : 'Owner Identification Number';
        const missingExample = !hasPlate ? '(e.g. WXY 1234)' : '(NRIC / Foreign ID / Army IC / Police IC / Company Reg. No.)';
        openAiMessages.push({
          role: "system",
          content: `CRITICAL RESTRICTION: User has NOT provided both plate + IC yet. You MUST NOT:
- Show any insurance quotes or prices
- Discuss specific insurers (Takaful, Etiqa, Allianz)
- Talk about add-ons, road tax, or any pricing details

Ask for the missing item only. Keep it brief: "Please provide your **${missingItem}** ${missingExample} to proceed with the insurance renewal."`,
        });
      }
      }
    }

    // --- VEHICLE CONFIRMED → show quotes deterministically ---
    if (
      intent.intent === USER_INTENTS.CONFIRM &&
      state.hasCompleteVehicleIdentification() &&
      !state.selectedQuote &&
      wasLastAssistantVehicleConfirmation(messages)
    ) {
      const quotesBlock = buildQuotesBlock(state);
      openAiMessages.push({
        role: "system",
        content: `Vehicle confirmed. Your response MUST include this exact quotes block:

${formatStepLine(2, 'Choose Insurer')}

Great, here's what we have:

${quotesBlock}

Which option would you like to go with, or would you like my recommendation?

Start directly with the Step 2 line shown above.
Do NOT add any extra intro line before Step 2 (for example: "Let's compare your options.").
Do NOT alter the quote cards or prices.`,
      });
    }

    // --- VEHICLE LOOKUP complete, show vehicle details ---
    if (intent.intent === USER_INTENTS.PROVIDE_INFO && state.hasCompleteVehicleIdentification() && vehicleProfile) {
      forcedAssistantResponse = buildVehicleFoundReply(vehicleProfile);
    }

    // --- NCD complaint: user says NCD is wrong / wants to change NCD ---
    if (state.hasCompleteVehicleIdentification() && vehicleProfile && !state.selectedQuote) {
      const latestMsg = messages[messages.length - 1]?.content || '';
      const isNcdComplaint = /\bncd\b.*\b(wrong|incorrect|not right|different|should be|supposed to|change|update|actually)\b|\b(wrong|incorrect|change|update)\b.*\bncd\b|\bmy ncd is \d/i.test(latestMsg);

      if (isNcdComplaint) {
        vehicleRejectionHandled = true;
        forcedAssistantResponse = buildVehicleNcdConcernReply(vehicleProfile);
      }
    }

    // If user rejects vehicle details before selecting a quote, ask what to correct.
    if (state.hasCompleteVehicleIdentification() &&
        vehicleProfile &&
        !state.selectedQuote &&
        !vehicleRejectionHandled) {
      const latestMsg = messages[messages.length - 1]?.content || '';
      const isRejection = isVehicleDetailsRejectionMessage(latestMsg);
      const isVehicleConfirmationContext = wasLastAssistantVehicleConfirmation(messages);

      if (isRejection && isVehicleConfirmationContext) {
        vehicleRejectionHandled = true;
        forcedAssistantResponse = buildVehicleRejectionFollowUpReply(vehicleProfile);
      }
    }

    // --- CONFIRM at QUOTES step: user accepting AI recommendation ---
    if (
      intent.intent === USER_INTENTS.CONFIRM &&
      state.step === FLOW_STEPS.QUOTES &&
      !state.selectedQuote &&
      !wasLastAssistantVehicleConfirmation(messages)
    ) {
      // Find the last AI message to see which insurer was recommended
      const lastAIMessage = [...messages].reverse().find(m => m.role === 'assistant')?.content || '';
      const recommendedInsurerKey = state.lastRecommendedInsurer || parseRecommendedInsurerFromAssistantMessage(lastAIMessage);
      const insurerMap = {
        takaful: { insurer: 'Takaful Ikhlas', priceAfter: 796 },
        etiqa: { insurer: 'Etiqa Insurance', priceAfter: 872 },
        allianz: { insurer: 'Allianz Insurance', priceAfter: 920 },
      };
      const recommendedInsurer = recommendedInsurerKey ? insurerMap[recommendedInsurerKey] : null;
      const lowerLastAI = String(lastAIMessage).toLowerCase();
      const confirmedComparisonOffer =
        /side-?by-?side|recommend one now|should i recommend/i.test(lowerLastAI) &&
        /(takaful).*(etiqa).*(allianz)|(allianz).*(etiqa).*(takaful)|(etiqa).*(takaful).*(allianz)/i.test(lowerLastAI);
      const confirmedBettermentOffer = confirmedComparisonOffer && /betterment|zero betterment|waiver|depreciation/i.test(lowerLastAI);

      if (recommendedInsurer) {
        // Apply the selection
        state.selectQuote(recommendedInsurer);
        const summaryBox = buildSummaryBox(state);
        const addOnsStepBlock = buildAddOnsStepBlock(summaryBox);
        openAiMessages.push({
          role: "system",
          content: `User confirmed your recommendation of ${recommendedInsurer.insurer}. Your response MUST include:

Great choice! ✅

${addOnsStepBlock}

Do NOT alter prices. You may add a brief line but MUST include the Step 3 block exactly.`,
        });
      } else if (confirmedBettermentOffer) {
        openAiMessages.push({
          role: "system",
          content: `User replied "ok" to a zero-betterment comparison offer. Do NOT show full quotes list.
Give a direct side-by-side answer using PostgreSQL-grounded facts only (from QUESTION GROUNDING / LIVE DATABASE context).
If PostgreSQL evidence is missing for any insurer, say that clearly instead of guessing.
Then close consultatively in one line: ask if user wants your recommendation based on current total premium, or if they want to pick **Takaful**, **Etiqa**, or **Allianz**.
Do NOT move to next step until insurer is selected.`,
        });
      } else if (confirmedComparisonOffer) {
        openAiMessages.push({
          role: "system",
          content: `User replied "ok" to your comparison offer. Do NOT re-show full quotes list.
Provide a concise side-by-side comparison in 3 short bullets:
- Best budget value
- Best documented claims/service confidence (PostgreSQL-grounded only)
- Best higher-coverage option

Then ask one clear close question: "Would you like my recommendation, or do you want Takaful, Etiqa, or Allianz?"
Do NOT move to next step until insurer is selected.`,
        });
      } else {
        // No clear recommendation found - re-show full quotes deterministically
        const quotesBlock = buildQuotesBlock(state);
        openAiMessages.push({
          role: "system",
          content: `User confirmed but no specific recommended insurer was found in the previous assistant turn.
Your response MUST include this exact quotes block:

${formatStepLine(2, 'Choose Insurer')}

Great, here's what we have:

${quotesBlock}

Which option would you like to go with, or would you like my recommendation?

Start directly with the Step 2 line shown above.
Do NOT add any extra intro line before Step 2 (for example: "Let's compare your options.").`,
        });
      }
    }

    // --- QUOTES STEP: questions about insurers ---
    if (intent.intent === USER_INTENTS.ASK_QUESTION && state.step === FLOW_STEPS.QUOTES) {
      const latestMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
      const mentionsUnavailablePreferredInsurer = /\b(tokio\s*marine|tokio|zurich|axa|generali|msig|sompo|rhb|liberty)\b/i.test(latestMsg);
      const isDilemma = /can'?t (choose|decide|pick|select)|torn between|stuck between|not sure which|help me (choose|decide|pick)|between .+ and/i.test(latestMsg);
      const isAskingRecommendation = /recommend|which (one|should)|which is better|what(?:'s| is) better|better one|best one|what.*(suggest|think|pick)|help me (choose|decide|pick)|your (pick|choice|suggestion)/i.test(latestMsg);
      const asksBetterment = /betterment|zero betterment|waiver of betterment|depreciation/i.test(latestMsg);
      const asksToSeeQuotesAgain =
        /(?:show|list|repeat|remind(?: me)?|display)\b.*\b(?:quote|quotes|options|price|prices)\b|\b(?:quote|quotes|options|price list)\b.*\b(?:again|repeat)\b|what are the options|show me (?:the )?quotes/i.test(latestMsg);

      const quotesBlock = buildQuotesBlock(state);
      const rankedQuotes = getQuotesFromState(state)
        .slice()
        .sort((a, b) => Number(a?.pricing?.finalPremium || 0) - Number(b?.pricing?.finalPremium || 0));
      const lowestQuote = rankedQuotes[0];
      const lowestQuoteName = lowestQuote?.insurer?.displayName || "the lowest-premium option";
      const lowestQuotePrice = formatRmAmount(lowestQuote?.pricing?.finalPremium || 0);

      if (mentionsUnavailablePreferredInsurer) {
        openAiMessages.push({
          role: "system",
          content: `User mentioned a preferred insurer that is not in today's available panel (for example: Tokio Marine).
Do NOT dump the full quote list unless explicitly requested.

Your response must:
1. Acknowledge their past preference/trust in that insurer.
2. Clearly say that insurer is not available in the current options.
3. Offer one best available fit using current quote prices.
4. If you mention policy/service benefits, cite PostgreSQL-grounded facts only.
5. Use a consultative, confident close: ask if they want you to lock that option now.

Tone: helpful salesperson, non-pushy, 3-5 sentences max.`,
        });
      } else if (asksBetterment) {
        openAiMessages.push({
          role: "system",
          content: `User asked which insurer has zero betterment.
Answer directly using PostgreSQL-grounded facts only.
If data is missing for any insurer, say "not found in current insurer database" and ask one clarifying follow-up.
Then give one practical recommendation line based on current quote pricing (avoid unsupported policy claims).
End with one clear close question:
"Would you like my recommendation now, or do you want **Takaful**, **Etiqa**, or **Allianz**?"`,
        });
      } else if (isAskingRecommendation) {
        // User wants a recommendation - give a CONFIDENT, DIRECT answer
        openAiMessages.push({
          role: "system",
          content: `User is asking for YOUR recommendation. Give a CONFIDENT, DIRECT recommendation. Do NOT:
- Ask discovery questions
- Show all quotes again
- Be wishy-washy or indecisive

DO:
- Pick ONE insurer confidently (use your judgment based on value)
- Give ONE clear reason why (price-first is allowed; insurer-policy claims must be PostgreSQL-grounded)
- End with "Want to go with this?" or similar

Use the current quote table for pricing reference. Lowest now: **${lowestQuoteName} (${lowestQuotePrice})**.

Be decisive. Be smart. Pick one and recommend it confidently.`,
        });
      } else if (isDilemma) {
        // User can't decide — use discovery questions from DISCOVERY QUESTIONS section
        openAiMessages.push({
          role: "system",
          content: `User is having trouble deciding between insurers. DO NOT pick for them yet. Instead:

1. Acknowledge their dilemma ("Tough choice! Both are great options.")
2. Ask ONE discovery question to understand their priority. Pick the most relevant:
   - "What matters most to you — **saving money**, **easy claims**, or **maximum coverage**?"
   - "How do you mainly use your car — **daily commute**, **occasional trips**, or **long-distance highway**?"

Do NOT show quotes again. Do NOT make a recommendation yet. Wait for their answer, then use the RECOMMENDATION RUBRIC to give a confident pick.`,
        });
      } else {
        if (asksToSeeQuotesAgain) {
          openAiMessages.push({
            role: "system",
            content: `Answer briefly (2-3 sentences max), then show the full quotes block because the user asked to see options again:

${quotesBlock}

Which option would you like to go with?`,
          });
        } else {
          openAiMessages.push({
            role: "system",
            content: `Answer the user's question briefly (2-3 sentences max) in a conversational tone.
If the question relates to something LAJOO can help with, answer genuinely then add a natural bridge like "Good news — I can help you with that right here!" or "I can handle this end-to-end for you here."
Do NOT reprint the full quotes block unless user asks to see options again.
End with one consultative next-step question that keeps momentum without forcing an immediate pick, for example:
"Want a quick side-by-side on this point for **Takaful**, **Etiqa**, and **Allianz**, or should I recommend one now?"`,
          });
        }
      }
    }

    // --- ASK_QUESTION at ADDONS step: answer naturally, show menu only on request ---
    if (intent.intent === USER_INTENTS.ASK_QUESTION && state.step === FLOW_STEPS.ADDONS) {
      const latestMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
      const asksDirectCheaperOutside =
        /direct|directly|save\s*\d+%|cheaper|lower|discount|better deal|better price/i.test(latestMsg) &&
        /(takaful|etiqa|allianz|insur|renew)/i.test(latestMsg);
      const asksUnavailableInsurerAtAddons = /\b(tokio\s*marine|tokio|zurich|axa|generali|msig|sompo|rhb|liberty)\b/i.test(latestMsg);
      const asksBetterment = /betterment|zero betterment|waiver of betterment|depreciation/i.test(latestMsg);
      const isAskingWhichNeeded = /which (do i|one|should)|what (do i|should)|need|recommend/i.test(latestMsg);
      const asksToSeeAddOnsAgain = /show|list|options|again|repeat|what add-?ons|addon menu/i.test(latestMsg);

      if (asksDirectCheaperOutside) {
        openAiMessages.push({
          role: "system",
          content: `User raised a price objection (direct insurer might be cheaper).
Respond like a helpful advisor, not defensive:
1) Acknowledge the concern and validate it.
2) Be transparent: if direct truly offers better price for the same coverage, that's a valid option.
3) Explain LAJOO value in one practical line (compare options, one flow, add-ons/road tax/payment handled together).
4) Give a confident but non-pushy close with a clear next action.

Close with ONE of these actions:
- "Want me to keep your current insurer and continue with add-ons?"
- "If you prefer lowest cost now, I can proceed with **skip add-ons**."

Do NOT dump all quotes again.
Do NOT sound scripted or repetitive.`,
        });
      } else if (asksUnavailableInsurerAtAddons) {
        openAiMessages.push({
          role: "system",
          content: `User asked about an insurer that's not in today's panel (e.g., Tokio Marine) while at add-ons step.
Respond clearly and naturally:
1) Confirm that insurer is not available in current panel.
2) Explain the user can still renew directly with that insurer outside LAJOO.
3) Offer the best next in-platform action based on current selected insurer (continue or switch).
4) End with one concise close question for add-ons.

Tone: human, practical, non-pushy.
Do NOT ignore the user's question.
Do NOT dump full quote cards unless explicitly requested.`,
        });
      } else if (asksBetterment) {
        openAiMessages.push({
          role: "system",
          content: `User asked about zero betterment while in add-ons step.
You MUST answer this question first using PostgreSQL-grounded insurer facts only.
Do NOT use generic/hardcoded betterment text.
If a detail is missing in PostgreSQL, say so clearly and ask one short clarifying follow-up.
Then add ONE practical recommendation tied to the user's concern (avoiding unexpected repair bills), and include a soft sales bridge that keeps momentum.
If relevant, mention the currently selected insurer is **${state.selectedQuote?.insurer || 'current option'}** and offer to switch before proceeding.

Then return to add-ons with one clear close question:
"Would you like **Windscreen (RM 100)**, **Special Perils (RM 50)**, **E-hailing (RM 500)**, or **skip add-ons**?"

Style requirements:
- Helpful and advisor-like, not pushy.
- Do NOT skip answering the betterment question.
- Do NOT jump steps.`,
        });
      } else if (isAskingWhichNeeded) {
        // User asking "which do i need" — explain ALL 3 add-ons on separate lines
        openAiMessages.push({
          role: "system",
          content: `User wants to know which add-ons they need. Explain ALL 3 add-ons clearly using numbered lines that match selection numbers:

1. **Windscreen** (RM 100) — covers glass damage. Useful if you drive often, especially in city traffic or highways where debris can hit your windscreen.

2. **Special Perils** (RM 50) — covers flood and natural disaster damage. Recommended if your area is flood-prone or has landslides.

3. **E-hailing** (RM 500) — required if you drive for Grab, inDrive, or any ride-sharing service. Skip this if you don't do e-hailing.

Then ask: "${ADDONS_CLOSE_QUESTION}"

Do NOT combine into one paragraph. Keep the same 1/2/3 numbering so user can reply by number.`,
        });
      } else {
        if (asksToSeeAddOnsAgain) {
          const addOnsMenu = buildAddOnsMenu();
          openAiMessages.push({
            role: "system",
            content: `Answer briefly, then re-show the add-ons menu because user asked for options again:

${addOnsMenu}

Which would you like? You can reply with **1**, **2**, **3**, or a combo like **1 and 3**. Or skip if you don't need any.
Do NOT auto-skip or assume. Wait for explicit confirmation before moving to road tax.`,
          });
        } else {
          openAiMessages.push({
            role: "system",
            content: `Answer the user's question directly first (2-4 sentences) in a natural advisor tone.
Use concrete facts when available (not generic wording).
If user gives an indirect answer (e.g. "I don't drive much"), acknowledge it and give one practical recommendation.
If the question relates to insurer choice/policy value, add one consultative sales bridge (time-saving, smoother claims, or avoiding unexpected costs) without being pushy.
Then naturally tie it back: "I can add that for you right now" or "Since we're already here, want me to include it?"
Avoid repeating stock phrasing from prior turns.
Do NOT paste the full add-ons menu unless user asks to see options again.
Use a compact reminder line instead: "You can add windscreen (RM 100), special perils (RM 50), or e-hailing (RM 500) — or skip."
End with one clear question.`,
          });
        }
      }
    }

    // --- ASK_QUESTION at ROADTAX step: answer naturally, then concise handoff ---
    if (intent.intent === USER_INTENTS.ASK_QUESTION && state.step === FLOW_STEPS.ROADTAX) {
      const latestMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
      const asksAlternativeRenewal = /where\s+else|elsewhere|other\s+place|besides|outside|where\s+can\s+i\s+renew|renew\s+this\s+where/i.test(latestMsg);
      const asksPrintedOrPhysical = /\b(printed|physical|hard\s*copy|hardcopy|sticker|paper)\b/i.test(latestMsg);

      if (asksPrintedOrPhysical) {
        openAiMessages.push({
          role: "system",
          content: `User asked about printed/physical road tax.
Give a clear factual answer first:
- From ${PRINTED_ROAD_TAX_EFFECTIVE_DATE}, printed road tax is only for vehicles registered under a Foreign ID or Company Registration.
- For individual-owned vehicles, guide to digital road tax.

Keep it short and practical, then close with one question:
"Would you like 12-month digital road tax (RM 90), or no road tax?"`,
        });
      } else if (asksAlternativeRenewal) {

        openAiMessages.push({
          role: "system",
          content: `User is asking where else road tax can be renewed. Reply in a natural conversational style (not textbook):
1) Give a direct one-line answer (JPJ office, MyEG, Pos Malaysia).
2) Add a soft sales line highlighting convenience here (e.g. one flow, no re-keying details, settle it together now).
3) Add one factual policy line: "From ${PRINTED_ROAD_TAX_EFFECTIVE_DATE}, printed road tax is only for Foreign ID or Company vehicles."
4) Add one short bridge line back to this flow: "Here, I can proceed with 12-month digital road tax (RM 90) or no road tax."
5) End with one clear question: "Want me to proceed with digital road tax, or skip road tax?"

Do NOT reprint the full road tax menu or repeated "Please note" block unless user asks to see options again.`,
        });
      } else {
        openAiMessages.push({
          role: "system",
          content: `Answer the user's question briefly in 1-2 short lines.
Always tie it back naturally — e.g. "You can do that at JPJ too, but since you're already here, I can settle it for you in one go!"
Then move them forward with one clear question.
Give only a compact option reminder in one line: "12-month digital road tax (RM 90) or no road tax."
Do NOT re-show the full road tax menu unless user explicitly asks for the options again.`,
        });
      }
    }

    // --- ASK_QUESTION at other steps: brief answer ---
    if (intent.intent === USER_INTENTS.ASK_QUESTION &&
        state.step !== FLOW_STEPS.ADDONS &&
        state.step !== FLOW_STEPS.ROADTAX &&
        state.step !== FLOW_STEPS.QUOTES) {
      openAiMessages.push({
        role: "system",
        content: `Answer the question briefly and helpfully. If it relates to something LAJOO can do (insurance, road tax, claims), answer first then naturally remind them you can help right here — e.g. "Good thing is, I can sort that out for you right now!" Keep it warm, not pushy. End by guiding back to the current step.`,
      });
    }

    // --- SELECT_QUOTE → transition to add-ons ---
    if (intent.intent === USER_INTENTS.SELECT_QUOTE && state.selectedQuote) {
      const summaryBox = buildSummaryBox(state);
      const addOnsStepBlock = buildAddOnsStepBlock(summaryBox);
      openAiMessages.push({
        role: "system",
        content: `User selected ${state.selectedQuote.insurer}. Your response MUST include:

Great choice! ✅

${addOnsStepBlock}

Do NOT alter prices. You may add a brief line but MUST include the Step 3 block exactly.`,
      });
    }

    // --- SELECT_ADDON → transition to road tax ---
    if (intent.intent === USER_INTENTS.SELECT_ADDON) {
      if (!state.hasCompleteVehicleIdentification()) {
        openAiMessages.push({
          role: "system",
          content: `STOP. User hasn't provided vehicle info yet. Ask for: 1) Vehicle Plate Number, 2) Owner ID. Nothing else.`,
        });
      } else if (!state.selectedQuote) {
        const quotesBlock = buildQuotesBlock(state);
        openAiMessages.push({
          role: "system",
          content: `User mentioned add-ons but hasn't selected an insurer yet. Show quotes and ask them to choose first:

${quotesBlock}

Which insurer would you like to go with?`,
        });
      } else {
        const summaryBox = buildSummaryBox(state);
        const roadTaxStepBlock = buildRoadTaxStepBlock(summaryBox, state);
        const addOnNames = state.selectedAddOns.length > 0
          ? state.selectedAddOns.map(a => `**${a.name}**`).join(', ')
          : 'no add-ons';
        openAiMessages.push({
          role: "system",
          content: `User confirmed ${addOnNames}. Your response MUST follow this exact structure and order:

${roadTaxStepBlock}

Rules:
- First line must be a compact add-on confirmation (example: "Windscreen added! ✅").
- Then show the renewal summary block.
- Then show "${formatStepLine(4, 'Road Tax')}".
- Then show the road tax question/menu block exactly.
- Do NOT alter prices or wording in the road tax menu block.`,
        });
      }
    }

    // --- SELECT_ROADTAX blocked: delivered option not eligible ---
    if (intent.intent === USER_INTENTS.SELECT_ROADTAX && roadTaxDeliveryBlocked) {
      const summaryBox = buildSummaryBox(state);
      const roadTaxStepBlock = buildRoadTaxStepBlock(summaryBox, state);
      const attemptedLabel = blockedRoadTaxOption?.includes('deliver')
        ? 'printed + delivered road tax'
        : 'road tax delivery';
      openAiMessages.push({
        role: "system",
        content: `User asked for ${attemptedLabel}, but it is not eligible for this ownership type.
Explain briefly and politely: from ${PRINTED_ROAD_TAX_EFFECTIVE_DATE}, printed delivery is available only for vehicles registered under a Foreign ID or Company Registration.
Then ask them to choose the 12-month digital option or no road tax.

${roadTaxStepBlock}

Ask clearly: "Reply **ok** for 12-month digital, or **no road tax**."`,
      });
    }

    // --- SELECT_ROADTAX → transition to personal details ---
    if (intent.intent === USER_INTENTS.SELECT_ROADTAX && state.selectedRoadTax && !roadTaxDeliveryBlocked) {
      const summaryBox = buildSummaryBox(state);
      const roadTaxName = state.selectedRoadTax?.name || 'No Road Tax';
      openAiMessages.push({
        role: "system",
        content: `User selected road tax: ${roadTaxName}. Your response MUST include:

${roadTaxName !== 'No Road Tax' ? `${roadTaxName} added!` : 'No road tax.'} ✅

${formatStepLine(5, 'Your Details')}

${summaryBox}

Almost done! Please share:
${buildPersonalDetailExampleList()}

Do NOT alter the summary. MUST include all 3 items to collect.`,
      });
    }

    // --- SUBMIT_DETAILS → collect or confirm personal info ---
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

      openAiMessages.push({
        role: "system",
        content: missing.length === 0
          ? `All 3 required details are collected. Ask the user to confirm before sending OTP. Your response MUST follow this format:

Just to make sure I've got everything right 👇

- **Email:** ${canonicalDetails.email || '(provided)'}
- **Phone:** ${canonicalDetails.phone || '(provided)'}
- **Address:** ${canonicalDetails.address || '(provided)'}

Is this correct?

Reply **ok** / **yes** and I'll send the OTP to verify.
If anything's wrong, just tell me what to fix.

Do NOT send OTP yet. Wait for user confirmation first.`
          : `User is submitting personal details.
Currently still missing: ${missing.join(', ')}.
Acknowledge what was received, then ask ONLY for missing item(s) in this exact bullet format:
${buildPersonalDetailExampleList(missing)}
${typoSignals.length > 0 ? `If relevant, briefly mention likely format issue(s): ${typoSignals.join(' ')}` : ''}
Do NOT proceed to OTP until all 3 are collected.`,
      });
    }

    // --- CONFIRM at OTP step → user confirmed details, now send OTP ---
    if (intent.intent === USER_INTENTS.CONFIRM && state.step === FLOW_STEPS.OTP) {
      openAiMessages.push({
        role: "system",
        content: `User confirmed their personal details are correct. Now ask for OTP. Your response MUST be:

"Please key in the **OTP** sent to your phone or email now. 📱📧"`,
      });
    }

    // --- VERIFY_OTP → show payment link ---
    if (intent.intent === USER_INTENTS.VERIFY_OTP) {
      if (state.isQuoteExpired()) {
        const summaryBox = buildSummaryBox(state);
        openAiMessages.push({
          role: "system",
          content: `⚠️ Quote expired. Respond with:

"Your quote has expired. Let me refresh it for you...

✅ **Quote refreshed!** Same prices apply.

${summaryBox}

Please key in the **OTP** sent to your phone to continue. 📱📧"`,
        });
        state.refreshQuoteTimestamps();
      } else {
        const paymentLink = buildPaymentLink(state);
        paymentLinkFallback = paymentLink;
        shouldInjectPaymentLinkFallback = true;
        const summaryBox = buildSummaryBox(state);
        const paymentStepBlock = buildPaymentStepBlock(summaryBox, paymentLink);
        openAiMessages.push({
          role: "system",
          content: `OTP verified! Your response MUST include:

✅ All set!

${paymentStepBlock}

Do NOT alter the payment link URL or amounts.`,
        });
      }
    }

    // --- SELECT_PAYMENT / quote expired during payment ---
    if (intent.intent === USER_INTENTS.SELECT_PAYMENT) {
      if (state.isQuoteExpired()) {
        const summaryBox = buildSummaryBox(state);
        const paymentLink = buildPaymentLink(state);
        paymentLinkFallback = paymentLink;
        shouldInjectPaymentLinkFallback = true;
        openAiMessages.push({
          role: "system",
          content: `⚠️ Quote expired. Respond with:

"Your quote has expired. Let me refresh it for you...

✅ **Quote refreshed!** Same prices still apply.

${summaryBox}

${paymentLink}"`,
        });
        state.refreshQuoteTimestamps();
      } else {
        // User confirmed payment - show the payment link
        const paymentLink = buildPaymentLink(state);
        paymentLinkFallback = paymentLink;
        shouldInjectPaymentLinkFallback = true;
        const summaryBox = buildSummaryBox(state);
        const paymentStepBlock = buildPaymentStepBlock(summaryBox, paymentLink);
        openAiMessages.push({
          role: "system",
          content: `User is ready to pay. Your response MUST include:

${paymentStepBlock}

Do NOT alter the payment link URL or amounts.`,
        });
      }
    }

    // --- CHANGE_QUOTE: AI asks for confirmation ---
    if (intent.intent === USER_INTENTS.CHANGE_QUOTE && intent.data) {
      const currentInsurer = state.selectedQuote?.insurer || 'current insurer';
      const newKey = intent.data.newInsurer;
      const nameMap = { takaful: 'Takaful Ikhlas', etiqa: 'Etiqa', allianz: 'Allianz' };
      openAiMessages.push({
        role: "system",
        content: `User wants to change from ${currentInsurer} to ${nameMap[newKey] || newKey}. This will reset all selections (add-ons, road tax). Ask for confirmation: "Switching from **${currentInsurer}** to **${nameMap[newKey]}** will restart from the insurer step. Are you sure?"`,
      });
    }

    // --- UNCLEAR_OR_PLAYFUL: human-like recovery ---
    if (intent.intent === USER_INTENTS.UNCLEAR_OR_PLAYFUL) {
      const latest = latestMessage.toLowerCase();

      if (state.step === FLOW_STEPS.QUOTES && !state.selectedQuote) {
        const isBudgetSignal = /cheap|cheapest|save|saving|budget|broke|lower|lowest|value/.test(latest);
        if (isBudgetSignal) {
          openAiMessages.push({
            role: "system",
            content: `User gave a playful/unclear response with budget signal. Reply naturally:
1) acknowledge casually in one short line,
2) give one confident recommendation: **Takaful Ikhlas (RM 796)** with one reason,
3) ask: "Want me to lock this in?"`,
          });
        } else {
          openAiMessages.push({
            role: "system",
            content: `User reply is playful/unclear at quote selection. Keep tone human:
1) short acknowledgement (friendly, not robotic),
2) ask ONE decision question: "What matters most: lowest price, easier claims, or higher coverage?",
3) offer direct shortcut: "Or say **pick for me**."`,
          });
        }
      } else if (state.step === FLOW_STEPS.ADDONS) {
        openAiMessages.push({
          role: "system",
          content: `User reply is playful/unclear at add-ons. Keep it human and practical:
1) acknowledge briefly,
2) give one default suggestion: **Windscreen (RM 100)** for most drivers,
3) ask one clear action: "Add windscreen, add flood too, or skip all?"`,
        });
      } else if (state.step === FLOW_STEPS.ROADTAX) {
        openAiMessages.push({
          role: "system",
          content: `User reply is playful/unclear at road tax. Keep response simple:
1) acknowledge briefly,
2) recommend **12-month digital (RM 90)** as default convenience,
3) ask confirmation: "Reply **ok** to proceed with 12-month digital, or reply **no road tax**."`,
        });
      } else if (state.step === FLOW_STEPS.PERSONAL_DETAILS) {
        openAiMessages.push({
          role: "system",
          content: `User reply is playful/unclear while collecting details. Stay warm, then redirect:
"No worries 😄 I just need these to issue your policy:"
${buildPersonalDetailExampleList()}
Ask for whichever is missing first.`,
        });
      } else {
        openAiMessages.push({
          role: "system",
          content: `User reply is playful/unclear. Acknowledge naturally and ask one clear next-step question based on current step.`,
        });
      }
    }

    // --- OTHER: low-confidence / unclear messages ---
    if (intent.intent === USER_INTENTS.OTHER) {
      if (intent.data?.cancelPendingAction) {
        openAiMessages.push({
          role: "system",
          content: `User canceled insurer switch confirmation. Acknowledge and continue with the CURRENT selected insurer and current step. Do not reset flow.`,
        });
      } else if (state.step === FLOW_STEPS.QUOTES && !state.selectedQuote && !vehicleRejectionHandled) {
        const latestMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
        const mentionsUnavailablePreferredInsurer = /\b(tokio\s*marine|tokio|zurich|axa|generali|msig|sompo|rhb|liberty)\b/i.test(latestMsg);
        const asksToSeeQuotesAgain =
          /(?:show|list|repeat|remind(?: me)?|display)\b.*\b(?:quote|quotes|options|price|prices)\b|\b(?:quote|quotes|options|price list)\b.*\b(?:again|repeat)\b|what are the options|show me (?:the )?quotes/i.test(latestMsg);
        if (asksToSeeQuotesAgain) {
          const quotesBlock = buildQuotesBlock(state);
          openAiMessages.push({
            role: "system",
            content: `User asked to see quotes again. Your response MUST include this exact quotes block:

${formatStepLine(2, 'Choose Insurer')}

Great, here's what we have:

${quotesBlock}

Which option would you like to go with, or would you like my recommendation?

Start directly with the Step 2 line shown above.
Do NOT add any extra intro line before Step 2 (for example: "Let's compare your options.").`,
          });
        } else if (mentionsUnavailablePreferredInsurer) {
          openAiMessages.push({
            role: "system",
            content: `User prefers an insurer not in current available options.
Do NOT ignore this. Do NOT dump full quote list.
Answer in 3-5 sentences:
1) acknowledge trust in their previous insurer,
2) explain it is not available in current panel,
3) recommend ONE best-fit available option with one concrete reason (price-based or PostgreSQL-grounded benefit),
4) ask if they want you to lock it in now.
Keep tone persuasive but respectful, non-pushy.`,
          });
        } else {
          openAiMessages.push({
            role: "system",
            content: `User response is unclear. Reply naturally:
1) brief acknowledgement,
2) answer/clarify their point first in one helpful line,
3) ask one consultative next action that keeps them engaged, for example:
"Would you like a quick side-by-side, or should I recommend one based on your priority (budget, claims, or coverage)?"`,
          });
        }
      } else if (state.step === FLOW_STEPS.ADDONS) {
        const latestMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
        const looksLikeInsuranceQuestion =
          (
            /^(which|what|how|why|when|where|can|could|would|is|are|do|does|should)\b/i.test(latestMsg) &&
            /\b(insurer|policy|coverage|cover|claims?|betterment|waiver|depreciation|premium|sum insured|ncd|takaful|etiqa|allianz)\b/i.test(latestMsg)
          ) ||
          /betterment|zero betterment|clarify this|tokio\s*marine|tokio|zurich|axa|generali|msig|sompo|rhb|liberty|direct|directly|save\s*\d+%|cheaper|discount/i.test(latestMsg);

        if (looksLikeInsuranceQuestion) {
          openAiMessages.push({
            role: "system",
            content: `User asked a policy/insurer question during add-ons.
Do NOT ignore the question. Answer it directly first in 2-4 clear sentences with PostgreSQL-grounded facts only.
If the needed insurer detail is missing in PostgreSQL, say so clearly and ask one short clarifying follow-up.
Then add one short consultative bridge that gives confidence to continue with LAJOO now (non-pushy).
If appropriate, offer to compare or switch insurer before continuing add-ons.
End with exactly one clear add-ons close question:
"Would you like **Windscreen (RM 100)**, **Special Perils (RM 50)**, **E-hailing (RM 500)**, or **skip add-ons**?"`,
          });
        } else {
        openAiMessages.push({
          role: "system",
          content: `User response is unclear at add-ons step. Reply naturally in one short line, then ask one clear next-step question.
Use compact options only: "Windscreen (RM 100), special perils (RM 50), e-hailing (RM 500), or skip?"
Do NOT paste the full add-ons menu unless user explicitly asks to see the options.`,
        });
        }
      } else if (state.step === FLOW_STEPS.ROADTAX) {
        openAiMessages.push({
          role: "system",
          content: `User response is unclear at road tax step. Reply naturally in one short line, then ask one clear next-step question.
Use compact options only: "12-month digital road tax (RM 90) or no road tax?"
Do NOT paste the full road tax menu unless user explicitly asks to see the options.`,
        });
      }
    }

    const questionOrderInstruction = buildQuestionFirstThenStepCloseInstruction(state, { intent, messages, vehicleProfile });
    if (questionOrderInstruction && !lowConfidenceNeedsClarification) {
      openAiMessages.push({
        role: "system",
        content: questionOrderInstruction,
      });
    }

    if (lowConfidenceNeedsClarification) {
      openAiMessages.push({
        role: "system",
        content: `${buildClarifyingQuestionInstruction(state)}

Response rule for this turn:
- Ask exactly ONE clarifying question.
- Do not advance to the next flow step yet.
- Do not dump long menus or long summaries.`,
      });
    }

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
          if (errorText.includes("invalid_api_key")) {
            throw new Error("OPENAI_API_KEY is invalid. Update your key and restart the app.");
          }
          throw new Error(`OpenAI API error: ${errorText}`);
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
    const postProcessContext = { intent, messages, vehicleProfile, lowConfidenceNeedsClarification };
    if (!forcedAssistantResponse) {
      const expectedStepLine = getExpectedStepLine(intent, state, messages);
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
        aiResponse = intent.intent === USER_INTENTS.VERIFY_OTP
          ? `✅ All set!\n\n${paymentStepBlock}`
          : paymentStepBlock;
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
            state: state.toJSON(),
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
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      }
    );
  }
}
