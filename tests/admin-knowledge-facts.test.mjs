import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFactReviewQueueClause,
  buildFactValidityClause,
  sanitizeDocumentUpdateInput,
  sanitizeFactUpdateInput,
} from '../src/server/admin/knowledgeFactsAdmin.js';

test('admin fact sanitizer keeps approved fields and normalizes tags', () => {
  const result = sanitizeFactUpdateInput({
    title: 'Betterment waiver wording found',
    value: 'Allianz has imported private-car betterment waiver wording in the source document.',
    advisorUse: 'Use this for older-car users, but confirm live quote eligibility.',
    category: 'betterment',
    tags: 'betterment, waiver betterment, older_car, older_car',
    confidence: 'HIGH',
    status: 'VERIFIED',
    validFrom: '2026-06-01',
    validTo: '',
  });

  assert.equal(result.title, 'Betterment waiver wording found');
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.confidence, 'high');
  assert.deepEqual(result.tags, ['betterment', 'waiver_betterment', 'older_car']);
  assert.ok(result.validFrom instanceof Date);
  assert.equal(result.validTo, null);
});

test('admin fact sanitizer rejects invalid statuses', () => {
  assert.throws(() => sanitizeFactUpdateInput({
    status: 'PUBLIC',
  }), /Invalid fact status/);
});

test('admin fact sanitizer rejects unsafe tiny statements', () => {
  assert.throws(() => sanitizeFactUpdateInput({
    value: 'Too short',
  }), /too short/);
});

test('admin fact sanitizer rejects invalid dates and impossible ranges', () => {
  assert.throws(() => sanitizeFactUpdateInput({
    validFrom: 'not-a-date',
  }), /Effective from is invalid/);

  assert.throws(() => sanitizeFactUpdateInput({
    validFrom: '2026-12-31',
    validTo: '2026-01-01',
  }), /cannot be after/);
});

test('admin document sanitizer supports version and effective dates', () => {
  const result = sanitizeDocumentUpdateInput({
    versionLabel: ' PDS/12/2025 ',
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
  });

  assert.equal(result.versionLabel, 'PDS/12/2025');
  assert.ok(result.effectiveFrom instanceof Date);
  assert.equal(result.effectiveTo, null);
});

test('admin document sanitizer rejects impossible date ranges', () => {
  assert.throws(() => sanitizeDocumentUpdateInput({
    effectiveFrom: '2027-01-01',
    effectiveTo: '2026-01-01',
  }), /cannot be after/);
});

test('validity filter builds conservative database clauses', () => {
  const now = new Date('2026-06-07T12:00:00Z');

  assert.deepEqual(buildFactValidityClause('undated', now), {
    validFrom: null,
    validTo: null,
  });
  assert.deepEqual(buildFactValidityClause('expired', now), {
    validTo: { lt: new Date('2026-06-07T00:00:00.000Z') },
  });
  assert.equal(buildFactValidityClause('all', now), null);
});

test('review queue filter builds high-impact dating queue clauses', () => {
  const now = new Date('2026-06-07T12:00:00Z');

  const priority = buildFactReviewQueueClause('priority', now);
  assert.ok(Array.isArray(priority.AND));
  assert.match(JSON.stringify(priority), /betterment|windscreen|special/i);
  assert.match(JSON.stringify(priority), /validFrom|validTo|sourcePage/i);

  const highImpact = buildFactReviewQueueClause('high_impact', now);
  const factTypeClause = highImpact.OR.find((clause) => clause.factType);
  assert.deepEqual(factTypeClause.factType.in, [
    'BETTERMENT',
    'WINDSCREEN',
    'FLOOD',
    'TOWING',
  ]);
  assert.doesNotMatch(JSON.stringify(factTypeClause), /ZERO_BETTERMENT|TESLA|SPECIAL_PERILS/);

  const needsDates = buildFactReviewQueueClause('needs_dates', now);
  assert.match(JSON.stringify(needsDates), /validFrom/);
  assert.match(JSON.stringify(needsDates), /validTo/);

  assert.equal(buildFactReviewQueueClause('all', now), null);
  assert.throws(() => buildFactReviewQueueClause('random', now), /Invalid review queue filter/);
});
