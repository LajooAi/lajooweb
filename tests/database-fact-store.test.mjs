import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDbFactWhere,
  buildVerifiedDatabaseFactsInstructionFromFacts,
  mapInsurerFactRowToApprovedFact,
} from '../src/server/insurance/databaseFactStore.js';
import { buildQuoteRecommendation } from '../src/server/insurance/recommendationEngine.js';
import {
  buildUsableFactDateWhere,
  FACT_VALIDITY_STATUS,
  FACT_REVIEW_PRIORITY,
  getFactReviewPriority,
  getFactValidityStatus,
  isFactUsableForAi,
} from '../src/server/knowledge/sourceAudit.js';

test('maps Neon verified fact rows into approved fact shape', () => {
  const fact = mapInsurerFactRowToApprovedFact({
    id: 'fact_1',
    factType: 'BETTERMENT',
    title: 'Betterment waiver wording found',
    value: 'Allianz has imported private-car betterment waiver wording in "Private Car Add-ons".',
    category: 'betterment',
    tags: ['betterment', 'waiver_betterment', 'older_car'],
    advisorUse: 'Use this for older-car users who worry about surprise repair cost.',
    confidence: 'medium',
    status: 'VERIFIED',
    sourceExcerpt: 'Waiver of betterment is subject to eligibility.',
    sourceRelativePath: 'allianz/private-car/private-car-addons-en.pdf',
    sourcePage: 4,
    insurer: {
      code: 'ALLIANZ',
      name: 'Allianz General Insurance Company (Malaysia) Berhad',
    },
  });

  assert.equal(fact.id, 'db:fact_1');
  assert.equal(fact.insurerSlug, 'allianz');
  assert.equal(fact.approvedForAi, true);
  assert.deepEqual(fact.tags, ['betterment', 'waiver_betterment', 'older_car']);
  assert.equal(fact.sourceType, 'db_verified_fact');
  assert.equal(fact.sourcePage, 4);
  assert.equal(fact.sourceLabel, 'allianz/private-car/private-car-addons-en.pdf (p. 4)');
  assert.equal(fact.validityStatus, FACT_VALIDITY_STATUS.UNDATED);
  assert.equal(fact.usableForAi, true);
});

test('generic generated brand-program facts are review-only, not AI recommendation facts', () => {
  const fact = mapInsurerFactRowToApprovedFact({
    id: 'fact_brand_generic',
    factType: 'ELIGIBILITY',
    title: 'Perodua brand-program wording found',
    value: 'Allianz Insurance has imported private-car Perodua-related programme or product wording in "private car road warrior pds.en". Do not say it is automatically best for every Perodua owner; use it only as brand-specific eligibility/support context.',
    category: 'brand_program',
    tags: ['brand_program', 'perodua'],
    advisorUse: 'Generated from imported PDF evidence. Keep final user answers source-bound and confirm exact limits before payment.',
    confidence: 'medium',
    status: 'VERIFIED',
    sourceExcerpt: 'Premium assumption: Male, 30 years old, Perodua Myvi...',
    sourceRelativePath: 'allianz/private-car/private-car-road-warrior-pds.en.pdf',
    sourcePage: 2,
    insurer: {
      code: 'ALLIANZ',
      name: 'Allianz General Insurance Company (Malaysia) Berhad',
    },
  });

  assert.equal(fact.approvedForAi, false);
  assert.equal(fact.usableForAi, false);
  assert.equal(fact.needsReview, true);
  assert.ok(fact.reviewReasons.some((reason) => /brand-program/i.test(reason)));
});

test('fact source audit blocks expired or future facts but allows undated verified facts cautiously', () => {
  const now = new Date('2026-06-07T12:00:00Z');

  assert.equal(getFactValidityStatus({
    status: 'VERIFIED',
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validTo: new Date('2026-12-31T00:00:00Z'),
  }, now), FACT_VALIDITY_STATUS.ACTIVE);

  assert.equal(isFactUsableForAi({
    status: 'VERIFIED',
    validTo: new Date('2026-01-01T00:00:00Z'),
  }, now), false);

  assert.equal(isFactUsableForAi({
    status: 'VERIFIED',
    validFrom: new Date('2026-12-01T00:00:00Z'),
  }, now), false);

  assert.equal(isFactUsableForAi({
    status: 'VERIFIED',
  }, now), true);

  assert.equal(isFactUsableForAi({
    status: 'VERIFIED',
  }, now, { requireDatedFacts: true }), false);

  assert.equal(isFactUsableForAi({
    status: 'VERIFIED',
    validFrom: new Date('2026-01-01T00:00:00Z'),
  }, now, { requireDatedFacts: true }), true);
});

test('strict dated fact database filter requires at least one date', () => {
  const now = new Date('2026-06-07T12:00:00Z');
  const loose = buildUsableFactDateWhere(now, { requireDatedFacts: false });
  const strict = buildUsableFactDateWhere(now, { requireDatedFacts: true });

  assert.equal(loose.length, 2);
  assert.equal(strict.length, 3);
  assert.match(JSON.stringify(strict[2]), /not/);
});

