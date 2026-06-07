import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYMENT_STATUS,
  createPayment,
  getPayment,
  sanitizePaymentForClient,
  updatePaymentStatus,
} from '../src/lib/paymentStore.js';
import {
  createProviderPaymentIntent,
} from '../src/server/payment/paymentProvider.js';

const originalSnapshotStore = process.env.LAJOO_PAYMENT_SNAPSHOT_STORE;
const originalChatSessionStore = process.env.LAJOO_CHAT_SESSION_STORE;

test.beforeEach(() => {
  process.env.LAJOO_PAYMENT_SNAPSHOT_STORE = '';
  process.env.LAJOO_CHAT_SESSION_STORE = '';
});

test.after(() => {
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

test('payment snapshot locks checkout amount server-side', async () => {
  const payment = await createPayment({
    paymentId: 'PAY-store-lock-test',
    sessionId: 'session-store-lock-test',
    total: 986,
    insurer: 'Takaful Ikhlas',
    plate: 'JRT9289',
    insurance: 796,
    addons: 100,
    tax: 0,
    roadtax: 90,
    status: PAYMENT_STATUS.REQUIRES_PROVIDER,
    checkoutData: {
      total: 986,
      insurer: 'Takaful Ikhlas',
    },
  });

  assert.equal(payment.total, 986);

  const clientTamperedTotal = 1;
  const snapshot = await getPayment('PAY-store-lock-test');
  const providerIntent = createProviderPaymentIntent({
    paymentId: snapshot.paymentId,
    total: snapshot.total,
    insurer: snapshot.insurer,
    plate: snapshot.plate,
    insurance: snapshot.insurance,
    addons: snapshot.addons,
    tax: snapshot.tax,
    roadtax: snapshot.roadtax,
    paymentMethod: 'fpx',
  }, { env: {} });

  assert.equal(clientTamperedTotal, 1);
  assert.equal(providerIntent.amount, 986);
  assert.equal(providerIntent.breakdown.total, 986);
  assert.equal(providerIntent.status, PAYMENT_STATUS.REQUIRES_PROVIDER);
});

test('payment status response hides confirmation token but includes checkout snapshot', async () => {
  await createPayment({
    paymentId: 'PAY-client-snapshot-test',
    total: 100,
    insurer: 'Etiqa Insurance',
    plate: 'ABC1234',
    insurance: 90,
    addons: 0,
    tax: 10,
    roadtax: 0,
    clientConfirmationToken: 'secret-token',
    checkoutData: {
      insurerDisplay: 'Etiqa Insurance',
      total: 100,
    },
  });

  const payment = await getPayment('PAY-client-snapshot-test');
  const clientPayment = sanitizePaymentForClient(payment);

  assert.equal(clientPayment.total, 100);
  assert.equal(clientPayment.checkoutData.insurerDisplay, 'Etiqa Insurance');
  assert.equal(clientPayment.clientConfirmationToken, undefined);
});

test('payment status updates preserve locked financial breakdown', async () => {
  await createPayment({
    paymentId: 'PAY-update-preserve-test',
    total: 500,
    insurer: 'Allianz Insurance',
    plate: 'JRT9289',
    insurance: 420,
    addons: 0,
    tax: 80,
    roadtax: 0,
  });

  const updated = await updatePaymentStatus('PAY-update-preserve-test', PAYMENT_STATUS.PENDING, {
    provider: 'mock',
    providerPaymentIntentId: 'mock_pi_test',
    paymentMethod: 'card',
  });

  assert.equal(updated.status, PAYMENT_STATUS.PENDING);
  assert.equal(updated.total, 500);
  assert.equal(updated.insurance, 420);
  assert.equal(updated.tax, 80);
  assert.equal(updated.providerPaymentIntentId, 'mock_pi_test');
});
