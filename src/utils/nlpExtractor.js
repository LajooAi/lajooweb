/**
 * Natural Language Processing utilities for extracting user information
 * from chat messages
 */

const MY_LOCAL_PHONE_REGEX = /\b0?1\d(?:[\s\-]?\d){7,8}\b/;
const MY_COUNTRY_PHONE_REGEX = /\+?60(?:[\s\-]?\d){9,10}\b/;

/**
 * Extract email address from text
 * @param {string} text - The text to search
 * @returns {string|null} - Extracted email or null
 */
export function extractEmail(text) {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(emailRegex);
  return matches ? matches[0] : null;
}

/**
 * Extract Malaysian phone number from text
 * @param {string} text - The text to search
 * @returns {string|null} - Extracted phone or null
 */
export function extractPhone(text) {
  if (!text || typeof text !== 'string') return null;

  const normalizePhone = (raw) => {
    if (!raw) return null;
    let digits = String(raw).replace(/\D/g, '');

    if (digits.startsWith('60')) {
      digits = `0${digits.slice(2)}`;
    } else if (digits.startsWith('1')) {
      digits = `0${digits}`;
    }

    return /^01\d{8,9}$/.test(digits) ? digits : null;
  };

  // Malaysian phone patterns:
  // 01X-XXXXXXX (10 digits starting with 01)
  // +60 1X-XXXXXXX (with country code)

  // Try country-code form first (+60 / 60)
  const countryMatch = text.match(MY_COUNTRY_PHONE_REGEX);
  const countryPhone = normalizePhone(countryMatch?.[0]);
  if (countryPhone) {
    return countryPhone;
  }

  // Local form (supports grouped spacing/hyphens like "012 2277 888")
  const mobileMatch = text.match(MY_LOCAL_PHONE_REGEX);
  const mobilePhone = normalizePhone(mobileMatch?.[0]);
  if (mobilePhone) {
    return mobilePhone;
  }

  // Fallback: just look for a plain 10/11-digit Malaysian mobile
  const simpleRegex = /\b(01\d{8,9})\b/;
  const simpleMatch = text.match(simpleRegex);
  if (simpleMatch) {
    return simpleMatch[1];
  }

  return null;
}

/**
 * Extract address from text
 * @param {string} text - The text to search
 * @returns {string|null} - Extracted address or null
 */
