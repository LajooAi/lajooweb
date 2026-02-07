/**
 * ConversationState - Single Source of Truth for Insurance Renewal Flow
 *
 * This module manages conversation state for LAJOO's AI-driven insurance
 * renewal assistant. The AI handles all interaction naturally through
 * conversation - no UI cards or markers needed.
 *
 * Architecture:
 * - State is derived from conversation history
 * - AI guides users through the renewal flow conversationally
 * - Intent detection helps AI understand user requests
 * - Ready for real insurer API integration
 */

import { extractVehicleInfo } from '../utils/nlpExtractor.js';

// ============================================================================
// FLOW STEPS - The insurance renewal journey
// ============================================================================

export const FLOW_STEPS = {
  START: 'start',
  VEHICLE_LOOKUP: 'vehicle_lookup',      // Collecting plate + IC
  VEHICLE_CONFIRMED: 'vehicle_confirmed', // User confirmed vehicle details
  QUOTES: 'quotes',                       // Discussing/selecting quotes
  ADDONS: 'addons',                       // Discussing/selecting add-ons
  ROADTAX: 'roadtax',                     // Discussing/selecting road tax
  PERSONAL_DETAILS: 'personal_details',   // Collecting user info
  OTP: 'otp',                             // OTP verification
  PAYMENT: 'payment',                     // Payment selection
  SUCCESS: 'success',                     // Completed
};

// ============================================================================
// CONVERSATION STATE CLASS
// ============================================================================

// Quote validity period in milliseconds (30 minutes)
const QUOTE_VALIDITY_MS = 30 * 60 * 1000;

export class ConversationState {
  constructor() {
    this.step = FLOW_STEPS.START;
    this.vehicleInfo = null;
    this.plateNumber = null;
    // Kept as nricNumber for compatibility; may contain other owner ID formats too.
    this.nricNumber = null;
    this.ownerIdType = null; // nric | foreign_id | army_ic | police_ic | company_reg | other_id
    this.selectedQuote = null;
    this.quoteGeneratedAt = null;    // Timestamp when quotes were fetched
    this.quoteValidUntil = null;     // Timestamp when quotes expire
    this.selectedAddOns = [];
    this.addOnsConfirmed = false;  // Track if add-ons have been confirmed
    this.selectedRoadTax = null;
    this.personalDetails = null;
    this.otpVerified = false;
    this.paymentMethod = null;
    // Pending action confirmation guard (e.g., switching insurer mid-flow)
    this.pendingAction = null;
  }

  /**
   * Check if the current quote has expired
   * @returns {boolean} true if quote is expired or no quote exists
   */
  isQuoteExpired() {
    if (!this.quoteValidUntil) return false; // No quote yet
    return Date.now() > this.quoteValidUntil;
  }

  /**
   * Get time remaining until quote expires (in minutes)
   * @returns {number} minutes remaining, or 0 if expired
   */
  getQuoteTimeRemaining() {
    if (!this.quoteValidUntil) return 0;
    const remaining = this.quoteValidUntil - Date.now();
    return Math.max(0, Math.ceil(remaining / 60000));
  }

  /**
   * Set quote timestamps when quotes are generated/fetched
   */
  setQuoteTimestamps() {
    this.quoteGeneratedAt = Date.now();
    this.quoteValidUntil = Date.now() + QUOTE_VALIDITY_MS;
    return this;
  }

  /**
   * Refresh quote timestamps (when re-fetching quotes)
   * Keeps all selections but updates validity period
   */
  refreshQuoteTimestamps() {
    this.quoteGeneratedAt = Date.now();
    this.quoteValidUntil = Date.now() + QUOTE_VALIDITY_MS;
    return this;
  }

  /**
   * Hydrate state from a JSON object (sent back from the frontend).
   * This avoids re-inferring state from message text every turn.
   * Falls back gracefully: if json is null/undefined, returns null so
   * the caller can fall back to fromMessages().
   */
  static fromJSON(json) {
    if (!json || typeof json !== 'object') return null;

    const state = new ConversationState();
    state.step = json.step || FLOW_STEPS.START;
    state.plateNumber = json.plateNumber || null;
    state.nricNumber = json.nricNumber || null;
    state.ownerIdType = json.ownerIdType || null;
    if (state.nricNumber && !state.ownerIdType) {
      state.ownerIdType = /^\d{12}$/.test(String(state.nricNumber)) ? 'nric' : 'other_id';
    }
    state.vehicleInfo = json.vehicleInfo || null;
    state.selectedQuote = json.selectedQuote || null;
    state.quoteGeneratedAt = json.quoteGeneratedAt || null;
    state.quoteValidUntil = json.quoteValidUntil || null;
    state.selectedAddOns = Array.isArray(json.selectedAddOns) ? json.selectedAddOns : [];
    state.addOnsConfirmed = !!json.addOnsConfirmed;
    state.selectedRoadTax = json.selectedRoadTax || null;
    state.personalDetails = json.personalDetails || null;
    state.otpVerified = !!json.otpVerified;
    state.paymentMethod = json.paymentMethod || null;
    state.pendingAction = json.pendingAction || null;

    return state;
  }

