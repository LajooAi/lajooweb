import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canInspectCustomerLaunchQa,
  canManageCustomerLaunchQa,
  canManageCustomerLaunchQaItem,
  getPersistedCustomerLaunchQaData,
  resetAdminCustomerLaunchQaMemoryForTest,
  updateCustomerLaunchQaItem,
  updateCustomerLaunchUatRun,
} from '../src/server/admin/adminCustomerLaunchQa.js';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

const founderSession = {
  id: 'founder-launch-qa-test',
  source: 'test',
  role: 'founder',
  email: 'founder@lajoo.my',
  permissions: ['business_admin', 'security_access'],
};

const opsSession = {
  id: 'ops-launch-qa-test',
  source: 'test',
  role: 'ops',
  email: 'ops@lajoo.my',
  permissions: ['business_admin'],
};

const complianceSession = {
  id: 'compliance-launch-qa-test',
  source: 'test',
  role: 'compliance',
  email: 'compliance@lajoo.my',
  permissions: ['security_access'],
};

const aiQaSession = {
  id: 'ai-qa-launch-qa-test',
  source: 'test',
  role: 'ai_qa',
  email: 'ai.qa@lajoo.my',
  permissions: ['ai_knowledge'],
};

const engineerSession = {
  id: 'engineer-launch-qa-test',
  source: 'test',
  role: 'engineer',
  email: 'engineer@lajoo.my',
  permissions: ['tech_admin', 'security_access'],
};

test.beforeEach(() => {
  delete process.env.DATABASE_URL;
  resetAdminCustomerLaunchQaMemoryForTest();
});

