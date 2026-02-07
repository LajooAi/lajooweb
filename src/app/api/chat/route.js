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
import { getVehicleProfile, getQuotes, ADDONS } from "@/lib/insuranceData";
import { AI_FUNCTIONS } from "@/lib/aiFunctions";
import { searchKnowledgeBase } from "@/lib/knowledgeBase";
import { extractPersonalInfo, extractVehicleInfo } from "@/utils/nlpExtractor";
import {
  parseRecommendedInsurerFromAssistantMessage,
  isVehicleDetailsRejectionMessage,
  wasLastAssistantVehicleConfirmation,
  canUseDeliveredRoadTaxByOwnerType,
} from "@/lib/flowGuards";

// ============================================================================
// DETERMINISTIC BLOCK BUILDERS — code-generated markdown the AI must include
// ============================================================================

/** Build the "Your Selection" summary box from current state */
function buildSummaryBox(state) {
  const insurer = state.selectedQuote?.insurer || 'Not selected';
  const insurerPrice = state.selectedQuote?.priceAfter || 0;

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

  const addOnsLine = state.selectedAddOns.length > 0
    ? state.selectedAddOns.map(a => `${a.name} - RM ${a.price}`).join(', ')
    : 'Not selected';
  const addOnsTotal = state.selectedAddOns.reduce((sum, a) => sum + (a.price || 0), 0);

  const roadTaxLine = state.selectedRoadTax && state.selectedRoadTax.price > 0
    ? `${state.selectedRoadTax.name} - RM ${state.selectedRoadTax.price}`
    : state.selectedRoadTax ? state.selectedRoadTax.name : 'Not selected';
  const roadTaxTotal = state.selectedRoadTax?.price || 0;

  const total = insurerPrice + addOnsTotal + roadTaxTotal;

  return `---
**Your Selection**
**Insurance:** ${insurerLine}
**Add-ons:** ${addOnsLine}
**Road tax:** ${roadTaxLine}

💰 <u>**Total: RM ${total.toLocaleString()}**</u>
---`;
}

/** Build the 3-quote cards block */
function buildQuotesBlock() {
  const quotes = getQuotes();
  return quotes.map(q => {
    const logo = q.insurer.logoUrl;
    const name = q.insurer.displayName;
    const final = q.pricing.finalPremium;
    const base = q.pricing.basePremium;
    const si = q.sumInsured.toLocaleString();
    const features = q.insurer.features.map(f => `✓ ${f}`).join(' ');
    return `![${name}](${logo}) **${name}** — **RM ${final}**
Sum Insured: RM ${si}
${features}
~~RM ${base.toLocaleString()}~~ → RM ${final} (${q.pricing.ncdPercent}% NCD)`;
  }).join('\n\n');
}

/** Build the add-ons menu */
function buildAddOnsMenu() {
  return `- **Windscreen** — RM ${ADDONS.WINDSCREEN.price}
- **Special Perils (Flood & Natural Disaster)** — RM ${ADDONS.FLOOD.price}
- **E-hailing** — RM ${ADDONS.EHAILING.price}`;
}

function canUseDeliveredRoadTax(state) {
  return canUseDeliveredRoadTaxByOwnerType(state?.ownerIdType || null);
}

/** Build the road tax menu */
function buildRoadTaxMenu(state) {
  if (canUseDeliveredRoadTax(state)) {
    return `- **6 months**: RM 45 (digital) | RM 55 (delivered)
- **12 months**: RM 90 (digital) | RM 100 (delivered)

Or continue without road tax.`;
  }

  return `- **6 months**: RM 45 (digital only)
- **12 months**: RM 90 (digital only)

Printed + delivered road tax is available only for **Foreign ID** or **Company Registration** vehicle ownership.

Or continue without road tax.`;
}

/** Build the vehicle info block from a profile */
function buildVehicleBlock(profile) {
  if (!profile) return '';
  // Policy dates: next year from today
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() + 30); // roughly next renewal
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  const fmt = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return `**Vehicle Reg.Num**: ${profile.plateNumber}
**Vehicle**: ${profile.year} ${profile.make} ${profile.model}
**Engine**: Auto - ${profile.engineCC.toLocaleString()}cc
**Postcode**: ${profile.address.postcode}
**NCD**: ${profile.ncdPercent}%
**Cover Type**: ${profile.coverType}
**Policy Effective**: ${fmt(start)} - ${fmt(end)}`;
}

