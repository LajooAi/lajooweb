import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashSensitiveText,
  maskSensitiveText,
} from '../src/lib/piiMasking.js';
import {
  appendAssistantMessageForStorage,
  resolveMessagesForTurn,
  sanitizeChatMessages,
} from '../src/server/chat/sessionStore.js';

test('PII masking redacts Malaysian renewal identifiers without hiding prices', () => {
  const raw = 'jrt 9289 951018145405 founder@lajoo.com 0123456789 No 12, Jalan Setia 1, 47000 Shah Alam. RM 995.00 NCD 20%';
  const masked = maskSensitiveText(raw);

  assert.match(masked, /\[vehicle-plate\]/);
  assert.match(masked, /\[owner-id\]/);
  assert.match(masked, /\[email\]/);
  assert.match(masked, /\[phone\]/);
  assert.match(masked, /\[address\]/);
  assert.match(masked, /RM 995\.00/);
  assert.match(masked, /NCD 20%/);
  assert.doesNotMatch(masked, /951018145405|founder@lajoo\.com|0123456789|Jalan Setia/i);
});

test('chat message sanitizer can redact raw content for persistence', () => {
  const messages = sanitizeChatMessages([
    { role: 'user', content: 'plate JRT9289 ic 951018-14-5405 email founder@lajoo.com phone 0123456789' },
    { role: 'assistant', content: 'I found JRT 9289 for 951018-14-5405.' },
  ], { maskSensitiveContent: true });

  assert.equal(messages.length, 2);
  assert.doesNotMatch(messages[0].content, /JRT9289|951018|founder@lajoo\.com|0123456789/);
  assert.doesNotMatch(messages[1].content, /JRT 9289|951018/);
});

test('message resolver prefers masked server history but keeps latest user turn usable', () => {
  const resolved = resolveMessagesForTurn({
    serverMessages: [
      { role: 'user', content: 'jrt 9289 951018145405' },
      { role: 'assistant', content: 'Found your vehicle.' },
    ],
    requestMessages: [
      { role: 'user', content: 'jrt 9289 951018145405' },
      { role: 'assistant', content: 'Found your vehicle.' },
      { role: 'user', content: 'what is betterment?' },
    ],
  });

  assert.equal(resolved.length, 3);
  assert.equal(resolved[0].content.includes('951018145405'), false);
  assert.equal(resolved[2].content, 'what is betterment?');
});

test('assistant message persistence redacts raw previous turns but keeps card metadata', () => {
  const messages = appendAssistantMessageForStorage(
    [{ role: 'user', content: 'my phone is 0123456789 and email founder@lajoo.com' }],
    {
      content: 'I will send it to founder@lajoo.com.',
      summaryCard: { total: 796 },
    }
  );

  assert.equal(messages.length, 2);
  assert.doesNotMatch(messages[0].content, /0123456789|founder@lajoo\.com/);
  assert.doesNotMatch(messages[1].content, /founder@lajoo\.com/);
  assert.deepEqual(messages[1].summaryCard, { total: 796 });
});

test('sensitive text hashes are deterministic and do not reveal source text', () => {
  const hashA = hashSensitiveText('I agree');
  const hashB = hashSensitiveText(' i   agree ');

  assert.equal(hashA, hashB);
  assert.equal(hashA.includes('agree'), false);
});
