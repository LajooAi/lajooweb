import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStructuredRecommendationParagraphs,
} from '../src/server/ai/structuredResponseFormatting.js';

test('normalizes quote recommendation labels into separate markdown paragraphs', () => {
  const compact = '**My pick:** **Tokio Marine Insurance** — **RM 800**\n**Why:** Best balance of premium and sum insured.\n**Trade-off:** Takaful is cheaper by RM 4.\n**Next:** Want to go with **Tokio Marine Insurance**?';

  const normalized = normalizeStructuredRecommendationParagraphs(compact);

  assert.equal(
    normalized,
    '**My pick:** **Tokio Marine Insurance** — **RM 800**\n\n**Why:** Best balance of premium and sum insured.\n\n**Trade-off:** Takaful is cheaper by RM 4.\n\n**Next:** Want to go with **Tokio Marine Insurance**?'
  );
});

test('normalizes same-line quote recommendation labels without changing label wording', () => {
  const compact = '**My pick:** **Tokio Marine Insurance** — **RM 800** **Why:** Best balance. **Trade-off:** Close call. **Next:** Choose Tokio or Takaful?';

  const normalized = normalizeStructuredRecommendationParagraphs(compact);

  assert.match(normalized, /\*\*RM 800\*\*\n\n\*\*Why:\*\*/);
  assert.match(normalized, /Best balance\.\n\n\*\*Trade-off:\*\*/);
  assert.match(normalized, /Close call\.\n\n\*\*Next:\*\*/);
});

test('does not alter normal explanatory replies with a single why label', () => {
  const normal = 'Here is why: Special Perils matters if you park in a flood-prone area.';

  assert.equal(normalizeStructuredRecommendationParagraphs(normal), normal);
});