/** Build the payment link */
function buildPaymentLink(state) {
  const insurerPrice = state.selectedQuote?.priceAfter || 0;
  const addOnsTotal = state.selectedAddOns.reduce((sum, a) => sum + (a.price || 0), 0);
  const roadTaxTotal = state.selectedRoadTax?.price || 0;
  const total = insurerPrice + addOnsTotal + roadTaxTotal;
  const insurer = encodeURIComponent(state.selectedQuote?.insurer || '');
  const plate = encodeURIComponent(state.plateNumber || '');
  const payId = `PAY-${Date.now()}`;
  return `[**Pay RM ${total.toLocaleString()} →**](/my/payment/${payId}?total=${total}&insurer=${insurer}&plate=${plate}&insurance=${insurerPrice}&addons=${addOnsTotal}&roadtax=${roadTaxTotal})`;
}

const STEP_LINE_REGEX = /^\s*(?:\*{1,2})?\s*step\s+\d+\s+of\s+5\s*[—-]/im;
const STEP_LINE_CAPTURE_REGEX = /^\s*(?:\*{1,2})?\s*(step\s+\d+\s+of\s+5\s*[—-]\s*[^\n*]+)\s*(?:\*{1,2})?/im;

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

function ensureStepLineIfMissing(response, stepLine) {
  if (!stepLine || !response) return response;
  if (STEP_LINE_REGEX.test(response)) return response;
  return `${stepLine}\n\n${response}`;
}

function getCurrentStageStepLine(state) {
  if (!state.hasCompleteVehicleIdentification()) {
    return '*Step 1 of 5 — Vehicle Info*';
  }

  if (state.step === FLOW_STEPS.QUOTES && !state.selectedQuote) return '*Step 2 of 5 — Choose Insurer*';
  if (state.step === FLOW_STEPS.ADDONS) return '*Step 3 of 5 — Add-ons*';
  if (state.step === FLOW_STEPS.ROADTAX) return '*Step 4 of 5 — Road Tax*';
  if (state.step === FLOW_STEPS.PERSONAL_DETAILS) return '*Step 5 of 5 — Your Details*';

  return null;
}

