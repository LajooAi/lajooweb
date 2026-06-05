import { canUseDeliveredRoadTaxByOwnerType } from "../../lib/flowGuards.js";

export const PRINTED_ROAD_TAX_EFFECTIVE_DATE = '1 Feb 2026';
export const PRINTED_ROAD_TAX_POLICY_NOTE = `Please note that from ${PRINTED_ROAD_TAX_EFFECTIVE_DATE}, printed road tax is only for Foreign ID or Company vehicles.`;

export function getRoadTaxDisplayName(roadTax, noRoadTaxLabel = 'Not included') {
  const rawName = typeof roadTax === 'string' ? roadTax : roadTax?.name;
  const name = String(rawName || '').trim();
  const normalized = name.toLowerCase();

  if (!name) return '';
  if (normalized.includes('no road tax') || normalized === 'none' || normalized === 'not included') {
    return noRoadTaxLabel;
  }
  if (normalized.includes('physical') || normalized.includes('deliver')) {
    return '12 months physical + delivery';
  }
  if (normalized.includes('digital') || normalized.includes('12month-digital')) {
    return '12 months digital road tax';
  }

  return name;
}
export function canUseDeliveredRoadTax(state) {
  return canUseDeliveredRoadTaxByOwnerType(state?.ownerIdType || null);
}

export function roadTaxOptionFromState(state) {
  const name = String(state?.selectedRoadTax?.name || '').toLowerCase();
  if (!name) return 'digital_12m';
  if (name.includes('no road tax') || name === 'none') return 'none';
  if (name.includes('printed') || name.includes('deliver')) return 'printed_12m';
  return 'digital_12m';
}
