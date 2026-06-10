import {
  AVAILABLE_INSURERS,
  getInsurerByText,
} from './insurerCatalog.js';

/**
 * Insurance Data Layer - Single Source of Truth
 *
 * This module centralizes ALL insurance product data.
 * When real insurer APIs are integrated, this file becomes the adapter layer.
 *
 * Benefits:
 * - One place to update prices/products
 * - Frontend and backend use same data
 * - Easy to swap mock data for real API calls
 * - AI prompts reference this data, not hardcoded values
 */

// ============================================================================
// INSURERS - The companies we work with
// ============================================================================

function insurerExportKey(insurer) {
  if (insurer.key === 'takaful') return 'TAKAFUL_IKHLAS';
  if (insurer.key === 'tokio') return 'TOKIO_MARINE';
  return insurer.code;
}

export const INSURERS = Object.fromEntries(
  AVAILABLE_INSURERS.map((insurer) => [
    insurerExportKey(insurer),
    {
      id: insurer.id,
      name: insurer.summaryName,
      displayName: insurer.displayName,
      logoUrl: insurer.logoUrl,
      type: insurer.type,
      features: insurer.features,
      rating: 4.5,
    },
  ])
);

// ============================================================================
// QUOTES - Insurance pricing (mock data, replace with API later)
// ============================================================================

/**
 * Get insurance quotes for a vehicle
 * @param {Object} params - Vehicle parameters
 * @returns {Array} - Sorted quotes (cheapest first)
 */
export function getQuotes({ vehicleValue = 51000, ncdPercent = 20, engineCC = 1496 } = {}) {
  // In production, this would call real insurer APIs
  // For now, return structured mock data

  const quoteMeta = {
    takaful: {
      benefit: 'CHEAPEST option',
      recommendation: 'Best for budget-conscious drivers seeking Shariah-compliant coverage',
      tag: 'CHEAPEST',
    },
    tokio: {
      benefit: 'Very close to cheapest',
      recommendation: 'Best for drivers who want a low premium from an international insurer',
      tag: 'VALUE',
    },
    etiqa: {
      benefit: 'Balanced price and coverage',
      recommendation: 'Best for drivers who travel frequently and want roadside assistance',
      tag: 'BALANCED',
    },
    allianz: {
      benefit: 'Premium service option',
      recommendation: 'Best for drivers who prioritize service confidence',
      tag: 'PREMIUM',
    },
    lonpac: {
      benefit: 'Strong value for RM 37,000.00 sum insured',
      recommendation: 'Best for drivers who want higher sum insured while keeping premium below RM 1,000.00',
      tag: 'HIGHER COVER',
    },
    msig: {
      benefit: 'Higher sum insured option',
      recommendation: 'Best for drivers who want RM 37,000.00 coverage from an international insurer',
      tag: 'HIGHER COVER',
    },
    generali: {
      benefit: 'Highest sum insured (RM 40,000.00)',
      recommendation: 'Best for drivers who prioritize maximum sum insured',
      tag: 'MAX COVER',
    },
  };

  const quotes = AVAILABLE_INSURERS.map((catalogInsurer) => {
    const insurer = INSURERS[insurerExportKey(catalogInsurer)];
    const meta = quoteMeta[catalogInsurer.key] || {};

    return {
      id: `${insurer.id}-${Date.now()}`,
      insurer,
      sumInsured: catalogInsurer.sumInsured,
      coverType: 'Comprehensive',
      pricing: {
        basePremium: catalogInsurer.priceBefore,
        ncdPercent: ncdPercent,
        ncdDiscount: Number((catalogInsurer.priceBefore - catalogInsurer.priceAfter).toFixed(2)),
        finalPremium: catalogInsurer.priceAfter,
      },
      benefits: [
        meta.benefit,
        ...insurer.features,
      ].filter(Boolean),
      recommendation: meta.recommendation || 'Available comprehensive motor insurance option',
      tag: meta.tag || 'OPTION',
    };
  });

  // Sort by price (cheapest first)
  return quotes.sort((a, b) => a.pricing.finalPremium - b.pricing.finalPremium);
}

/**
 * Find a quote by insurer name
 */
export function findQuoteByInsurer(insurerName) {
  const quotes = getQuotes();
  const insurer = getInsurerByText(insurerName);
  if (insurer) return quotes.find(q => q.insurer.id === insurer.id);

  return null;
}

