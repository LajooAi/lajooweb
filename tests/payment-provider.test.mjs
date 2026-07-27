import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {
  PaymentProviderError,
  PAYMENT_PROVIDER_STATUSES,
  PAYMENT_WEBHOOK_EVENT_TYPES,
  confirmProviderPaymentIntent,
  createProviderPaymentIntent,
  createProviderPaymentIntentAsync,
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

test('staging mock allows e-wallet success while other methods remain blocked', () => {
  const env = { NODE_ENV: 'development' };
  const ewalletIntent = createProviderPaymentIntent({
    ...basePayload,
    paymentMethod: 'ewallet',
  }, { env });

  assert.equal(ewalletIntent.status, PAYMENT_PROVIDER_STATUSES.PENDING);
  assert.equal(ewalletIntent.paymentAvailable, true);
  assert.equal(Boolean(ewalletIntent.clientConfirmationToken), true);
  assert.match(ewalletIntent.message, /E-wallet mock payment/i);

  const confirmation = confirmProviderPaymentIntent(ewalletIntent, {
    paymentMethod: 'ewallet',
    clientConfirmationToken: ewalletIntent.clientConfirmationToken,
  }, { env });

  assert.equal(confirmation.status, PAYMENT_PROVIDER_STATUSES.SUCCEEDED);
  assert.equal(confirmation.paymentMethod, 'ewallet');
  assert.equal(confirmation.isMock, true);

  const fpxIntent = createProviderPaymentIntent(basePayload, { env });
  assert.equal(fpxIntent.status, PAYMENT_PROVIDER_STATUSES.REQUIRES_PROVIDER);
  assert.equal(fpxIntent.paymentAvailable, false);
  assert.equal(fpxIntent.clientConfirmationToken, null);

  assert.throws(
    () => confirmProviderPaymentIntent(fpxIntent, {
      paymentMethod: 'fpx',
      clientConfirmationToken: 'anything',
    }, { env }),
    (error) => error instanceof PaymentProviderError && error.code === 'MOCK_PAYMENT_DISABLED'
  );
});

test('staging e-wallet mock is disabled in production by default', () => {
  const env = { NODE_ENV: 'production', VERCEL_ENV: 'production' };
  const intent = createProviderPaymentIntent({
    ...basePayload,
    paymentMethod: 'ewallet',
  }, { env });

  assert.equal(intent.status, PAYMENT_PROVIDER_STATUSES.REQUIRES_PROVIDER);
  assert.equal(intent.paymentAvailable, false);
  assert.equal(intent.clientConfirmationToken, null);
});

test('demo Buy Now, Pay Later payment succeeds while unrelated methods stay blocked', () => {
  const env = { NODE_ENV: 'development' };
  const bnplIntent = createProviderPaymentIntent({
    ...basePayload,
    paymentMethod: 'bnpl',
  }, { env });

  assert.equal(bnplIntent.status, PAYMENT_PROVIDER_STATUSES.PENDING);
  assert.equal(bnplIntent.paymentAvailable, true);
  assert.equal(Boolean(bnplIntent.clientConfirmationToken), true);
  assert.match(bnplIntent.message, /Buy Now, Pay Later demo payment/i);

  const confirmation = confirmProviderPaymentIntent(bnplIntent, {
    paymentMethod: 'bnpl',
    clientConfirmationToken: bnplIntent.clientConfirmationToken,
  }, { env });

  assert.equal(confirmation.status, PAYMENT_PROVIDER_STATUSES.SUCCEEDED);
  assert.equal(confirmation.paymentMethod, 'bnpl');
  assert.equal(confirmation.isMock, true);

  const cardIntent = createProviderPaymentIntent({
    ...basePayload,
    paymentMethod: 'card',
  }, { env });
  assert.equal(cardIntent.status, PAYMENT_PROVIDER_STATUSES.REQUIRES_PROVIDER);
  assert.equal(cardIntent.paymentAvailable, false);
  assert.equal(cardIntent.clientConfirmationToken, null);
});

test('demo Buy Now, Pay Later payment is disabled in production unless explicitly enabled', () => {
  const productionEnv = { NODE_ENV: 'production', VERCEL_ENV: 'production' };
  const blockedIntent = createProviderPaymentIntent({
    ...basePayload,
    paymentMethod: 'bnpl',
  }, { env: productionEnv });

  assert.equal(blockedIntent.status, PAYMENT_PROVIDER_STATUSES.REQUIRES_PROVIDER);
  assert.equal(blockedIntent.paymentAvailable, false);
  assert.equal(blockedIntent.clientConfirmationToken, null);

  const enabledEnv = {
    ...productionEnv,
    LAJOO_ENABLE_DEMO_BNPL_MOCK: 'true',
  };
  const enabledIntent = createProviderPaymentIntent({
    ...basePayload,
    paymentMethod: 'bnpl',
  }, { env: enabledEnv });

  assert.equal(enabledIntent.status, PAYMENT_PROVIDER_STATUSES.PENDING);
  assert.equal(enabledIntent.paymentAvailable, true);
  assert.equal(Boolean(enabledIntent.clientConfirmationToken), true);
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
  assert.equal(stripe.implemented, true);
  assert.equal(billplz.country, 'MY');
  assert.equal(Object.values(stripe).some((value) => String(value).includes('secret')), false);
});

test('stripe config is implemented but disabled until launch flags and env are ready', async () => {
  const env = {
    LAJOO_PAYMENT_PROVIDER: 'stripe',
    STRIPE_SECRET_KEY: 'sk_test_do_not_show',
    STRIPE_WEBHOOK_SECRET: 'whsec_do_not_show',
  };
  const config = getPaymentProviderConfig(env);
  const intent = await createProviderPaymentIntentAsync(basePayload, { env });

  assert.equal(config.provider, 'stripe');
  assert.equal(config.implemented, true);
  assert.equal(config.paymentAvailable, false);
  assert.equal(config.livePaymentsEnabled, false);
  assert.equal(config.mode, 'stripe_checkout_sandbox');
  assert.equal(intent.status, PAYMENT_PROVIDER_STATUSES.REQUIRES_PROVIDER);
  assert.equal(intent.clientConfirmationToken, null);
  assert.doesNotMatch(JSON.stringify(config), /sk_test_do_not_show|whsec_do_not_show/);
});

test('stripe checkout creation returns hosted checkout URL and never enables policy issuance', async () => {
  const calls = [];
  const env = {
    LAJOO_PAYMENT_PROVIDER: 'stripe',
    LAJOO_LIVE_PAYMENTS_ENABLED: 'true',
    LAJOO_PAYMENT_PROVIDER_STRIPE_ENABLED: 'true',
    STRIPE_SECRET_KEY: 'sk_test_do_not_show',
    STRIPE_WEBHOOK_SECRET: 'whsec_do_not_show',
    STRIPE_MODE: 'test',
  };
  const stripeClient = {
    checkout: {
      sessions: {
        create: async (params) => {
          calls.push(params);
          return {
            id: 'cs_test_lajoo',
            url: 'https://checkout.stripe.test/c/pay/cs_test_lajoo',
            payment_intent: 'pi_test_lajoo',
          };
        },
      },
    },
  };

  const intent = await createProviderPaymentIntentAsync(basePayload, {
    env,
    origin: 'https://lajoo.test',
    stripeClient,
  });

  assert.equal(intent.provider, 'stripe');
  assert.equal(intent.paymentAvailable, true);
  assert.equal(intent.canIssuePolicy, false);
  assert.equal(intent.checkoutUrl, 'https://checkout.stripe.test/c/pay/cs_test_lajoo');
  assert.equal(intent.clientConfirmationToken, null);
  assert.equal(intent.providerPaymentIntentId, 'pi_test_lajoo');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].client_reference_id, 'PAY-test');
  assert.deepEqual(calls[0].payment_method_types, ['fpx']);
  assert.equal(calls[0].line_items[0].price_data.unit_amount, 98600);
  assert.match(calls[0].success_url, /\/my\/payment\/PAY-test/);
  assert.match(calls[0].success_url, /\{CHECKOUT_SESSION_ID\}/);
  assert.doesNotMatch(JSON.stringify(calls[0].metadata), /JRT9289|Takaful Ikhlas/);
});