export function extractAddress(text) {
  if (!text || typeof text !== 'string') return null;

  const lowerText = text.toLowerCase();
  // Remove obvious non-address tokens first (email/phone often come in same message).
  const textWithoutEmail = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, ' ');
  const textWithoutEmailPhone = textWithoutEmail
    .replace(MY_COUNTRY_PHONE_REGEX, ' ')
    .replace(MY_LOCAL_PHONE_REGEX, ' ');
  const addressText = textWithoutEmailPhone.replace(/\s+/g, ' ').trim();
  const lowerAddressText = addressText.toLowerCase();

  // Skip if text is clearly a question (not an address submission)
  if (/\?/.test(text) || /^(how|what|when|where|why|which|can|do|does|is|are|will)\b/i.test(text.trim())) {
    return null;
  }

  // Malaysian street/location indicators - these are strong signals of an actual address
  const streetIndicators = ['jalan', 'jln', 'lorong', 'taman', 'persiaran', 'lebuh', 'kampung', 'kg'];
  const hasStreetIndicator = streetIndicators.some(indicator => lowerAddressText.includes(indicator));
  const hasPostcode = /\b\d{5}\b/.test(addressText);
  const commaCount = (addressText.match(/,/g) || []).length;
  const hasStructuredAddress = hasPostcode && commaCount >= 2;
  const stateIndicators = [
    'selangor', 'kuala lumpur', 'johor', 'penang', 'perak', 'kedah',
    'kelantan', 'terengganu', 'pahang', 'negeri sembilan', 'melaka',
    'sabah', 'sarawak', 'perlis', 'putrajaya', 'labuan'
  ];
  const hasStateIndicator = stateIndicators.some(state => lowerAddressText.includes(state));
  const looksLikeAddress = hasStreetIndicator || hasStructuredAddress || (hasPostcode && hasStateIndicator);

  // If no strong address signals, avoid false positives like "deliver to me".
  if (!looksLikeAddress) {
    return null;
  }

  // Try to extract address after common patterns
  // Pattern 1: Look for house number + street pattern (e.g., "3a, jalan..." or "no 12, jalan...")
  const houseStreetPattern = /\b(\d+[a-z]?\s*,?\s*(?:jalan|jln|lorong|taman|persiaran|lebuh)\s+[^@\n]+)/i;
  const houseMatch = addressText.match(houseStreetPattern);
  if (houseMatch) {
    let address = houseMatch[1].trim();
    // Clean trailing punctuation but keep commas within
    address = address.replace(/[.!?]+$/, '').trim();
    if (address.length > 10) {
      return address;
    }
  }

  // Pattern 2: Look for "no." or "lot" prefix
  const noLotPattern = /\b((?:no\.?|lot)\s*\d+[a-z]?\s*,?\s*(?:jalan|jln|lorong|taman|persiaran|lebuh)\s+[^@\n]+)/i;
  const noLotMatch = addressText.match(noLotPattern);
  if (noLotMatch) {
    let address = noLotMatch[1].trim();
    address = address.replace(/[.!?]+$/, '').trim();
    if (address.length > 10) {
      return address;
    }
  }

  // Pattern 3: Direct street name pattern (e.g., "Jalan Setia Prima, 47000 Shah Alam")
  const streetPattern = /\b((?:jalan|jln|lorong|taman|persiaran|lebuh|kampung|kg)\s+[^@\n]+)/i;
  const streetMatch = addressText.match(streetPattern);
  if (streetMatch) {
    let address = streetMatch[1].trim();
    // Clean trailing punctuation
    address = address.replace(/[.!?]+$/, '').trim();
    if (address.length > 10) {
      return address;
    }
  }

  // Pattern 4: Structured residential format without street keywords
  // Example: "3A, Elitis Maya, Valencia, Sungai Buloh, 47000 Selangor"
  const structuredPattern = /\b((?:no\.?\s*)?\d+[a-z]?\s*,\s*[^@\n]{5,}?\b\d{5}\b[^@\n]*)/i;
  const structuredMatch = addressText.match(structuredPattern);
  if (structuredMatch) {
    let address = structuredMatch[1].trim();
    address = address.replace(/[.!?]+$/, '').trim();
    if (address.length > 12) {
      return address;
    }
  }

  return null;
}

/**
 * Extract Malaysian vehicle registration number from text
 * @param {string} text - The text to search
 * @returns {string|null} - Extracted registration number or null
 */
