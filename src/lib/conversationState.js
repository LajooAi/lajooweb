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

import { extractPersonalInfo, extractVehicleInfo } from '../utils/nlpExtractor.js';

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
    this.lastRecommendedInsurer = null; // takaful | etiqa | allianz
    this.quoteGeneratedAt = null;    // Timestamp when quotes were fetched
    this.quoteValidUntil = null;     // Timestamp when quotes expire
    this.selectedAddOns = [];
    this.addOnsConfirmed = false;  // Track if add-ons have been confirmed
    this.selectedRoadTax = null;
    this.personalDetails = null;
    this.otpVerified = false;
    this.paymentMethod = null;
    this.transaction = {
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
    // Pending action confirmation guard (e.g., switching insurer mid-flow)
    this.pendingAction = null;
    this.userPreferences = {
      budgetFocused: false,
      claimsFocused: false,
      coverageFocused: false,
      concisePreferred: null, // true | false | null (unknown)
      preferenceScores: {
        budgetFocused: 0,
        claimsFocused: 0,
        coverageFocused: 0,
        concisePreferred: 0, // positive = concise, negative = detailed
      },
      preferenceTurnCounter: 0,
      preferenceUpdatedAt: null,
    };
    this.experiment = {
      promptVariant: 'A',
      experimentMode: 'off',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      turns: 0,
      decisionTurns: 0,
      conversionIntentTurns: 0,
      conversionRate: 0,
      milestones: {
        quoteSelected: false,
        addOnsConfirmed: false,
        roadTaxSelected: false,
        reachedOtp: false,
        reachedPayment: false,
        completedPayment: false,
      },
    };
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
    state.lastRecommendedInsurer = ['takaful', 'etiqa', 'allianz'].includes(json.lastRecommendedInsurer)
      ? json.lastRecommendedInsurer
      : null;
    state.quoteGeneratedAt = json.quoteGeneratedAt || null;
    state.quoteValidUntil = json.quoteValidUntil || null;
    state.selectedAddOns = Array.isArray(json.selectedAddOns) ? json.selectedAddOns : [];
    state.addOnsConfirmed = !!json.addOnsConfirmed;
    state.selectedRoadTax = json.selectedRoadTax || null;
    state.personalDetails = json.personalDetails || null;
    state.otpVerified = !!json.otpVerified;
    state.paymentMethod = json.paymentMethod || null;
    state.transaction = {
      quoteId: json?.transaction?.quoteId || null,
      reprice: json?.transaction?.reprice || null,
      proposalId: json?.transaction?.proposalId || null,
      proposalStatus: json?.transaction?.proposalStatus || null,
      paymentIntentId: json?.transaction?.paymentIntentId || null,
      paymentStatus: json?.transaction?.paymentStatus || null,
      policyNumber: json?.transaction?.policyNumber || null,
      policyStatus: json?.transaction?.policyStatus || null,
      lastError: json?.transaction?.lastError || null,
    };
    state.pendingAction = json.pendingAction || null;
    state.userPreferences = {
      budgetFocused: !!json?.userPreferences?.budgetFocused,
      claimsFocused: !!json?.userPreferences?.claimsFocused,
      coverageFocused: !!json?.userPreferences?.coverageFocused,
      concisePreferred: typeof json?.userPreferences?.concisePreferred === 'boolean'
        ? json.userPreferences.concisePreferred
        : null,
      preferenceScores: {
        budgetFocused: Number(json?.userPreferences?.preferenceScores?.budgetFocused || 0),
        claimsFocused: Number(json?.userPreferences?.preferenceScores?.claimsFocused || 0),
        coverageFocused: Number(json?.userPreferences?.preferenceScores?.coverageFocused || 0),
        concisePreferred: Number(json?.userPreferences?.preferenceScores?.concisePreferred || 0),
      },
      preferenceTurnCounter: Number(json?.userPreferences?.preferenceTurnCounter || 0),
      preferenceUpdatedAt: json?.userPreferences?.preferenceUpdatedAt || null,
    };
    state.experiment = {
      promptVariant: ['A', 'B'].includes(json?.experiment?.promptVariant) ? json.experiment.promptVariant : 'A',
      experimentMode: json?.experiment?.experimentMode || 'off',
      startedAt: Number(json?.experiment?.startedAt || Date.now()),
      updatedAt: Number(json?.experiment?.updatedAt || Date.now()),
      turns: Number(json?.experiment?.turns || 0),
      decisionTurns: Number(json?.experiment?.decisionTurns || 0),
      conversionIntentTurns: Number(json?.experiment?.conversionIntentTurns || 0),
      conversionRate: Number(json?.experiment?.conversionRate || 0),
      milestones: {
        quoteSelected: !!json?.experiment?.milestones?.quoteSelected,
        addOnsConfirmed: !!json?.experiment?.milestones?.addOnsConfirmed,
        roadTaxSelected: !!json?.experiment?.milestones?.roadTaxSelected,
        reachedOtp: !!json?.experiment?.milestones?.reachedOtp,
        reachedPayment: !!json?.experiment?.milestones?.reachedPayment,
        completedPayment: !!json?.experiment?.milestones?.completedPayment,
      },
    };

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
        if (['takaful', 'etiqa', 'allianz'].includes(meta.lastRecommendedInsurer)) {
          state.lastRecommendedInsurer = meta.lastRecommendedInsurer;
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
    this.lastRecommendedInsurer = null;
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
    this.lastRecommendedInsurer = null;
    this.quoteGeneratedAt = null;
    this.quoteValidUntil = null;
    this.selectedAddOns = [];
    this.addOnsConfirmed = false;
    this.selectedRoadTax = null;
    this.personalDetails = null;
    this.otpVerified = false;
    this.paymentMethod = null;
    this.transaction = {
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
      lastRecommendedInsurer: this.lastRecommendedInsurer,
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
      transaction: this.transaction ? {
        quoteId: this.transaction.quoteId || null,
        reprice: this.transaction.reprice || null,
        proposalId: this.transaction.proposalId || null,
        proposalStatus: this.transaction.proposalStatus || null,
        paymentIntentId: this.transaction.paymentIntentId || null,
        paymentStatus: this.transaction.paymentStatus || null,
        policyNumber: this.transaction.policyNumber || null,
        policyStatus: this.transaction.policyStatus || null,
        lastError: this.transaction.lastError || null,
      } : null,
      pendingAction: this.pendingAction,
      userPreferences: this.userPreferences,
      experiment: this.experiment,
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
    } else if (this.lastRecommendedInsurer && this.step === FLOW_STEPS.QUOTES) {
      const labelMap = {
        takaful: 'Takaful Ikhlas',
        etiqa: 'Etiqa Insurance',
        allianz: 'Allianz Insurance',
      };
      parts.push(`Last recommendation: ${labelMap[this.lastRecommendedInsurer] || this.lastRecommendedInsurer}`);
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
    if (this.transaction?.proposalId) {
      parts.push(`Proposal: ${this.transaction.proposalId} (${this.transaction.proposalStatus || 'DRAFT'})`);
    }
    if (this.transaction?.paymentIntentId) {
      parts.push(`Payment Intent: ${this.transaction.paymentIntentId} (${this.transaction.paymentStatus || 'PENDING'})`);
    }
    if (this.transaction?.policyNumber) {
      parts.push(`Policy: ${this.transaction.policyNumber} (${this.transaction.policyStatus || 'ISSUED'})`);
    }
    if (this.userPreferences) {
      const prefs = [];
      if (this.userPreferences.budgetFocused) prefs.push('budget-focused');
      if (this.userPreferences.claimsFocused) prefs.push('claims-focused');
      if (this.userPreferences.coverageFocused) prefs.push('coverage-focused');
      if (this.userPreferences.concisePreferred === true) prefs.push('prefers concise replies');
      if (this.userPreferences.concisePreferred === false) prefs.push('prefers detailed replies');
      if (prefs.length > 0) {
        parts.push(`User preferences: ${prefs.join(', ')}`);
      }
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

function hasApproxToken(text, targets, maxDistance = 2) {
  const tokens = tokenizeIntentText(text);
  return tokens.some((token) => token.length >= 3 && !!fuzzyMatch(token, targets, maxDistance));
}

function normalizeCommonIntentTypos(text) {
  let out = String(text || '');
  const replacements = [
    [/\bobleh\b/gi, 'boleh'],
    [/\bbole\b/gi, 'boleh'],
    [/\bboeh\b/gi, 'boleh'],
    [/\bboelh\b/gi, 'boleh'],
    [/\bbloeh\b/gi, 'boleh'],
    [/\bskp\b/gi, 'skip'],
    [/\bskpi\b/gi, 'skip'],
    [/\bksip\b/gi, 'skip'],
    [/\bsikp\b/gi, 'skip'],
    [/\bernew\b/gi, 'renew'],
    [/\bcrad\b/gi, 'card'],
    [/\bcadr\b/gi, 'card'],
    [/\bacrd\b/gi, 'card'],
    [/\bello\b/gi, 'hello'],
    [/\bhelo\b/gi, 'hello'],
    [/\bhllo\b/gi, 'hello'],
    [/\bhlelo\b/gi, 'hello'],
    [/\behllo\b/gi, 'hello'],
    [/\bhelol\b/gi, 'hello'],
    [/\brecommnd\b/gi, 'recommend'],
    [/\brecomend\b/gi, 'recommend'],
    [/\brecommed\b/gi, 'recommend'],
    [/\brecomnd\b/gi, 'recommend'],
    [/\beitqa\b/gi, 'etiqa'],
    [/\betiaq\b/gi, 'etiqa'],
    [/\btakaflu\b/gi, 'takaful'],
    [/\btoki\b/gi, 'tokio'],
    [/\bokio\b/gi, 'tokio'],
  ];

  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function isStartGreetingMessage(text) {
  const tokens = tokenizeIntentText(text);
  if (!tokens.length) return false;

  let consumed = 0;
  const first = tokens[0];
  const second = tokens[1] || '';

  if (['hi', 'hello', 'hey', 'yo', 'salam', 'assalam', 'hell'].includes(first)) {
    consumed = 1;
  } else if (first === 'good' && ['morning', 'afternoon', 'evening'].includes(second)) {
    consumed = 2;
  } else {
    return false;
  }

  const tail = tokens.slice(consumed);
  const filler = new Set(['please', 'pls', 'boleh', 'can', 'leh', 'ah', 'la', 'lah', 'bro', 'boss', 'sis', 'tq', 'thanks', 'there']);
  return tail.every((token) => filler.has(token));
}

function detectSingleInsurerKey(text) {
  const msg = String(text || '').toLowerCase();
  const hits = new Set();

  if (/\btakaful\b|\bikhlas\b/i.test(msg)) hits.add('takaful');
  if (/\betiqa\b/i.test(msg)) hits.add('etiqa');
  if (/\ballianz\b/i.test(msg)) hits.add('allianz');

  const tokens = tokenizeIntentText(msg);
  for (const token of tokens) {
    if (fuzzyMatch(token, ['takaful', 'ikhlas'], 2)) hits.add('takaful');
    if (fuzzyMatch(token, ['etiqa'], 2)) hits.add('etiqa');
    if (fuzzyMatch(token, ['allianz'], 2)) hits.add('allianz');
  }

  if (hits.size !== 1) return null;
  return [...hits][0];
}

function parsePaymentMethodFromText(text) {
  const msg = String(text || '').toLowerCase();

  if (
    /\bfpx\b|online banking|bank transfer|internet banking/i.test(msg) ||
    hasApproxToken(msg, ['fpx'], 1)
  ) return 'fpx';

  if (
    /\b(e.?wallet|wallet|tng|touch n go|grabpay|boost|shopeepay)\b/i.test(msg) ||
    hasApproxToken(msg, ['wallet', 'ewallet', 'grabpay', 'boost', 'tng'], 2)
  ) return 'ewallet';

  if (
    /\b(instalment|installment|bnpl|pay later|atome|paylater)\b/i.test(msg) ||
    hasApproxToken(msg, ['instalment', 'installment', 'bnpl', 'atome'], 2)
  ) return 'bnpl';

  if (
    /\b(card|cadr|acrd|credit|debit|visa|mastercard)\b/i.test(msg) ||
    hasApproxToken(msg, ['card', 'credit', 'debit'], 2)
  ) return 'card';

  return null;
}

function hasGeneralQuestionSignal(text) {
  const msg = String(text || '').toLowerCase().trim();
  if (!msg) return false;

  if (/\?/.test(msg)) return true;
  if (/\b(do i|should i|can i|could i|would i|what|why|how|when|where|which|who|explain|tell me|clarify|compare|difference|worth it|necessary)\b/i.test(msg)) return true;
  if (/\b(apa|kenapa|bagaimana|macam mana|boleh ke|perlu ke|patut ke)\b/i.test(msg)) return true;
  if (hasApproxToken(msg, ['recommend', 'compare', 'comparison', 'difference', 'explain', 'clarify'], 2)) return true;

  return false;
}

/**
 * Normalize intent text and remove known noise tails that should not drive routing.
 */
function sanitizeIntentMessage(message) {
  let normalized = String(message || '').toLowerCase();
  normalized = normalized.replace(/[\r\n]+/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  normalized = normalizeCommonIntentTypos(normalized);

  // Strip prompt-injection style tails often appended after an otherwise valid user intent.
  normalized = normalized.replace(/\b(?:ignore|ingore)\s+(?:previous|preivous)\s+(?:instructions?|intsructions?|istructions?)[\s\S]*$/i, '').trim();
  return normalized;
}

/**
 * Remove conversational tag-question suffixes so structured extractors
 * still work for messages like "0123 ... boleh ah?".
 */
function stripTagQuestionSuffix(text) {
  const input = String(text || '').trim();
  if (!input) return input;

  // Drop trailing emoji/symbol noise so suffix stripping still works.
  const withoutTrailingNoise = input.replace(/[^\p{L}\p{N}\s?!.,:'"-]+$/gu, '').trim();
  const stripped = withoutTrailingNoise
    .replace(/\b(?:boleh|can|leh)\s*ah\??(?:\s*please)?$/i, '')
    .replace(/\b(?:boleh|can|leh)\??(?:\s*please)?$/i, '')
    .trim();

  return stripped.length > 0 ? stripped : (withoutTrailingNoise || input);
}

function tokenizeIntentText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function isAffirmativeToken(token) {
  const t = String(token || '').toLowerCase();
  return /^(ok+|okay+|ya+|yah+|yes+|yep+|yup+|sure+|alright+|betul+|correct+|confirm+)$/i.test(t);
}

function hasAffirmativePrefix(text) {
  const tokens = tokenizeIntentText(text);
  if (!tokens.length) return false;
  let i = 0;
  while (i < tokens.length && /^(hmm+|umm+|uhh+|eh+|ah+)$/i.test(tokens[i])) i += 1;
  if (i >= tokens.length) return false;

  const first = tokens[i];
  const second = tokens[i + 1] || '';
  if (isAffirmativeToken(first)) return true;
  if (/^(proceed|continue)$/i.test(first)) return true;
  if (/^(go|do|lets|let's)$/i.test(first) && /^(ahead|it|go)$/i.test(second)) return true;
  return false;
}

function isSimpleAffirmative(text) {
  const tokens = tokenizeIntentText(text);
  if (!tokens.length) return false;

  let i = 0;
  while (i < tokens.length && /^(hmm+|umm+|uhh+|eh+|ah+)$/i.test(tokens[i])) i += 1;
  if (i >= tokens.length) return false;

  const first = tokens[i];
  const second = tokens[i + 1] || '';
  const rest = tokens.slice(i + 1);
  const filler = new Set(['please', 'pls', 'pls.', 'lah', 'la', 'bro', 'boss', 'sis', 'tq', 'thanks', 'ah', 'leh', 'boleh', 'can']);

  if (/^(proceed|continue)$/i.test(first)) {
    return rest.every((w) => filler.has(w));
  }

  if (/^(go|do|lets|let's)$/i.test(first) && /^(ahead|it|go)$/i.test(second)) {
    const phraseRest = tokens.slice(i + 2);
    return phraseRest.every((w) => filler.has(w));
  }

  if (!isAffirmativeToken(first)) return false;
  return rest.every((w) => filler.has(w));
}

function isNegativeToken(token) {
  const t = String(token || '').toLowerCase();
  return /^(no+|nope+|nah+|nop+|cancel|stop)$/i.test(t);
}

function isSimpleNegative(text) {
  const tokens = tokenizeIntentText(text);
  if (!tokens.length) return false;

  let i = 0;
  while (i < tokens.length && /^(hmm+|umm+|uhh+|eh+|ah+)$/i.test(tokens[i])) i += 1;
  if (i >= tokens.length) return false;

  const first = tokens[i];
  const rest = tokens.slice(i + 1);
  const filler = new Set(['please', 'pls', 'pls.', 'lah', 'la', 'bro', 'boss', 'sis', 'tq', 'thanks', 'ah', 'leh', 'boleh', 'can']);

  if (!isNegativeToken(first)) return false;
  return rest.every((w) => filler.has(w));
}

// ============================================================================
// INTENT DETECTION - What does the user want to do?
// ============================================================================

export const USER_INTENTS = {
  GREETING: 'greeting',
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
  const normalized = sanitizeIntentMessage(message);
  const msg = stripTagQuestionSuffix(normalized);
  const structuredMsg = msg;

  // Pending insurer-switch confirmation: only interpret short confirmations in this mode.
  if (currentState.pendingAction?.type === 'confirm_quote_change') {
    if (isSimpleAffirmative(msg) || /^(change it)$/i.test(msg)) {
      return { intent: USER_INTENTS.CONFIRM_CHANGE_QUOTE, confidence: 0.95 };
    }
    if (/^(no|nope|cancel|don'?t|do not|never mind|nevermind|continue|keep current|stay)$/i.test(msg)) {
      return { intent: USER_INTENTS.OTHER, confidence: 0.9, data: { cancelPendingAction: true } };
    }
  }

  // Greeting at start: keep this separate so route.js can answer naturally
  // without forcing a full form/list on "hello".
  if (
    currentState.step === FLOW_STEPS.START &&
    !currentState.plateNumber &&
    !currentState.nricNumber &&
    isStartGreetingMessage(msg)
  ) {
    return { intent: USER_INTENTS.GREETING, confidence: 0.95 };
  }

  // Probe/testing messages at start should feel human, not force immediate intake.
  if (
    currentState.step === FLOW_STEPS.START &&
    !currentState.plateNumber &&
    !currentState.nricNumber &&
    /^(?:just\s+)?(test|testing|check|checking|ping|trial|demo)\b[!. ]*$/i.test(msg)
  ) {
    return { intent: USER_INTENTS.UNCLEAR_OR_PLAYFUL, confidence: 0.9 };
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

  // OTP verification (any 4 digits - for testing, accept any 4-digit code token such as "1470" or "hmm 1470 please")
  // In production, this should verify against the actual OTP sent
  if (currentState.step === FLOW_STEPS.OTP) {
    const otpMatch = msg.match(/\b(\d{4})\b/);
    if (otpMatch) {
      const otp = otpMatch[1];
      console.log('[Intent] OTP verification detected:', otp);
      // For testing: accept any 4-digit code
      // In production: verify against actual OTP
      return { intent: USER_INTENTS.VERIFY_OTP, confidence: 1.0, data: { otp, valid: true } };
    }
  }

  // Payment selection
  if (currentState.step === FLOW_STEPS.PAYMENT) {
    // Explicit negative/cancel response should stay as non-selection.
    if (/^(?:hmm+\s+)?(?:no|nope|not now|cancel|don'?t|do not)\b/i.test(msg)) {
      return { intent: USER_INTENTS.OTHER, confidence: 0.9 };
    }

    // Specific payment method selection
    const paymentMethod = parsePaymentMethodFromText(msg);
    if (paymentMethod) {
      const method = paymentMethod;
      return { intent: USER_INTENTS.SELECT_PAYMENT, confidence: 0.9, data: { method } };
    }
    // General confirmation to proceed with payment (e.g., "yes please", "ok", "proceed")
    if (isSimpleAffirmative(msg) || /^(ready|pay now|let'?s go)$/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_PAYMENT, confidence: 0.85, data: { method: 'any' } };
    }
  }

  // Quote selection - with typo tolerance using fuzzy matching
  // IMPORTANT: Only treat as selection when user explicitly confirms their choice.
  // Mentioning an insurer alone (e.g. "I want to know about Allianz") is NOT a selection.
  if (currentState.step === FLOW_STEPS.QUOTES) {
    if (isSimpleNegative(msg)) {
      return { intent: USER_INTENTS.OTHER, confidence: 0.9 };
    }

    // If user just says "ok", "yes", etc. without specifying an insurer
    // The AI will naturally ask which quote they prefer
    if (isSimpleAffirmative(msg)) {
      return { intent: USER_INTENTS.CONFIRM, confidence: 0.7 };
    }

    // Explicit request to re-show quotes/options should always stay in quote Q&A mode
    // e.g. "show me the quotes again", "repeat options", "list prices"
    const asksToSeeQuotesAgain =
      /(?:show|list|repeat|remind(?: me)?|display)\b.*\b(?:quote|quotes|options|price|prices)\b|\b(?:quote|quotes|options|price list)\b.*\b(?:again|repeat)\b|what are the options|show me (?:the )?quotes/i.test(msg);
    if (asksToSeeQuotesAgain) {
      return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.95 };
    }

    // User may mention a preferred insurer that's outside current panel (e.g., Tokio Marine).
    // Treat this as a consultative question so AI can acknowledge and map to best available option.
    const mentionsUnavailableInsurer = /\b(tokio\s*marine|toki(?:o)?\s*marine|tokio|toki|okio\s*marine|okio|zurich|axa|generali|msig|sompo|rhb|liberty)\b/i.test(msg);
    if (mentionsUnavailableInsurer) {
      return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 };
    }

    // DILEMMA/INDECISION detection — user needs help deciding, NOT making a selection
    // "can't choose", "can't decide", "torn between", "not sure which", "help me decide", etc.
    const isDilemma = /can'?t (choose|decide|pick|select)|torn between|stuck between|not sure which|help me (choose|decide|pick)|which (one|should)|which is better|what(?:'s| is) better|better one|best one|between .+ and/i.test(msg);
    if (isDilemma) {
      return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.95 };
    }

    const singleInsurerMention = detectSingleInsurerKey(msg);
    const hasSelectionNegationCue = /\b(no|not|don'?t|dont|can'?t|cannot|couldn'?t|not sure|between)\b/i.test(msg);
    const hasQuoteQuestionCue =
      hasGeneralQuestionSignal(msg) ||
      /\b(about|tell me|explain|compare|difference|details|info)\b/i.test(msg);
    if (singleInsurerMention && !hasSelectionNegationCue && !hasQuoteQuestionCue) {
      return {
        intent: USER_INTENTS.SELECT_QUOTE,
        confidence: 0.9,
        data: { insurer: singleInsurerMention }
      };
    }

    // Treat as question if message contains question markers or inquiry words + insurer
    const isRecommendationQuestion = /\brecommend(?:ation)?\b|your (pick|choice|suggestion)|suggest/i.test(msg) || hasApproxToken(msg, ['recommend'], 2);
    const isQuestion = hasGeneralQuestionSignal(msg) || /tell me|what about|how about|about\s+(takaful|ikhlas|etiqa|allianz)|interested|want to know|more about|details|which is better|what(?:'s| is) better|better one|best one/i.test(msg);
    const isDiscussion = /\b(which|what|why|compare|difference|better|best)\b/i.test(msg) || isRecommendationQuestion;

    if (isQuestion || isDiscussion) {
      // At quote step, discussion/question phrasing should stay in Q&A mode
      // rather than falling through to generic OTHER.
      return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 };
    }

    // Delegation / playful uncertainty
    if (
      /you choose|you pick|up to you|whatever|whichever|surprise me|idk|dunno|not sure|hmm+|haha|lol/i.test(msg) &&
      !isQuestion &&
      !isDiscussion
    ) {
      return { intent: USER_INTENTS.UNCLEAR_OR_PLAYFUL, confidence: 0.88 };
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
    const hasSkipToken =
      /\b(skip|skpi|ksip|sikp)\b/i.test(msg) ||
      /^skp$/i.test(msg.trim()) ||
      (() => {
        const tokens = tokenizeIntentText(msg);
        const filler = new Set(['please', 'pls', 'lah', 'la', 'ah', 'leh', 'boleh', 'can', 'bro', 'boss', 'sis']);
        const core = tokens.filter((token) => !filler.has(token));
        if (core.length === 0 || core.length > 2) return false;
        return core.some((token) => /^(ski|sip|kip)$/i.test(token));
      })();

    // Check for explicit "no add-ons" / "skip" / "none"
    if (
      /\b(no add.?on|none|skip(?: all)?(?: add.?ons?)?|skip add|no thanks|don't need|dont need|proceed without|no insurance add)\b/i.test(msg) ||
      hasSkipToken
    ) {
      return { intent: USER_INTENTS.SELECT_ADDON, confidence: 0.9, data: { addOns: [], confirmed: true } };
    }

    // Detect which add-ons are mentioned
    const mentionedAddOns = [];

    const addonWords = msg
      .replace(/[^a-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const hasWindscreen = /windscreen/i.test(msg) || addonWords.some((w) => !!fuzzyMatch(w, ['windscreen'], 3));
    if (hasWindscreen) mentionedAddOns.push('windscreen');
    if (/flood|disaster|perils|special perils/i.test(msg)) mentionedAddOns.push('flood');
    if (/e.?hailing|grab|ride.?sharing|ride.?share/i.test(msg)) mentionedAddOns.push('ehailing');
    if (/both|all/i.test(msg)) {
      mentionedAddOns.push('windscreen', 'flood', 'ehailing');
    }

    // Number-based selection: "1", "1 and 3", "1,3", "1 3", "1 & 2"
    const numberMap = { '1': 'windscreen', '2': 'flood', '3': 'ehailing' };
    const numberMatches = msg.match(/\b[1-3]\b/g);
    if (numberMatches && mentionedAddOns.length === 0) {
      const unique = [...new Set(numberMatches)];
      for (const n of unique) {
        if (numberMap[n] && !mentionedAddOns.includes(numberMap[n])) {
          mentionedAddOns.push(numberMap[n]);
        }
      }
      if (mentionedAddOns.length > 0) {
        return {
          intent: USER_INTENTS.SELECT_ADDON,
          confidence: 0.9,
          data: { addOns: mentionedAddOns, confirmed: true }
        };
      }
    }

    // Check if this is a QUESTION about add-ons (not a selection)
    // "what is windscreen?", "do I need flood?", "tell me about special perils"
    const isQuestion = /\?|what is|what's|do i need|should i|tell me|explain|clarify|which one|which insurer|recommend|need this|worth it|necessary|how does|what does|betterment|zero betterment/i.test(msg);

    // Cross-topic insurance/policy questions can happen mid-step.
    // Answer first, then route back to add-ons (handled in route.js).
    const startsLikeQuestion = /^(which|what|how|why|when|where|can|could|would|is|are|do|does|should)\b/i.test(msg);
    const hasInsuranceTopicCue = /\b(insurer|policy|coverage|cover|claims?|betterment|waiver|depreciation|premium|sum insured|ncd)\b/i.test(msg);
    const isCrossTopicInsuranceQuestion = (startsLikeQuestion && hasInsuranceTopicCue) || /\bclarify this\b/i.test(msg);

    // Check for indecision/dilemma about add-ons
    const isIndecision = /can'?t (choose|decide)|not sure|help me (choose|decide)|which (one|should)/i.test(msg);

    if (isQuestion || isIndecision || isCrossTopicInsuranceQuestion) {
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
    if (isSimpleAffirmative(msg)) {
      return { intent: USER_INTENTS.OTHER, confidence: 0.5 };
    }

    if (/you choose|you pick|up to you|whatever|whichever|surprise me|idk|dunno|not sure|hmm+|haha|lol/i.test(msg)) {
      return { intent: USER_INTENTS.UNCLEAR_OR_PLAYFUL, confidence: 0.82 };
    }
  }

  // Road tax selection - check if user is selecting a road tax option
  const isRoadTaxStep = currentState.step === FLOW_STEPS.ROADTAX;
  if (isRoadTaxStep) {
    const compactMsg = msg.replace(/[^a-z0-9]/g, '');
    if (isSimpleNegative(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.9, data: { option: 'none' } };
    }

    // Explicit "no road tax" intent should win before generic affirmations.
    if (
      /\bno\s*(?:road\s*tax|roadtax|orad\s*tax|raod\s*tax|rod\s*tax|roa\s*tax|rad\s*tax|oad\s*tax|roda\s*tax)\b/i.test(msg) ||
      /\b(just insurance|insurance only|skip)\b/i.test(msg) ||
      /no(?:roadtax|oradtax|raodtax|rodtax|roatax|radtax|oadtax|rodatax)/i.test(compactMsg)
    ) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.9, data: { option: 'none' } };
    }

    // Alternative renewal location question (e.g., "where else can i renew roadtax")
    if (/where\s*else|whereelse|wehreelse|other place|where can i renew|renew.*where/i.test(msg)) {
      return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.85 };
    }

    // Clarifying questions about digital road tax should stay in Q&A mode.
    const asksDigitalMeaning =
      /\b((?:what|wat|wht|hwat|waht)\s+(?:do\s+you\s+)?(?:mean|maen|mea)|(?:what|wat|wht|hwat|waht)\s+you\s+(?:mean|maen|mea)|(?:mean|maen|mea)\s+what|meaning)\b/i.test(msg) &&
      /\b(digital|dgital|digitl|diigtal|idgital|digial|road\s*tax|roadtax)\b/i.test(msg);
    if (asksDigitalMeaning) {
      return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 };
    }

    // Single-option flow: "ok/yes/proceed" means accept default 12-month digital.
    if (isSimpleAffirmative(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.9, data: { option: '12month-digital' } };
    }

    // Natural affirmations like "ok renew", "yes renew roadtax", "add digital".
    const hasAffirmative = hasAffirmativePrefix(msg) || /\b(add|include)\b/i.test(msg);
    const hasRoadTaxContext = /\b(renew|road tax|roadtax|digital|12 month|12 months|1 year)\b/i.test(msg);
    if (hasAffirmative && hasRoadTaxContext) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.88, data: { option: '12month-digital' } };
    }

    if (hasAffirmativePrefix(msg) && !hasGeneralQuestionSignal(msg) && !/\b(no|none|skip)\b/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.84, data: { option: '12month-digital' } };
    }

    // Direct action phrasing: "renew roadtax", "add digital road tax"
    const startsWithAction = /^(renew|add|include|take|go with)\b/i.test(msg);
    const hasSpecificRoadTaxTarget = /\b(road tax|roadtax|digital|12\s*(month|months|mth|mths|year|yr)|1\s*year)\b/i.test(msg);
    if (startsWithAction && hasSpecificRoadTaxTarget) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.87, data: { option: '12month-digital' } };
    }

    // Delivery/printed requests are clarified in conversational response.
    if (/deliver|delivery|printed|physical|sticker/i.test(msg)) {
      return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.8 };
    }

    if (/12.*month.*digital|digital.*12|year.*digital/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.9, data: { option: '12month-digital' } };
    }
    if (/\b(12\s*(month|months|mth|mths|year|yr)|1\s*year)\b/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.88, data: { option: '12month-digital' } };
    }

    // Keep this as clarification instead of selecting a removed option.
    if (/\b6\s*(month|months|mth|mths)\b/i.test(msg)) {
      return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.8 };
    }

    // Plain duration fallback:
    // "12 months" (without digital/delivered) should still select road tax.
    // Default to digital option when channel is not specified.
    if (/\b12\s*(month|months|mth|mths|year|yr)?\b/i.test(msg)) {
      return { intent: USER_INTENTS.SELECT_ROADTAX, confidence: 0.85, data: { option: '12month-digital' } };
    }

    if (/you choose|you pick|up to you|whatever|whichever|surprise me|idk|dunno|not sure|hmm+|haha|lol/i.test(msg)) {
      return { intent: USER_INTENTS.UNCLEAR_OR_PLAYFUL, confidence: 0.82 };
    }
  }

  // IMPORTANT: Prioritize structured payload detection before broad question routing.
  const personalInfo = extractPersonalInfo(structuredMsg);
  const hasEmail = !!personalInfo.email;
  const hasPhone = !!personalInfo.phone;
  const hasAddress = !!personalInfo.address;

  if (hasEmail) {
    console.log('[Intent] Detected SUBMIT_DETAILS intent - email found');
    return { intent: USER_INTENTS.SUBMIT_DETAILS, confidence: 0.95 };
  }

  if ((hasPhone || hasAddress) && currentState.step === FLOW_STEPS.PERSONAL_DETAILS) {
    console.log('[Intent] Detected SUBMIT_DETAILS intent - phone/address found at personal_details step');
    return { intent: USER_INTENTS.SUBMIT_DETAILS, confidence: 0.85 };
  }

  // Personal details fallback: treat messy combined payloads as details submission
  // so route can ask specifically for missing/invalid fields instead of generic repeat.
  if (currentState.step === FLOW_STEPS.PERSONAL_DETAILS) {
    const looksLikeQuestion = /\?|^(how|what|when|where|why|which|can|do|does|is|are|should)\b/i.test(msg.trim());
    const hasDetailSignal =
      /@|(?:\+?60|0?1)\D*\d{6,}|\b(jalan|jln|lorong|taman|seksyen|section|address|addr|postcode|poskod)\b|,/.test(msg);
    if (!looksLikeQuestion && hasDetailSignal) {
      console.log('[Intent] Detected SUBMIT_DETAILS intent - fallback detail signal at personal_details step');
      return { intent: USER_INTENTS.SUBMIT_DETAILS, confidence: 0.72 };
    }
  }

  const extractedVehicle = extractVehicleInfo(structuredMsg);
  const hasPlate = !!extractedVehicle.registrationNumber;
  const hasNRIC = !!extractedVehicle.ownerId;
  if ((hasPlate || hasNRIC) && currentState.step !== FLOW_STEPS.PERSONAL_DETAILS) {
    return { intent: USER_INTENTS.PROVIDE_INFO, confidence: 0.9, data: { hasPlate, hasNRIC } };
  }

  // Question detection (after step-specific handlers so payment questions don't get swallowed)
  if (hasGeneralQuestionSignal(msg) || /tell me about|need this|need these/i.test(msg)) {
    return { intent: USER_INTENTS.ASK_QUESTION, confidence: 0.9 };
  }

  // Confirmation - detect various ways users say "yes, that's correct"
  if (isSimpleAffirmative(msg) ||
      /^(yes|correct|confirm|ok|okay|ya|betul|proceed|looks good|that's right|continue|all good|all is good|good|yep|yup|right|thats? correct)$/i.test(msg) ||
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

  return { intent: USER_INTENTS.OTHER, confidence: 0.5 };
}

export default ConversationState;
