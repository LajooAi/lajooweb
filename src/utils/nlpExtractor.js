/**
 * Natural Language Processing utilities for extracting user information
 * from chat messages
 */

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
  // Malaysian phone patterns:
  // 01X-XXXXXXX (10 digits starting with 01)
  // +60 1X-XXXXXXX (with country code)

  // Try to find Malaysian mobile number in original text (with separators)
  const mobileRegex = /\b0?1[0-9][\s\-]?[0-9]{3,4}[\s\-]?[0-9]{4}\b/;
  const mobileMatch = text.match(mobileRegex);
  if (mobileMatch) {
    // Extract just digits
    const phone = mobileMatch[0].replace(/\D/g, '');
    // Ensure 10 digits and starts with 01
    if (phone.length === 10 && phone.startsWith('01')) {
      return phone;
    }
  }

  // Try with country code +60
  const countryCodeRegex = /\+?60[\s\-]?1[0-9][\s\-]?[0-9]{3,4}[\s\-]?[0-9]{4}\b/;
  const countryMatch = text.match(countryCodeRegex);
  if (countryMatch) {
    const phone = countryMatch[0].replace(/\D/g, '');
    // Remove country code and add 0
    if (phone.startsWith('60') && phone.length === 11) {
      return '0' + phone.substring(2);
    }
  }

  // Fallback: just look for 10 consecutive digits starting with 01
  const simpleRegex = /\b(01[0-9]{8})\b/;
  const simpleMatch = text.match(simpleRegex);
  if (simpleMatch) {
    return simpleMatch[1];
  }

  return null;
}

/**
 * Extract delivery address from text
 * @param {string} text - The text to search
 * @returns {string|null} - Extracted address or null
 */
export function extractAddress(text) {
  const lowerText = text.toLowerCase();

  // Skip if text is clearly a question (not an address submission)
  if (/\?/.test(text) || /^(how|what|when|where|why|which|can|do|does|is|are|will)\b/i.test(text.trim())) {
    return null;
  }

  // Malaysian street/location indicators - these are strong signals of an actual address
  const streetIndicators = ['jalan', 'jln', 'lorong', 'taman', 'persiaran', 'lebuh', 'kampung', 'kg'];
  const hasStreetIndicator = streetIndicators.some(indicator => lowerText.includes(indicator));

  // If no street indicator, don't try to extract address
  // This prevents "deliver to me" from being matched as an address
  if (!hasStreetIndicator) {
    return null;
  }

  // Try to extract address after common patterns
  // Pattern 1: Look for house number + street pattern (e.g., "3a, jalan..." or "no 12, jalan...")
  const houseStreetPattern = /\b(\d+[a-z]?\s*,?\s*(?:jalan|jln|lorong|taman|persiaran|lebuh)\s+[^@\n]+)/i;
  const houseMatch = text.match(houseStreetPattern);
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
  const noLotMatch = text.match(noLotPattern);
  if (noLotMatch) {
    let address = noLotMatch[1].trim();
    address = address.replace(/[.!?]+$/, '').trim();
    if (address.length > 10) {
      return address;
    }
  }

  // Pattern 3: Direct street name pattern (e.g., "Jalan Setia Prima, 47000 Shah Alam")
  const streetPattern = /\b((?:jalan|jln|lorong|taman|persiaran|lebuh|kampung|kg)\s+[^@\n]+)/i;
  const streetMatch = text.match(streetPattern);
  if (streetMatch) {
    let address = streetMatch[1].trim();
    // Clean trailing punctuation
    address = address.replace(/[.!?]+$/, '').trim();
    if (address.length > 10) {
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
  const validMatches = matches.filter(match => {
    const normalized = match.replace(/\s+/g, '');
    const upper = normalized.toUpperCase();
    // Must be at least 4 characters
    if (upper.length < 4) return false;
    // Exclude common abbreviations
    const excludeList = ['NCD', 'CC', 'RM', 'EMAIL', 'NRIC', 'IC'];
    return !excludeList.includes(upper);
  });

  return validMatches.length > 0 ? validMatches[0].replace(/\s+/g, '').toUpperCase() : null;
}

/**
 * Extract Malaysian NRIC (IC number) from text
 * @param {string} text - The text to search
 * @returns {string|null} - Extracted NRIC or null
 */
export function extractNRIC(text) {
  // Malaysian NRIC format: YYMMDD-PB-###G
  // Common formats: 951018145405, 951018-14-5405, etc.

  // Remove all non-digit characters for easier matching
  const digitsOnly = text.replace(/\D/g, '');

  // Match 12 consecutive digits
  const nricRegex = /\b([0-9]{12})\b/;
  const match = digitsOnly.match(nricRegex);

  if (match) {
    return match[1];
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

  // 4) Conservative fallback: short message with clear alphanumeric ID token
  // Example: "A1234567", "P123456", "TNI-88421"
  const alphaNumToken = text.match(/\b([A-Z]{1,4}[0-9]{4,12}|[0-9]{3,12}[A-Z]{1,4}[0-9]{1,8}|[A-Z0-9]{6,18})\b/i);
  if (alphaNumToken) {
    const token = alphaNumToken[1].toUpperCase();
    const hasLetter = /[A-Z]/.test(token);
    const hasDigit = /\d/.test(token);
    const likelyIdContext = /\b(id|passport|owner|army|police|foreign|company)\b/i.test(lower) || text.trim().split(/\s+/).length <= 4;
    const blocked = ['NCD', 'EMAIL', 'PHONE', 'ROADTAX', 'QUOTE', 'ADDON', 'IC'].includes(token);
    if (!blocked && hasLetter && hasDigit && likelyIdContext) {
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
  const ownerId = extractOwnerIdentification(text);
  return {
    registrationNumber: extractRegistrationNumber(text),
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