// ============================================================================
// ADD-ONS - Optional coverage enhancements
// ============================================================================

export const ADDONS = {
  WINDSCREEN: {
    id: 'windscreen',
    name: 'Windscreen Protection',
    shortName: 'Windscreen',
    description: 'Cover windscreen damage without affecting NCD',
    price: 100,
    benefits: [
      'Covers windscreen cracks and chips',
      'No effect on your NCD if claimed',
      'Common issue on Malaysian highways',
    ],
    recommendedFor: ['daily commuters', 'highway users'],
  },
  FLOOD: {
    id: 'flood',
    name: 'Flood & Natural Disaster (Special Perils)',
    shortName: 'Special Perils',
    description: 'Protection against flood, landslide, and natural disasters',
    price: 50,
    benefits: [
      'Covers flood damage to vehicle',
      'Includes landslide and storm damage',
      'Essential during monsoon season (Nov-Feb)',
    ],
    recommendedFor: ['Selangor', 'Penang', 'Kelantan', 'Johor', 'flood-prone areas'],
  },
  EHAILING: {
    id: 'ehailing',
    name: 'E-hailing Cover',
    shortName: 'E-hailing',
    description: 'Required coverage for Grab, inDrive, and other ride-sharing drivers',
    price: 500,
    benefits: [
      'Legal requirement for e-hailing drivers',
      'Covers passengers during commercial trips',
      'Protects your NCD for work-related claims',
    ],
    recommendedFor: ['Grab drivers', 'inDrive drivers', 'ride-sharing drivers'],
  },
};

/**
 * Get all available add-ons
 */
export function getAddOns() {
  return Object.values(ADDONS);
}

/**
 * Get add-on by ID
 */
export function getAddOnById(id) {
  return Object.values(ADDONS).find(addon => addon.id === id);
}

/**
 * Calculate total add-ons price
 */
export function calculateAddOnsTotal(selectedIds) {
  return selectedIds.reduce((total, id) => {
    const addon = getAddOnById(id);
    return total + (addon?.price || 0);
  }, 0);
}

// ============================================================================
// ROAD TAX - Renewal options
// ============================================================================

export const ROAD_TAX_OPTIONS = {
  '12MONTH_DIGITAL': {
    id: '12month-digital',
    name: '12-Month (Digital Only)',
    duration: 12,
    delivery: 'digital',
    features: ['Digital road tax MYJPJ (Instant)'],
    basePrice: 90,
    deliveryFee: 0,
    totalPrice: 90,
  },
  NONE: {
    id: 'none',
    name: 'No Road Tax Renewal',
    duration: null,
    delivery: null,
    features: ['Insurance renewal only'],
    basePrice: 0,
    deliveryFee: 0,
    totalPrice: 0,
  },
};

/**
 * Get all road tax options
 */
export function getRoadTaxOptions() {
  return Object.values(ROAD_TAX_OPTIONS);
}

/**
 * Get road tax option by ID
 */
export function getRoadTaxById(id) {
  return Object.values(ROAD_TAX_OPTIONS).find(option => option.id === id);
}

// ============================================================================
// PAYMENT METHODS
// ============================================================================

export const PAYMENT_METHODS = {
  CARD: {
    id: 'card',
    name: 'Credit/Debit Card',
    icon: '💳',
    processingTime: 'Instant',
    fee: 0,
  },
  FPX: {
    id: 'fpx',
    name: 'Online Banking (FPX)',
    icon: '🏦',
    processingTime: 'Instant',
    fee: 0,
  },
  EWALLET: {
    id: 'ewallet',
    name: 'E-Wallet',
    icon: '📱',
    description: 'Touch n Go, GrabPay, Boost',
    processingTime: 'Instant',
    fee: 0,
  },
  BNPL: {
    id: 'bnpl',
    name: 'Pay Later (0% Instalment)',
    icon: '📅',
    description: 'Atome, ShopBack PayLater',
    processingTime: 'Instant approval',
    fee: 0,
  },
};

/**
 * Get all payment methods
 */
export function getPaymentMethods() {
  return Object.values(PAYMENT_METHODS);
}

// ============================================================================
// VEHICLE PROFILE - Mock vehicle data (replace with JPJ API later)
// ============================================================================

