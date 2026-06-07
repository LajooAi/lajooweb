import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVerifiedFactCandidatesForDocument,
} from '../src/server/knowledge/factExtraction.js';

function makeDocument(overrides = {}) {
  return {
    id: 'doc_1',
    insurerId: 'insurer_1',
    title: 'Private Car Comprehensive Add-ons',
    sourceFileName: 'private-car-addons-en.pdf',
    sourceRelativePath: 'allianz/private-car/private-car-addons-en.pdf',
    category: 'private-car',
    documentType: 'add_on_terms',
    useForPrivateCarMvp: true,
    extractedText: '',
    insurer: {
      code: 'ALLIANZ',
      name: 'Allianz General Insurance Company (Malaysia) Berhad',
    },
    ...overrides,
  };
}

test('extracts conservative private-car add-on facts from imported PDF text', () => {
  const document = makeDocument({
    extractedText: `
      Optional cover includes windscreen glass cover and tinted film.
      Special perils cover may include flood, storm, and landslide.
      Waiver of betterment is subject to eligibility and policy terms.
    `,
  });

  const facts = buildVerifiedFactCandidatesForDocument(document);
  const categories = facts.map((fact) => fact.category);

  assert.ok(categories.includes('windscreen'));
  assert.ok(categories.includes('flood'));
  assert.ok(categories.includes('betterment'));
  assert.ok(facts.every((fact) => fact.status === 'VERIFIED'));
  assert.ok(facts.every((fact) => fact.value.includes('imported private-car')));
});

test('extracted facts inherit page evidence and document validity when chunks are available', () => {
  const document = makeDocument({
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: new Date('2026-12-31T00:00:00Z'),
    extractedText: 'General policy text.',
    chunks: [
      {
        pageNumber: 7,
        chunkOrder: 1,
        chunkText: 'Optional cover includes windscreen glass cover and tinted film.',
      },
    ],
  });

  const facts = buildVerifiedFactCandidatesForDocument(document);
  const windscreenFact = facts.find((fact) => fact.category === 'windscreen');

  assert.ok(windscreenFact);
  assert.equal(windscreenFact.sourcePage, 7);
  assert.equal(windscreenFact.validFrom, document.effectiveFrom);
  assert.equal(windscreenFact.validTo, document.effectiveTo);
});

test('extracts roadside facts from roadside assistance documents', () => {
  const facts = buildVerifiedFactCandidatesForDocument(makeDocument({
    title: 'Private Car Roadside Assistance',
    sourceRelativePath: 'allianz/private-car/private-car-road-assistant-tnc-en.pdf',
    documentType: 'roadside_assistance',
    extractedText: 'Roadside assistance and towing are available under the relevant assistance wording after breakdown.',
  }));

  assert.ok(facts.some((fact) => fact.category === 'roadside'));
});

test('does not extract private-car MVP facts from out-of-scope documents', () => {
  const facts = buildVerifiedFactCandidatesForDocument(makeDocument({
    category: 'motorcycle',
    useForPrivateCarMvp: false,
    extractedText: 'Windscreen betterment towing flood roadside assistance.',
  }));

  assert.deepEqual(facts, []);
});

test('extracts brand-program suitability facts without overclaiming recommendation quality', () => {
  const facts = buildVerifiedFactCandidatesForDocument(makeDocument({
    sourceRelativePath: 'tokio-marine/private-car/private-car-perodua-programme-en.pdf',
    insurer: {
      code: 'TOKIO',
      name: 'Tokio Marine Insurans (Malaysia) Berhad',
    },
    documentType: 'brochure',
    extractedText: 'Private car brochure for Perodua owner programme and support.',
  }));

  const brandFact = facts.find((fact) => fact.category === 'brand_program');
  assert.ok(brandFact);
  assert.ok(brandFact.tags.includes('perodua'));
  assert.match(brandFact.value, /Do not say it is automatically best/i);
  assert.equal(brandFact.status, 'DRAFT');
  assert.equal(brandFact.confidence, 'low');
  assert.match(brandFact.advisorUse, /Admin must verify/i);
});
