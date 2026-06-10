/**
 * Mock Insurance API Layer
 * This file contains mock implementations of all insurance-related APIs.
 * Later, replace these with real API calls when you get insurer API access.
 */
import { AVAILABLE_INSURERS } from './insurerCatalog.js';

// Mock database of previous policies
const MOCK_POLICIES = {
  "WXY1234": {
    registrationNumber: "WXY1234",
    policyNumber: "POL2024-001234",
    insurer: "Takaful Ikhlas Insurance",
    expiryDate: "2024-12-31",
    ncd: 20,
    vehicleType: "Private Car",
    make: "Perodua",
    model: "Myvi",
    year: 2020,
    cc: 1500,
    sumInsured: 34000,
    lastPremium: 995
  },
  "ABC5678": {
    registrationNumber: "ABC5678",
    policyNumber: "POL2024-005678",
    insurer: "Allianz Malaysia",
    expiryDate: "2024-11-30",
    ncd: 25,
    vehicleType: "Private Car",
    make: "Honda",
    model: "City",
    year: 2019,
    cc: 1500,
    sumInsured: 45000,
    lastPremium: 1200
  }
};

// Mock quotes data with exact fixed prices. Do not randomize.
const MOCK_INSURERS = AVAILABLE_INSURERS.map((insurer) => ({
  id: insurer.id,
  name: insurer.displayName,
  logoUrl: insurer.logoUrl,
  sumInsured: insurer.sumInsured,
  priceBefore: insurer.priceBefore,
  priceAfter: insurer.priceAfter,
  benefits: insurer.features,
}));

/**
 * Look up user's previous insurance policy by registration number
 * @param {string} registrationNumber - Vehicle registration number (e.g., "WXY1234")
 * @returns {Promise<Object|null>} - Policy details or null if not found
 */
export async function lookupPreviousPolicy(registrationNumber) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));

  const regNum = registrationNumber.toUpperCase().replace(/\s/g, '');
  const policy = MOCK_POLICIES[regNum];

  if (!policy) {
    return null;
  }

  return policy;
}

/**
 * Get insurance quotes for a vehicle
 * @param {Object} vehicleInfo - Vehicle details
 * @returns {Promise<Array>} - Array of insurance quotes
 */
export async function getInsuranceQuotes(vehicleInfo) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 800));

  const { ncd = 20 } = vehicleInfo;

  // Return EXACT fixed quotes - no randomization!
  // These must match the system prompt data exactly
  const quotes = MOCK_INSURERS.map((insurer, index) => {
    return {
      id: `${insurer.id}-${Date.now()}-${index}`,
      insurer: insurer.name,
      logoUrl: insurer.logoUrl,
      sumInsured: insurer.sumInsured,
      cover: "Full Cover",
      priceBefore: insurer.priceBefore,
      ncdPercent: ncd,
      ncdAmount: insurer.priceBefore - insurer.priceAfter,
      priceAfter: insurer.priceAfter,
      benefits: insurer.benefits
    };
  }).sort((a, b) => a.priceAfter - b.priceAfter); // Sort by price (Takaful first as cheapest)

  return quotes;
}

/**
 * Validate Malaysian vehicle registration number
 * @param {string} registrationNumber - Registration number to validate
 * @returns {Promise<Object>} - Validation result with vehicle basic info
 */
export async function validateRegistrationNumber(registrationNumber) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 300));

  const regNum = registrationNumber.toUpperCase().replace(/\s/g, '');

  // Basic Malaysian registration number validation
  // Format: ABC1234 or WXY123 or 1ABC234
  const validPattern = /^[A-Z]{1,3}[0-9]{1,4}$|^[0-9]{1}[A-Z]{3}[0-9]{1,4}$/;

  if (!validPattern.test(regNum)) {
    return {
      isValid: false,
      error: "Invalid registration number format"
    };
  }

  // Mock: Check if we have policy data
  const existingPolicy = MOCK_POLICIES[regNum];

  return {
    isValid: true,
    registrationNumber: regNum,
    hasHistory: !!existingPolicy,
    basicInfo: existingPolicy ? {
      make: existingPolicy.make,
      model: existingPolicy.model,
      year: existingPolicy.year
    } : null
  };
}

