import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYMENT_AUDIT_DIRECTION,
  PAYMENT_AUDIT_STATUS,
  clearMemoryPaymentAuditEvents,
  listPaymentAuditEvents,
  recordPaymentAuditEvent,
} from '../src/lib/paymentAuditStore.js';

const originalSnapshotStore = process.env.LAJOO_PAYMENT_SNAPSHOT_STORE;
const originalChatSessionStore = process.env.LAJOO_CHAT_SESSION_STORE;

test.beforeEach(() => {
  process.env.LAJOO_PAYMENT_SNAPSHOT_STORE = '';
  process.env.LAJOO_CHAT_SESSION_STORE = '';
  clearMemoryPaymentAuditEvents();
});

test.after(() => {
  clearMemoryPaymentAuditEvents();

  if (originalSnapshotStore === undefined) {
    delete process.env.LAJOO_PAYMENT_SNAPSHOT_STORE;
  } else {
    process.env.LAJOO_PAYMENT_SNAPSHOT_STORE = originalSnapshotStore;
  }

  if (originalChatSessionStore === undefined) {
    delete process.env.LAJOO_CHAT_SESSION_STORE;
  } else {
    process.env.LAJOO_CHAT_SESSION_STORE = originalChatSessionStore;
  }
});

test('payment audit store records and filters memory events', async () => {
  await recordPaymentAuditEvent({
    paymentId: 'PAY-audit-1',
    provider: 'mock',
    direction: PAYMENT_AUDIT_DIRECTION.CLIENT_REQUEST,
    eventType: 'payment.process.requested',
    eventStatus: PAYMENT_AUDIT_STATUS.RECEIVED,
    payload: { paymentMethod: 'fpx' },
  });

  await recordPaymentAuditEvent({
    paymentId: 'PAY-audit-2',
    provider: 'mock',
    direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_WEBHOOK,
    eventType: 'payment.succeeded',
    eventStatus: PAYMENT_AUDIT_STATUS.APPLIED,
  });

  const firstPaymentEvents = await listPaymentAuditEvents({ paymentId: 'PAY-audit-1' });
  assert.equal(firstPaymentEvents.length, 1);
  assert.equal(firstPaymentEvents[0].eventType, 'payment.process.requested');
  assert.equal(firstPaymentEvents[0].payload.paymentMethod, 'fpx');

  const providerEvents = await listPaymentAuditEvents({ provider: 'mock' });
  assert.equal(providerEvents.length, 2);
  assert.equal(providerEvents[0].paymentId, 'PAY-audit-2');
});
