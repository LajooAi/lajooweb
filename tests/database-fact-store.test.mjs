import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVerifiedDatabaseFactsInstructionFromFacts,
  mapInsurerFactRowToApprovedFact,
} from '../src/server/insurance/databaseFactStore.js';
import { buildQuoteRecommendation } from '../src/server/insurance/recommendationEngine.js';

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
  assert.match(instruction, /Confirm limits, eligibility, and selected add-ons before payment/i);
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
