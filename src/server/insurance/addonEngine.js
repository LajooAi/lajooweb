export const ADDONS_CLOSE_QUESTION = 'Based on your situation, which would you like? You can type 1, 2, 3, 8, or a combo like 1 and 8. Or reply skip.';
export const WINDSCREEN_PREMIUM_RATE = 0.15;
export const DEFAULT_WINDSCREEN_COVERAGE = 2000;

export const ADD_ON_CATALOG = [
  {
    id: 'windscreen',
    number: 1,
    name: 'Windscreen',
    price: null,
    hasCoverageInput: true,
    defaultCoverage: DEFAULT_WINDSCREEN_COVERAGE,
    recommended: true,
    info: 'Covers windscreen, window, and glass damage up to your selected coverage amount.',
  },
  {
    id: 'flood',
    number: 2,
    name: 'Special Perils (Flood & others)',
    summaryName: 'Inclusion of Special Perils',
    price: 150,
    recommended: true,
    info: 'Covers flood and selected natural disaster damage, subject to insurer terms.',
  },
  {
    id: 'ehailing',
    number: 3,
    name: 'E-hailing (Grab & others)',
    price: 2000,
    info: 'Required if the vehicle is used for e-hailing or ride-sharing work.',
  },
  {
    id: 'all_drivers',
    number: 4,
    name: 'All Drivers',
    price: 30,
    info: 'Lets additional drivers be covered, subject to policy wording.',
  },
  {
    id: 'legal_liability_passengers',
    number: 5,
    name: 'Legal Liability To Passengers',
    price: 20,
    info: 'Covers selected legal liability to passengers, subject to policy wording.',
  },
  {
    id: 'lltp_negligence',
    number: 6,
    name: 'LLTP for Negligence Acts',
    price: 7,
    info: 'Additional passenger liability protection for negligence-related situations.',
  },
  {
    id: 'strike_riot',
    number: 7,
    name: 'Strike riot and civil commotion',
    price: 450,
    info: 'Covers selected damage caused by strike, riot, or civil commotion events.',
  },
  {
    id: 'betterment_waiver',
    number: 8,
    name: 'Betterment waiver',
    price: 350,
    info: 'Helps reduce unexpected betterment charges when new parts replace old parts.',
  },
  {
    id: 'ncd_relief',
    number: 9,
    name: 'Current year NCD relief',
    price: 250,
    info: 'Helps protect the current year NCD benefit, subject to insurer terms.',
  },
  {
    id: 'body_painting',
    number: 10,
    name: 'Full vehicle body painting',
    price: 180,
    info: 'Adds selected body painting protection, subject to insurer acceptance.',
  },
  {
    id: 'personal_accident',
    number: 11,
    name: 'Personal accident for all',
    price: 50,
    info: 'Adds selected personal accident protection for covered persons.',
  },
];

export const ADD_ON_BY_ID = Object.fromEntries(ADD_ON_CATALOG.map((addOn) => [addOn.id, addOn]));

function roundCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}
export function calculateWindscreenPremium(coverageAmount) {
  return roundCurrency(Number(coverageAmount || 0) * WINDSCREEN_PREMIUM_RATE);
}

export function extractWindscreenCoverageAmount(text, { allowBareAmount = false } = {}) {
  const raw = String(text || '');
  const candidates = [];

  const addCandidate = (value) => {
    const numeric = Number(String(value || '').replace(/,/g, ''));
    if (Number.isFinite(numeric) && numeric >= 100 && numeric <= 100000) {
      candidates.push(numeric);
    }
  };

  const contextualPatterns = [
    /windscreen[\s\S]{0,40}?(?:rm\s*)?(\d[\d,]*(?:\.\d{1,2})?)/gi,
    /(?:coverage|cover)[\s\S]{0,20}?(?:rm\s*)?(\d[\d,]*(?:\.\d{1,2})?)/gi,
    /(?:rm\s*)(\d[\d,]*(?:\.\d{1,2})?)[\s\S]{0,30}?(?:coverage|cover|windscreen)/gi,
  ];

  for (const pattern of contextualPatterns) {
    for (const match of raw.matchAll(pattern)) {
      addCandidate(match[1]);
    }
  }

  if (allowBareAmount) {
    for (const match of raw.matchAll(/(?:rm\s*)?(\d{3,6}(?:,\d{3})*(?:\.\d{1,2})?|\d{3,6}(?:\.\d{1,2})?)/gi)) {
      addCandidate(match[1]);
    }
  }

  return candidates.length > 0 ? candidates[0] : null;
}

export function getAddOnCatalogItem(id) {
  return ADD_ON_BY_ID[id] || null;
}

export function buildAddOnObject(addOnId, options = {}) {
  const item = getAddOnCatalogItem(addOnId);
  if (!item) return null;

  if (item.hasCoverageInput) {
    const coverageAmount = Number(options.coverageAmount || item.defaultCoverage || DEFAULT_WINDSCREEN_COVERAGE);
    return {
      id: item.id,
      name: item.name,
      coverageAmount,
      price: calculateWindscreenPremium(coverageAmount),
    };
  }

  return {
    id: item.id,
    name: item.summaryName || item.name,
    price: Number(item.price || 0),
  };
}

export function buildAddOnsFromSelection(addOnIds = [], options = {}) {
  const uniqueIds = [...new Set(addOnIds)].filter(Boolean);
  return uniqueIds
    .map((id) => buildAddOnObject(id, options))
    .filter(Boolean);
}

export function addOnIdsFromState(state) {
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
