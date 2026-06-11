import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuoteStepClosePrompt,
  containsStaleQuoteStepClose,
  hasQuoteStepSelectionClose,
  replaceStaleQuoteStepClose,
} from '../src/server/ai/quoteStepClose.js';
import { getQuotes } from '../src/lib/insuranceData.js';

test('quote step close asks for insurer decision after a recommendation', () => {
  const prompt = buildQuoteStepClosePrompt({
    context: {
      quoteRecommendation: {
        recommendedQuote: { insurerName: 'Tokio Marine Insurance', finalPremium: 800 },
        scoredQuotes: [
          { insurerName: 'Tokio Marine Insurance', finalPremium: 800 },
          { insurerName: 'Takaful Ikhlas Insurance', finalPremium: 796 },
        ],
      },
    },
  });

  assert.match(prompt, /go with \*\*Tokio Marine Insurance - RM 800.00\*\*/i);
  assert.match(prompt, /cheapest option \*\*Takaful Ikhlas Insurance - RM 796.00\*\*/i);
  assert.match(prompt, /explore other insurers/i);
  assert.doesNotMatch(prompt, /quick side-by-side/i);
  assert.doesNotMatch(prompt, /go with this/i);
});

test('quote step close rejects stale comparison-or-recommend loop', () => {
  const stale = 'Next: Want to go with this, or would you like the cheapest option or a full comparison?';
  const replacement = buildQuoteStepClosePrompt({
    context: {
      quoteRecommendation: {
        recommendedQuote: { insurerName: 'Tokio Marine Insurance', finalPremium: 800 },
        scoredQuotes: [
          { insurerName: 'Tokio Marine Insurance', finalPremium: 800 },
          { insurerName: 'Takaful Ikhlas Insurance', finalPremium: 796 },
        ],
      },
    },
  });
  const fixed = replaceStaleQuoteStepClose(`Summary done.\n\n${stale}`, replacement);

  assert.equal(containsStaleQuoteStepClose(stale), true);
  assert.equal(hasQuoteStepSelectionClose(stale), false);
  assert.match(fixed, /Would you like to go with \*\*Tokio Marine Insurance - RM 800.00\*\*/i);
  assert.match(fixed, /cheapest option \*\*Takaful Ikhlas Insurance - RM 796.00\*\*/i);
  assert.doesNotMatch(fixed, /go with this/i);
  assert.equal(hasQuoteStepSelectionClose(fixed), true);
});

test('quote step close treats direct advice as already recommended', () => {
  const response = `Here's my advice: **Tokio Marine Insurance** at **RM 800.00** is my top pick.

It gives a strong balance of price and coverage.`;
  const prompt = buildQuoteStepClosePrompt({
    state: {
      vehicleInfo: {
        quoteOptions: getQuotes(),
      },
    },
    context: {
      messages: [{ role: 'user', content: 'what is your advice?' }],
    },
    response,
  });

  assert.match(prompt, /Want me to select \*\*Tokio Marine Insurance - RM 800.00\*\*/i);
  assert.match(prompt, /compare with another insurer/i);
  assert.doesNotMatch(prompt, /Would you like my recommendation/i);
  assert.doesNotMatch(prompt, /choose one of these/i);
});

test('quote step close keeps soft good-question close focused on the recommendation', () => {
  const response = `If you're looking for the best balance, **Tokio Marine Insurance at RM 800.00** is a solid choice.`;
  const prompt = buildQuoteStepClosePrompt({
    state: {
      vehicleInfo: {
        quoteOptions: getQuotes(),
      },
    },
    context: {
      quoteRecommendation: {
        recommendedQuote: { insurerName: 'Tokio Marine Insurance', finalPremium: 800 },
        scoredQuotes: [
          { insurerName: 'Tokio Marine Insurance', finalPremium: 800 },
          { insurerName: 'Takaful Ikhlas Insurance', finalPremium: 796 },
        ],
      },
      messages: [{ role: 'user', content: 'which is good' }],
    },
    response,
  });

  assert.match(prompt, /Want me to select \*\*Tokio Marine Insurance - RM 800.00\*\*/i);
  assert.match(prompt, /compare with another insurer/i);
  assert.doesNotMatch(prompt, /Takaful Ikhlas Insurance/i);
  assert.doesNotMatch(prompt, /cheapest option/i);
});

