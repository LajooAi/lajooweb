import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearMemoryPdpaConsentAuditEvents,
  listPdpaConsentAuditEvents,
  recordPdpaConsentAuditEvent,
} from '../src/lib/pdpaConsentAuditStore.js';
import { PDPA_CONSENT_VERSION } from '../src/lib/pdpaConsent.js';

const originalChatSessionStore = process.env.LAJOO_CHAT_SESSION_STORE;

test.beforeEach(() => {
  process.env.LAJOO_CHAT_SESSION_STORE = '';
  clearMemoryPdpaConsentAuditEvents();
});

test.after(() => {
  clearMemoryPdpaConsentAuditEvents();
  if (originalChatSessionStore === undefined) {
    delete process.env.LAJOO_CHAT_SESSION_STORE;
  } else {
    process.env.LAJOO_CHAT_SESSION_STORE = originalChatSessionStore;
  }
});

test('PDPA consent audit store records versioned consent without raw message text', async () => {
  const saved = await recordPdpaConsentAuditEvent({
    sessionId: 'chat_pdpa_audit_123',
    acceptedAt: new Date('2026-06-08T03:00:00.000Z'),
    reason: 'owner_id',
    acceptanceMessage: 'I agree, my IC is 951018145405',
  });

  assert.equal(saved.sessionId, 'chat_pdpa_audit_123');
  assert.equal(saved.action, 'accepted');
  assert.equal(saved.consentVersion, PDPA_CONSENT_VERSION);
  assert.equal(saved.reason, 'owner_id');
  assert.equal(saved.acceptedAt, '2026-06-08T03:00:00.000Z');
  assert.ok(saved.messageHash);
  assert.equal(JSON.stringify(saved).includes('951018145405'), false);

  const events = await listPdpaConsentAuditEvents({ sessionId: 'chat_pdpa_audit_123' });
  assert.equal(events.length, 1);
  assert.equal(events[0].messageHash, saved.messageHash);
});

test('PDPA consent audit store requires a session id', async () => {
  await assert.rejects(
    () => recordPdpaConsentAuditEvent({ acceptanceMessage: 'I agree' }),
    /requires a sessionId/
  );
});