/**
 * Get vehicle profile from plate + NRIC
 * In production, this would call JPJ/insurer APIs
 */
export function getVehicleProfile(plateNumber, nricNumber) {
  const normalizedPlate = String(plateNumber || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const ownerId = String(nricNumber || '').replace(/\s+/g, '');
  const normalizedOwnerId = ownerId.replace(/-/g, '').toUpperCase();
  const allowedTestRecord = {
    plate: 'JRT9289',
    ownerId: '951018145405',
  };

  // Strict test-mode lookup: only one known plate + owner ID pair is available.
  // Any other identifiers must return "not found" so flow behaves like real retrieval.
  if (normalizedPlate !== allowedTestRecord.plate || normalizedOwnerId !== allowedTestRecord.ownerId) {
    return null;
  }

  const isNRIC = /^\d{12}$/.test(ownerId);
  const ownerNRICFormatted = isNRIC
    ? `${ownerId.slice(0, 6)}-${ownerId.slice(6, 8)}-${ownerId.slice(8)}`
    : ownerId;

  // Mock data - in production, this comes from JPJ API
  return {
    plateNumber: allowedTestRecord.plate,
    ownerNRIC: ownerId,
    ownerNRICFormatted,
    make: 'Perodua',
    model: 'Myvi 1.5L',
    year: 2019,
    engineCC: 1496,
    marketValueMin: 51000,
    marketValueMax: 68000,
    coverType: 'Comprehensive (1st Party)',
    currentInsurer: 'Takaful Ikhlas',
    ncdPercent: 20,
    eHailing: false,
    address: {
      line1: 'No. 12, Jalan Setia Prima',
      line2: 'Setia Alam',
      postcode: '47000',
      city: 'Shah Alam',
      state: 'Selangor',
    },
  };
}

// ============================================================================
// PRICE CALCULATION
// ============================================================================

/**
 * Calculate total order amount
 */
export function calculateTotal({ quote, addOnIds = [], roadTaxId = 'none' }) {
  const insurancePremium = quote?.pricing?.finalPremium || 0;
  const addOnsTotal = calculateAddOnsTotal(addOnIds);
  const roadTax = getRoadTaxById(roadTaxId);
  const roadTaxPrice = roadTax?.totalPrice || 0;

  return {
    insurance: insurancePremium,
    addOns: addOnsTotal,
    roadTax: roadTaxPrice,
    total: insurancePremium + addOnsTotal + roadTaxPrice,
    breakdown: {
      insurancePremium,
      addOnItems: addOnIds.map(id => getAddOnById(id)).filter(Boolean),
      roadTaxOption: roadTax,
    },
  };
}

// ============================================================================
// AI PROMPT DATA - Formatted data for AI system prompts
// ============================================================================

/**
 * Get formatted quote data for AI prompts
 */
export function getQuotesForAI() {
  const quotes = getQuotes();
  return quotes.map(q => ({
    insurer: q.insurer.displayName,
    price: `RM${q.pricing.finalPremium}`,
    sumInsured: `RM${q.sumInsured.toLocaleString()}`,
    tag: q.tag,
    key_benefit: q.benefits[0],
  }));
}

/**
 * Get formatted add-ons data for AI prompts
 */
export function getAddOnsForAI() {
  return getAddOns().map(addon => ({
    name: addon.name,
    price: `RM${addon.price}`,
    description: addon.description,
  }));
}

/**
 * Get formatted road tax data for AI prompts
 */
export function getRoadTaxForAI() {
  return getRoadTaxOptions().map(opt => ({
    name: opt.name,
    price: opt.totalPrice > 0 ? `RM${opt.totalPrice}` : 'Free',
    delivery: opt.delivery || 'N/A',
  }));
}

export default {
  INSURERS,
  ADDONS,
  ROAD_TAX_OPTIONS,
  PAYMENT_METHODS,
  getQuotes,
  findQuoteByInsurer,
  getAddOns,
  getAddOnById,
  calculateAddOnsTotal,
  getRoadTaxOptions,
  getRoadTaxById,
  getPaymentMethods,
  getVehicleProfile,
  calculateTotal,
  getQuotesForAI,
  getAddOnsForAI,
  getRoadTaxForAI,
};