function getExpectedStepLine(intent, state, messages) {
  // Last shown step from assistant history.
  const lastAssistantStepLine = [...messages]
    .reverse()
    .filter(m => m.role === 'assistant')
    .map(m => extractStepLineFromText(String(m.content || '')))
    .find(Boolean) || null;

  // Prefer explicit transition triggers.
  let candidate = null;
  if (intent.intent === USER_INTENTS.SELECT_QUOTE) candidate = '*Step 3 of 5 — Add-ons*';
  else if (intent.intent === USER_INTENTS.SELECT_ADDON) candidate = '*Step 4 of 5 — Road Tax*';
  else if (intent.intent === USER_INTENTS.SELECT_ROADTAX) candidate = '*Step 5 of 5 — Your Details*';
  else if (intent.intent === USER_INTENTS.PROVIDE_INFO && state.hasCompleteVehicleIdentification()) candidate = '*Step 2 of 5 — Choose Insurer*';
  else if (intent.intent === USER_INTENTS.CONFIRM && state.step === FLOW_STEPS.QUOTES && !state.selectedQuote) candidate = '*Step 2 of 5 — Choose Insurer*';

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

export const runtime = "nodejs";

// ============================================================================
// AI SYSTEM PROMPT - Pure conversational focus
// ============================================================================

function buildSystemPrompt(state, vehicleProfile) {
  const roadTaxPricingLine = canUseDeliveredRoadTax(state)
    ? '**Road Tax:** 6 months RM 45 (digital) / RM 55 (delivered) | 12 months RM 90 (digital) / RM 100 (delivered)'
    : '**Road Tax:** 6 months RM 45 (digital only) | 12 months RM 90 (digital only). Delivered option is only for Foreign ID / Company Registration ownership.';

  return `You are LAJOO, a smart car insurance assistant in Malaysia.

## COMMUNICATION STYLE
- Be minimal — say less, mean more
- Sound smart — confident, not wordy
- Use simple English — easy for everyone
- Friendly but efficient — warm tone, no fluff
- If user is playful/unclear, acknowledge naturally first, then ask one clarifying question
- Max 2-3 sentences for routine steps; up to 5-6 when helping user decide
- Bold key info (prices, names, action items)

## CURRENT STATE
${state.getAIContext()}
${vehicleProfile ? `Vehicle: ${vehicleProfile.make} ${vehicleProfile.model} ${vehicleProfile.year} | ${vehicleProfile.engineCC}cc | ${vehicleProfile.address.city} | NCD: ${vehicleProfile.ncdPercent}%` : ''}

## PRICES (exact amounts — ALWAYS use "RM xxx" with space)
**Insurance (after 20% NCD):**
- Takaful Ikhlas: RM 796 (was RM 995) — Sum Insured RM 34k, Shariah-Compliant, Fast Claims
- Etiqa: RM 872 (was RM 1,090) — Sum Insured RM 35k, FREE 24-hour Claim Assistance
- Allianz: RM 920 (was RM 1,150) — Sum Insured RM 36k, Best Car Insurer 2018

**Add-Ons:** Windscreen RM 100 | Flood RM 50 | E-hailing RM 500

${roadTaxPricingLine}

## RECOMMENDATION LOGIC
When user asks "which one?" / "help me decide" / "recommend":
1. If user preference is clear, recommend directly. If unclear, ask ONE discovery question: priority (budget/claims/coverage), usage (commute/highway), or risk (parking/flood area)
2. Match known context to rubric:
   - Budget → Takaful Ikhlas (RM 796)
   - Easy claims / Highway → Etiqa (RM 872)
   - Max coverage → Allianz (RM 920)
   - Flood-prone → Add Special Perils (RM 50)
   - Outdoor parking → Add Windscreen (RM 100)
3. Give ONE confident recommendation with price, ONE reason, then ask "Want to go with this?"

## FORMATTING RULES
- **Price format**: ALWAYS "RM xxx" with space (RM 796, not RM796)
- **Step indicators**: Show *Step X of 5 — Title* at transitions only (italic)
- **Summary box**: Use --- separators, bold labels only (not values), end with 💰 <u>**Total: RM xxx**</u>
- **Quote cards**: Each quote on separate lines with logo, features, strikethrough price
- **Vehicle info**: Show all 7 fields on separate lines
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
    case "search_insurance_knowledge":
      const results = searchKnowledgeBase(args.query);
      return results.length > 0
        ? { found: true, results: results.slice(0, 3) }
        : { found: false, message: "No specific information found" };

    case "explain_insurance_term":
      const termResults = searchKnowledgeBase(args.term);
      return termResults.length > 0
        ? { term: args.term, explanation: termResults[0].answer }
        : { term: args.term, explanation: `I can explain ${args.term} in general terms.` };

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
          { duration: '6 months', digital: 45, physical: 55 },
          { duration: '12 months', digital: 90, physical: 100 },
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
    const latestMessage = messages[messages.length - 1]?.content || "";
    const intent = detectUserIntent(latestMessage, state);
    let roadTaxDeliveryBlocked = false;
    let blockedRoadTaxOption = null;

    console.log('State source:', clientState ? 'round-tripped from client' : 'inferred from messages');
    console.log('[AI_INTENT_TRACE]', JSON.stringify({
      step: state.step,
      intent: intent.intent,
      confidence: intent.confidence,
      hasPendingAction: !!state.pendingAction,
      timestamp: new Date().toISOString(),
    }));

    // ========================================================================
    // 1b. APPLY INTENT-DRIVEN STATE MUTATIONS
    // When state is round-tripped, the latest user action hasn't been applied yet.
    // Apply it now based on the detected intent.
    // ========================================================================
    if (intent.intent === USER_INTENTS.SELECT_QUOTE && intent.data?.insurer) {
      const insurerMap = {
        takaful: { insurer: 'Takaful Ikhlas', priceAfter: 796 },
        etiqa: { insurer: 'Etiqa Insurance', priceAfter: 872 },
        allianz: { insurer: 'Allianz Insurance', priceAfter: 920 },
      };
      const quote = insurerMap[intent.data.insurer];
      if (quote) state.selectQuote(quote);
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
        '6month-digital': { name: '6 Months Digital', price: 45 },
        '6month-deliver': { name: '6 Months Delivered', price: 55 },
        '12month-digital': { name: '12 Months Digital', price: 90 },
        '12month-deliver': { name: '12 Months Delivered', price: 100 },
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
      const extracted = extractPersonalInfo(latestMessage);
      const existing = (state.personalDetails && typeof state.personalDetails === 'object') ? state.personalDetails : {};
      const merged = {
        email: !!(existing.email || extracted.email),
        phone: !!(existing.phone || extracted.phone),
        address: !!(existing.address || extracted.address),
      };

      const hasAny = merged.email || merged.phone || merged.address;
      const hasAll = merged.email && merged.phone && merged.address;

      state.personalDetails = hasAny ? merged : null;
      state.step = hasAll ? FLOW_STEPS.OTP : FLOW_STEPS.PERSONAL_DETAILS;
    }

    // Extract or update vehicle identifiers from latest message.
    // Allow updates before quote selection so users can correct wrong vehicle details.
    const vehicleExtract = extractVehicleInfo(latestMessage);
    const canUpdateVehicleIdentity = !state.selectedQuote &&
      [FLOW_STEPS.START, FLOW_STEPS.VEHICLE_LOOKUP, FLOW_STEPS.QUOTES].includes(state.step);

    if (canUpdateVehicleIdentity && intent.intent === USER_INTENTS.PROVIDE_INFO) {
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

    console.log('=== LAJOO API ===');
    console.log('Intent:', intent.intent);
    console.log('Step:', state.step);
    console.log('=================');

    // ========================================================================
    // 2. GET VEHICLE PROFILE IF WE HAVE BOTH IDENTIFIERS
    // ========================================================================
    let vehicleProfile = null;
    if (state.hasCompleteVehicleIdentification()) {
      vehicleProfile = getVehicleProfile(state.plateNumber, state.nricNumber);
      state.vehicleInfo = vehicleProfile;
    }

    // ========================================================================
    // 3. BUILD AI MESSAGES
    // ========================================================================
    const systemPrompt = buildSystemPrompt(state, vehicleProfile);

    const openAiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map(msg => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: String(msg.content || ""),
      })),
    ];
    let vehicleRejectionHandled = false;

    // ========================================================================
    // DETERMINISTIC FLOW HINTS — code-built blocks the AI must include
    // ========================================================================

    // GLOBAL GUARD: No quotes or pricing without vehicle info
    if (!state.hasCompleteVehicleIdentification()) {
      const canAnswerGeneralQuestion = intent.intent === USER_INTENTS.ASK_QUESTION;
      const isPlayfulStart = intent.intent === USER_INTENTS.UNCLEAR_OR_PLAYFUL && state.step === FLOW_STEPS.START;

      if (canAnswerGeneralQuestion) {
        openAiMessages.push({
          role: "system",
          content: `User asked a general insurance question before sharing plate/owner ID.
Answer the question helpfully first (no quotes/pricing cards).
After answering, add one short line: "If you'd like renewal quotes, share your **car plate** and **owner identification number**."`,
        });
      } else if (isPlayfulStart) {
        openAiMessages.push({
          role: "system",
          content: `User is playful/unclear at start. Reply naturally in 1-2 short lines:
1) brief friendly acknowledgement
2) ask what they need today (renewal quote, policy check, or claims help)
If they mention renewal, ask for plate + owner ID.`,
        });
      } else {
      // Determine what's still needed
      const hasPlate = !!state.plateNumber;
      const hasNRIC = !!state.nricNumber;

      if (!hasPlate && !hasNRIC) {
        // First message — show full Step 1 UI with numbered list
        openAiMessages.push({
          role: "system",
          content: `CRITICAL RESTRICTION: User has NOT provided car plate + IC yet. You MUST NOT:
