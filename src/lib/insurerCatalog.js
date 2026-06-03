export const AVAILABLE_INSURERS = [
  {
    key: 'takaful',
    code: 'TAKAFUL',
    id: 'takaful-ikhlas',
    displayName: 'Takaful Ikhlas Insurance',
    shortName: 'Takaful',
    summaryName: 'Takaful Ikhlas Insurance Bhd',
    logoUrl: '/partners/takaful.svg',
    type: 'takaful',
    priceBefore: 995,
    priceAfter: 796,
    ncdPercent: 20,
    sumInsured: 34000,
    aliases: ['takaful', 'ikhlas', 'takaful ikhlas', 'takful', 'takaflu'],
    features: [
      'Shariah-compliant (Islamic insurance)',
      'Fast claim payout',
      'Great value for money',
    ],
  },
  {
    key: 'etiqa',
    code: 'ETIQA',
    id: 'etiqa',
    displayName: 'Etiqa Insurance',
    shortName: 'Etiqa',
    summaryName: 'Etiqa Insurance',
    logoUrl: '/partners/etiqa.svg',
    type: 'conventional',
    priceBefore: 1090,
    priceAfter: 872,
    ncdPercent: 20,
    sumInsured: 35000,
    aliases: ['etiqa', 'etika', 'etiqqa', 'etiaq', 'eitqa'],
    features: [
      'Free towing service up to 200km',
      'Good customer service',
      'Well-established local insurer',
    ],
  },
  {
    key: 'allianz',
    code: 'ALLIANZ',
    id: 'allianz',
    displayName: 'Allianz Insurance',
    shortName: 'Allianz',
    summaryName: 'Allianz Insurance',
    logoUrl: '/partners/allianz.svg',
    type: 'conventional',
    priceBefore: 1150,
    priceAfter: 920,
    ncdPercent: 20,
    sumInsured: 36000,
    aliases: ['allianz', 'alianz'],
    features: [
      'Premium service quality',
      'Excellent claims network',
      'Best customer service ratings',
    ],
  },
  {
    key: 'tokio',
    code: 'TOKIO',
    id: 'tokio-marine',
    displayName: 'Tokio Marine Insurance',
    shortName: 'Tokio Marine',
    summaryName: 'Tokio Marine Insurance',
    logoUrl: '/partners/tokio-marine.svg',
    type: 'conventional',
    priceBefore: 1000,
    priceAfter: 800,
    ncdPercent: 20,
    sumInsured: 35000,
    aliases: ['tokio', 'tokio marine', 'toki', 'toki marine', 'okio', 'okio marine'],
    features: [
      'Established international insurer',
      'Competitive premium',
      'Reliable claims support',
    ],
  },
  {
    key: 'lonpac',
    code: 'LONPAC',
    id: 'lonpac',
    displayName: 'Lonpac Insurance',
    shortName: 'Lonpac',
    summaryName: 'Lonpac Insurance',
    logoUrl: '/partners/lonpac.svg',
    type: 'conventional',
    priceBefore: 1200,
    priceAfter: 960,
    ncdPercent: 20,
    sumInsured: 37000,
    aliases: ['lonpac', 'lonpak'],
    features: [
      'Strong sum insured value',
      'Straightforward comprehensive cover',
      'Local market presence',
    ],
  },
  {
    key: 'msig',
    code: 'MSIG',
    id: 'msig',
    displayName: 'MSIG Insurance',
    shortName: 'MSIG',
    summaryName: 'MSIG Insurance',
    logoUrl: '/partners/msig.svg',
    type: 'conventional',
    priceBefore: 1250,
    priceAfter: 1000,
    ncdPercent: 20,
    sumInsured: 37000,
    aliases: ['msig'],
    features: [
      'International insurer network',
      'Higher sum insured',
      'Reliable service option',
    ],
  },
  {
    key: 'generali',
    code: 'GENERALI',
    id: 'generali',
    displayName: 'Generali Insurance',
    shortName: 'Generali',
    summaryName: 'Generali Insurance',
    logoUrl: '/partners/generali.svg',
    type: 'conventional',
    priceBefore: 1350,
    priceAfter: 1080,
    ncdPercent: 20,
    sumInsured: 40000,
    aliases: ['generali'],
    features: [
      'Highest sum insured in this quote set',
      'Comprehensive coverage option',
      'International insurer brand',
    ],
  },
];

export const AVAILABLE_INSURER_KEYS = AVAILABLE_INSURERS.map((insurer) => insurer.key);
export const AVAILABLE_INSURER_KEY_SET = new Set(AVAILABLE_INSURER_KEYS);
export const INSURERS_BY_KEY = Object.fromEntries(AVAILABLE_INSURERS.map((insurer) => [insurer.key, insurer]));
export const INSURERS_BY_CODE = Object.fromEntries(AVAILABLE_INSURERS.map((insurer) => [insurer.code, insurer]));

export const AVAILABLE_INSURER_CHOICE_TEXT = AVAILABLE_INSURERS
  .map((insurer) => `**${insurer.shortName}**`)
  .join(', ')
  .replace(/, ([^,]*)$/, ', or $1');

export const AVAILABLE_INSURER_NAMES_TEXT = AVAILABLE_INSURERS
  .map((insurer) => insurer.shortName)
  .join(', ')
  .replace(/, ([^,]*)$/, ', and $1');

export const AVAILABLE_INSURER_OPTIONS_WITH_PRICES = AVAILABLE_INSURERS.map(
  (insurer) => `${insurer.displayName} (RM ${insurer.priceAfter.toLocaleString()})`
);

export const UNAVAILABLE_INSURER_REGEX = /\b(zurich|axa|sompo|bsompo|rhb|liberty|amassurance|berjaya)\b/i;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasPattern(alias) {
  return escapeRegex(alias.trim()).replace(/\s+/g, '\\s*');
}

function textContainsAlias(text, alias) {
  if (!text || !alias) return false;
  const pattern = new RegExp(`(^|[^a-z0-9])${aliasPattern(alias)}(?=$|[^a-z0-9])`, 'i');
  return pattern.test(text);
}

export function getInsurerByKey(key) {
  return INSURERS_BY_KEY[String(key || '').toLowerCase()] || null;
}

export function getInsurerByCode(code) {
  return INSURERS_BY_CODE[String(code || '').toUpperCase()] || null;
}

export function isKnownInsurerKey(key) {
  return AVAILABLE_INSURER_KEY_SET.has(String(key || '').toLowerCase());
}

export function getInsurerKeysFromText(text) {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return [];

  const hits = new Set();
  for (const insurer of AVAILABLE_INSURERS) {
    if (
      textContainsAlias(normalized, insurer.id) ||
      textContainsAlias(normalized, insurer.displayName) ||
      textContainsAlias(normalized, insurer.shortName) ||
      insurer.aliases.some((alias) => textContainsAlias(normalized, alias))
    ) {
      hits.add(insurer.key);
    }
  }

  return [...hits];
}

export function findInsurerKeyByText(text) {
  const keys = getInsurerKeysFromText(text);
  return keys.length === 1 ? keys[0] : null;
}

export function textMatchesInsurerKey(text, key) {
  const normalizedKey = String(key || '').toLowerCase();
  return getInsurerKeysFromText(text).includes(normalizedKey);
}

export function getInsurerByText(text) {
  return getInsurerByKey(findInsurerKeyByText(text));
}

export function getInsurerQuoteIdPrefix(key) {
  const insurer = getInsurerByKey(key);
  return insurer?.code ? insurer.code.slice(0, 3) : null;
}
