const MONTHS = new Map([
  ['jan', 0],
  ['january', 0],
  ['feb', 1],
  ['february', 1],
  ['mar', 2],
  ['march', 2],
  ['mac', 2],
  ['apr', 3],
  ['april', 3],
  ['may', 4],
  ['mei', 4],
  ['jun', 5],
  ['june', 5],
  ['jul', 6],
  ['july', 6],
  ['julai', 6],
  ['aug', 7],
  ['august', 7],
  ['ogos', 7],
  ['sep', 8],
  ['sept', 8],
  ['september', 8],
  ['oct', 9],
  ['october', 9],
  ['okt', 9],
  ['oktober', 9],
  ['nov', 10],
  ['november', 10],
  ['dec', 11],
  ['december', 11],
  ['dis', 11],
  ['disember', 11],
]);

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year)) return null;
  if (year >= 0 && year < 100) return 2000 + year;
  return year;
}

function buildUtcDate(year, monthIndex, day) {
  const fullYear = normalizeYear(year);
  const month = Number(monthIndex);
  const date = Number(day);
  if (!fullYear || !Number.isInteger(month) || !Number.isInteger(date)) return null;
  if (fullYear < 2000 || fullYear > 2100) return null;
  if (month < 0 || month > 11 || date < 1 || date > 31) return null;

  const candidate = new Date(Date.UTC(fullYear, month, date));
  if (
    candidate.getUTCFullYear() !== fullYear ||
    candidate.getUTCMonth() !== month ||
    candidate.getUTCDate() !== date
  ) {
    return null;
  }

  return candidate;
}

function parseNumericDate(day, month, year) {
  return buildUtcDate(year, Number(month) - 1, Number(day));
}

function parseNamedDate(day, monthName, year) {
  const month = MONTHS.get(String(monthName || '').toLowerCase());
  if (month === undefined) return null;
  return buildUtcDate(year, month, day);
}

function parseDateMatch(match) {
  if (!match) return null;
  if (match.groups?.day && match.groups?.month && match.groups?.year) {
    return parseNumericDate(match.groups.day, match.groups.month, match.groups.year);
  }
  if (match.groups?.namedDay && match.groups?.namedMonth && match.groups?.namedYear) {
    return parseNamedDate(match.groups.namedDay, match.groups.namedMonth, match.groups.namedYear);
  }
  return null;
}

const NUMERIC_DATE = String.raw`(?<day>\d{1,2})[\/.-](?<month>\d{1,2})[\/.-](?<year>\d{2,4})`;
const MONTH_NAME_TEXT = String.raw`Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Mac|Apr(?:il)?|May|Mei|Jun(?:e)?|Jul(?:y)?|Julai|Aug(?:ust)?|Ogos|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Okt(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|Dis(?:ember)?`;
const NAMED_DATE = String.raw`(?<namedDay>\d{1,2})\s+(?<namedMonth>${MONTH_NAME_TEXT})\s+(?<namedYear>\d{4})`;
const NUMERIC_DATE_TEXT = String.raw`\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}`;
const NAMED_DATE_TEXT = String.raw`\d{1,2}\s+(?:${MONTH_NAME_TEXT})\s+\d{4}`;
const DATE_TEXT = String.raw`(?:${NUMERIC_DATE_TEXT}|${NAMED_DATE_TEXT})`;

function parseDateString(value) {
  const text = String(value || '').trim();
  return parseDateMatch(new RegExp(`^${NUMERIC_DATE}$`, 'i').exec(text)) ||
    parseDateMatch(new RegExp(`^${NAMED_DATE}$`, 'i').exec(text));
}

function firstDateAfterLabel(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const date = parseDateMatch(match);
    if (date) return date;
  }
  return null;
}

function extractEffectiveRange(text) {
  const rangePatterns = [
    new RegExp(String.raw`\b(?:valid|effective|berkuat\s+kuasa)\s+(?:from|mulai|period)?\s*(${DATE_TEXT})\s+(?:to|until|hingga|-|–)\s+(${DATE_TEXT})`, 'i'),
  ];

  for (const pattern of rangePatterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const effectiveFrom = parseDateString(match[1]);
    const effectiveTo = parseDateString(match[2]);
    if (effectiveFrom && effectiveTo) {
      return {
        effectiveFrom,
        effectiveTo,
      };
    }
  }

  return null;
}

function extractExplicitEffectiveDate(text) {
  return firstDateAfterLabel(text, [
    new RegExp(String.raw`\bvalid\s+as\s+at\s+${NUMERIC_DATE}`, 'i'),
    new RegExp(String.raw`\bvalid\s+as\s+at\s+${NAMED_DATE}`, 'i'),
    new RegExp(String.raw`\beffective\s+(?:date\s*:?\s*|from\s+|as\s+of\s+)?${NUMERIC_DATE}`, 'i'),
    new RegExp(String.raw`\beffective\s+(?:date\s*:?\s*|from\s+|as\s+of\s+)?${NAMED_DATE}`, 'i'),
    new RegExp(String.raw`\bberkuat\s+kuasa\s+(?:mulai\s+)?${NUMERIC_DATE}`, 'i'),
    new RegExp(String.raw`\bberkuat\s+kuasa\s+(?:mulai\s+)?${NAMED_DATE}`, 'i'),
    new RegExp(String.raw`\b(?:pds\s+)?date\s*:\s*${NUMERIC_DATE}`, 'i'),
    new RegExp(String.raw`\b(?:pds\s+)?date\s*:\s*${NAMED_DATE}`, 'i'),
    new RegExp(String.raw`\btarikh\s*:\s*${NUMERIC_DATE}`, 'i'),
    new RegExp(String.raw`\btarikh\s*:\s*${NAMED_DATE}`, 'i'),
  ]);
}

function extractVersionLabel({ text, fileName, relativePath } = {}) {
  const source = normalizeText(`${relativePath || ''} ${fileName || ''} ${text || ''}`);
  const explicitVersion = /\bVersion\s*:\s*([A-Z]{2,12}\/\d{1,2}\/\d{4})\b/i.exec(source);
  if (explicitVersion?.[1]) return explicitVersion[1].replace(/\s+/g, '');

  const revisionCode = /\b([A-Z]{1,4}\s?\d{2}\/\d{2})\b/.exec(source);
  if (revisionCode?.[1]) return revisionCode[1].replace(/\s+/g, '');

  return null;
}

export function extractDocumentDating({ text = '', fileName = '', relativePath = '' } = {}) {
  const scanText = normalizeText(text).slice(0, 8000);
  const range = extractEffectiveRange(scanText);
  const effectiveFrom = range?.effectiveFrom || extractExplicitEffectiveDate(scanText);
  const effectiveTo = range?.effectiveTo || null;
  const versionLabel = extractVersionLabel({ text: scanText, fileName, relativePath });

  return {
    effectiveFrom,
    effectiveTo,
    versionLabel,
  };
}

export default extractDocumentDating;