- Show any insurance quotes or prices
- Discuss specific insurers (Takaful, Etiqa, Allianz)
- Talk about add-ons, road tax, or any pricing details
- Proceed with ANY insurance flow

Your response MUST include this exact format:

*Step 1 of 5 — Vehicle Info*

To get started with your insurance renewal, please provide your:

1. **Car Plate Number** (e.g. WXY 1234)
2. **Owner Identification Number** (NRIC / Foreign ID / Army IC / Police IC / Company Reg. No.)

You may add a brief greeting before the step indicator, but do NOT skip the numbered list format.`,
        });
      } else {
        // One item provided, ask for the other
        const missingItem = !hasPlate ? 'Car Plate Number' : 'Owner Identification Number';
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
    if (intent.intent === USER_INTENTS.CONFIRM && state.hasCompleteVehicleIdentification() && !state.selectedQuote) {
      const quotesBlock = buildQuotesBlock();
      openAiMessages.push({
        role: "system",
        content: `Vehicle confirmed. Your response MUST include this exact quotes block:

*Step 2 of 5 — Choose Insurer*

Here are your options:

${quotesBlock}

Which option would you like to go with, or would you like my recommendation?

You may add a brief acknowledgement line before the step indicator, but do NOT alter the quote cards or prices.`,
      });
    }

    // --- VEHICLE LOOKUP complete, show vehicle details ---
    if (intent.intent === USER_INTENTS.PROVIDE_INFO && state.hasCompleteVehicleIdentification() && vehicleProfile) {
      const vehicleBlock = buildVehicleBlock(vehicleProfile);
      openAiMessages.push({
        role: "system",
        content: `Vehicle found. Your response MUST include these exact details:

