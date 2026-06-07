import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStrictReadinessReport,
  summarizeStrictFactReadiness,
} from '../src/server/knowledge/strictReadiness.js';

function fact({
  id,
  insurerName = 'Allianz Insurance',
  category = 'betterment',
  title = 'Verified source fact',
  validFrom = null,
  validTo = null,
} = {}) {
  return {
    id: `db:${id}`,
    insurerName,
    category,
    title,
    statement: `${insurerName} has source-backed ${category} wording.`,
    approvedForAi: true,
    sourceLabel: `${insurerName.toLowerCase().replace(/\s+/g, '-')}/private-car/source.pdf (p. 2)`,
    sourcePage: 2,
    validityStatus: validFrom || validTo ? 'active' : 'undated',
    validFrom,
    validTo,
  };
}

test('strict readiness marks a topic ready when enough dated facts exist', async () => {
  const report = await summarizeStrictFactReadiness({
    questions: [
      {
        id: 'betterment',
        label: 'Betterment',
        question: 'Which insurer has betterment waiver?',
        category: 'betterment',
        tags: ['betterment'],
        minDatedFacts: 2,
      },
    ],
    getFacts: async ({ requireDatedFacts }) => {
      const dated = [
        fact({ id: 'a', category: 'betterment', validFrom: new Date('2026-01-01T00:00:00Z') }),
        fact({ id: 'b', category: 'betterment', validTo: new Date('2026-12-31T00:00:00Z') }),
      ];
      return requireDatedFacts
        ? dated
        : [...dated, fact({ id: 'c', category: 'betterment' })];
    },
  });

  assert.equal(report.strictModeReady, true);
  assert.equal(report.summary.ready, 1);
  assert.equal(report.items[0].status, 'ready');
  assert.equal(report.items[0].strictCount, 2);
  assert.equal(report.items[0].looseOnlyCount, 1);
  assert.equal(report.items[0].datedSamples[0].validFrom, '2026-01-01');
});

test('strict readiness separates partial, blocked, and missing topics', async () => {
  const questions = [
    {
      id: 'windscreen',
      label: 'Windscreen',
      question: 'Which insurers support windscreen?',
      category: 'windscreen',
      tags: ['windscreen'],
      minDatedFacts: 2,
    },
    {
      id: 'towing',
      label: 'Towing',
      question: 'Which insurers include towing?',
      category: 'towing_roadside',
      tags: ['towing'],
      minDatedFacts: 1,
    },
    {
      id: 'ev',
      label: 'EV',
      question: 'Which insurers support EV?',
      category: 'ev_tesla',
      tags: ['ev'],
      minDatedFacts: 1,
    },
  ];

  const report = await summarizeStrictFactReadiness({
    questions,
    getFacts: async ({ category, requireDatedFacts }) => {
      if (category === 'windscreen') {
        const dated = [fact({ id: 'wind-1', category, validFrom: new Date('2026-01-01T00:00:00Z') })];
        return requireDatedFacts ? dated : [...dated, fact({ id: 'wind-2', category })];
      }
      if (category === 'towing_roadside') {
        return requireDatedFacts ? [] : [fact({ id: 'tow-1', category })];
      }
      return [];
    },
  });

  assert.equal(report.strictModeReady, false);
  assert.equal(report.summary.partial, 1);
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.summary.missing, 1);
  assert.equal(report.items.find((item) => item.id === 'windscreen').status, 'partial');
  assert.equal(report.items.find((item) => item.id === 'towing').status, 'blocked');
  assert.equal(report.items.find((item) => item.id === 'ev').status, 'missing');
});

test('optional readiness topics do not block strict production readiness', async () => {
  const report = await summarizeStrictFactReadiness({
    questions: [
      {
        id: 'betterment',
        label: 'Betterment',
        question: 'Which insurer has betterment waiver?',
        category: 'betterment',
        tags: ['betterment'],
        minDatedFacts: 1,
      },
      {
        id: 'brand_program',
        label: 'Brand programmes',
        question: 'Which insurers have brand programmes?',
        category: 'brand_program',
        tags: ['brand_program'],
        requiredForStrictMode: false,
        minDatedFacts: 1,
      },
    ],
    getFacts: async ({ category, requireDatedFacts }) => {
      if (category === 'betterment') {
        return [fact({ id: 'betterment-ready', category, validFrom: new Date('2026-01-01T00:00:00Z') })];
      }
      if (category === 'brand_program') {
        return requireDatedFacts ? [] : [fact({ id: 'brand-undated', category })];
      }
      return [];
    },
  });

  const brandItem = report.items.find((item) => item.id === 'brand_program');
  assert.equal(report.strictModeReady, true);
  assert.equal(report.requiredQuestions, 1);
  assert.equal(report.optionalQuestions, 1);
  assert.equal(brandItem.status, 'blocked');
  assert.equal(brandItem.requiredForStrictMode, false);
  assert.match(formatStrictReadinessReport(report), /BLOCKED \\| OPTIONAL/);
});

test('strict readiness report gives production-safe next action', async () => {
  const report = await summarizeStrictFactReadiness({
    questions: [
      {
        id: 'flood',
        label: 'Flood / special perils',
        question: 'Do users need flood cover?',
        category: 'flood_special_perils',
        tags: ['flood'],
        minDatedFacts: 1,
      },
    ],
    getFacts: async ({ requireDatedFacts }) => requireDatedFacts
      ? []
      : [fact({ id: 'flood-1', category: 'flood_special_perils' })],
  });

  const text = formatStrictReadinessReport(report);
  assert.match(text, /NOT READY/);
  assert.match(text, /Do not enable LAJOO_AI_REQUIRE_DATED_FACTS=true/);
  assert.match(text, /Review and date at least 1/);
});
