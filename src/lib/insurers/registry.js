import mockoonAggregatorAdapter from "./adapters/mockoonAggregatorAdapter.js";
import allianzAdapter from "./adapters/allianzAdapter.js";
import etiqaAdapter from "./adapters/etiqaAdapter.js";
import takafulAdapter from "./adapters/takafulAdapter.js";
import tokioMarineAdapter from "./adapters/tokioMarineAdapter.js";
import lonpacAdapter from "./adapters/lonpacAdapter.js";
import msigAdapter from "./adapters/msigAdapter.js";
import generaliAdapter from "./adapters/generaliAdapter.js";

const ADAPTERS = {
  mockoon_aggregator: mockoonAggregatorAdapter,
  allianz_direct: allianzAdapter,
  etiqa_direct: etiqaAdapter,
  takaful_direct: takafulAdapter,
  tokio_marine_direct: tokioMarineAdapter,
  lonpac_direct: lonpacAdapter,
  msig_direct: msigAdapter,
  generali_direct: generaliAdapter,
};

const ALIASES = {
  mockoon: "mockoon_aggregator",
  sandbox: "mockoon_aggregator",
  allianz: "allianz_direct",
  etiqa: "etiqa_direct",
  takaful: "takaful_direct",
  tokio: "tokio_marine_direct",
  tokio_marine: "tokio_marine_direct",
  lonpac: "lonpac_direct",
  msig: "msig_direct",
  generali: "generali_direct",
};

function normalizeAdapterKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "mockoon_aggregator";
  return ALIASES[raw] || raw;
}

export function resolveAdapterKey(overrideKey = null) {
  const requested = normalizeAdapterKey(
    overrideKey
    || process.env.INSURER_PLATFORM_ADAPTER
    || process.env.INSURER_API_PROVIDER
    || "mockoon_aggregator"
  );

  if (ADAPTERS[requested]) return requested;
  return "mockoon_aggregator";
}

export function getInsurerAdapter(overrideKey = null) {
  const key = resolveAdapterKey(overrideKey);
  return ADAPTERS[key] || ADAPTERS.mockoon_aggregator;
}

export function getAvailableAdapters() {
  return Object.values(ADAPTERS).map((adapter) => ({
    key: adapter.key,
    name: adapter.name,
    mode: adapter.mode,
  }));
}
