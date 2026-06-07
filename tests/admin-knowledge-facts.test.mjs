import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
