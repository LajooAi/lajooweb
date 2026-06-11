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

function parseWrittenCoverageAmount(text) {
  const raw = String(text || '').toLowerCase().replace(/[-]+/g, ' ');
  const digitThousand = raw.match(/\b(\d{1,3})\s*(?:k|thousand)\b/i);
  if (digitThousand) return Number(digitThousand[1]) * 1000;

  const numberWords = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  for (const [word, value] of Object.entries(numberWords)) {
    if (new RegExp(`\\b${word}\\s+thousand\\b`, 'i').test(raw)) {
      return value * 1000;
    }
  }

  return null;
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

  const writtenAmount = parseWrittenCoverageAmount(raw);
  if (writtenAmount && (allowBareAmount || /windscreen|coverage|cover|rm/i.test(raw))) {
    addCandidate(writtenAmount);
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

const ADD_ON_TEXT_ALIASES = {
  windscreen: ['windscreen', 'wind screen', 'glass'],
  flood: ['flood', 'special peril', 'special perils', 'peril', 'perils', 'natural disaster', 'natural disasters', 'landslide', 'landslip', 'storm'],
  ehailing: ['e-hailing', 'ehailing', 'e hailing', 'grab', 'ride sharing', 'rideshare', 'ride share'],
  all_drivers: ['all drivers', 'all driver'],
  legal_liability_passengers: ['legal liability to passengers', 'legal liability passenger', 'llp'],
  lltp_negligence: ['lltp', 'negligence'],
  strike_riot: ['strike riot', 'riot', 'civil commotion'],
  betterment_waiver: ['betterment waiver', 'betterment', 'zero betterment'],
  ncd_relief: ['ncd relief', 'current year ncd'],
  body_painting: ['body painting', 'vehicle body painting', 'full vehicle body painting', 'paint'],
  personal_accident: ['personal accident'],
};

const ADD_ON_NUMBER_TO_ID = Object.fromEntries(
  ADD_ON_CATALOG.map((addOn) => [String(addOn.number), addOn.id])
);

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueCatalogOrder(ids = []) {
  const wanted = new Set(ids.filter(Boolean));
  return ADD_ON_CATALOG.map((addOn) => addOn.id).filter((id) => wanted.has(id));
}

function normalizeAddOnCommandSpacing(value) {
  return String(value || '').replace(
    /\b(add|include|remove|delete|drop|exclude|want|need|take|get|choose|select|with)(?=(?:vehicle|windscreen|body|paint|betterment|flood|special|peril|all|driver|legal|liability|lltp|strike|riot|civil|personal|accident|ncd|e-?hailing|ehailing|grab))/gi,
    '$1 '
  );
}

function addOnAliasPattern(id) {
  const aliases = ADD_ON_TEXT_ALIASES[id] || [];
  const parts = aliases.map(escapeRegex);
  return `(?:${parts.join('|')})`;
}

function maskMoneyAmounts(text) {
  return String(text || '')
    .replace(/\brm\s*\d[\d,]*(?:\.\d{1,2})?\b/gi, ' ')
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b/g, ' ');
}

function addOnIdFromTextValue(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw) return null;
  if (ADD_ON_BY_ID[raw]) return raw;
  for (const [id, aliases] of Object.entries(ADD_ON_TEXT_ALIASES)) {
    if (aliases.some((alias) => raw.includes(alias))) return id;
  }
  return null;
}

function addOnIdsMentionedInText(text) {
  const raw = String(text || '').toLowerCase();
  const numberText = maskMoneyAmounts(raw);
  const ids = [];

  for (const id of Object.keys(ADD_ON_TEXT_ALIASES)) {
    if (new RegExp(`\\b${addOnAliasPattern(id)}\\b`, 'i').test(raw)) {
      ids.push(id);
    }
  }

  for (const match of numberText.matchAll(/(?:^|[^\d])(?:option\s*)?([1-9]|1[01])(?=$|[^\d])/g)) {
    const id = ADD_ON_NUMBER_TO_ID[match[1]];
    if (id) ids.push(id);
  }

  return uniqueCatalogOrder(ids);
}

