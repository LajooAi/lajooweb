import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationState,
  FLOW_STEPS,
} from '../src/lib/conversationState.js';
import {
  appendAssistantMessageForStorage,
  clearChatSession,
  getStateFromSession,
  loadChatSession,
  normalizeChatSessionId,
  resolveMessagesForTurn,
  saveChatSession,
  serializeStateForClient,
  serializeStateForStorage,
} from '../src/server/chat/sessionStore.js';

test('chat session store keeps full personal details server-side but masks client state', () => {
  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.OTP,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    personalDetails: {
      email: 'founder@lajoo.com',
      phone: '0123456789',
      address: 'No 12, Jalan Setia 1, 47000 Shah Alam',
    },
  });

  const storage = serializeStateForStorage(state);
  const client = serializeStateForClient(state);

  assert.equal(storage.personalDetails.email, 'founder@lajoo.com');
  assert.equal(storage.personalDetails.phone, '0123456789');
  assert.equal(storage.personalDetails.address, 'No 12, Jalan Setia 1, 47000 Shah Alam');
  assert.deepEqual(client.personalDetails, {
    email: true,
    phone: true,
    address: true,
  });
});

test('chat session store saves and hydrates conversation state by session id', async () => {
  const sessionId = normalizeChatSessionId('chat_test_session_123');
  await clearChatSession(sessionId);

  const state = new ConversationState();
  Object.assign(state, {
    step: FLOW_STEPS.ADDONS,
    plateNumber: 'JRT9289',
    nricNumber: '951018145405',
    selectedQuote: {
      insurer: 'Takaful Ikhlas Insurance',
      priceAfter: 796,
      priceBefore: 995,
      ncdPercent: 20,
      sumInsured: 34000,
      coverType: 'Comprehensive',
    },
  });

  await saveChatSession({
    sessionId,
    state,
    messages: [
      { role: 'user', content: 'jrt 9289 951018145405' },
      { role: 'assistant', content: 'Found your vehicle.' },
    ],
  });

  const session = await loadChatSession(sessionId);
  const hydrated = await getStateFromSession(session);

  assert.equal(session.sessionId, sessionId);
  assert.equal(session.messages.length, 2);
  assert.equal(hydrated.step, FLOW_STEPS.ADDONS);
  assert.equal(hydrated.selectedQuote.insurer, 'Takaful Ikhlas Insurance');

  await clearChatSession(sessionId);
});

test('message resolver can append latest user turn to server history', () => {
  const resolved = resolveMessagesForTurn({
    serverMessages: [
      { role: 'user', content: 'renew car insurance' },
      { role: 'assistant', content: 'Sure, share your vehicle plate.' },
    ],
    requestMessages: [
      { role: 'user', content: 'JRT 9289' },
    ],
  });

  assert.equal(resolved.length, 3);
  assert.equal(resolved[2].role, 'user');
  assert.equal(resolved[2].content, 'JRT 9289');
});

test('assistant message persistence keeps structured card metadata', () => {
  const messages = appendAssistantMessageForStorage(
    [{ role: 'user', content: 'show quotes' }],
    {
      content: 'Here are your quotes.',
      summaryCard: { total: 796 },
      addOnsCard: { options: [] },
    }
  );

  assert.equal(messages.length, 2);
  assert.deepEqual(messages[1].summaryCard, { total: 796 });
  assert.deepEqual(messages[1].addOnsCard, { options: [] });
});