/**
 * Get available add-ons for a quote
 * @param {string} insurerId - Insurer ID
 * @returns {Promise<Array>} - Array of available add-ons
 */
export async function getAvailableAddOns(insurerId) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200));

  // Mock add-ons (same for all insurers for now)
  return [
    {
      id: "windscreen",
      name: "Windscreen Protection",
      description: "Cover windscreen damage without affecting NCD",
      price: 100
    },
    {
      id: "flood",
      name: "Flood & Natural Disaster (Special Perils)",
      description: "Protection against flood, landslide, and natural disasters",
      price: 50
    },
    {
      id: "legal-liability",
      name: "Legal Liability to Passengers",
      description: "Cover legal liability for passengers in your vehicle",
      price: 30
    },
    {
      id: "all-drivers",
      name: "All Drivers Coverage",
      description: "Allow any licensed driver to drive your vehicle",
      price: 80
    }
  ];
}

/**
 * Get road tax options for a vehicle
 * @param {Object} vehicleInfo - Vehicle details
 * @returns {Promise<Array>} - Array of road tax renewal options
 */
export async function getRoadTaxOptions(vehicleInfo) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200));

  const { cc = 1500 } = vehicleInfo;

  // Calculate road tax based on engine capacity
  let roadTaxAmount = 90;
  if (cc > 1600) roadTaxAmount = 200;
  if (cc > 2000) roadTaxAmount = 380;
  if (cc > 2500) roadTaxAmount = 520;

  return [
    {
      id: "deliver",
      name: "Yes, deliver it to me",
      subtitle: "(3-5 days)",
      price: roadTaxAmount + 10, // +10 for delivery
      displayPrice: `RM ${Number(roadTaxAmount || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + RM 10.00 delivery`
    },
    {
      id: "digital",
      name: "Yes, digital only",
      subtitle: "Instant delivery",
      price: roadTaxAmount,
      displayPrice: `RM ${Number(roadTaxAmount || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    },
    {
      id: "no",
      name: "No, just insurance",
      price: null,
      displayPrice: null
    }
  ];
}

/**
 * Calculate total premium with add-ons and road tax
 * @param {Object} quote - Selected quote
 * @param {Array} addOns - Selected add-ons
 * @param {Object} roadTax - Selected road tax option
 * @returns {Object} - Price breakdown
 */
export function calculateTotalPremium(quote, addOns = [], roadTax = null) {
  const basePrice = quote.priceAfter || 0;
  const addOnsTotal = addOns.reduce((sum, addon) => sum + (addon.price || 0), 0);
  const roadTaxPrice = roadTax?.price || 0;
  const grandTotal = basePrice + addOnsTotal + roadTaxPrice;

  return {
    insurancePremium: basePrice,
    addOnsTotal,
    roadTaxAmount: roadTaxPrice,
    grandTotal,
    breakdown: {
      insurance: basePrice,
      addOns: addOns.map(a => ({ name: a.name, price: a.price })),
      roadTax: roadTax ? { name: roadTax.name, price: roadTaxPrice } : null
    }
  };
}

/**
 * Verify OTP code (mock)
 * @param {string} phone - Phone number
 * @param {string} otpCode - OTP code to verify
 * @returns {Promise<Object>} - Verification result
 */
export async function verifyOTP(phone, otpCode) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // Mock: Accept any 4-digit code
  if (otpCode.length === 4 && /^\d+$/.test(otpCode)) {
    return {
      success: true,
      message: "OTP verified successfully"
    };
  }

  return {
    success: false,
    message: "Invalid OTP code"
  };
}

/**
 * Send OTP to phone or email (mock)
 * @param {string} contact - Phone number or email
 * @returns {Promise<Object>} - Send result
 */
export async function sendOTP(contact) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 300));

  // Mock: Always successful
  return {
    success: true,
    message: `OTP sent to ${contact}`,
    // In production, don't return this!
    mockOTP: "1234"
  };
}