test('high-impact undated facts get high review priority', () => {
  const priority = getFactReviewPriority({
    status: 'VERIFIED',
    category: 'betterment',
    tags: ['betterment', 'waiver_betterment'],
    title: 'Betterment waiver wording found',
    value: 'Betterment waiver wording was found in the imported PDF.',
    sourceRelativePath: 'allianz/private-car/private-car-addons-en.pdf',
    sourcePage: 4,
  }, new Date('2026-06-07T12:00:00Z'));

  assert.equal(priority.level, FACT_REVIEW_PRIORITY.HIGH);
  assert.equal(priority.topic, 'betterment');
  assert.ok(priority.reasons.some((reason) => /Missing effective/i.test(reason)));
});

test('high-impact topic detection does not match short terms inside unrelated words', () => {
  const priority = getFactReviewPriority({
    status: 'VERIFIED',
    category: 'brand_program',
    tags: ['brand_program', 'perodua'],
    title: 'Perodua brand-program wording found',
    value: 'Imported programme wording should be reviewed and dated before production use.',
    sourceRelativePath: 'tokio-marine/private-car/perodua-brand-program-en.pdf',
    sourcePage: 2,
  }, new Date('2026-06-07T12:00:00Z'));

  assert.equal(priority.level, FACT_REVIEW_PRIORITY.HIGH);
  assert.equal(priority.topic, 'brand_program');
  assert.notEqual(priority.topic, 'ev_tesla');
});

test('strict mapped facts block undated facts from AI use', () => {
  const strictFact = mapInsurerFactRowToApprovedFact({
    id: 'fact_strict_1',
    factType: 'TOWING',
    title: 'Roadside assistance wording found',
    value: 'Allianz has roadside assistance wording in the imported document.',
    category: 'towing_roadside',
    tags: ['towing', 'roadside'],
    advisorUse: 'Use cautiously and confirm exact limits before payment.',
    confidence: 'medium',
    status: 'VERIFIED',
    sourceExcerpt: 'Roadside assistance terms apply.',
    sourceRelativePath: 'allianz/private-car/private-car-roadside-assistance-en.pdf',
    sourcePage: 1,
    insurer: {
      code: 'ALLIANZ',
      name: 'Allianz General Insurance Company (Malaysia) Berhad',
    },
  }, { requireDatedFacts: true });

  assert.equal(strictFact.approvedForAi, false);
  assert.equal(strictFact.usableForAi, false);
  assert.equal(strictFact.strictDatedFactsRequired, true);
});

test('verified database facts instruction keeps facts source-bound', () => {
  const instruction = buildVerifiedDatabaseFactsInstructionFromFacts([
    {
      approvedForAi: true,
      insurerName: 'MSIG Insurance (Malaysia) Bhd',
      statement: 'MSIG has imported private-car windscreen wording in "Private Car Add-ons".',
      advisorUse: 'Confirm coverage amount before adding it.',
      sourceRelativePath: 'msig/private-car/private-car-addons-en.pdf',
      sourceExcerpt: 'Windscreen cover is subject to selected sum insured.',
    },
  ]);

  assert.match(instruction, /VERIFIED DATABASE INSURER FACTS/i);
  assert.match(instruction, /Use them before raw PDF chunks/i);
  assert.match(instruction, /Date rule/i);
  assert.match(instruction, /Confirm limits, eligibility, and selected add-ons before payment/i);
});

test('database fact lookup keeps tagged policy questions on topic', () => {
  const where = buildDbFactWhere({
    message: 'Which insurer has EV or Tesla benefits?',
    tags: ['ev', 'tesla', 'charger'],
    requireDatedFacts: true,
  });

  assert.equal(where.OR, undefined);
  assert.ok(where.AND.some((clause) => (
    Array.isArray(clause.OR) &&
    clause.OR.some((entry) => entry.tags?.has === 'ev') &&
    clause.OR.some((entry) => entry.tags?.has === 'tesla')
  )));
  assert.doesNotMatch(JSON.stringify(where), /"value":\{"contains":"which"/);
});

test('recommendation engine can use verified database facts for insurer scoring', () => {
  const recommendation = buildQuoteRecommendation({
    message: 'I want zero betterment for my older car',
    state: {
      vehicleInfo: { year: 2016, make: 'Perodua', model: 'Myvi' },
      userPreferences: { coverageFocused: true },
    },
    quotes: [
      {
        insurer: {
          displayName: 'Allianz Insurance',
          id: 'allianz',
          type: 'conventional',
          features: [],
        },
        priceAfter: 920,
        sumInsured: 36000,
      },
      {
        insurer: {
          displayName: 'Etiqa Insurance',
          id: 'etiqa',
          type: 'conventional',
          features: [],
        },
        priceAfter: 872,
        sumInsured: 35000,
      },
    ],
    extraApprovedFacts: [
      {
        id: 'db:allianz-betterment',
        insurerSlug: 'allianz',
        insurerName: 'Allianz Insurance',
        category: 'betterment',
        tags: ['betterment', 'waiver_betterment', 'older_car'],
        statement: 'Allianz has imported private-car betterment waiver wording.',
        advisorUse: 'Use this for older-car users who worry about surprise repair cost.',
        confidence: 'medium',
        approvedForAi: true,
      },
    ],
  });

  assert.equal(recommendation.recommendedQuote.insurerKey, 'allianz');
  assert.ok(recommendation.factReasons.some((reason) => /betterment/i.test(reason)));
});
