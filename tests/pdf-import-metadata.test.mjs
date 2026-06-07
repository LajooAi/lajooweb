import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  classifyKnowledgePdf,
  summarizeKnowledgePdfMetadata,
} from '../src/server/knowledge/pdfMetadata.js';

const root = path.resolve(process.cwd(), 'knowledge/raw-pdfs');

function classify(relativePath) {
  return classifyKnowledgePdf(root, path.join(root, relativePath));
}

test('classifies Allianz nested private-car PDFs without using parent folder as insurer', () => {
  const file = classify('allianz/private-car/private-car-comprehensive-pds-en.pdf');

  assert.equal(file.knownInsurer, true);
  assert.equal(file.insurerSlug, 'allianz');
  assert.equal(file.insurerCode, 'ALLIANZ');
  assert.equal(file.category, 'private-car');
  assert.equal(file.productType, 'private-car');
  assert.equal(file.documentType, 'product_disclosure_sheet');
  assert.equal(file.coverageFamily, 'comprehensive');
  assert.equal(file.language, 'en');
  assert.equal(file.useForPrivateCarMvp, true);
});

test('classifies Takaful certificate wording as private-car MVP knowledge', () => {
  const file = classify('takaful-ikhlas/private-car/private-car-comprehensive-plus-certificate-new-en.pdf');

  assert.equal(file.insurerCode, 'TAKAFUL');
  assert.equal(file.insurerType, 'TAKAFUL');
  assert.equal(file.category, 'private-car');
  assert.equal(file.documentType, 'certificate_wording');
  assert.equal(file.coverageFamily, 'comprehensive_plus');
  assert.equal(file.language, 'en');
  assert.equal(file.useForPrivateCarMvp, true);
});

test('classifies Tokio Marine Chinese claim guide correctly', () => {
  const file = classify('tokio-marine/private-car/private-car-claim-guide-cn.pdf');

  assert.equal(file.insurerCode, 'TOKIO');
  assert.equal(file.category, 'private-car');
  assert.equal(file.documentType, 'claims_guide');
  assert.equal(file.language, 'cn');
  assert.equal(file.useForPrivateCarMvp, true);
});

test('classifies BM roadside assistance and add-on documents', () => {
  const roadside = classify('generali/private-car/private-car-road-assistant-bm.pdf');
  const specialPerils = classify('generali/private-car/private-car-special-perils-en.pdf');

  assert.equal(roadside.insurerCode, 'GENERALI');
  assert.equal(roadside.documentType, 'roadside_assistance');
  assert.equal(roadside.language, 'bm');
  assert.equal(roadside.useForPrivateCarMvp, true);

  assert.equal(specialPerils.documentType, 'add_on_terms');
  assert.equal(specialPerils.language, 'en');
  assert.equal(specialPerils.useForPrivateCarMvp, true);
});

test('keeps third-party files out of private-car MVP scope', () => {
  const file = classify('etiqa/private-car/private-car-third-party-pds-en.pdf');

  assert.equal(file.insurerCode, 'ETIQA');
  assert.equal(file.category, 'private-car');
  assert.equal(file.coverageFamily, 'third_party');
  assert.equal(file.useForPrivateCarMvp, false);
});

test('keeps private-car marketing product PDFs inside MVP review scope', () => {
  const file = classify('msig/private-car/private-car-lady-motor-plus.pdf');

  assert.equal(file.insurerCode, 'MSIG');
  assert.equal(file.category, 'private-car');
  assert.equal(file.documentType, 'brochure');
  assert.equal(file.coverageFamily, 'comprehensive_plus');
  assert.equal(file.useForPrivateCarMvp, true);
});

test('summary counts insurers, categories, document types, and languages', () => {
  const files = [
    classify('allianz/private-car/private-car-road-warrior-pds.en.pdf'),
    classify('generali/private-car/private-car-comprehensive-pds-bm.pdf'),
    classify('tokio-marine/private-car/private-car-claim-guide-cn.pdf'),
  ];
  const summary = summarizeKnowledgePdfMetadata(files);

  assert.equal(summary.totalPdfs, 3);
  assert.equal(summary.byInsurer.allianz, 1);
  assert.equal(summary.byCategory['private-car'], 3);
  assert.equal(summary.byDocumentType.product_disclosure_sheet, 2);
  assert.equal(summary.byDocumentType.claims_guide, 1);
  assert.equal(summary.byLanguage.en, 1);
  assert.equal(summary.byLanguage.bm, 1);
  assert.equal(summary.byLanguage.cn, 1);
});
