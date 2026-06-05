import { getQuotes } from "../../lib/insuranceData.js";
import {
  AVAILABLE_INSURERS,
  getInsurerByKey,
  findInsurerKeyByText,
  textMatchesInsurerKey,
  getInsurerQuoteIdPrefix,
} from "../../lib/insurerCatalog.js";

export const SST_RATE = 0.08;
export const STAMP_DUTY_AMOUNT = 10;

const INSURER_UI_META = Object.fromEntries(
  AVAILABLE_INSURERS.map((insurer) => [
    insurer.code,
    {
      id: insurer.id,
      displayName: insurer.displayName,
      logoUrl: insurer.logoUrl,
      features: insurer.features,
    },
  ])
);

function roundCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}
export function getQuoteInsurerKey(quote) {
  const insurerText = typeof quote?.insurer === 'string'
    ? quote.insurer
    : `${quote?.insurer?.id || ''} ${quote?.insurer?.displayName || ''} ${quote?.insurer?.summaryName || ''}`;
  return findInsurerKeyByText(insurerText);
}

export function quoteIdForInsurerKey(state, insurerKey, fallbackId = null) {
  const sampleId = state?.vehicleInfo?.sampleId;
  const quotePrefix = getInsurerQuoteIdPrefix(insurerKey);
  if (sampleId && quotePrefix) return `QT-${sampleId}-${quotePrefix}-001`;
  return fallbackId;
}

export function withGatewayStyleQuoteId(quote, state) {
  const insurerKey = getQuoteInsurerKey(quote);
  const quoteId = quoteIdForInsurerKey(state, insurerKey, quote?.id || null);
  if (!quoteId || quoteId === quote?.id) return quote;
  return { ...quote, id: quoteId };
}

export function supplementQuotesWithCatalog(quotes = [], state = {}) {
  const combined = Array.isArray(quotes) ? quotes.filter(Boolean).map((quote) => withGatewayStyleQuoteId(quote, state)) : [];
  const seenKeys = new Set(combined.map(getQuoteInsurerKey).filter(Boolean));

  for (const catalogQuote of getQuotes()) {
    const insurerKey = getQuoteInsurerKey(catalogQuote);
    if (!insurerKey || seenKeys.has(insurerKey)) continue;
    combined.push(withGatewayStyleQuoteId(catalogQuote, state));
    seenKeys.add(insurerKey);
  }

  return combined.sort((a, b) => Number(a?.pricing?.finalPremium || 0) - Number(b?.pricing?.finalPremium || 0));
}

export function getQuotesFromState(state) {
  const gatewayQuotes = state?.vehicleInfo?.quoteOptions;
  if (Array.isArray(gatewayQuotes) && gatewayQuotes.length > 0) {
    return supplementQuotesWithCatalog(gatewayQuotes, state);
  }
  return supplementQuotesWithCatalog(getQuotes(), state);
}

export function calculateSummaryAmounts(state) {
  const insurance = Number(state?.selectedQuote?.priceAfter || 0);
  const addOns = (state?.selectedAddOns || []).reduce((sum, item) => sum + Number(item?.price || 0), 0);
  const roadTax = Number(state?.selectedRoadTax?.price || 0);
  const tax = insurance > 0 ? roundCurrency((insurance + addOns) * SST_RATE + STAMP_DUTY_AMOUNT) : 0;
  const total = roundCurrency(insurance + addOns + tax + roadTax);
  return { insurance, addOns, roadTax, tax, total };
}

export function calculateCurrentGrandTotal(state) {
  return calculateSummaryAmounts(state).total;
}

export function insurerMetaFromGatewayQuote(quote) {
  const code = String(quote?.insurer?.code || '').toUpperCase();
  if (INSURER_UI_META[code]) return INSURER_UI_META[code];

  const insurer = getInsurerByKey(findInsurerKeyByText(quote?.insurer?.name || ''));
  if (insurer) {
    return {
      id: insurer.id,
      displayName: insurer.displayName,
      logoUrl: insurer.logoUrl,
      features: insurer.features,
    };
  }

  return {
    id: code ? code.toLowerCase() : 'unknown-insurer',
    displayName: quote?.insurer?.name || 'Unknown Insurer',
    logoUrl: '',
    features: [],
  };
}

export function mapGatewayQuoteToInternal(quote) {
  if (!quote || typeof quote !== 'object') return null;
  const meta = insurerMetaFromGatewayQuote(quote);

  const basePremium = Number(quote?.premium?.base || 0);
  const finalPremium = Number(quote?.premium?.final || 0);
  const ncdPercent = Number(quote?.premium?.ncd_percent || 0);
  const ncdDiscount = Number(quote?.premium?.ncd_amount || Math.max(0, basePremium - finalPremium));

  return {
    id: quote.quote_id || `${meta.id}-${Date.now()}`,
    insurer: {
      id: meta.id,
      displayName: meta.displayName,
      logoUrl: meta.logoUrl,
      features: meta.features,
    },
    sumInsured: Number(quote?.coverage?.sum_insured || 0),
    coverType: String(quote?.coverage?.type || 'COMPREHENSIVE').replace(/_/g, ' '),
    pricing: {
      basePremium,
      ncdPercent,
      ncdDiscount,
      finalPremium,
    },
    benefits: [...meta.features],
    addonsCatalog: Array.isArray(quote?.addons_catalog) ? quote.addons_catalog : [],
  };
}

export function mapGatewayQuotesToInternal(gatewayQuotes = []) {
  const mapped = gatewayQuotes.map(mapGatewayQuoteToInternal).filter(Boolean);
  mapped.sort((a, b) => a.pricing.finalPremium - b.pricing.finalPremium);
  return mapped;
}

export function quoteSelectionFromIntent(state, insurerKey) {
  const key = String(insurerKey || '').toLowerCase();
  const quotes = getQuotesFromState(state);
  const selected = quotes.find((q) => {
    const id = String(q?.insurer?.id || '').toLowerCase();
    const name = String(q?.insurer?.displayName || '').toLowerCase();
    return textMatchesInsurerKey(`${id} ${name}`, key);
  });

  if (!selected) return null;
  return {
    insurer: selected.insurer.displayName,
    priceAfter: Number(selected.pricing?.finalPremium || 0),
    priceBefore: Number(selected.pricing?.basePremium || 0),
    ncdPercent: Number(selected.pricing?.ncdPercent || 0),
    sumInsured: Number(selected.sumInsured || 0),
    coverType: selected.coverType || 'Comprehensive',
    quoteId: selected.id || null,
  };
}

export function quoteIdForCurrentSelection(state) {
  if (state?.selectedQuote?.quoteId) return state.selectedQuote.quoteId;

  const selectedInsurer = String(state?.selectedQuote?.insurer || '').toLowerCase();
  const fromLoadedQuotes = getQuotesFromState(state).find((q) =>
    String(q?.insurer?.displayName || '').toLowerCase() === selectedInsurer
  );
  if (fromLoadedQuotes?.id) return fromLoadedQuotes.id;

  const sampleId = state?.vehicleInfo?.sampleId;
  if (!sampleId) return null;

  const insurerKey = findInsurerKeyByText(selectedInsurer);
  const quotePrefix = getInsurerQuoteIdPrefix(insurerKey);
  if (quotePrefix) return `QT-${sampleId}-${quotePrefix}-001`;
  return null;
}