  /**
   * Create state from conversation history
   * This replaces all the scattered regex detection in route.js
   */
  static fromMessages(messages) {
    const state = new ConversationState();

    for (const msg of messages) {
      if (msg.role !== 'user') continue;

      const content = msg.content || '';
      const extracted = extractVehicleInfo(content);

      // Extract plate number
      if (!state.plateNumber && extracted.registrationNumber) {
        state.plateNumber = extracted.registrationNumber;
      }

      // Extract owner ID (NRIC or other accepted formats)
      if (!state.nricNumber && extracted.ownerId) {
        state.nricNumber = extracted.ownerId;
        state.ownerIdType = extracted.ownerIdType || null;
      }
    }

    // Check for structured data in message metadata (from our API responses)
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.metadata) {
        const meta = msg.metadata;

        if (meta.selectedQuote) {
          state.selectedQuote = meta.selectedQuote;
        }
        if (meta.quoteGeneratedAt) {
          state.quoteGeneratedAt = meta.quoteGeneratedAt;
        }
        if (meta.quoteValidUntil) {
          state.quoteValidUntil = meta.quoteValidUntil;
        }
        if (meta.selectedAddOns) {
          state.selectedAddOns = meta.selectedAddOns;
        }
        if (meta.selectedRoadTax) {
          state.selectedRoadTax = meta.selectedRoadTax;
        }
        if (meta.step) {
          state.step = meta.step;
        }
      }
    }

    // Detect quote selection from user messages (e.g., "I choose Takaful Ikhlas", "go with Allianz")
    // This handles the case where frontend doesn't send metadata
    // IMPORTANT: Require explicit confirmation verbs only. "want" + insurer is treated as
    // interest/question, NOT a selection. User must say "I choose X" / "go with X" / "I'll take X".
    if (!state.selectedQuote) {
      for (const msg of messages) {
        if (msg.role !== 'user') continue;
        const content = (msg.content || '').toLowerCase();

        // Skip messages that are questions (contain ? or question words + insurer)
        if (/\?|tell me about|what about|how about|do i need|should i|explain|which one|recommend/i.test(content)) {
          continue;
        }

        // Skip messages that express indecision/dilemma (negated verbs, "between X and Y", etc.)
        // "i cant choose between etiqa and takaful" → NOT a selection
        if (/can'?t|cannot|couldn'?t|between .+ and|torn between|stuck between|not sure|help me (choose|decide)/i.test(content)) {
          continue;
        }

        // Only match explicit selection verbs (NOT "want" / "interested" / "like")
        if (/\b(go with|choose|select|pick|i'll take|i will take|confirm)\b/i.test(content)) {
          if (/takaful|ikhlas/i.test(content)) {
            state.selectedQuote = { insurer: 'Takaful Ikhlas', priceAfter: 796 };
          } else if (/etiqa/i.test(content)) {
            state.selectedQuote = { insurer: 'Etiqa Insurance', priceAfter: 872 };
          } else if (/allianz/i.test(content)) {
            state.selectedQuote = { insurer: 'Allianz Insurance', priceAfter: 920 };
          }
        }
      }
    }

    // Determine current step based on what we have
    state.step = state._determineStep();

    return state;
  }

  /**
   * Determine current step based on collected data
   */
  _determineStep() {
    const hasCompletePersonalDetails = !!(
      this.personalDetails &&
      this.personalDetails.email &&
      this.personalDetails.phone &&
      this.personalDetails.address
    );

    if (this.paymentMethod) return FLOW_STEPS.SUCCESS;
    if (this.otpVerified) return FLOW_STEPS.PAYMENT;
    if (hasCompletePersonalDetails) return FLOW_STEPS.OTP;
    if (this.selectedRoadTax) return FLOW_STEPS.PERSONAL_DETAILS;
    // Only move to ROADTAX if add-ons have been confirmed (not just pre-selected via chat)
    if (this.addOnsConfirmed) return FLOW_STEPS.ROADTAX;
    if (this.selectedQuote) return FLOW_STEPS.ADDONS;
    if (this.plateNumber && this.nricNumber) return FLOW_STEPS.QUOTES;
    if (this.plateNumber || this.nricNumber) return FLOW_STEPS.VEHICLE_LOOKUP;
    return FLOW_STEPS.START;
  }

  /**
   * Check if we have both required identifiers
   */
  hasCompleteVehicleIdentification() {
    return !!(this.plateNumber && this.nricNumber);
  }

  /**
   * Check what's missing for vehicle identification
   */
  getMissingIdentification() {
    const missing = [];
    if (!this.plateNumber) missing.push('plate_number');
    if (!this.nricNumber) missing.push('nric');
    return missing;
  }

  /**
   * Update state with new selection
   */
  selectQuote(quote) {
    this.selectedQuote = quote;
    this.setQuoteTimestamps(); // Set validity when quote is selected
    this.step = FLOW_STEPS.ADDONS;
    this.pendingAction = null;
    return this;
  }

  // Confirm add-ons selection (from clicking "Confirm" button)
  selectAddOns(addOns) {
    this.selectedAddOns = addOns;
    this.addOnsConfirmed = true;
    this.step = FLOW_STEPS.ROADTAX;
    this.pendingAction = null;
    return this;
  }

  // Pre-select add-ons without changing step (for chat-based selection like "ok flood only")
  // User still needs to click "Confirm" button to proceed to road tax
  preSelectAddOns(addOns) {
    this.selectedAddOns = addOns;
    this.addOnsConfirmed = false;  // Not confirmed yet
    this.pendingAction = null;
    return this;
  }

  selectRoadTax(roadTax) {
    this.selectedRoadTax = roadTax;
    this.step = FLOW_STEPS.PERSONAL_DETAILS;
    this.pendingAction = null;
    return this;
  }

  /**
   * Reset state to quotes step - used when user wants to change insurer mid-flow
   * Keeps vehicle info but clears all selections
   */
  resetToQuotes() {
    // Keep vehicle identification
    // this.plateNumber stays
    // this.nricNumber stays
    // this.vehicleInfo stays

    // Reset all selections and quote timestamps
    this.selectedQuote = null;
    this.quoteGeneratedAt = null;
    this.quoteValidUntil = null;
    this.selectedAddOns = [];
    this.addOnsConfirmed = false;
    this.selectedRoadTax = null;
    this.personalDetails = null;
    this.otpVerified = false;
    this.paymentMethod = null;
    this.pendingAction = null;

    // Go back to quotes step
    this.step = FLOW_STEPS.QUOTES;
    return this;
  }

  setPersonalDetails(details) {
    this.personalDetails = details;
    this.step = FLOW_STEPS.OTP;
    this.pendingAction = null;
    return this;
  }

  verifyOTP() {
    this.otpVerified = true;
    this.step = FLOW_STEPS.PAYMENT;
    this.pendingAction = null;
    return this;
  }

  setPaymentMethod(method) {
    this.paymentMethod = method;
    this.step = FLOW_STEPS.SUCCESS;
    this.pendingAction = null;
    return this;
  }

  setPendingAction(action) {
    this.pendingAction = action || null;
    return this;
  }

  /**
   * Export state for API response
   */
  toJSON() {
    return {
      step: this.step,
      plateNumber: this.plateNumber,
      nricNumber: this.nricNumber,
      ownerIdType: this.ownerIdType,
      vehicleInfo: this.vehicleInfo,
      selectedQuote: this.selectedQuote,
      quoteGeneratedAt: this.quoteGeneratedAt,
      quoteValidUntil: this.quoteValidUntil,
      quoteExpired: this.isQuoteExpired(),
      quoteTimeRemaining: this.getQuoteTimeRemaining(),
      selectedAddOns: this.selectedAddOns,
      addOnsConfirmed: this.addOnsConfirmed,
      selectedRoadTax: this.selectedRoadTax,
      personalDetails: this.personalDetails ? {
        email: !!this.personalDetails.email,
        phone: !!this.personalDetails.phone,
        address: !!this.personalDetails.address,
      } : null,
      otpVerified: this.otpVerified,
      paymentMethod: this.paymentMethod,
      pendingAction: this.pendingAction,
    };
  }

  /**
   * Get context string for AI prompt
   */
  getAIContext() {
    const parts = [
      `Current Step: ${this.step}`,
    ];

    if (this.plateNumber) {
      parts.push(`Vehicle Plate: ${this.plateNumber}`);
    }
    if (this.nricNumber) {
      const typeLabelMap = {
        nric: 'NRIC',
        foreign_id: 'Foreign ID',
        army_ic: 'Army IC',
        police_ic: 'Police IC',
        company_reg: 'Company Reg',
        other_id: 'Owner ID',
      };
      const label = typeLabelMap[this.ownerIdType] || 'Owner ID';
      const visibleLen = Math.min(6, this.nricNumber.length);
      const masked = `${this.nricNumber.slice(0, visibleLen)}${'*'.repeat(Math.max(4, this.nricNumber.length - visibleLen))}`;
      parts.push(`${label}: ${masked}`);
    }
    if (this.vehicleInfo) {
      parts.push(`Vehicle: ${this.vehicleInfo.make} ${this.vehicleInfo.model} ${this.vehicleInfo.year}`);
    }
    if (this.selectedQuote) {
      parts.push(`Selected Quote: ${this.selectedQuote.insurer} - RM${this.selectedQuote.priceAfter}`);
      // Add quote expiration status
      if (this.isQuoteExpired()) {
        parts.push(`⚠️ QUOTE EXPIRED - needs refresh before payment`);
      } else {
        const mins = this.getQuoteTimeRemaining();
        parts.push(`Quote valid for: ${mins} minute${mins !== 1 ? 's' : ''}`);
      }
    }
    if (this.selectedAddOns.length > 0) {
      const status = this.addOnsConfirmed ? 'Confirmed' : 'Pre-selected (waiting for confirmation)';
      parts.push(`Add-ons (${status}): ${this.selectedAddOns.map(a => a.name).join(', ')}`);
    }
    if (this.selectedRoadTax) {
      parts.push(`Road Tax: ${this.selectedRoadTax.name}`);
    }
    if (this.personalDetails) {
      const collected = ['email', 'phone', 'address'].filter(k => this.personalDetails[k]).length;
      parts.push(`Personal details collected: ${collected}/3`);
    }

    return parts.join('\n');
  }
}

