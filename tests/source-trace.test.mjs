import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendKnowledgeSourceTraceToMetadata,
  buildKnowledgeSourceTrace,
} from '../src/server/ai/sourceTrace.js';
import { getQuotes } from '../src/lib/insuranceData.js';
import { buildQuoteRecommendation } from '../src/server/insurance/recommendationEngine.js';

test('source trace keeps exact fact source fields and masks sensitive question text', () => {
  const trace = buildKnowledgeSourceTrace({
    sessionId: 'chat_source_trace_test',
    latestMessage: 'My IC is 951018145405 and email is founder@example.com. Which insurer has EV benefits?',
    state: { step: 'quotes' },
    intent: { intent: 'ask_question' },
    decision: { mode: 'insurance_question' },
    turnPlan: { responsePattern: 'answer_then_resume' },
    verifiedDatabaseFacts: [
      {
        id: 'db:fact_ev_1',
        insurerName: 'MSIG',
        insurerSlug: 'msig',
        category: 'ev_tesla',
        factType: 'ELIGIBILITY',
        title: 'EV Plus wording found',
        statement: 'MSIG has imported private-car EV, charger, charging-cable, or Tesla-related wording.',
        sourceType: 'db_verified_fact',
        sourceRelativePath: 'msig/private-car/private-car-ev-plus-leaflet-en-bm.pdf',
        sourcePage: 1,
        sourceLabel: 'msig/private-car/private-car-ev-plus-leaflet-en-bm.pdf (p. 1)',
        validityStatus: 'active',
        validFrom: new Date('2024-10-10T00:00:00.000Z'),
        confidence: 'medium',
      },
    ],
    now: new Date('2026-06-07T12:00:00.000Z'),
  });

  assert.ok(trace.traceId.startsWith('kst_'));
  assert.equal(trace.sourceCount, 1);
  assert.equal(trace.questionPreview.includes('951018145405'), false);
  assert.equal(trace.questionPreview.includes('founder@example.com'), false);
  assert.equal(trace.sources[0].id, 'db:fact_ev_1');
  assert.equal(trace.sources[0].sourceRelativePath, 'msig/private-car/private-car-ev-plus-leaflet-en-bm.pdf');
  assert.equal(trace.sources[0].sourcePage, 1);
  assert.equal(trace.sources[0].validFrom, '2024-10-10');
});

test('source trace metadata keeps a bounded audit history', () => {
  let metadata = {};
  for (let i = 0; i < 35; i += 1) {
    metadata = appendKnowledgeSourceTraceToMetadata(metadata, {
      traceId: `kst_${i}`,
      createdAt: `2026-06-07T12:${String(i).padStart(2, '0')}:00.000Z`,
      step: 'quotes',
      intent: 'ask_question',
      sourceCount: 1,
      sources: [{ id: `db:fact_${i}`, sourceLabel: `source-${i}.pdf (p. 1)` }],
    }, { step: 'quotes' });
  }

  assert.equal(metadata.knowledgeSourceTraces.length, 30);
  assert.equal(metadata.knowledgeSourceTraces[0].traceId, 'kst_5');
  assert.equal(metadata.lastKnowledgeSourceTrace.traceId, 'kst_34');
});

test('source trace stores recommendation explainability even without document sources', () => {
  const quoteRecommendation = buildQuoteRecommendation({
    quotes: getQuotes(),
    message: 'which is the best?',
  });
  const trace = buildKnowledgeSourceTrace({
    sessionId: 'chat_recommendation_trace_test',
    latestMessage: 'which is the best?',
    state: { step: 'quotes' },
    intent: { intent: 'ask_question' },
    decision: { mode: 'quote_comparison' },
    turnPlan: { responsePattern: 'answer_then_resume', questionGuidance: 'quote_recommendation' },
    quoteRecommendation,
    now: new Date('2026-06-07T12:30:00.000Z'),
  });

  assert.ok(trace.traceId.startsWith('kst_'));
  assert.equal(trace.sourceCount, 0);
  assert.equal(trace.sources.length, 0);
  assert.equal(trace.recommendation.insurerKey, 'tokio');
  assert.equal(trace.recommendation.scoreVersion, 'quote_recommendation_v2');
  assert.equal(trace.recommendation.isCloseCall, true);
  assert.ok(trace.recommendation.reasonCodes.includes('near_cheapest_with_higher_sum_insured'));
  assert.equal(trace.recommendation.explainability.governance.paidPlacementApplied, false);
  assert.ok(trace.recommendation.explainability.quoteSnapshot.length >= 7);

  const metadata = appendKnowledgeSourceTraceToMetadata({}, trace, { step: 'quotes' });
  assert.equal(metadata.lastKnowledgeSourceTrace.recommendation.insurerKey, 'tokio');
  assert.equal(metadata.lastKnowledgeSourceTrace.recommendation.explainability.reasonCodes.includes('balanced_default'), true);
});
