import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PaymentProviderError,
  PAYMENT_PROVIDER_STATUSES,
  confirmProviderPaymentIntent,
  createProviderPaymentIntent,
  getPaymentProviderConfig,
  validatePaymentBreakdown,
} from '../src/server/payment/paymentProvider.js';

const basePayload = {
  paymentId: 'PAY-test',
  total: 986,
  insurer: 'Takaful Ikhlas',
  plate: 'JRT9289',
  insurance: 796,
  addons: 100,
  tax: 0,
  roadtax: 90,
  paymentMethod: 'fpx',
};

test('default mock provider is safe and does not allow payment success', () => {
  const env = {};
  const config = getPaymentProviderConfig(env);
  const intent = createProviderPaymentIntent(basePayload, { env });

  assert.equal(config.provider, 'mock');
  assert.equal(config.paymentAvailable, false);
  assert.equal(intent.status, PAYMENT_PROVIDER_STATUSES.REQUIRES_PROVIDER);
  assert.equal(intent.clientConfirmationToken, null);
  assert.match(intent.message, /not live yet/i);
});

test('payment breakdown validation rejects tampered totals', () => {
  const breakdown = validatePaymentBreakdown({
    ...basePayload,
    total: 1,
  });

  assert.equal(breakdown.ok, false);
  assert.equal(breakdown.expectedTotal, 986);
  assert.throws(
    () => createProviderPaymentIntent({ ...basePayload, total: 1 }, { env: {} }),
    (error) => error instanceof PaymentProviderError && error.code === 'PAYMENT_TOTAL_MISMATCH'
  );
});

test('mock confirmation requires explicit env flag and per-intent token', () => {
  const env = { LAJOO_ALLOW_MOCK_PAYMENT_CONFIRM: 'true' };
  const intent = createProviderPaymentIntent(basePayload, { env });

  assert.equal(intent.status, PAYMENT_PROVIDER_STATUSES.PENDING);
  assert.equal(Boolean(intent.clientConfirmationToken), true);

  assert.throws(
    () => confirmProviderPaymentIntent(intent, {
      paymentMethod: 'fpx',
      clientConfirmationToken: 'wrong-token',
    }, { env }),
    (error) => error instanceof PaymentProviderError && error.code === 'PAYMENT_CONFIRMATION_UNAUTHORIZED'
  );

  const confirmation = confirmProviderPaymentIntent(intent, {
    paymentMethod: 'fpx',
    clientConfirmationToken: intent.clientConfirmationToken,
  }, { env });

  assert.equal(confirmation.status, PAYMENT_PROVIDER_STATUSES.SUCCEEDED);
  assert.equal(confirmation.isMock, true);
  assert.equal(confirmation.canIssuePolicy, false);
});

test('mock confirmation stays disabled without explicit flag', () => {
  const intent = createProviderPaymentIntent(basePayload, { env: {} });

  assert.throws(
    () => confirmProviderPaymentIntent(intent, {
      paymentMethod: 'fpx',
      clientConfirmationToken: 'anything',
    }, { env: {} }),
    (error) => error instanceof PaymentProviderError && error.code === 'MOCK_PAYMENT_DISABLED'
  );
});
