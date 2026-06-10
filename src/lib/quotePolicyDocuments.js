export const QUOTE_POLICY_DOCUMENT_TYPES = [
  {
    key: "product-disclosure-sheet",
    label: "Product Disclosure Sheet",
  },
  {
    key: "policy-wording",
    label: "Policy Wording",
  },
];

export function getQuotePolicyDocumentLinks(insurerKey = "default") {
  const safeInsurerKey = String(insurerKey || "default").toLowerCase();
  return QUOTE_POLICY_DOCUMENT_TYPES.map((document) => ({
    ...document,
    url: `/api/policy-documents/${encodeURIComponent(safeInsurerKey)}/${document.key}`,
  }));
}
