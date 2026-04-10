import mockoonAggregatorAdapter from "./adapters/mockoonAggregatorAdapter.js";
import allianzAdapter from "./adapters/allianzAdapter.js";
import etiqaAdapter from "./adapters/etiqaAdapter.js";
import takafulAdapter from "./adapters/takafulAdapter.js";

const ADAPTERS = {
  mockoon_aggregator: mockoonAggregatorAdapter,
  allianz_direct: allianzAdapter,
  etiqa_direct: etiqaAdapter,
  takaful_direct: takafulAdapter,
};

const ALIASES = {
  mockoon: "mockoon_aggregator",
  sandbox: "mockoon_aggregator",
  allianz: "allianz_direct",
  etiqa: "etiqa_direct",
  takaful: "takaful_direct",
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
