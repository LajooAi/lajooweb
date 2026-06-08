import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  buildSemanticKnowledgeResult,
  buildRelevantKnowledgeSnippet,
  embeddingToPgVector,
  mergeSemanticAndKeywordResults,
  shouldUseSemanticKnowledgeSearch,
} from '../src/server/knowledge/semanticSearch.js';

function fakeEmbedding(value = 0.01) {
  return Array.from({ length: KNOWLEDGE_EMBEDDING_DIMENSIONS }, () => value);
}

test('semantic knowledge search only enables when allowed and an API key is present', () => {
  assert.equal(shouldUseSemanticKnowledgeSearch({ setting: 'false', apiKey: 'sk-test' }), false);
  assert.equal(shouldUseSemanticKnowledgeSearch({ setting: 'auto', apiKey: '' }), false);
  assert.equal(shouldUseSemanticKnowledgeSearch({ setting: 'auto', apiKey: 'sk-test' }), true);
  assert.equal(shouldUseSemanticKnowledgeSearch({ enabled: false, apiKey: 'sk-test' }), false);
  assert.equal(shouldUseSemanticKnowledgeSearch({ enabled: true, apiKey: '' }), false);
});

test('embeddingToPgVector validates dimensions and numeric values', () => {
  const vector = embeddingToPgVector(fakeEmbedding(0.123456789));

  assert.match(vector, /^\[/);
  assert.match(vector, /\]$/);
  assert.equal(vector.split(',').length, KNOWLEDGE_EMBEDDING_DIMENSIONS);
  assert.throws(() => embeddingToPgVector([1, 2, 3]), /1536 dimensions/);
  assert.throws(() => embeddingToPgVector([...fakeEmbedding(0.1).slice(0, -1), Number.NaN]), /non-numeric/);
});

test('semantic result keeps source page, document path, and similarity', () => {
  const result = buildSemanticKnowledgeResult({
    id: 'chunk_1',
    chunkText: 'Roadside assistance is available when the covered car breaks down.',
    pageNumber: 3,
    documentTitle: 'Private Car Roadside Assistance',
    sourceFileName: 'roadside.pdf',
    sourceRelativePath: 'allianz/private-car/private-car-roadside-assistance-en.pdf',
    insurerCode: 'ALLIANZ',
    insurerName: 'Allianz Insurance',
    similarity: 0.721234,
    embeddingModel: 'text-embedding-3-small',
  });

  assert.equal(result.id, 'db-semantic-chunk-chunk_1');
  assert.equal(result.sourceType, 'db_semantic_chunk');
  assert.equal(result.sourcePage, 3);
  assert.equal(result.sourceRelativePath, 'allianz/private-car/private-car-roadside-assistance-en.pdf');
  assert.equal(result.sourceLabel, 'allianz/private-car/private-car-roadside-assistance-en.pdf (p. 3)');
  assert.equal(result.insurerCode, 'ALLIANZ');
  assert.equal(result.semanticSimilarity, 0.7212);
  assert.match(result.question, /Allianz Insurance/);
});

test('semantic snippets prefer the relevant wording instead of PDF headers', () => {
  const text = [
    'Allianz General Insurance Company Malaysia Berhad Product Disclosure Sheet header wording.',
    'This page contains general introduction text that is not the answer.',
    'Roadside assistance and towing support may be available subject to the terms in this document.',
    'More unrelated footer wording follows after the useful sentence.',
  ].join(' '.repeat(20));

  const snippet = buildRelevantKnowledgeSnippet(text, 'does Allianz help if my car breaks down?', 160);

  assert.match(snippet, /Roadside assistance/i);
  assert.doesNotMatch(snippet, /^Allianz General Insurance/);
});

test('semantic and keyword results dedupe by source while preserving stronger score', () => {
  const semantic = {
    id: 'db-semantic-chunk-1',
    question: 'Allianz: Roadside',
    answer: 'Roadside assistance wording',
    sourceRelativePath: 'allianz/private-car/roadside.pdf',
    sourcePage: 1,
    sourceType: 'db_semantic_chunk',
    score: 17,
  };
  const keywordDuplicate = {
    id: 'db-chunk-1',
    question: 'Allianz: Roadside',
    answer: 'Roadside assistance wording',
    sourceRelativePath: 'allianz/private-car/roadside.pdf',
    sourcePage: 1,
    sourceType: 'db_chunk',
    score: 5,
  };
  const keywordUnique = {
    id: 'db-chunk-2',
    question: 'Etiqa: Towing',
    answer: 'Towing wording',
    sourceRelativePath: 'etiqa/private-car/towing.pdf',
    sourcePage: 2,
    sourceType: 'db_chunk',
    score: 6,
  };

  const results = mergeSemanticAndKeywordResults([semantic], [keywordDuplicate, keywordUnique], 6);

  assert.equal(results.length, 2);
  assert.equal(results[0].id, 'db-semantic-chunk-1');
  assert.equal(results[1].id, 'db-chunk-2');
});
