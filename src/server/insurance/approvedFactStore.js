import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const APPROVED_FACTS_PATH = path.join(process.cwd(), 'knowledge/approved-facts.private-car.json');

let cachedFactsData = null;

const TOPIC_TAGS = [
  {
    tags: ['betterment', 'zero_betterment', 'waiver_betterment', 'older_car'],
    patterns: [/\bbetterment\b/i, /\bzero\s+betterment\b/i, /\bwaiver\b/i, /\bold(er)?\s+car\b/i, /\bspare\s+parts?\b/i],
  },
  {
    tags: ['windscreen', 'glass', 'ncd_safe', 'sum_insured'],
    patterns: [/\bwindscreen\b/i, /\bwindshield\b/i, /\bglass\b/i, /\btint/i, /\bsunroof\b/i],
  },
  {
    tags: ['flood', 'special_perils', 'natural_disaster'],
    patterns: [/\bflood\b/i, /\bspecial\s+perils?\b/i, /\bnatural\s+disaster\b/i, /\blandslide\b/i, /\bstorm\b/i, /\bmonsoon\b/i],
  },
  {
    tags: ['roadside', 'towing', 'unlimited_towing', 'long_distance', 'breakdown'],
    patterns: [/\btow/i, /\btowing\b/i, /\broadside\b/i, /\bbreakdown\b/i, /\bhighway\b/i, /\boutstation\b/i, /\bstranded\b/i],
  },
  {
    tags: ['ev', 'tesla', 'charger', 'charging_cable', 'out_of_charge_towing'],
    patterns: [/\bev\b/i, /\belectric\b/i, /\btesla\b/i, /\bcharger\b/i, /\bcharging\b/i, /\bbattery\b/i],
  },
  {
    tags: ['e_hailing', 'grab', 'private_hire'],
    patterns: [/\be-?hailing\b/i, /\bgrab\b/i, /\bprivate\s+hire\b/i, /\bfare\b/i],
  },
  {
    tags: ['low_mileage', 'usage_based', 'cashback', 'budget'],
    patterns: [/\blow\s+mileage\b/i, /\bdrive\s+less\b/i, /\bwork\s+from\s+home\b/i, /\bcashback\b/i, /\bcheapest\b/i, /\bbudget\b/i],
  },
  {
    tags: ['takaful', 'shariah', 'islamic'],
    patterns: [/\btakaful\b/i, /\bshariah\b/i, /\bsyariah\b/i, /\bislamic\b/i, /\bhalal\b/i],
  },
  {
    tags: ['brand_program', 'perodua', 'myvi'],
    patterns: [/\bperodua\b/i, /\bmyvi\b/i, /\bbezza\b/i, /\baxia\b/i, /\balza\b/i, /\bativa\b/i],
  },
  {
    tags: ['brand_program', 'proton'],
    patterns: [/\bproton\b/i, /\bsaga\b/i, /\bpersona\b/i, /\biriz\b/i, /\bx50\b/i, /\bx70\b/i, /\bx90\b/i],
  },
  {
    tags: ['brand_program', 'honda'],
    patterns: [/\bhonda\b/i, /\bcity\b/i, /\bcivic\b/i, /\bhr-?v\b/i, /\bcr-?v\b/i, /\baccord\b/i],
  },
  {
    tags: ['brand_program', 'subaru'],
    patterns: [/\bsubaru\b/i, /\bforester\b/i, /\bxv\b/i, /\boutback\b/i],
  },
  {
    tags: ['brand_program', 'jetour'],
    patterns: [/\bjetour\b/i, /\bdashing\b/i],
  },
];

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function loadFactsData() {
  if (cachedFactsData) return cachedFactsData;
  cachedFactsData = JSON.parse(fs.readFileSync(APPROVED_FACTS_PATH, 'utf-8'));
  return cachedFactsData;
}

function scoreFact(fact, { insurerSlug = null, tags = [], message = '' } = {}) {
  const text = normalizeText(`${fact.statement} ${fact.advisorUse} ${(fact.tags || []).join(' ')}`);
  const normalizedMessage = normalizeText(message);
  let score = 0;

  if (insurerSlug && fact.insurerSlug === insurerSlug) score += 5;
  if (fact.insurerSlug === 'market') score += 1.2;

  for (const tag of tags) {
    if (fact.tags?.includes(tag)) score += 2;
  }

  for (const token of normalizedMessage.split(' ').filter((part) => part.length >= 4)) {
    if (text.includes(token)) score += 0.2;
  }

  if (fact.confidence === 'high') score += 0.4;
  if (fact.confidence === 'medium') score += 0.1;

  return score;
}

export function getApprovedFactsData() {
  return loadFactsData();
}

export function inferFactTagsFromMessage(message = '') {
  const tags = new Set();
  for (const topic of TOPIC_TAGS) {
    if (topic.patterns.some((pattern) => pattern.test(message))) {
      topic.tags.forEach((tag) => tags.add(tag));
    }
  }
  return [...tags];
}

export function getApprovedPrivateCarFacts({ insurerSlug = null, tags = [], category = null, limit = 12 } = {}) {
  const data = loadFactsData();
  let facts = data.facts.filter((fact) => fact.approvedForAi);

  if (insurerSlug) {
    facts = facts.filter((fact) => fact.insurerSlug === insurerSlug || fact.insurerSlug === 'market');
  }
  if (category) {
    facts = facts.filter((fact) => fact.category === category);
  }
  if (tags.length > 0) {
    facts = facts.filter((fact) => tags.some((tag) => fact.tags?.includes(tag)));
  }

  return facts
    .sort((a, b) => scoreFact(b, { insurerSlug, tags }) - scoreFact(a, { insurerSlug, tags }))
    .slice(0, limit);
}

export function findApprovedFactsForMessage(message = '', { insurerSlug = null, limit = 8 } = {}) {
  const tags = inferFactTagsFromMessage(message);
  if (tags.length === 0 && !insurerSlug) return [];

  const data = loadFactsData();
  return data.facts
    .filter((fact) => fact.approvedForAi)
    .map((fact) => ({
      fact,
      score: scoreFact(fact, { insurerSlug, tags, message }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.fact);
}

export function buildApprovedFactsInstruction(message = '', options = {}) {
  const facts = findApprovedFactsForMessage(message, options);
  if (facts.length === 0) return null;

  const lines = [
    'APPROVED INSURER KNOWLEDGE',
    'Use only these approved facts when making insurer-specific statements. If the answer needs a fact not listed here, say LAJOO needs to verify it before confirming.',
  ];

  facts.forEach((fact, index) => {
    lines.push(`${index + 1}. ${fact.insurerName}: ${fact.statement}`);
    if (fact.advisorUse) lines.push(`   Advisor use: ${fact.advisorUse}`);
  });

  lines.push('Compliance: do not invent insurer benefits, limits, claim quality, pricing, or add-on availability beyond these facts and the live quote.');
  return lines.join('\n');
}

export default getApprovedPrivateCarFacts;
