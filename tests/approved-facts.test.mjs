import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApprovedFactsInstruction,
  findApprovedFactsForMessage,
  getApprovedFactsData,
  getApprovedPrivateCarFacts,
  inferFactTagsFromMessage,
} from '../src/server/insurance/approvedFactStore.js';

test('approved facts data is founder-approved and non-empty', () => {
  const data = getApprovedFactsData();

  assert.equal(data.scope.approvalStatus, 'approved_seed_facts');
  assert.ok(data.facts.length >= 50);
  assert.ok(data.facts.every((fact) => fact.approvedForAi === true));
});

test('betterment questions retrieve zero/waiver/buyback facts', () => {
  const tags = inferFactTagsFromMessage('which insurer has zero betterment for my old car?');
  const facts = findApprovedFactsForMessage('which insurer has zero betterment for my old car?', { limit: 10 });
  const text = facts.map((fact) => `${fact.insurerName} ${fact.statement}`).join(' ');

  assert.ok(tags.includes('betterment'));
  assert.match(text, /Tokio Marine/i);
  assert.match(text, /zero betterment|waiver|buyback/i);
});

test('tesla questions retrieve EV-specific facts', () => {
  const facts = findApprovedFactsForMessage('which insurance is best for Tesla EV charger and towing?', { limit: 10 });
  const text = facts.map((fact) => `${fact.insurerName} ${fact.statement}`).join(' ');

  assert.match(text, /Etiqa/i);
  assert.match(text, /Tesla Ensure/i);
  assert.match(text, /Allianz|MSIG|Tokio Marine/i);
});

test('brand suitability questions retrieve approved brand-program guidance', () => {
  const facts = findApprovedFactsForMessage('is takaful good for my Perodua Myvi and why?', { limit: 10 });
  const text = facts.map((fact) => `${fact.id} ${fact.statement} ${fact.advisorUse}`).join(' ');

  assert.match(text, /perodua-total-protect-plus/i);
  assert.match(text, /Perodua vehicles purchased through Perodua franchises and dealers/i);
  assert.match(text, /not say Takaful is automatically best for every Perodua/i);
});

test('honda brand questions retrieve stronger programme benefits', () => {
  const facts = findApprovedFactsForMessage('which insurance is good for Honda City betterment and towing?', { limit: 10 });
  const text = facts.map((fact) => `${fact.id} ${fact.statement}`).join(' ');

  assert.match(text, /honda-takaful-program/i);
  assert.match(text, /waiver of betterment/i);
  assert.match(text, /unlimited towing/i);
});

test('insurer filtering keeps requested insurer plus market guidance', () => {
  const facts = getApprovedPrivateCarFacts({
    insurerSlug: 'allianz',
    tags: ['towing'],
    limit: 5,
  });

  assert.ok(facts.length > 0);
  assert.ok(facts.every((fact) => ['allianz', 'market'].includes(fact.insurerSlug)));
  assert.match(facts.map((fact) => fact.statement).join(' '), /Road|towing|tow/i);
});

test('approved facts instruction includes compliance guardrail', () => {
  const instruction = buildApprovedFactsInstruction('does Etiqa cover Tesla charger and towing?', { limit: 6 });

  assert.match(instruction, /APPROVED INSURER KNOWLEDGE/);
  assert.match(instruction, /do not invent/i);
  assert.match(instruction, /Tesla|EV|charger/i);
});

test('strict dated-facts mode blocks undated static seed facts', () => {
  const previous = process.env.LAJOO_AI_REQUIRE_DATED_FACTS;
  process.env.LAJOO_AI_REQUIRE_DATED_FACTS = 'true';

  try {
    assert.deepEqual(
      findApprovedFactsForMessage('does Etiqa cover Tesla charger and towing?', { limit: 6 }),
      []
    );
    assert.equal(
      buildApprovedFactsInstruction('does Etiqa cover Tesla charger and towing?', { limit: 6 }),
      null
    );
  } finally {
    if (previous === undefined) {
      delete process.env.LAJOO_AI_REQUIRE_DATED_FACTS;
    } else {
      process.env.LAJOO_AI_REQUIRE_DATED_FACTS = previous;
    }
  }
});