Found your vehicle! 🚗

${vehicleBlock}

Is this correct?

Do NOT skip any field. Do NOT alter the values.`,
      });
    }

    // If user rejects vehicle details before selecting a quote, ask what to correct.
    if (state.hasCompleteVehicleIdentification() &&
        vehicleProfile &&
        !state.selectedQuote) {
      const vehicleBlock = buildVehicleBlock(vehicleProfile);
      const latestMsg = messages[messages.length - 1]?.content || '';
      const isRejection = isVehicleDetailsRejectionMessage(latestMsg);
      const isVehicleConfirmationContext = wasLastAssistantVehicleConfirmation(messages);

      if (isRejection && isVehicleConfirmationContext) {
        vehicleRejectionHandled = true;
        openAiMessages.push({
          role: "system",
          content: `User rejected the vehicle details. Do NOT proceed to insurer selection yet.
Explain briefly that these details are fetched from insurer/ISM-linked records based on the provided plate + owner ID, so they should normally match.
Then ask the user to tell you what is incorrect or re-share the corrected car plate and owner identification number.
Also re-show the EXACT same details below:

I understand your concern. These details come from insurer/ISM records linked to your submitted vehicle identifiers:

${vehicleBlock}

Please tell me which field is wrong, or send the corrected **car plate** and **owner identification number** so I can re-check.

Do NOT alter or abbreviate any field. Show ALL fields exactly as above.`,
        });
      }
    }

    // --- CONFIRM at QUOTES step: user accepting AI recommendation ---
    if (intent.intent === USER_INTENTS.CONFIRM && state.step === FLOW_STEPS.QUOTES && !state.selectedQuote) {
      // Find the last AI message to see which insurer was recommended
      const lastAIMessage = [...messages].reverse().find(m => m.role === 'assistant')?.content || '';
      const recommendedInsurerKey = parseRecommendedInsurerFromAssistantMessage(lastAIMessage);
      const insurerMap = {
        takaful: { insurer: 'Takaful Ikhlas', priceAfter: 796 },
        etiqa: { insurer: 'Etiqa Insurance', priceAfter: 872 },
        allianz: { insurer: 'Allianz Insurance', priceAfter: 920 },
      };
      const recommendedInsurer = recommendedInsurerKey ? insurerMap[recommendedInsurerKey] : null;

      if (recommendedInsurer) {
        // Apply the selection
        state.selectQuote(recommendedInsurer);
        const summaryBox = buildSummaryBox(state);
        const addOnsMenu = buildAddOnsMenu();
        openAiMessages.push({
          role: "system",
          content: `User confirmed your recommendation of ${recommendedInsurer.insurer}. Your response MUST include:

*Step 3 of 5 — Add-ons*

Great choice! ✅

${summaryBox}

Want add-ons?
${addOnsMenu}

