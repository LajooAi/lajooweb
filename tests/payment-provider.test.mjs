import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PaymentProviderError,
  PAYMENT_PROVIDER_STATUSES,
  PAYMENT_WEBHOOK_EVENT_TYPES,
  confirmProviderPaymentIntent,
  createProviderPaymentIntent,
  createWebhookSignature,
  getPaymentProviderConfig,
  listPaymentProviderShells,
  validatePaymentBreakdown,
  verifyProviderWebhook,
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

test('provider-specific external shell remains disabled but adapter contract is stable', () => {
  const env = { LAJOO_PAYMENT_PROVIDER: 'billplz' };
  const config = getPaymentProviderConfig(env);
  const intent = createProviderPaymentIntent(basePayload, { env });

  assert.equal(config.provider, 'billplz');
  assert.equal(config.label, 'Billplz');
  assert.equal(config.mode, 'integration_shell');
  assert.equal(config.implemented, false);
  assert.equal(config.paymentAvailable, false);
  assert.equal(config.livePaymentsEnabled, false);
  assert.deepEqual(config.requiredEnv, ['BILLPLZ_API_KEY', 'BILLPLZ_COLLECTION_ID', 'BILLPLZ_X_SIGNATURE_KEY']);
  assert.deepEqual(config.missingEnv, ['BILLPLZ_API_KEY', 'BILLPLZ_COLLECTION_ID', 'BILLPLZ_X_SIGNATURE_KEY']);
  assert.equal(intent.provider, 'billplz');
  assert.equal(intent.status, PAYMENT_PROVIDER_STATUSES.REQUIRES_PROVIDER);
  assert.match(intent.message, /shell is ready/i);
});

test('provider shells require both global and provider-specific live flags', () => {
  const env = {
    LAJOO_PAYMENT_PROVIDER: 'billplz',
    LAJOO_LIVE_PAYMENTS_ENABLED: 'true',
    BILLPLZ_API_KEY: 'api-key',
    BILLPLZ_COLLECTION_ID: 'collection-id',
    BILLPLZ_X_SIGNATURE_KEY: 'signature-key',
  };
  const config = getPaymentProviderConfig(env);
  const intent = createProviderPaymentIntent(basePayload, { env });

  assert.equal(config.livePaymentGlobalEnabled, true);
  assert.equal(config.livePaymentProviderEnabled, false);
  assert.equal(config.livePaymentsEnabled, false);
  assert.equal(config.hasRequiredConfig, true);
  assert.equal(intent.paymentAvailable, false);
  assert.equal(intent.canIssuePolicy, false);
});

test('configured provider shell is still shell-only until real integration is implemented', () => {
  const env = {
    LAJOO_PAYMENT_PROVIDER: 'billplz',
    LAJOO_LIVE_PAYMENTS_ENABLED: 'true',
    LAJOO_PAYMENT_PROVIDER_BILLPLZ_ENABLED: 'true',
    BILLPLZ_API_KEY: 'api-key',
    BILLPLZ_COLLECTION_ID: 'collection-id',
    BILLPLZ_X_SIGNATURE_KEY: 'signature-key',
  };
  const config = getPaymentProviderConfig(env);
  const intent = createProviderPaymentIntent(basePayload, { env });

  assert.equal(config.livePaymentsEnabled, true);
  assert.equal(config.hasRequiredConfig, true);
  assert.equal(config.paymentAvailable, false);
  assert.equal(intent.status, PAYMENT_PROVIDER_STATUSES.REQUIRES_PROVIDER);
  assert.match(intent.providerPaymentIntentId, /^billplz_pi_/);
  assert.match(intent.message, /configured/i);

  assert.throws(
    () => confirmProviderPaymentIntent(intent, { paymentMethod: 'fpx' }, { env }),
    (error) => error instanceof PaymentProviderError && error.code === 'PAYMENT_PROVIDER_SHELL_ONLY'
  );

  assert.throws(
    () => verifyProviderWebhook('billplz', JSON.stringify({ paymentId: 'PAY-test' }), {}, { env }),
    (error) => error instanceof PaymentProviderError && error.code === 'PAYMENT_WEBHOOK_SHELL_ONLY'
  );
});

test('provider shells expose safe readiness metadata without secrets', () => {
  const shells = listPaymentProviderShells({
    LAJOO_LIVE_PAYMENTS_ENABLED: 'true',
    LAJOO_PAYMENT_PROVIDER_STRIPE_ENABLED: 'true',
    STRIPE_SECRET_KEY: 'secret',
  });
  const stripe = shells.find((shell) => shell.provider === 'stripe');
  const billplz = shells.find((shell) => shell.provider === 'billplz');

  assert.equal(shells.length >= 4, true);
  assert.equal(stripe.label, 'Stripe');
  assert.deepEqual(stripe.missingEnv, ['STRIPE_WEBHOOK_SECRET']);
  assert.equal(stripe.hasRequiredConfig, false);
  assert.equal(stripe.paymentAvailable, false);
  assert.equal(billplz.country, 'MY');
  assert.equal(Object.values(stripe).some((value) => String(value).includes('secret')), false);
});

test('provider-specific shell rejects unsupported payment methods early', () => {
  assert.throws(
    () => createProviderPaymentIntent({ ...basePayload, provider: 'toyyibpay', paymentMethod: 'card' }, { env: {} }),
    (error) => error instanceof PaymentProviderError && error.code === 'PAYMENT_METHOD_NOT_SUPPORTED_BY_PROVIDER'
  );
});

test('mock webhook requires explicit flag and valid HMAC signature', () => {
  const secret = 'test-webhook-secret';
  const env = {
    LAJOO_ALLOW_MOCK_PAYMENT_CONFIRM: 'true',
    LAJOO_PAYMENT_WEBHOOK_SECRET: secret,
  };
  const rawBody = JSON.stringify({
    id: 'evt_mock_1',
    type: 'payment.succeeded',
    paymentId: 'PAY-webhook-test',
    transactionId: 'mock_txn_1',
    paymentMethod: 'fpx',
  });
  const signature = createWebhookSignature(rawBody, secret);
  const result = verifyProviderWebhook('mock', rawBody, {
    'x-lajoo-mock-signature': `sha256=${signature}`,
  }, { env });

  assert.equal(result.ok, true);
  assert.equal(result.signatureStatus, 'verified');
  assert.equal(result.event.paymentId, 'PAY-webhook-test');
  assert.equal(result.event.eventType, PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED);
  assert.equal(result.event.transactionRef, 'mock_txn_1');

  assert.throws(
    () => verifyProviderWebhook('mock', rawBody, {
      'x-lajoo-mock-signature': 'sha256=bad',
    }, { env }),
    (error) => error instanceof PaymentProviderError && error.code === 'WEBHOOK_SIGNATURE_INVALID'
  );
});

test('mock webhook stays disabled without explicit testing flag', () => {
  const secret = 'test-webhook-secret';
  const rawBody = JSON.stringify({
    type: 'payment.succeeded',
    paymentId: 'PAY-webhook-disabled-test',
  });
  const signature = createWebhookSignature(rawBody, secret);

  assert.throws(
    () => verifyProviderWebhook('mock', rawBody, {
      'x-lajoo-mock-signature': signature,
    }, { env: { LAJOO_PAYMENT_WEBHOOK_SECRET: secret } }),
    (error) => error instanceof PaymentProviderError && error.code === 'MOCK_PAYMENT_DISABLED'
  );
});
