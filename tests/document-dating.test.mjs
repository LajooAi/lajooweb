import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractDocumentDating,
} from '../src/server/knowledge/documentDating.js';

function isoDate(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

test('extractDocumentDating captures explicit valid-as-at source date', () => {
  const result = extractDocumentDating({
    text: 'This Product Disclosure Sheet is valid as at 01/01/2026. Premium may vary.',
  });

  assert.equal(isoDate(result.effectiveFrom), '2026-01-01');
  assert.equal(result.effectiveTo, null);
  assert.equal(result.versionLabel, null);
});

test('extractDocumentDating captures explicit PDS date', () => {
  const result = extractDocumentDating({
    text: 'PRODUCT DISCLOSURE SHEET Date: 15/12/2025 What is covered?',
  });

  assert.equal(isoDate(result.effectiveFrom), '2025-12-15');
});

test('extractDocumentDating captures explicit effective named date', () => {
  const result = extractDocumentDating({
    text: 'F-AD-S80-V5 (Effective 1 October 2025 / Berkuat kuasa 1 Oktober 2025)',
  });

  assert.equal(isoDate(result.effectiveFrom), '2025-10-01');
  assert.equal(result.effectiveTo, null);
});

test('extractDocumentDating captures BM effective named date', () => {
  const result = extractDocumentDating({
    text: 'Dokumen ini berkuat kuasa mulai 1 Oktober 2025 untuk produk motor.',
  });

  assert.equal(isoDate(result.effectiveFrom), '2025-10-01');
});

test('extractDocumentDating captures named valid-from/to ranges', () => {
  const result = extractDocumentDating({
    text: 'This wording is valid from 1 June 2026 to 31 May 2027 for the campaign.',
  });

  assert.equal(isoDate(result.effectiveFrom), '2026-06-01');
  assert.equal(isoDate(result.effectiveTo), '2027-05-31');
});

test('extractDocumentDating does not treat generic registration dates as document validity', () => {
  const result = extractDocumentDating({
    text: 'Date of Original Registration and date of accident must be shown in the form.',
  });

  assert.equal(result.effectiveFrom, null);
  assert.equal(result.effectiveTo, null);
});

test('extractDocumentDating stores version label without inventing effective date', () => {
  const result = extractDocumentDating({
    text: 'Version: PDS/12/2025 Know your obligations before renewal.',
  });

  assert.equal(result.versionLabel, 'PDS/12/2025');
  assert.equal(result.effectiveFrom, null);
});

test('extractDocumentDating captures uppercase revision code only', () => {
  const result = extractDocumentDating({
    text: 'Comprehensive Motor Insurance AZ10/24 product leaflet.',
  });

  assert.equal(result.versionLabel, 'AZ10/24');
  assert.equal(result.effectiveFrom, null);
});