test('quote step close replaces generic recommendation close after advice was already given', () => {
  const response = `Here's my advice: **Tokio Marine Insurance** at **RM 800.00** is my top pick.

Would you like my recommendation, or do you want to choose one of these: **Takaful**, **Etiqa**, **Allianz**, **Tokio Marine**, **Lonpac**, **MSIG**, or **Generali**?`;
  const closePrompt = buildQuoteStepClosePrompt({
    state: {
      vehicleInfo: {
        quoteOptions: getQuotes(),
      },
    },
    context: {
      messages: [{ role: 'user', content: 'what is your advice?' }],
    },
    response,
  });
  const fixed = replaceStaleQuoteStepClose(response, closePrompt);

  assert.match(fixed, /Want me to select \*\*Tokio Marine Insurance - RM 800.00\*\*/i);
  assert.doesNotMatch(fixed, /Would you like my recommendation/i);
  assert.doesNotMatch(fixed, /choose one of these/i);
});

test('quote step close replaces soft prefer-my-recommendation close when user asked for advice', () => {
  const response = `To make the best choice, **Tokio Marine Insurance** offers a strong balance with a premium of **RM 800.00**.

Let me know if you'd prefer my recommendation, or if you want to choose one of these: **Takaful**, **Etiqa**, **Allianz**, **Tokio Marine**, **Lonpac**, **MSIG**, or **Generali**.`;
  const closePrompt = buildQuoteStepClosePrompt({
    state: {
      vehicleInfo: {
        quoteOptions: getQuotes(),
      },
    },
    context: {
      quoteRecommendation: {
        recommendedQuote: { insurerName: 'Tokio Marine Insurance', finalPremium: 800 },
      },
      messages: [{ role: 'user', content: 'what is your advice?' }],
    },
    response,
  });
  const fixed = replaceStaleQuoteStepClose(response, closePrompt);

  assert.match(fixed, /Want me to select \*\*Tokio Marine Insurance - RM 800.00\*\*/i);
  assert.doesNotMatch(fixed, /prefer my recommendation/i);
  assert.doesNotMatch(fixed, /choose one of these/i);
});

test('quote step close makes advice close decisive instead of reopening alternatives', () => {
  const response = `**My pick:** **Tokio Marine Insurance** — **RM 800.00**

**Why:** It offers a strong balance between premium cost and sum insured.

**Trade-off:** Takaful Ikhlas Insurance is only RM 4 cheaper.

Would you like to go with **Tokio Marine Insurance - RM 800.00**, choose the cheapest option **Takaful Ikhlas Insurance - RM 796.00**, or explore other options?`;
  const closePrompt = buildQuoteStepClosePrompt({
    state: {
      vehicleInfo: {
        quoteOptions: getQuotes(),
      },
    },
    context: {
      quoteRecommendation: {
        recommendedQuote: { insurerName: 'Tokio Marine Insurance', finalPremium: 800 },
        scoredQuotes: [
          { insurerName: 'Tokio Marine Insurance', finalPremium: 800 },
          { insurerName: 'Takaful Ikhlas Insurance', finalPremium: 796 },
        ],
      },
      messages: [{ role: 'user', content: 'what is your advice?' }],
    },
    response,
  });
  const fixed = replaceStaleQuoteStepClose(response, closePrompt);

  assert.match(fixed, /Want me to select \*\*Tokio Marine Insurance - RM 800.00\*\*/i);
  assert.match(fixed, /compare with another insurer/i);
  assert.doesNotMatch(fixed, /choose the cheapest option/i);
});

test('quote step close rejects vague cheapest-option question without insurer name', () => {
  const vague = '**Next:** Do you want to go with **Tokio Marine**, choose the cheapest option, or compare all insurers?';
  const specific = '**Next:** Do you want to go with **Tokio Marine Insurance - RM 800.00**, choose the cheapest option **Takaful Ikhlas Insurance - RM 796.00**, or explore others?';

  assert.equal(containsStaleQuoteStepClose(vague), true);
  assert.equal(hasQuoteStepSelectionClose(vague), false);
  assert.equal(hasQuoteStepSelectionClose(specific), true);
});

test('generic quote step close still supports flexible choice', () => {
  const prompt = buildQuoteStepClosePrompt();

  assert.match(prompt, /my recommendation/i);
  assert.match(prompt, /choose one of these/i);
  assert.match(prompt, /Takaful/i);
  assert.equal(hasQuoteStepSelectionClose(prompt), true);
});