test('stripe webhook verification uses signed raw body and sanitized event payload', () => {
  const secret = 'whsec_phase15_test';
  const env = {
    LAJOO_PAYMENT_PROVIDER: 'stripe',
    LAJOO_LIVE_PAYMENTS_ENABLED: 'true',
    LAJOO_PAYMENT_PROVIDER_STRIPE_ENABLED: 'true',
    STRIPE_SECRET_KEY: 'sk_test_do_not_show',
    STRIPE_WEBHOOK_SECRET: secret,
  };
  const stripe = new Stripe('sk_test_do_not_show');
  const rawBody = JSON.stringify({
    id: 'evt_stripe_phase15',
    object: 'event',
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_test_phase15',
        object: 'checkout.session',
        client_reference_id: 'PAY-stripe-webhook',
        payment_intent: 'pi_test_phase15',
        amount_total: 98600,
        currency: 'myr',
        payment_status: 'paid',
        metadata: { lajooPaymentId: 'PAY-stripe-webhook' },
        customer_details: { email: 'customer@example.com' },
      },
    },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret,
  });

  const verified = verifyProviderWebhook('stripe', rawBody, {
    'stripe-signature': signature,
  }, { env });

  assert.equal(verified.ok, true);
  assert.equal(verified.provider, 'stripe');
  assert.equal(verified.event.paymentId, 'PAY-stripe-webhook');
  assert.equal(verified.event.providerEventId, 'evt_stripe_phase15');
  assert.equal(verified.event.providerPaymentIntentId, 'pi_test_phase15');
  assert.equal(verified.event.eventType, PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED);
  assert.equal(verified.event.amount, 986);
  assert.equal(verified.event.currency, 'MYR');
  assert.doesNotMatch(JSON.stringify(verified.event.payload), /customer@example.com|customer_details/);

  assert.throws(
    () => verifyProviderWebhook('stripe', rawBody, {
      'stripe-signature': 'bad-signature',
    }, { env }),
    (error) => error instanceof PaymentProviderError && error.code === 'WEBHOOK_SIGNATURE_INVALID'
  );
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