Do NOT alter prices. You may add a brief line but MUST include the summary box and add-ons menu exactly.`,
        });
      } else {
        // No clear recommendation found - ask user to specify
        const quotesBlock = buildQuotesBlock();
        openAiMessages.push({
          role: "system",
          content: `User said "ok" but no specific insurer was recommended. Ask them to pick one:

${quotesBlock}

Which insurer would you like to go with?`,
        });
      }
    }

    // --- QUOTES STEP: questions about insurers ---
    if (intent.intent === USER_INTENTS.ASK_QUESTION && state.step === FLOW_STEPS.QUOTES) {
      const latestMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
      const isDilemma = /can'?t (choose|decide|pick|select)|torn between|stuck between|not sure which|help me (choose|decide|pick)|between .+ and/i.test(latestMsg);
      const isAskingRecommendation = /recommend|which (one|should)|which is better|what(?:'s| is) better|better one|best one|what.*(suggest|think|pick)|help me (choose|decide|pick)|your (pick|choice|suggestion)/i.test(latestMsg);

      const quotesBlock = buildQuotesBlock();

      if (isAskingRecommendation) {
        // User wants a recommendation - give a CONFIDENT, DIRECT answer
        openAiMessages.push({
          role: "system",
          content: `User is asking for YOUR recommendation. Give a CONFIDENT, DIRECT recommendation. Do NOT:
- Ask discovery questions
- Show all quotes again
- Be wishy-washy or indecisive

DO:
- Pick ONE insurer confidently (use your judgment based on value)
- Give ONE clear reason why
- End with "Want to go with this?" or similar