test.after(() => {
  if (ORIGINAL_DATABASE_URL) process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

test('customer launch QA roles inspect and mutate with least privilege', async () => {
  assert.equal(canInspectCustomerLaunchQa(founderSession), true);
  assert.equal(canInspectCustomerLaunchQa(opsSession), true);
  assert.equal(canInspectCustomerLaunchQa(complianceSession), true);
  assert.equal(canInspectCustomerLaunchQa(aiQaSession), true);
  assert.equal(canInspectCustomerLaunchQa(engineerSession), true);
  assert.equal(canInspectCustomerLaunchQa(null), false);

  assert.equal(canManageCustomerLaunchQa(founderSession), true);
  assert.equal(canManageCustomerLaunchQa(opsSession), true);
  assert.equal(canManageCustomerLaunchQa(complianceSession), true);
  assert.equal(canManageCustomerLaunchQa(aiQaSession), false);

  const data = await getPersistedCustomerLaunchQaData({ session: aiQaSession });
  const stuckFlow = data.stuckFlowScenarios.find((item) => item.itemKey === 'ambiguous_answer');
  const payment = data.paymentFailureChecklist.find((item) => item.itemKey === 'no_fake_paid_state');
  assert.equal(canManageCustomerLaunchQaItem(aiQaSession, stuckFlow), true);
  assert.equal(canManageCustomerLaunchQaItem(aiQaSession, payment), false);
});

test('default customer launch QA data is conservative and launch-blocking', async () => {
  const data = await getPersistedCustomerLaunchQaData({ session: opsSession });

  assert.equal(data.persisted, false);
  assert.equal(data.summary.launchReady, false);
  assert.ok(data.summary.blockerCount > 0);
  assert.equal(data.endToEndChecklist.some((item) => item.itemKey === 'start_renewal'), true);
  assert.equal(data.stuckFlowScenarios.some((item) => item.itemKey === 'payment_policy_question_before_live'), true);
  assert.equal(data.mobileChecklist.some((item) => item.viewport === 'iphone_small'), true);
  assert.equal(data.paymentFailureChecklist.every((item) => item.launchBlocking), true);
  assert.equal(data.supportHandoffChecklist.some((item) => item.itemKey === 'user_requests_human'), true);
  assert.equal(data.uatRuns[0].signoffStatus, 'not_ready');
  assert.doesNotMatch(JSON.stringify(data), /920418-14-5582|aisyah\.rahman@example\.com|Bearer|sk_|rawPayload|prompt/i);
});

test('QA status changes require a real reason and correct role scope', async () => {
  await assert.rejects(
    () => updateCustomerLaunchQaItem({
      session: opsSession,
      itemId: 'vehicle_lookup',
      status: 'passed',
      blocker: false,
      reason: 'short',
    }),
    /at least 8/,
  );

  await assert.rejects(
    () => updateCustomerLaunchQaItem({
      session: aiQaSession,
      itemId: 'no_fake_paid_state',
      status: 'passed',
      blocker: false,
      reason: 'AI QA should not approve payment safety records.',
    }),
    /Founder, ops, compliance, or scoped AI QA role required/,
  );

  const result = await updateCustomerLaunchQaItem({
    session: aiQaSession,
    itemId: 'ambiguous_answer',
    status: 'passed',
    blocker: false,
    reason: 'AI QA verified ambiguous user answers ask one clear follow-up.',
  });

  assert.equal(result.qaItem.status, 'passed');
  assert.equal(result.qaItem.blocker, false);
});

test('mobile and support QA records can be progressed by ops with audit-safe metadata', async () => {
  const mobile = await updateCustomerLaunchQaItem({
    session: opsSession,
    itemId: 'iphone_small',
    status: 'needs_fix',
    blocker: true,
    evidence: [{ label: 'mobile smoke', rawPayload: 'should be dropped', note: 'Input needs manual QA on small viewport.' }],
    reason: 'Ops found small viewport QA still needs a manual visual pass.',
  });

  assert.equal(mobile.qaItem.status, 'needs_fix');
  assert.equal(mobile.qaItem.blocker, true);
  assert.equal(mobile.qaItem.evidence[0].rawPayload, undefined);

  const support = await updateCustomerLaunchQaItem({
    session: opsSession,
    itemId: 'user_requests_human',
    status: 'passed',
    blocker: false,
    reason: 'Ops verified user human-help request maps to the support handoff queue.',
  });

  assert.equal(support.qaItem.status, 'passed');
  assert.equal(support.qaItem.blocker, false);
});

test('payment failure QA keeps unsafe payment and policy states blocked unless explicitly verified', async () => {
  const data = await getPersistedCustomerLaunchQaData({ session: complianceSession });
  const noFakePaid = data.paymentFailureChecklist.find((item) => item.itemKey === 'no_fake_paid_state');
  const noFakeIssued = data.paymentFailureChecklist.find((item) => item.itemKey === 'no_fake_issued_policy');
  const unverifiedBlocked = data.paymentFailureChecklist.find((item) => item.itemKey === 'unverified_payment_blocked');

  assert.equal(noFakePaid.status, 'passed');
  assert.equal(noFakeIssued.status, 'passed');
  assert.equal(unverifiedBlocked.status, 'passed');
  assert.equal(data.summary.launchReady, false);

  await updateCustomerLaunchQaItem({
    session: complianceSession,
    itemId: 'failed_cancelled_manual_states',
    status: 'blocked',
    blocker: true,
    reason: 'Compliance keeps manual payment failure state launch-blocking until customer copy is reviewed.',
  });

  const updated = await getPersistedCustomerLaunchQaData({ session: complianceSession });
  assert.ok(updated.summary.paymentFailureBlockers > 0);
});

test('UAT signoff is blocked while customer launch QA blockers remain', async () => {
  await assert.rejects(
    () => updateCustomerLaunchUatRun({
      session: founderSession,
      runId: 'customer-uat-staging-ops-dry-run',
      status: 'completed',
      signoffStatus: 'signed_off',
      reason: 'Founder attempted UAT signoff while launch blockers remain for testing.',
    }),
    /blockers remain/,
  );

  const result = await updateCustomerLaunchUatRun({
    session: complianceSession,
    runId: 'customer-uat-staging-ops-dry-run',
    signoffStatus: 'ready_for_review',
    reason: 'Compliance marked UAT ready for review but not launch signed off.',
  });

  assert.equal(result.uatRun.signoffStatus, 'ready_for_review');
  assert.ok(result.uatRun.blockerCount > 0);
});
