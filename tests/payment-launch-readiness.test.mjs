import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canManagePaymentOperations,
  classifyPaymentReconciliationIssue,
  clearAdminPaymentLaunchMemoryForTest,
  createAdminPaymentException,
  getPaymentProviderReadiness,
  getPolicyIssuancePaymentGuard,
  sanitizePaymentAdminPayload,
  updateAdminPaymentException,
  updateAdminPaymentReconciliationItem,
  verifySignedPaymentWebhookForLaunch,
  PAYMENT_RECONCILIATION_ISSUE_TYPES,
} from '../src/server/payment/paymentLaunchReadiness.js';
import {
  PAYMENT_WEBHOOK_EVENT_TYPES,
  createWebhookSignature,
} from '../src/server/payment/paymentProvider.js';
import { PAYMENT_STATUS } from '../src/lib/paymentStore.js';

test.beforeEach(() => {
  clearAdminPaymentLaunchMemoryForTest();
});

test('payment provider readiness reports config without exposing secret values', () => {
  const readiness = getPaymentProviderReadiness({
    env: {
      LAJOO_PAYMENT_PROVIDER: 'stripe',
      LAJOO_LIVE_PAYMENTS_ENABLED: 'true',
      LAJOO_PAYMENT_PROVIDER_STRIPE_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'sk_live_do_not_show',
      STRIPE_WEBHOOK_SECRET: 'whsec_do_not_show',
      NODE_ENV: 'production',
    },
    origin: 'https://admin.lajoo.my',
  });

  assert.equal(readiness.provider, 'stripe');
  assert.equal(readiness.apiKeyConfigured, true);
  assert.equal(readiness.webhookSecretConfigured, true);
  assert.equal(readiness.status, 'configured');
  assert.equal(readiness.verifierImplemented, true);
  assert.equal(readiness.checkoutImplemented, true);
  assert.equal(readiness.reconciliationAutomation, 'matched_success_auto_resolve');
  assert.equal(readiness.endpointUrl, 'https://admin.lajoo.my/api/payment/webhook/stripe');
  assert.doesNotMatch(JSON.stringify(readiness), /sk_live_do_not_show|whsec_do_not_show/);
});

