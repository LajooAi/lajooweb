const CONCEPTS = [
  {
    id: 'ncd',
    title: 'NCD / No Claim Discount',
    aliases: ['ncd', 'no claim discount', 'no-claim discount'],
    explanation: 'NCD is a discount on your motor insurance premium when there was no claim under your policy. In Malaysia, it usually follows the vehicle owner record, and it reduces the premium before the final payable amount is shown.',
    advisory: 'Make clear that NCD is not an insurer benefit and should not be compared as if one insurer is giving a better NCD unless verified.',
  },
  {
    id: 'windscreen',
    title: 'Windscreen cover',
    aliases: ['windscreen', 'window glass', 'glass cover', 'glass coverage'],
    explanation: 'Windscreen cover is optional protection for the windscreen and vehicle glass. If the user buys it, a windscreen claim normally does not affect NCD, up to the selected coverage amount.',
    advisory: 'Ask for the coverage amount when the user wants windscreen cover because the premium depends on the chosen insured amount.',
  },
  {
    id: 'flood',
    title: 'Flood / Special Perils',
    aliases: ['flood', 'special perils', 'natural disaster', 'landslide', 'storm'],
    explanation: 'Special Perils is optional cover for risks like flood, storm, landslide, and other natural events. Normal comprehensive motor insurance may not automatically include flood damage unless this add-on is included.',
    advisory: 'For Malaysia, connect this to monsoon season, flood-prone parking areas, and whether the car is parked outdoors.',
  },
  {
    id: 'betterment',
    title: 'Betterment',
    aliases: ['betterment', 'zero betterment', 'betterment waiver', 'waiver of betterment'],
    explanation: 'Betterment is the extra amount a customer may need to pay when old damaged parts are replaced with brand-new parts during a claim, usually for older cars. A zero-betterment or betterment-waiver add-on can reduce that surprise cost if the insurer offers it.',
    advisory: 'Do not claim any insurer has zero betterment unless verified by insurer knowledge.',
  },
  {
    id: 'excess',
    title: 'Excess',
    aliases: ['excess', 'deductible', 'compulsory excess'],
    explanation: 'Excess is the amount the customer pays first before the insurer pays the rest of an approved claim. It can apply because of policy terms, driver age, vehicle use, or insurer rules.',
    advisory: 'Explain it as the customer share of a claim, not an extra premium.',
  },
  {
    id: 'market_value',
    title: 'Market value',
    aliases: ['market value', 'current market value', 'car value'],
    explanation: 'Market value is the estimated current value of the car at the time of insurance or claim. If the car is a total loss, settlement is usually based on the market value subject to policy terms.',
    advisory: 'Explain that it may move over time and must be verified by insurer/valuation data for final issuance.',
  },
  {
    id: 'agreed_value',
    title: 'Agreed value',
    aliases: ['agreed value', 'agreed-value'],
    explanation: 'Agreed value means the insurer and customer agree upfront on the insured value for the policy. If a covered total loss happens, that agreed amount is usually the reference amount, subject to policy terms.',
    advisory: 'Do not say a quote is agreed value unless the quote data or insurer fact says so.',
  },
  {
    id: 'road_tax',
    title: 'Road tax',
    aliases: ['road tax', 'roadtax', 'myjpj', 'digital road tax'],
    explanation: 'Road tax is separate from insurance, but it can usually be renewed after insurance is active. Digital road tax appears in MyJPJ; printed road tax availability depends on current JPJ rules and owner type.',
    advisory: 'Do not promise physical road tax unless the current owner type and road tax rule allows it.',
  },
  {
    id: 'sum_insured',
    title: 'Sum insured',
    aliases: ['sum insured', 'insured amount', 'coverage amount'],
    explanation: 'Sum insured is the amount the vehicle is insured for. Higher sum insured can give more protection for total loss, but the premium can also be higher.',
    advisory: 'When comparing quotes, pair sum insured with price so the user sees the tradeoff.',
  },
  {
    id: 'e_hailing',
    title: 'E-hailing cover',
    aliases: ['e-hailing', 'ehailing', 'grab', 'indrive', 'ride sharing', 'rideshare'],
    explanation: 'E-hailing cover is needed when a private car is used to carry passengers through services like Grab or similar platforms. Without the right cover, a work-related claim may be rejected or limited.',
    advisory: 'Ask whether the car is used for e-hailing before recommending or skipping this add-on.',
  },
];

function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasMatches(text, alias) {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(alias).replace(/\s+/g, '\\s+')}(?=$|[^a-z0-9])`, 'i');
  return pattern.test(text);
}

export function findInsuranceConcepts(message, options = {}) {
  const text = normalize(message);
  if (!text) return [];

  const limit = Number(options.limit || 3);
  const matches = CONCEPTS.filter((concept) =>
    concept.aliases.some((alias) => aliasMatches(text, alias))
  );

  return matches.slice(0, limit);
}

export function hasInsuranceConcept(message) {
  return findInsuranceConcepts(message, { limit: 1 }).length > 0;
}

export function isLikelyInsurerSpecificQuestion(message) {
  const text = normalize(message);
  if (!text) return false;

  return (
    /\b(which|what)\s+insurer\b/.test(text) ||
    /\b(does|do|did|can|will|would|is|are)\s+(allianz|etiqa|takaful|ikhlas|tokio|marine|lonpac|msig|generali)\b/.test(text) ||
    /\b(allianz|etiqa|takaful|ikhlas|tokio|marine|lonpac|msig|generali)\b.*\b(include|cover|offer|has|have|provide|better|best|zero)\b/.test(text) ||
    /\b(zero\s+betterment|which one|which is better|compare|versus|vs\.?)\b/.test(text)
  );
}

export function shouldUseGeneralConceptAnswer(message) {
  return hasInsuranceConcept(message) && !isLikelyInsurerSpecificQuestion(message);
}

export function buildInsuranceConceptInstruction(message, state) {
  const concepts = findInsuranceConcepts(message, { limit: 3 });
  if (concepts.length === 0) return null;

  const conceptLines = concepts.map((concept, index) => (
    `${index + 1}. ${concept.title}\n` +
    `   Simple explanation: ${concept.explanation}\n` +
    `   Advisory rule: ${concept.advisory}`
  )).join('\n');

  const selectedQuote = state?.selectedQuote
    ? `Selected insurer context: ${state.selectedQuote.insurer || 'selected insurer'} at RM ${state.selectedQuote.priceAfter || state.selectedQuote.price || 'current quote'}.`
    : 'No insurer has been selected yet.';

  return `APPROVED GENERAL INSURANCE CONCEPTS
The user mentioned common Malaysian motor insurance concept(s). These are approved general explanations and may be used without insurer PDF retrieval.

${conceptLines}

Current context:
- Current checkpoint: ${state?.step || 'unknown'}
- ${selectedQuote}

Response rules:
- Answer the concept question first in layman terms.
- If the user asks about a specific insurer, do not treat this general explanation as insurer-specific proof.
- Do not invent insurer-specific inclusions, exclusions, limits, or add-on availability.
- After answering, return to the current renewal decision with one clear next question.`;
}

export { CONCEPTS as INSURANCE_CONCEPTS };

export default buildInsuranceConceptInstruction;
