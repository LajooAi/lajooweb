export const APPROVED_FACT_INSURER_SLUG_BY_KEY = {
  allianz: 'allianz',
  etiqa: 'etiqa',
  generali: 'generali',
  lonpac: 'lonpac',
  msig: 'msig',
  takaful: 'takaful-ikhlas',
  tokio: 'tokio-marine',
};

export function getApprovedFactInsurerSlugForKey(insurerKey) {
  return APPROVED_FACT_INSURER_SLUG_BY_KEY[String(insurerKey || '').toLowerCase()] || null;
}

export default APPROVED_FACT_INSURER_SLUG_BY_KEY;