test('mock signed webhook verification succeeds and rejects invalid signatures', () => {
  const secret = 'phase14-webhook-secret';
  const rawBody = JSON.stringify({
    id: 'evt_phase14_1',
    type: 'payment.succeeded',
    paymentId: 'PAY-phase14',
    amount: 100,
  });
  const signature = createWebhookSignature(rawBody, secret);
  const env = {
    LAJOO_ALLOW_MOCK_PAYMENT_CONFIRM: 'true',
    LAJOO_PAYMENT_WEBHOOK_SECRET: secret,
  };

  const verified = verifySignedPaymentWebhookForLaunch({
    provider: 'mock',
    rawBody,
    headers: { 'x-lajoo-mock-signature': `sha256=${signature}` },
    env,
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.verification.event.paymentId, 'PAY-phase14');

  const rejected = verifySignedPaymentWebhookForLaunch({
    provider: 'mock',
    rawBody,
    headers: { 'x-lajoo-mock-signature': 'sha256=bad' },
    env,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'WEBHOOK_SIGNATURE_INVALID');
  assert.equal(rejected.errorClass, 'verification_failed');
});

test('payment reconciliation classification covers launch review cases', () => {
  assert.equal(
    classifyPaymentReconciliationIssue({
      event: { eventType: PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED, amount: 100 },
      payment: null,
    }).issueType,
    PAYMENT_RECONCILIATION_ISSUE_TYPES.WEBHOOK_UNMATCHED
  );

  assert.equal(
    classifyPaymentReconciliationIssue({
      event: { eventType: PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED, amount: 101 },
      payment: { status: PAYMENT_STATUS.PENDING, total: 100 },
    }).issueType,
    PAYMENT_RECONCILIATION_ISSUE_TYPES.AMOUNT_MISMATCH
  );

  assert.equal(
    classifyPaymentReconciliationIssue({
      event: { eventType: PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED, amount: 100 },
      payment: { status: PAYMENT_STATUS.CONFIRMED, total: 100 },
    }).issueType,
    PAYMENT_RECONCILIATION_ISSUE_TYPES.DUPLICATE_EVENT
  );

  assert.equal(
    classifyPaymentReconciliationIssue({
      event: { eventType: PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_FAILED, amount: 100 },
      payment: { status: PAYMENT_STATUS.PENDING, total: 100 },
    }).issueType,
    PAYMENT_RECONCILIATION_ISSUE_TYPES.FAILED_PAYMENT
  );

  const matched = classifyPaymentReconciliationIssue({
    event: { eventType: PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED, amount: 100 },
    payment: { status: PAYMENT_STATUS.PENDING, total: 100 },
    outcome: 'applied',
  });
  assert.equal(matched.issueType, PAYMENT_RECONCILIATION_ISSUE_TYPES.MATCHED_SUCCESS);
  assert.equal(matched.status, 'resolved');

  assert.equal(
    classifyPaymentReconciliationIssue({
      event: { eventType: PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED, amount: null },
      payment: { status: PAYMENT_STATUS.PENDING, total: 100 },
      outcome: 'amount_mismatch',
    }).issueType,
    PAYMENT_RECONCILIATION_ISSUE_TYPES.AMOUNT_MISMATCH
  );
});

test('payment launch payload sanitizer redacts secrets, PII, and large raw values', () => {
  const sanitized = sanitizePaymentAdminPayload({
    signature: 'abc123',
    customerEmail: 'customer@example.com',
    phone: '+60 12 345 6789',
    note: 'Payment provider returned a safe status.',
  });

  assert.equal(sanitized.signature, '[redacted]');
  assert.equal(sanitized.customerEmail, '[redacted]');
  assert.equal(sanitized.phone, '[redacted]');
  assert.equal(sanitized.note, 'Payment provider returned a safe status.');
});

test('policy issuance guard blocks unverified payment and disabled issuance', () => {
  const unverified = getPolicyIssuancePaymentGuard({
    status: PAYMENT_STATUS.PENDING,
    providerPaymentIntentId: 'pi_pending',
  }, { env: { LAJOO_POLICY_ISSUANCE_ENABLED: 'true' } });
  assert.equal(unverified.canIssuePolicy, false);
  assert.equal(unverified.reasonCode, 'payment_not_verified');

  const disabled = getPolicyIssuancePaymentGuard({
    status: PAYMENT_STATUS.CONFIRMED,
    providerPaymentIntentId: 'pi_confirmed',
  }, { env: {} });
  assert.equal(disabled.canIssuePolicy, false);
  assert.equal(disabled.reasonCode, 'policy_issuance_not_enabled');

  const missingInsurerHandoff = getPolicyIssuancePaymentGuard({
    status: PAYMENT_STATUS.CONFIRMED,
    providerPaymentIntentId: 'pi_confirmed',
  }, { env: { LAJOO_POLICY_ISSUANCE_ENABLED: 'true' } });
  assert.equal(missingInsurerHandoff.canIssuePolicy, false);
  assert.equal(missingInsurerHandoff.reasonCode, 'insurer_handoff_not_enabled');

  const providerMismatch = getPolicyIssuancePaymentGuard({
    status: PAYMENT_STATUS.CONFIRMED,
    providerPaymentIntentId: 'pi_confirmed',
    provider: 'stripe',
    expectedProvider: 'billplz',
  }, { env: { LAJOO_POLICY_ISSUANCE_ENABLED: 'true', LAJOO_INSURER_POLICY_HANDOFF_ENABLED: 'true' } });
  assert.equal(providerMismatch.canIssuePolicy, false);
  assert.equal(providerMismatch.reasonCode, 'payment_provider_mismatch');

  const amountMismatch = getPolicyIssuancePaymentGuard({
    status: PAYMENT_STATUS.CONFIRMED,
    providerPaymentIntentId: 'pi_confirmed',
    provider: 'stripe',
    expectedAmount: 100,
    verifiedAmount: 101,
  }, { env: { LAJOO_POLICY_ISSUANCE_ENABLED: 'true', LAJOO_INSURER_POLICY_HANDOFF_ENABLED: 'true' } });
  assert.equal(amountMismatch.canIssuePolicy, false);
  assert.equal(amountMismatch.reasonCode, 'payment_amount_mismatch');

  const enabled = getPolicyIssuancePaymentGuard({
    status: PAYMENT_STATUS.CONFIRMED,
    providerPaymentIntentId: 'pi_confirmed',
    provider: 'stripe',
    expectedAmount: 100,
    verifiedAmount: 100,
  }, { env: { LAJOO_POLICY_ISSUANCE_ENABLED: 'true', LAJOO_INSURER_POLICY_HANDOFF_ENABLED: 'true' } });
  assert.equal(enabled.canIssuePolicy, true);
});

test('payment operation permissions are founder or ops only', async () => {
  assert.equal(canManagePaymentOperations({ role: 'founder' }), true);
  assert.equal(canManagePaymentOperations({ role: 'ops' }), true);
  assert.equal(canManagePaymentOperations({ role: 'compliance' }), false);

  await assert.rejects(
    updateAdminPaymentReconciliationItem({
      session: { id: 'admin-compliance', role: 'compliance', email: 'compliance@lajoo.my' },
      itemId: 'missing',
      status: 'resolved',
      reason: 'Compliance tried to change payment queue state.',
    }),
    /Founder or ops role required/
  );
});

test('refund exception workflow requires founder approval and blocks provider submission by default', async () => {
  const opsSession = { id: 'admin-ops', role: 'ops', email: 'ops@lajoo.my' };
  const founderSession = { id: 'admin-founder', role: 'founder', email: 'founder@lajoo.my' };
  const created = await createAdminPaymentException({
    session: opsSession,
    paymentId: 'PAY-refund-phase15',
    provider: 'stripe',
    exceptionType: 'refund_request',
    amount: 100,
    reason: 'Customer reported a duplicate successful payment and needs refund workflow review.',
  });

  assert.equal(created.exception.status, 'requested');
  assert.equal(created.exception.noRealRefund, true);

  await assert.rejects(
    updateAdminPaymentException({
      session: opsSession,
      exceptionId: created.exception.id,
      status: 'approved',
      reason: 'Ops attempted to approve refund workflow without founder approval.',
    }),
    /Founder approval is required/
  );

  const approved = await updateAdminPaymentException({
    session: founderSession,
    exceptionId: created.exception.id,
    status: 'approved',
    reason: 'Founder approved the refund workflow record after reviewing duplicate payment evidence.',
  });
  assert.equal(approved.exception.status, 'approved');

  await assert.rejects(
    updateAdminPaymentException({
      session: founderSession,
      exceptionId: created.exception.id,
      status: 'submitted_provider',
      reason: 'Founder attempted provider submission while refund API remains disabled.',
    }),
    /Provider refund submission is disabled/
  );
});