Example good response:
"I'd go with **Takaful Ikhlas at RM 796** — best value with fast claim payouts. Want to proceed with this?"

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
        openAiMessages.push({
          role: "system",
          content: `Answer the user's question briefly (2-3 sentences max). Then ALWAYS end with the full quotes block so they can choose:

${quotesBlock}

Which option would you like to go with?`,
        });
      }
    }

    // --- ASK_QUESTION at ADDONS step: answer then re-show the menu ---
    if (intent.intent === USER_INTENTS.ASK_QUESTION && state.step === FLOW_STEPS.ADDONS) {
      const latestMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
      const isAskingWhichNeeded = /which (do i|one|should)|what (do i|should)|need|recommend/i.test(latestMsg);

      if (isAskingWhichNeeded) {
        // User asking "which do i need" — explain ALL 3 add-ons on separate lines
        openAiMessages.push({
          role: "system",
          content: `User wants to know which add-ons they need. Explain ALL 3 add-ons clearly, each on its own line:

**Windscreen** (RM 100) — covers glass damage. Useful if you drive often, especially in city traffic or highways where debris can hit your windscreen.

**Special Perils** (RM 50) — covers flood and natural disaster damage. Recommended if your area is flood-prone or has landslides.

**E-hailing** (RM 500) — required if you drive for Grab, inDrive, or any ride-sharing service. Skip this if you don't do e-hailing.

Then ask: "Based on your situation, which would you like? Or skip if you don't need any."

Do NOT combine into one paragraph. Each add-on MUST be on its own line with a blank line between them.`,
        });
      } else {
        const addOnsMenu = buildAddOnsMenu();
        openAiMessages.push({
          role: "system",
          content: `Answer the user's question briefly (2-3 sentences). If user gives an indirect answer (e.g. "I don't drive much"), acknowledge it and give a recommendation. Then ALWAYS re-show the add-ons menu so they can pick or skip:

${addOnsMenu}

Which would you like? Or skip if you don't need any.

Do NOT auto-skip or assume. Wait for explicit confirmation before moving to road tax.`,
        });
      }
    }

    // --- ASK_QUESTION at ROADTAX step: answer then re-show the menu ---
    if (intent.intent === USER_INTENTS.ASK_QUESTION && state.step === FLOW_STEPS.ROADTAX) {
      const roadTaxMenu = buildRoadTaxMenu(state);
      openAiMessages.push({
        role: "system",
        content: `Answer the user's question briefly. Then ALWAYS re-show the road tax options:

${roadTaxMenu}`,
      });
    }

    // --- ASK_QUESTION at other steps: brief answer ---
    if (intent.intent === USER_INTENTS.ASK_QUESTION &&
        state.step !== FLOW_STEPS.ADDONS &&
        state.step !== FLOW_STEPS.ROADTAX &&
        state.step !== FLOW_STEPS.QUOTES) {
      openAiMessages.push({
        role: "system",
        content: `Answer briefly, add short recommendation if helpful.`,
      });
    }

    // --- SELECT_QUOTE → transition to add-ons ---
    if (intent.intent === USER_INTENTS.SELECT_QUOTE && state.selectedQuote) {
      const summaryBox = buildSummaryBox(state);
      const addOnsMenu = buildAddOnsMenu();
      openAiMessages.push({
        role: "system",
        content: `User selected ${state.selectedQuote.insurer}. Your response MUST include:

*Step 3 of 5 — Add-ons*

Great choice! ✅

${summaryBox}

Want add-ons?
${addOnsMenu}

Do NOT alter prices. You may add a brief line but MUST include the summary box and add-ons menu exactly.`,
      });
    }

    // --- SELECT_ADDON → transition to road tax ---
    if (intent.intent === USER_INTENTS.SELECT_ADDON) {
      if (!state.hasCompleteVehicleIdentification()) {
        openAiMessages.push({
          role: "system",
          content: `STOP. User hasn't provided vehicle info yet. Ask for: 1) Car Plate Number, 2) Owner ID. Nothing else.`,
        });
      } else if (!state.selectedQuote) {
        const quotesBlock = buildQuotesBlock();
        openAiMessages.push({
          role: "system",
          content: `User mentioned add-ons but hasn't selected an insurer yet. Show quotes and ask them to choose first:

${quotesBlock}

Which insurer would you like to go with?`,
        });
      } else {
        const summaryBox = buildSummaryBox(state);
        const roadTaxMenu = buildRoadTaxMenu(state);
        const addOnNames = state.selectedAddOns.length > 0
          ? state.selectedAddOns.map(a => `**${a.name}**`).join(', ')
          : 'no add-ons';
        openAiMessages.push({
          role: "system",
          content: `User confirmed ${addOnNames}. Your response MUST include:

*Step 4 of 5 — Road Tax*

${state.selectedAddOns.length > 0 ? `Added ${addOnNames}!` : 'No add-ons selected.'} ✅

${summaryBox}

Want to renew your **road tax** together? 🚗

${roadTaxMenu}

Do NOT alter prices. MUST include summary box and road tax menu exactly.`,
        });
      }
    }

    // --- SELECT_ROADTAX blocked: delivered option not eligible ---
    if (intent.intent === USER_INTENTS.SELECT_ROADTAX && roadTaxDeliveryBlocked) {
      const summaryBox = buildSummaryBox(state);
      const roadTaxMenu = buildRoadTaxMenu(state);
      const attemptedLabel = blockedRoadTaxOption?.startsWith('12') ? '12 Months Delivered' : '6 Months Delivered';
      openAiMessages.push({
        role: "system",
        content: `User selected ${attemptedLabel}, but delivered road tax is not eligible for this ownership type.
Explain briefly: delivered/printed road tax is only available for **Foreign ID** or **Company Registration** vehicle ownership.
Then ask them to choose a digital option or no road tax.

*Step 4 of 5 — Road Tax*

${summaryBox}

${roadTaxMenu}`,
      });
    }

    // --- SELECT_ROADTAX → transition to personal details ---
    if (intent.intent === USER_INTENTS.SELECT_ROADTAX && state.selectedRoadTax && !roadTaxDeliveryBlocked) {
      const summaryBox = buildSummaryBox(state);
      const roadTaxName = state.selectedRoadTax?.name || 'No Road Tax';
      openAiMessages.push({
        role: "system",
        content: `User selected road tax: ${roadTaxName}. Your response MUST include:

*Step 5 of 5 — Your Details*

${roadTaxName !== 'No Road Tax' ? `${roadTaxName} added!` : 'No road tax.'} ✅

${summaryBox}

Almost done! I need:

1. **Email**
2. **Phone number**
3. **Delivery address**

Do NOT alter the summary. MUST include all 3 items to collect.`,
      });
    }

    // --- SUBMIT_DETAILS → collect or confirm personal info ---
    if (intent.intent === USER_INTENTS.SUBMIT_DETAILS) {
      const details = state.personalDetails || {};
      const missing = [];
      if (!details.email) missing.push('Email');
      if (!details.phone) missing.push('Phone number');
      if (!details.address) missing.push('Delivery address');

      openAiMessages.push({
        role: "system",
        content: missing.length === 0
          ? `All 3 required details are collected (email, phone, delivery address). Confirm this briefly, then say: "Please key in the **OTP** sent to your phone or email now. 📱"`
          : `User is submitting personal details.
Currently still missing: ${missing.join(', ')}.
Acknowledge what was received, then ask ONLY for missing item(s) in a short numbered list.
Do NOT proceed to OTP until all 3 are collected.`,
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

Please key in the **OTP** sent to your phone to continue. 📱"`,
        });
        state.refreshQuoteTimestamps();
      } else {
        const paymentLink = buildPaymentLink(state);
        const summaryBox = buildSummaryBox(state);
        openAiMessages.push({
          role: "system",
          content: `OTP verified! Your response MUST include:

✅ All set!

${summaryBox}

${paymentLink}

Card, FPX, e-wallet, or pay later — your choice.

Do NOT alter the payment link URL or amounts.`,
        });
      }
    }

    // --- SELECT_PAYMENT / quote expired during payment ---
    if (intent.intent === USER_INTENTS.SELECT_PAYMENT) {
      if (state.isQuoteExpired()) {
        const summaryBox = buildSummaryBox(state);
        const paymentLink = buildPaymentLink(state);
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
        const summaryBox = buildSummaryBox(state);
        openAiMessages.push({
          role: "system",
          content: `User is ready to pay. Your response MUST include the payment link:

${summaryBox}

${paymentLink}

Card, FPX, e-wallet, or pay later — your choice.

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
3) ask confirmation: "Go with 12-month digital, or prefer another option?"`,
        });
      } else if (state.step === FLOW_STEPS.PERSONAL_DETAILS) {
        openAiMessages.push({
          role: "system",
          content: `User reply is playful/unclear while collecting details. Stay warm, then redirect:
"No worries 😄 I just need these to issue your policy:"
1. Email
2. Phone number
3. Delivery address
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
        openAiMessages.push({
          role: "system",
          content: `User response is unclear. Reply naturally:
1) brief acknowledgement,
2) offer help deciding in one line,
3) ask a clear next action: "Pick **Takaful**, **Etiqa**, **Allianz**, or say **recommend for me**."`,
        });
      } else if (state.step === FLOW_STEPS.ADDONS) {
        const addOnsMenu = buildAddOnsMenu();
        openAiMessages.push({
          role: "system",
          content: `User response is unclear at add-ons step. Clarify gently and re-show options:

${addOnsMenu}

Ask: "Which add-on would you like, or reply **skip**?"`,
        });
      } else if (state.step === FLOW_STEPS.ROADTAX) {
        const roadTaxMenu = buildRoadTaxMenu(state);
        openAiMessages.push({
          role: "system",
          content: `User response is unclear at road tax step. Clarify gently and re-show options:

${roadTaxMenu}

Ask: "Which option do you want, or reply **no road tax**?"`,
        });
      }
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
      intent.intent !== USER_INTENTS.ASK_QUESTION &&
      intent.intent !== USER_INTENTS.UNCLEAR_OR_PLAYFUL &&
      intent.intent !== USER_INTENTS.OTHER &&
      intent.intent !== USER_INTENTS.CHANGE_QUOTE;

    if (shouldInjectSummary) {
      const summaryBox = buildSummaryBox(state);
      openAiMessages.push({
        role: "system",
        content: `IMPORTANT: User has selected an insurer. Your response MUST ALWAYS include this summary box somewhere in your response:

${summaryBox}

This summary box must appear in EVERY response from now on until payment is complete. Do not skip it regardless of what the user asks or says.`,
      });
    }

    // ========================================================================
    // 4. CALL OPENAI
    // ========================================================================
    let aiResponse = "";
    let functionCalls = [];

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

    // Enforce visible step indicator on all renewal stages if AI omits it.
    const expectedStepLine = getExpectedStepLine(intent, state, messages);
    aiResponse = ensureStepLineIfMissing(aiResponse, expectedStepLine);

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