function addOnIdsWithContext(text, contextPattern, options = {}) {
  const raw = String(text || '').toLowerCase();
  const ids = [];
  const { before = true, after = true } = options;

  for (const id of Object.keys(ADD_ON_TEXT_ALIASES)) {
    const alias = addOnAliasPattern(id);
    const contextBefore = new RegExp(`\\b(?:${contextPattern})\\b[^,.;\\n]{0,36}\\b${alias}\\b`, 'i');
    const contextAfter = new RegExp(`\\b${alias}\\b[^,.;\\n]{0,36}\\b(?:${contextPattern})\\b`, 'i');
    if ((before && contextBefore.test(raw)) || (after && contextAfter.test(raw))) {
      ids.push(id);
    }
  }

  if (before) {
    const numberBefore = new RegExp(`\\b(?:${contextPattern})\\b[^,.;\\n]{0,18}(?<![\\d,])(?:option\\s*)?([1-9]|1[01])(?![\\d,])`, 'gi');
    for (const match of raw.matchAll(numberBefore)) {
      const id = ADD_ON_NUMBER_TO_ID[match[1]];
      if (id) ids.push(id);
    }
  }

  if (after) {
    const numberAfter = new RegExp(`(?<![\\d,])(?:option\\s*)?([1-9]|1[01])(?![\\d,])[^,.;\\n]{0,18}\\b(?:${contextPattern})\\b`, 'gi');
    for (const match of raw.matchAll(numberAfter)) {
      const id = ADD_ON_NUMBER_TO_ID[match[1]];
      if (id) ids.push(id);
    }
  }

  return uniqueCatalogOrder(ids);
}

function addOnIdsWithOnlyCue(text) {
  const raw = String(text || '').toLowerCase();
  const ids = [];

  for (const id of Object.keys(ADD_ON_TEXT_ALIASES)) {
    const alias = addOnAliasPattern(id);
    const onlyBefore = new RegExp(`\\b(?:only|just)\\s+(?:the\\s+)?${alias}\\b`, 'i');
    const onlyAfter = new RegExp(`\\b${alias}\\b\\s+(?:only|just)\\b`, 'i');
    if (onlyBefore.test(raw) || onlyAfter.test(raw)) ids.push(id);
  }

  return uniqueCatalogOrder(ids);
}

export function addOnIdsFromState(state) {
  return (state?.selectedAddOns || [])
    .map((item) => addOnIdFromTextValue(item?.id || item?.name))
    .filter(Boolean);
}

export function resolveAddOnChangeFromText(text, state = {}) {
  const raw = normalizeAddOnCommandSpacing(String(text || '').toLowerCase());
  const existingIds = addOnIdsFromState(state);
  const mentionedIds = addOnIdsMentionedInText(raw);
  const removeAll =
    /\b(?:remove|delete|clear|drop|skip)\b[\s\S]{0,24}\b(?:all|everything|add-?ons?|addons?)\b/i.test(raw) ||
    /\b(?:no add-?ons?|no addons|without add-?ons?|without addons)\b/i.test(raw);

  if (removeAll) {
    return {
      addOnIds: [],
      addOns: [],
      coverageAmount: null,
      requiresWindscreenCoverage: false,
    };
  }

  if (mentionedIds.length === 0) return null;

  const removeIds = addOnIdsWithContext(raw, 'remove|delete|drop|take out|exclude|without|no');
  const explicitKeepIds = addOnIdsWithContext(raw, 'keep|retain', { before: true, after: false });
  const onlyCueIds = addOnIdsWithOnlyCue(raw);
  const keepIds = uniqueCatalogOrder([...explicitKeepIds, ...onlyCueIds]);
  const addIds = addOnIdsWithContext(raw, 'add|include|want|need|take|get|choose|select|with');
  const hasOnlyCue = /\b(?:only|just)\b/i.test(raw);
  const hasEditCue = /\b(?:remove|delete|drop|take out|exclude|without|add|include|keep|retain|only|just|change|switch|update)\b/i.test(raw);

  let nextIds = null;
  if (explicitKeepIds.length > 0 && (removeIds.length > 0 || /\b(?:keep|retain)\b/i.test(raw))) {
    nextIds = keepIds;
  } else if (hasOnlyCue) {
    nextIds = uniqueCatalogOrder(mentionedIds.filter((id) => !removeIds.includes(id)));
  } else if (removeIds.length > 0 || addIds.length > 0) {
    const next = new Set(existingIds);
    for (const id of removeIds) next.delete(id);
    for (const id of addIds) next.add(id);
    nextIds = uniqueCatalogOrder([...next]);
  } else if (hasEditCue && existingIds.length === 0) {
    nextIds = mentionedIds;
  }

  if (!nextIds) return null;

  const existingWindscreen = (state?.selectedAddOns || []).find((addOn) => {
    const id = addOnIdFromTextValue(addOn?.id || addOn?.name);
    return id === 'windscreen';
  });
  const coverageAmount =
    extractWindscreenCoverageAmount(raw, { allowBareAmount: nextIds.includes('windscreen') }) ||
    existingWindscreen?.coverageAmount ||
    null;
  const requiresWindscreenCoverage = nextIds.includes('windscreen') && !coverageAmount;

  return {
    addOnIds: nextIds,
    addOns: requiresWindscreenCoverage ? [] : buildAddOnsFromSelection(nextIds, { coverageAmount }),
    coverageAmount,
    requiresWindscreenCoverage,
  };
}
