import { createHash } from 'node:crypto';

const DEFAULT_MAX_LENGTH = 12000;

function normalizeWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncate(value, maxLength = DEFAULT_MAX_LENGTH) {
  const text = String(value || '');
  if (!Number.isFinite(maxLength) || maxLength <= 0) return text;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function hashSensitiveText(value = '') {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) return null;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 24);
}

export function maskSensitiveText(value = '', options = {}) {
  const maxLength = Number.isFinite(options.maxLength) ? options.maxLength : DEFAULT_MAX_LENGTH;
  let out = truncate(String(value || ''), maxLength);
  if (!out) return out;

  out = out.replace(/https?:\/\/\S+/gi, '[url]');
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
  out = out.replace(/\b\d{6}-?\d{2}-?\d{4}\b/g, '[owner-id]');
  out = out.replace(/\b0?1\d[\s-]?\d{3,4}[\s-]?\d{4}\b/g, '[phone]');
  out = out.replace(
    /\b(?:no\.?\s*\d+[a-z]?[\s,.-]*)?(?:jalan|jln|lorong|taman|persiaran|lebuh|kampung|kg\.?|seksyen|shah alam|petaling jaya|subang|selangor|kuala lumpur)\b[^.\n;]*/gi,
    '[address]'
  );
  out = out.replace(/\b(?:plate|plat|car|vehicle|kereta)\s*[:#-]?\s*[A-Z]{1,3}\s?\d{1,4}[A-Z]{0,3}\b/gi, (match) => (
    match.replace(/[A-Z]{1,3}\s?\d{1,4}[A-Z]{0,3}\b/i, '[vehicle-plate]')
  ));
  out = out.replace(/\b([A-Z]{1,3})\s?(\d{3,4})([A-Z]{0,2})\b/gi, (match, prefix) => {
    const normalizedPrefix = String(prefix || '').toUpperCase();
    if (['RM', 'NO', 'IC', 'NCD', 'SST', 'OTP', 'PDF'].includes(normalizedPrefix)) return match;
    return '[vehicle-plate]';
  });
  out = out.replace(/\b\d{8,}\b/g, '[number]');

  return out;
}

export function containsMaskedSensitiveText(original = '', masked = '') {
  return String(original || '') !== String(masked || '');
}

export default maskSensitiveText;