// ============================================================================
// FUZZY MATCHING HELPER - For typo tolerance
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 * Used for typo-tolerant matching
 */
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Check if a word is similar to target (typo-tolerant)
 * @param {string} word - User's input word
 * @param {string[]} targets - Valid target words
 * @param {number} maxDistance - Max allowed Levenshtein distance (default 2)
 * @returns {string|null} - Matched target or null
 */
function fuzzyMatch(word, targets, maxDistance = 2) {
  word = word.toLowerCase();
  for (const target of targets) {
    const distance = levenshteinDistance(word, target.toLowerCase());
    // Allow more distance for longer words
    const allowedDistance = Math.min(maxDistance, Math.floor(target.length / 3));
    if (distance <= Math.max(allowedDistance, 1)) {
      return target;
    }
  }
  return null;
}

// ============================================================================
// INTENT DETECTION - What does the user want to do?
// ============================================================================

export const USER_INTENTS = {
  START_RENEWAL: 'start_renewal',
  PROVIDE_INFO: 'provide_info',
  CONFIRM: 'confirm',
  SELECT_QUOTE: 'select_quote',
  CHANGE_QUOTE: 'change_quote',           // User wants to change to a different insurer
  CONFIRM_CHANGE_QUOTE: 'confirm_change', // User confirms they want to restart with new insurer
  SELECT_ADDON: 'select_addon',
  SELECT_ROADTAX: 'select_roadtax',
  ASK_QUESTION: 'ask_question',
  SUBMIT_DETAILS: 'submit_details',
  VERIFY_OTP: 'verify_otp',
  SELECT_PAYMENT: 'select_payment',
  UNCLEAR_OR_PLAYFUL: 'unclear_or_playful',
  OTHER: 'other',
};