export function extractRegistrationNumber(text) {
  // Malaysian registration number patterns:
  // ABC1234, ABC 1234, WXY123, 1ABC234, JRT 9289, etc.
  const regNumRegex = /\b([A-Z]{1,3}\s?[0-9]{1,4}|[0-9]{1}\s?[A-Z]{3}\s?[0-9]{1,4})\b/gi;
  const matches = text.match(regNumRegex);

  if (!matches) return null;

  // Filter out common false positives (like "NCD" or short codes)
  const lowerText = String(text || '').toLowerCase();
  const validMatches = matches.filter(match => {
    const normalized = match.replace(/\s+/g, '');
    const upper = normalized.toUpperCase();
    // Must be at least 4 characters
    if (upper.length < 4) return false;
    // Exclude common abbreviations
    const excludeList = ['NCD', 'CC', 'RM', 'EMAIL', 'NRIC', 'IC'];
    if (excludeList.includes(upper)) return false;
    // Reject if the match is part of a regular word/sentence (e.g. "is 30" → "IS30")
    // Check that the match appears as a standalone token in original text
    const matchRegex = new RegExp(`(?:^|\\s)${match.replace(/\s+/g, '\\s?')}(?:\\s|$|[,\\.!?])`, 'i');
    const looseMatchRegex = new RegExp(`(?:^|\\s)${match.trim()}(?:\\s|$|[,\\.!?])`, 'i');
    if (!matchRegex.test(text) && !looseMatchRegex.test(text)) return false;
    // Reject matches extracted from common phrases (e.g. "is 30", "am 40", "at 50")
    const matchIndex = lowerText.indexOf(match.toLowerCase());
    const beforeMatch = text.substring(0, matchIndex).trim();
    const lastWordBefore = beforeMatch.split(/\s+/).pop()?.toLowerCase() || '';
    const contextWindow = lowerText.slice(Math.max(0, matchIndex - 24), Math.max(0, matchIndex) + match.length + 24);
    const hasPlateContext = /\b(plate|registration|reg(?:\.|istration)?|vehicle|car)\b/i.test(contextWindow);
    const commonWords = ['is', 'am', 'are', 'was', 'were', 'be', 'at', 'my', 'the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'has', 'have', 'had', 'do', 'does', 'did', 'get', 'got'];
    if (commonWords.includes(lastWordBefore) && !hasPlateContext) return false;
    return true;
  });

  return validMatches.length > 0 ? validMatches[0].replace(/\s+/g, '').toUpperCase() : null;
}

/**
 * Extract Malaysian NRIC (IC number) from text
 * @param {string} text - The text to search
 * @returns {string|null} - Extracted NRIC or null
 */
export function extractNRIC(text) {
  if (!text || typeof text !== 'string') return null;

  // Malaysian NRIC format: YYMMDD-PB-###G
  // Common formats: 951018145405, 951018-14-5405, etc.
  const isPlausibleNRIC = (value) => {
    if (!/^\d{12}$/.test(value)) return false;
    const month = Number(value.slice(2, 4));
    const day = Number(value.slice(4, 6));
    return month >= 1 && month <= 12 && day >= 1 && day <= 31;
  };

  // 1) Exact standalone 12-digit token
  const directMatch = text.match(/(?:^|[^\d])(\d{12})(?!\d)/);
  if (directMatch && isPlausibleNRIC(directMatch[1])) {
    return directMatch[1];
  }

  // 2) Common segmented format: YYMMDD-##-#### (or with spaces)
  const segmentedMatch = text.match(/(?:^|[^\d])(\d{6})[\s-]?(\d{2})[\s-]?(\d{4})(?!\d)/);
  if (segmentedMatch) {
    const candidate = `${segmentedMatch[1]}${segmentedMatch[2]}${segmentedMatch[3]}`;
    if (isPlausibleNRIC(candidate)) return candidate;
  }

  // 3) Fallback for merged numeric runs (e.g., plate digits + NRIC in one chunk)
  const digitRuns = text.match(/\d{12,}/g) || [];
  for (const run of digitRuns) {
    const candidate = run.slice(-12); // prefer rightmost 12 digits
    if (isPlausibleNRIC(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Extract owner identification (NRIC / Foreign ID / Army IC / Police IC / Company Reg)
 * @param {string} text - The text to search
 * @returns {{value: string, type: string}|null}
 */
export function extractOwnerIdentification(text) {
  if (!text || typeof text !== 'string') return null;

  // 1) Highest confidence: Malaysian NRIC
  const nric = extractNRIC(text);
  if (nric) {
    return { value: nric, type: 'nric' };
  }

  const lower = text.toLowerCase();

  // 2) Label-based extraction to reduce false positives
  const labeledMatch = text.match(
    /\b(passport|foreign id|foreign identification|army ic|police ic|company reg(?:istration)?|ssm|brn|roc|owner id|id number|id no)\b[\s:,-]*([a-z0-9\-\/]{5,24})/i
  );
  if (labeledMatch) {
    const label = labeledMatch[1].toLowerCase();
    const rawValue = labeledMatch[2];
    const value = rawValue.replace(/[^a-z0-9\-\/]/gi, '').toUpperCase();
    if (value.length >= 5) {
      let type = 'other_id';
      if (/passport|foreign/.test(label)) type = 'foreign_id';
      else if (/army/.test(label)) type = 'army_ic';
      else if (/police/.test(label)) type = 'police_ic';
      else if (/company|ssm|brn|roc/.test(label)) type = 'company_reg';
      return { value, type };
    }
  }

  // 3) Company registration common forms (labeled or standalone)
  const companyMatch = text.match(/\b((?:SSM|BRN|ROC)[\s:-]*[A-Z0-9-]{5,20}|\d{8,12})\b/i);
  if (companyMatch && /(ssm|brn|roc|company|sdn|berhad|bhd)/i.test(lower)) {
    const value = companyMatch[1].replace(/\s+/g, '').toUpperCase();
    return { value, type: 'company_reg' };
  }

  // 4) Fallback for plain 12-digit owner IDs (common user input for NRIC without separators).
  // Keep this conservative: accept only when message is short or clearly ID-related.
  const plain12Digit = text.match(/(?:^|[^\d])(\d{12})(?!\d)/);
  if (plain12Digit) {
    const candidate = plain12Digit[1];
    const tokenCount = text.trim().split(/\s+/).filter(Boolean).length;
    const likelyIdContext =
      /\b(ic|nric|id|owner|identification|passport|foreign|army|police|company)\b/i.test(lower) ||
      tokenCount <= 4;
    // Avoid misclassifying Malaysian mobile numbers as owner IDs.
    const looksLikePhone = /^01\d{8,9}$/.test(candidate);
    if (likelyIdContext && !looksLikePhone) {
      return { value: candidate, type: 'nric' };
    }
  }

  // 5) Conservative fallback: short message with clear alphanumeric ID token
  // Example: "A1234567", "P123456", "TNI-88421"
  const alphaNumToken = text.match(/\b([A-Z]{1,4}[0-9]{4,12}|[0-9]{3,12}[A-Z]{1,4}[0-9]{1,8}|[A-Z0-9]{6,18})\b/i);
  if (alphaNumToken) {
    const token = alphaNumToken[1].toUpperCase();
    const extractedPlate = extractRegistrationNumber(text);
    const normalizedPlate = extractedPlate ? extractedPlate.replace(/\s+/g, '').toUpperCase() : null;
    const looksLikePlate =
      token === normalizedPlate
      || /^[A-Z]{1,3}\d{1,4}[A-Z]{0,3}$/.test(token)
      || /^\d[A-Z]{1,3}\d{1,4}$/.test(token);
    const hasLetter = /[A-Z]/.test(token);
    const hasDigit = /\d/.test(token);
    const likelyIdContext =
      /\b(id|passport|owner|army|police|foreign|company|ssm|brn|roc|nric|ic)\b/i.test(lower)
      || token.length >= 8;
    const blocked = ['NCD', 'EMAIL', 'PHONE', 'ROADTAX', 'QUOTE', 'ADDON', 'IC'].includes(token);
    if (!blocked && !looksLikePlate && hasLetter && hasDigit && likelyIdContext) {
      return { value: token, type: 'other_id' };
    }
  }

  return null;
}

/**
 * Extract all personal information from text
 * @param {string} text - The text to search
 * @returns {Object} - Object with extracted email, phone, and address
 */
export function extractPersonalInfo(text) {
  return {
    email: extractEmail(text),
    phone: extractPhone(text),
    address: extractAddress(text),
  };
}

/**
 * Extract vehicle and identity information from text
 * @param {string} text - The text to search
 * @returns {Object} - Object with extracted registration number and NRIC
 */
export function extractVehicleInfo(text) {
  const registrationNumber = extractRegistrationNumber(text);
  let ownerId = extractOwnerIdentification(text);
  if (
    ownerId?.value
    && registrationNumber
    && String(ownerId.value).replace(/\s+/g, '').toUpperCase() === String(registrationNumber).replace(/\s+/g, '').toUpperCase()
  ) {
    ownerId = null;
  }
  return {
    registrationNumber,
    // Keep "nric" for backward compatibility with current flow code.
    nric: ownerId?.value || null,
    ownerId: ownerId?.value || null,
    ownerIdType: ownerId?.type || null,
  };
}

/**
 * Check if text contains personal information
 * @param {string} text - The text to check
 * @returns {boolean} - True if any personal info detected
 */
export function containsPersonalInfo(text) {
  const info = extractPersonalInfo(text);
  return !!(info.email || info.phone || info.address);
}
