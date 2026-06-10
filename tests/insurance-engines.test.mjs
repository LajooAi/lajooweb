import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WINDSCREEN_COVERAGE,
  ADD_ON_CATALOG,
  addOnIdsFromState,
  buildAddOnsFromSelection,
  calculateWindscreenPremium,
  extractWindscreenCoverageAmount,
  resolveAddOnChangeFromText,
} from '../src/server/insurance/addonEngine.js';
import {
  canUseDeliveredRoadTax,
  getRoadTaxDisplayName,
  roadTaxOptionFromState,
} from '../src/server/insurance/roadTaxEngine.js';
import {
  calculateCurrentGrandTotal,
  calculateSummaryAmounts,
  ensureVehicleDisplayQuoteOptions,
  getQuotesFromState,
  mapGatewayQuotesToInternal,
  quoteIdForCurrentSelection,
  quoteSelectionFromIntent,
} from '../src/server/insurance/quoteEngine.js';

test('addon engine calculates windscreen premium from coverage amount', () => {
  assert.equal(DEFAULT_WINDSCREEN_COVERAGE, 2000);
  assert.equal(calculateWindscreenPremium(500), 75);
  assert.equal(calculateWindscreenPremium(1000), 150);
  assert.equal(calculateWindscreenPremium(2000), 300);
});

test('addon engine extracts windscreen coverage from natural text', () => {
  assert.equal(extractWindscreenCoverageAmount('Add windscreen RM 2,000 please'), 2000);
  assert.equal(extractWindscreenCoverageAmount('add windscreen rm two thousand'), 2000);
  assert.equal(extractWindscreenCoverageAmount('2 thousand', { allowBareAmount: true }), 2000);
  assert.equal(extractWindscreenCoverageAmount('2000', { allowBareAmount: true }), 2000);
  assert.equal(extractWindscreenCoverageAmount('I want flood only'), null);
});

test('addon engine builds selected add-ons and gateway add-on ids', () => {
  const addOns = buildAddOnsFromSelection(['windscreen', 'flood', 'windscreen'], { coverageAmount: 1000 });

  assert.deepEqual(addOns.map((item) => item.id), ['windscreen', 'flood']);
  assert.equal(addOns[0].coverageAmount, 1000);
  assert.equal(addOns[0].price, 150);
  assert.equal(addOns[1].price, 150);
  assert.deepEqual(addOnIdsFromState({ selectedAddOns: addOns }), ['windscreen', 'flood']);
  assert.ok(ADD_ON_CATALOG.length >= 11);
});

test('addon engine resolves explicit later-step add-on corrections', () => {
  const state = {
    selectedAddOns: buildAddOnsFromSelection(['windscreen', 'flood'], { coverageAmount: 1000 }),
  };

  const change = resolveAddOnChangeFromText('remove windscreen, keep flood only', state);

  assert.deepEqual(change.addOnIds, ['flood']);
  assert.deepEqual(change.addOns.map((item) => item.id), ['flood']);
  assert.equal(change.requiresWindscreenCoverage, false);
});

test('addon engine keeps money amounts separate from option numbers', () => {
  const state = { selectedAddOns: [] };
  const change = resolveAddOnChangeFromText('add windscreen RM 2,000 please', state);

  assert.deepEqual(change.addOnIds, ['windscreen']);
  assert.equal(change.coverageAmount, 2000);
  assert.equal(change.addOns[0].price, 300);
});

test('addon engine asks for windscreen coverage when adding it later without amount', () => {
  const state = {
    selectedAddOns: buildAddOnsFromSelection(['flood']),
  };
  const change = resolveAddOnChangeFromText('add windscreen also', state);

  assert.deepEqual(change.addOnIds, ['windscreen', 'flood']);
  assert.equal(change.requiresWindscreenCoverage, true);
});

test('road tax engine normalizes display names and API options', () => {
  assert.equal(getRoadTaxDisplayName({ name: '12month-digital' }), '12 months digital road tax');
  assert.equal(getRoadTaxDisplayName({ name: '12 months physical + delivery' }), '12 months physical + delivery');
  assert.equal(getRoadTaxDisplayName({ name: 'No Road Tax' }), 'Not included');

  assert.equal(roadTaxOptionFromState({ selectedRoadTax: { name: 'No Road Tax' } }), 'none');
  assert.equal(roadTaxOptionFromState({ selectedRoadTax: { name: '12 months physical + delivery' } }), 'printed_12m');
  assert.equal(roadTaxOptionFromState({ selectedRoadTax: { name: '12 months digital road tax' } }), 'digital_12m');
  assert.equal(canUseDeliveredRoadTax({ ownerIdType: 'nric' }), false);
});

test('quote engine supplements gateway quotes with catalog fallback quotes', () => {
  const gatewayQuotes = mapGatewayQuotesToInternal([
    {
      quote_id: 'QT-SAMPLE-ETQ-001',
      insurer: { code: 'ETIQA', name: 'Etiqa Insurance' },
      coverage: { sum_insured: 35000, type: 'COMPREHENSIVE' },
      premium: { base: 1090, final: 872, ncd_percent: 20, ncd_amount: 218 },
    },
  ]);
  const quotes = getQuotesFromState({
    vehicleInfo: {
      sampleId: 'SAMPLE',
      quoteOptions: gatewayQuotes,
    },
  });

  assert.ok(quotes.length >= 7);
  assert.ok(quotes.some((quote) => quote.id === 'QT-SAMPLE-ETI-001'));
  assert.ok(quotes.some((quote) => quote.insurer.displayName === 'Takaful Ikhlas Insurance'));
});

test('vehicle display quote options fall back to catalog sums for market value range', () => {
  const quotes = ensureVehicleDisplayQuoteOptions([], {
    engineCC: 1496,
    ncdPercent: 20,
  });
  const sums = quotes.map((quote) => Number(quote.sumInsured || 0)).filter((value) => value > 0);

  assert.ok(quotes.length >= 7);
  assert.equal(Math.min(...sums), 34000);
  assert.equal(Math.max(...sums), 40000);
});

test('vehicle display quote options preserve usable gateway sums', () => {
  const gatewayQuotes = [
    { insurer: { displayName: 'Example A' }, sumInsured: 42000 },
    { insurer: { displayName: 'Example B' }, sumInsured: 44000 },
  ];

  assert.deepEqual(ensureVehicleDisplayQuoteOptions(gatewayQuotes), gatewayQuotes);
});

test('quote engine selects insurer and preserves gateway-style quote id', () => {
  const state = {
    vehicleInfo: { sampleId: 'JRT9289' },
  };
  const selected = quoteSelectionFromIntent(state, 'takaful');

  assert.equal(selected.insurer, 'Takaful Ikhlas Insurance');
  assert.equal(selected.priceAfter, 796);
  assert.equal(selected.quoteId, 'QT-JRT9289-TAK-001');
  assert.equal(quoteIdForCurrentSelection({ ...state, selectedQuote: selected }), selected.quoteId);
});

test('quote engine calculates current summary totals consistently', () => {
  const state = {
    selectedQuote: { priceAfter: 796 },
    selectedAddOns: buildAddOnsFromSelection(['windscreen'], { coverageAmount: 1000 }),
    selectedRoadTax: { name: '12 months digital road tax', price: 90 },
  };
  const amounts = calculateSummaryAmounts(state);

  assert.deepEqual(amounts, {
    insurance: 796,
    addOns: 150,
    roadTax: 90,
    tax: 85.68,
    total: 1121.68,
  });
  assert.equal(calculateCurrentGrandTotal(state), 1121.68);
});