/**
 * Detect user intent from message
 * This replaces scattered regex patterns throughout route.js
 */
export function detectUserIntent(message, currentState) {
  const msg = message.toLowerCase().trim();

  // Pending insurer-switch confirmation: only interpret short confirmations in this mode.
  if (currentState.pendingAction?.type === 'confirm_quote_change') {
    if (/^(yes|ya|ok|okay|confirm|sure|proceed|do it|change it|yes please)$/i.test(msg)) {
      return { intent: USER_INTENTS.CONFIRM_CHANGE_QUOTE, confidence: 0.95 };
    }
    if (/^(no|nope|cancel|don'?t|do not|never mind|nevermind|continue|keep current|stay)$/i.test(msg)) {
      return { intent: USER_INTENTS.OTHER, confidence: 0.9, data: { cancelPendingAction: true } };
    }
  }

  // CHANGE QUOTE DETECTION - HIGHEST PRIORITY when user has selected a quote
  // Must check BEFORE general question detection so "can i change to etiqa?" is detected correctly
  const hasSelectedQuote = currentState.selectedQuote !== null;
  const isPastQuotesStep = [FLOW_STEPS.ADDONS, FLOW_STEPS.ROADTAX, FLOW_STEPS.PERSONAL_DETAILS, FLOW_STEPS.OTP, FLOW_STEPS.PAYMENT].includes(currentState.step);

  if (hasSelectedQuote && isPastQuotesStep) {
    // Check if user is asking to change/switch to a different insurer
    // Require explicit change/selection verbs — NOT "want" alone (that's interest, not selection)
    const wantsToChange = /change|switch|go with|choose|pick|select|can i change|can i switch/i.test(msg);
    const mentionsInsurer = /takaful|ikhlas|etiqa|allianz/i.test(msg);

    if (wantsToChange && mentionsInsurer) {
      // Determine which insurer they want to change to
      let newInsurer = null;
      if (/takaful|ikhlas/i.test(msg)) newInsurer = 'takaful';
      else if (/etiqa/i.test(msg)) newInsurer = 'etiqa';
      else if (/allianz/i.test(msg)) newInsurer = 'allianz';

      // Determine current insurer (normalize to simple key)
      const currentInsurerRaw = currentState.selectedQuote?.insurer?.toLowerCase() || '';
      let currentInsurerKey = null;
      if (/takaful|ikhlas/i.test(currentInsurerRaw)) currentInsurerKey = 'takaful';
      else if (/etiqa/i.test(currentInsurerRaw)) currentInsurerKey = 'etiqa';
      else if (/allianz/i.test(currentInsurerRaw)) currentInsurerKey = 'allianz';

      // Check if it's a different insurer than currently selected
      const isDifferentInsurer = newInsurer && currentInsurerKey && newInsurer !== currentInsurerKey;

      console.log('[Intent] Change quote check:', { newInsurer, currentInsurerKey, currentInsurerRaw, isDifferentInsurer });

      if (isDifferentInsurer) {
        console.log('[Intent] CHANGE_QUOTE detected - user wants to switch from', currentInsurerKey, 'to', newInsurer);
        return {
          intent: USER_INTENTS.CHANGE_QUOTE,
          confidence: 0.95,
          data: { newInsurer, currentInsurer: currentInsurerKey }
        };
      }
    }
  }

  // OTP verification (any 4 digits - for testing, accept any 4-digit code or specifically "1470")
  // In production, this should verify against the actual OTP sent
  if (/^\d{4}$/.test(msg) && currentState.step === FLOW_STEPS.OTP) {
    console.log('[Intent] OTP verification detected:', msg);
    // For testing: accept any 4-digit code
    // In production: verify against actual OTP
    return { intent: USER_INTENTS.VERIFY_OTP, confidence: 1.0, data: { otp: msg, valid: true } };
  }

  // Payment selection
  if (currentState.step === FLOW_STEPS.PAYMENT) {
    // Specific payment method selection
    if (/card|fpx|wallet|instalment|atome|pay later/i.test(msg)) {
      const method = msg.includes('card') ? 'card' :
                     msg.includes('fpx') ? 'fpx' :
                     msg.includes('wallet') ? 'ewallet' :
                     msg.includes('atome') || msg.includes('instalment') ? 'bnpl' : 'card';
      return { intent: USER_INTENTS.SELECT_PAYMENT, confidence: 0.9, data: { method } };
    }
    // General confirmation to proceed with payment (e.g., "yes please", "ok", "proceed")
    if (/^(yes|ya|ok|okay|sure|proceed|continue|yes please|let'?s go|ready|pay now|confirm)$/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_PAYMENT, confidence: 0.85, data: { method: 'any' } };
    }
  }

  // Quote selection - with typo tolerance using fuzzy matching
  // IMPORTANT: Only treat as selection when user explicitly confirms their choice.
  // Mentioning an insurer alone (e.g. "I want to know about Allianz") is NOT a selection.
  if (currentState.step === FLOW_STEPS.QUOTES) {
    // If user just says "ok", "yes", etc. without specifying an insurer
    // The AI will naturally ask which quote they prefer
    if (/^(ok|okay|yes|ya|sure|alright|proceed|continue)$/i.test(msg)) {
      return { intent: USER_INTENTS.CONFIRM, confidence: 0.7 };
    }

    // DILEMMA/INDECISION detection — user needs help deciding, NOT making a selection
    // "can't choose", "can't decide", "torn between", "not sure which", "help me decide", etc.
    const isDilemma = /can'?t (choose|decide|pick|select)|torn between|stuck between|not sure which|help me (choose|decide|pick)|which (one|should)|which is better|what(?:'s| is) better|better one|best one|between .+ and/i.test(msg);
    if (isDilemma) {
      return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.95 };
    }

    // Delegation / playful uncertainty
    if (/you choose|you pick|up to you|whatever|whichever|surprise me|idk|dunno|not sure|hmm+|haha|lol/i.test(msg)) {
      return { intent: USER_INTENTS.UNCLEAR_OR_PLAYFUL, confidence: 0.88 };
    }

    // Treat as question if message contains question markers or inquiry words + insurer
    const isQuestion = /\?|tell me|what about|how about|about\s+(takaful|ikhlas|etiqa|allianz)|do i need|should i|explain|interested|want to know|more about|details|which is better|what(?:'s| is) better|better one|best one/i.test(msg);
    const isDiscussion = /which|what|why|compare|difference|better|best|recommend/i.test(msg);

    if (isQuestion || isDiscussion) {
      // At quote step, discussion/question phrasing should stay in Q&A mode
      // rather than falling through to generic OTHER.
      return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 };
    }

    // Require explicit selection verb: "go with", "choose", "select", "pick", "I'll take"
    // Also accept "ok/okay + insurer" or "maybe + insurer" as soft selections
    // Do NOT match "want", "like", "interested" — those are inquiries
    // Also exclude negated forms like "can't choose" (handled above as dilemma)
    const hasSelectionVerb = /\b(go with|choose|select|pick|i'll take|i will take|confirm)\b/i.test(msg) && !/can'?t|cannot|couldn'?t/i.test(msg);

    // Soft selection: "ok takaful", "okay etiqa", "maybe allianz", "ok maybe takaful"
    const hasSoftSelection = /\b(ok|okay|maybe)\b/i.test(msg) && /\b(takaful|ikhlas|etiqa|allianz)\b/i.test(msg);

    // Bare insurer selection: "takaful", "etiqa please", "allianz lah"
    // Keep this strict to avoid hijacking question/inquiry messages.
    const hasInquiryCue = /\b(about|tell|explain|compare|difference|why|what|which|recommend|info|details)\b/i.test(msg);
    const hasNegationCue = /\b(no|not|don'?t|dont|can'?t|cannot|couldn'?t|not sure)\b/i.test(msg);
    const normalizedWords = msg
      .replace(/[^a-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const fillerWords = new Set(['please', 'pls', 'lah', 'la', 'insurance']);
    const candidateWords = normalizedWords.filter(w => !fillerWords.has(w));

    let bareInsurer = null;
    if (!hasInquiryCue && !hasNegationCue && candidateWords.length >= 1 && candidateWords.length <= 2) {
      const insurerMappings = {
        takaful: ['takaful', 'ikhlas'],
        etiqa: ['etiqa'],
        allianz: ['allianz'],
      };
      const matchedInsurers = new Set();
      for (const word of candidateWords) {
        for (const [insurer, variants] of Object.entries(insurerMappings)) {
          if (fuzzyMatch(word, variants, 2)) {
            matchedInsurers.add(insurer);
          }
        }
      }
      if (matchedInsurers.size === 1) {
        bareInsurer = [...matchedInsurers][0];
      }
    }

    if (bareInsurer) {
      return {
        intent: USER_INTENTS.SELECT_QUOTE,
        confidence: 0.9,
        data: { insurer: bareInsurer }
      };
    }

    if (hasSelectionVerb || hasSoftSelection) {
      // Extract words from message and check each against insurer names
      const words = msg.toLowerCase().split(/\s+/);

      // Insurer name variations to match against
      const insurerMappings = {
        'takaful': ['takaful', 'ikhlas'],
        'etiqa': ['etiqa'],
        'allianz': ['allianz'],
      };

      for (const word of words) {
        if (word.length < 3) continue; // Skip short words

        // Check each insurer
        for (const [insurer, variants] of Object.entries(insurerMappings)) {
          // Try fuzzy match against each variant
          const match = fuzzyMatch(word, variants, 2);
          if (match) {
            return {
              intent: USER_INTENTS.SELECT_QUOTE,
              confidence: 0.9,
              data: { insurer }
            };
          }
        }
      }
    }
  }

  // Add-on selection - AI handles this conversationally
  if (currentState.step === FLOW_STEPS.ADDONS) {
    // Check for explicit "no add-ons" / "skip" / "none"
    if (/no add.?on|none|skip add|no thanks|don't need|dont need|proceed without|no insurance add|skip$|no$|nope/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_ADDON, confidence: 0.9, data: { addOns: [], confirmed: true } };
    }

    // Detect which add-ons are mentioned
    const mentionedAddOns = [];
    if (/windscreen/i.test(msg)) mentionedAddOns.push('windscreen');
    if (/flood|disaster|perils|special perils/i.test(msg)) mentionedAddOns.push('flood');
    if (/e.?hailing|grab|ride.?sharing|ride.?share/i.test(msg)) mentionedAddOns.push('ehailing');
    if (/both|all/i.test(msg)) {
      mentionedAddOns.push('windscreen', 'flood', 'ehailing');
    }

    // Check if this is a QUESTION about add-ons (not a selection)
    // "what is windscreen?", "do I need flood?", "tell me about special perils"
    const isQuestion = /\?|what is|what's|do i need|should i|tell me|explain|which one|recommend|need this|worth it|necessary|how does|what does/i.test(msg);

    // Check for indecision/dilemma about add-ons
    const isIndecision = /can'?t (choose|decide)|not sure|help me (choose|decide)|which (one|should)/i.test(msg);

    if (isQuestion || isIndecision) {
      // User is asking about add-ons, not selecting them
      return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 };
    }

    // Check for EXPLICIT selection intent (not just mentioning)
    // "I want windscreen", "add windscreen", "yes windscreen", "ok windscreen", "windscreen please", "i'll take windscreen"
    const hasSelectionIntent = /\b(add|want|yes|ok|okay|take|get|include|i'll take|i will take|give me|with)\b/i.test(msg);

    // Also accept direct confirmations like "windscreen" alone or "windscreen and flood"
    const isDirectSelection = mentionedAddOns.length > 0 && /^(windscreen|flood|special perils|e.?hailing|both|all)(\s*(and|,|\+)\s*(windscreen|flood|special perils|e.?hailing))*\.?$/i.test(msg.trim());

    if (mentionedAddOns.length > 0 && (hasSelectionIntent || isDirectSelection)) {
      // User explicitly wants to add these
      return {
        intent: USER_INTENTS.SELECT_ADDON,
        confidence: 0.9,
        data: { addOns: mentionedAddOns, confirmed: true }
      };
    }

    // If add-ons are mentioned but no clear intent, treat as question (let AI clarify)
    if (mentionedAddOns.length > 0) {
      return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.7 };
    }

    // If user just says "ok", "yes", etc. - AI will clarify what they want
    if (/^(ok|okay|yes|ya|sure|alright)$/i.test(msg)) {
      return { intent: USER_INTENTS.OTHER, confidence: 0.5 };
    }

    if (/you choose|you pick|up to you|whatever|whichever|surprise me|idk|dunno|not sure|hmm+|haha|lol/i.test(msg)) {
      return { intent: USER_INTENTS.UNCLEAR_OR_PLAYFUL, confidence: 0.82 };
    }
  }

  // Road tax selection - check if user is selecting a road tax option
  const isRoadTaxStep = currentState.step === FLOW_STEPS.ROADTAX || currentState.addOnsConfirmed;
  if (isRoadTaxStep) {
    // If user just says "ok", "yes", etc. - AI will clarify which option they want
    if (/^(ok|okay|yes|ya|sure|alright|proceed|continue)$/i.test(msg)) {
      return { intent: USER_INTENTS.OTHER, confidence: 0.5 };
    }

    if (/6.*month.*digital|digital.*6/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.9, data: { option: '6month-digital' } };
    }
    if (/6.*month.*deliver|deliver.*6/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.9, data: { option: '6month-deliver' } };
    }
    if (/12.*month.*digital|digital.*12|year.*digital/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.9, data: { option: '12month-digital' } };
    }
    if (/12.*month.*deliver|deliver.*12|year.*deliver/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.9, data: { option: '12month-deliver' } };
    }

    // Plain duration fallback:
    // "12 months" or "6 months" (without digital/delivered) should still select road tax.
    // Default to digital option when channel is not specified.
    if (/\b12\s*(month|months|mth|mths|year|yr)?\b/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.85, data: { option: '12month-digital' } };
    }
    if (/\b6\s*(month|months|mth|mths)?\b/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.85, data: { option: '6month-digital' } };
    }

    if (/no road tax|just insurance|insurance only|skip/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.9, data: { option: 'none' } };
    }

    if (/you choose|you pick|up to you|whatever|whichever|surprise me|idk|dunno|not sure|hmm+|haha|lol/i.test(msg)) {
      return { intent: USER_INTENTS.UNCLEAR_OR_PLAYFUL, confidence: 0.82 };
    }
  }

  // Question detection (after step-specific handlers so payment questions don't get swallowed)
  if (/\?|do i need|should i|what is|what's|how does|explain|tell me about|why|which one|recommend|need this|need these|worth it|necessary/i.test(msg)) {
    return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 };
  }

  // Confirmation - detect various ways users say "yes, that's correct"
  if (/^(yes|correct|confirm|ok|okay|ya|betul|proceed|looks good|that's right|continue|all good|all is good|good|yep|yup|right|thats? correct)$/i.test(msg) ||
      /\b(yes|correct|confirm|proceed|looks good|all good|all is good)\b/i.test(msg)) {
    return { intent: USER_INTENTS.CONFIRM, confidence: 0.7 };
  }

  // Renewal start
  if (/renew|insurance|start|begin|get quote/i.test(msg) && currentState.step === FLOW_STEPS.START) {
    return { intent: USER_INTENTS.START_RENEWAL, confidence: 0.8 };
  }

  // Playful/unclear fallback for human-like recovery (before final OTHER)
  if (/^(haha|lol|lmao|hehe|hmm+|umm+|uhh+|idk|dunno|whatever|anything|up to you|you choose|you pick|as you say|as you think|whichever)\b/i.test(msg) ||
      /\b(haha|lol|idk|dunno|whatever|up to you|you choose|you pick|whichever)\b/i.test(msg)) {
    return { intent: USER_INTENTS.UNCLEAR_OR_PLAYFUL, confidence: 0.75 };
  }

  // IMPORTANT: Check for personal details BEFORE plate/NRIC to avoid false positives
  // Personal details submission - detect email (strongest signal)
  const hasEmail = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i.test(msg);
  const hasPhone = /\b0?1[0-9][\s\-]?[0-9]{3,4}[\s\-]?[0-9]{4}\b/.test(msg);
  const hasAddress = /jalan|jln|lorong|taman|persiaran|lebuh/i.test(msg);

  console.log('[Intent] Personal details check:', { hasEmail, hasPhone, hasAddress, msgPreview: msg.substring(0, 50), currentStep: currentState.step });

  // If message contains email, it's definitely a personal details submission
  if (hasEmail) {
    console.log('[Intent] Detected SUBMIT_DETAILS intent - email found');
    return { intent: USER_INTENTS.SUBMIT_DETAILS, confidence: 0.95 };
  }

  // Also check for phone + address combination when in personal details step
  if (hasPhone && hasAddress && currentState.step === FLOW_STEPS.PERSONAL_DETAILS) {
    console.log('[Intent] Detected SUBMIT_DETAILS intent - phone + address found at personal_details step');
    return { intent: USER_INTENTS.SUBMIT_DETAILS, confidence: 0.85 };
  }

  // Providing info (plate/IC detected) - only check if NOT in personal details step
  // Use structured extraction so we can support non-NRIC owner IDs safely.
  const extractedVehicle = extractVehicleInfo(msg);
  const hasPlate = !!extractedVehicle.registrationNumber && currentState.step !== FLOW_STEPS.PERSONAL_DETAILS;
  const hasNRIC = !!extractedVehicle.ownerId && currentState.step !== FLOW_STEPS.PERSONAL_DETAILS;
  if (hasPlate || hasNRIC) {
    return { intent: USER_INTENTS.PROVIDE_INFO, confidence: 0.9, data: { hasPlate, hasNRIC } };
  }

  return { intent: USER_INTENTS.OTHER, confidence: 0.5 };
}

export default ConversationState;
