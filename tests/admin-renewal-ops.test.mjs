import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canManageRenewalOps,
  canReleasePolicyToCustomer,
  canVerifyPolicyDocuments,
  getPersistedRenewalOpsData,
  resetAdminRenewalOpsMemoryForTest,
  updateInsurerPartnerSubmission,
  updateRenewalOpsCaseStatus,
  upsertPolicyDocumentVerification,
} from '../src/server/admin/adminRenewalOps.js';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

const founderSession = {
  id: 'founder-test',
  source: 'test',
  role: 'founder',
  email: 'founder@lajoo.my',
  permissions: ['business_admin', 'security_access', 'reveal_pii'],
};

const opsSession = {
  id: 'ops-test',
  source: 'test',
  role: 'ops',
  email: 'ops@lajoo.my',
  permissions: ['business_admin', 'reveal_pii'],
};

const complianceSession = {
  id: 'compliance-test',
  source: 'test',
  role: 'compliance',
  email: 'compliance@lajoo.my',
  permissions: ['security_access', 'reveal_pii'],
};

test.beforeEach(() => {
  delete process.env.DATABASE_URL;
  resetAdminRenewalOpsMemoryForTest();
});

test.after(() => {
  if (ORIGINAL_DATABASE_URL) process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

test('renewal ops data masks PII by default and labels manual/demo sources honestly', async () => {
  const data = await getPersistedRenewalOpsData({ session: opsSession });
  const firstCase = data.cases.find((item) => item.caseRef === 'QR-1028');

  assert.equal(data.persisted, false);
  assert.equal(firstCase.customerIc, '******-**-5582');
  assert.match(firstCase.customerEmail, /\*\*\*/);
  assert.match(firstCase.customerPhone, /^\+\d{2} \*\*/);
  assert.doesNotMatch(JSON.stringify(firstCase), /aisyah\.rahman@example\.com|920418-14-5582|\+60 12 448 7789/);
  assert.equal(firstCase.customerReleaseBlocked, true);
  assert.equal(firstCase.policyIssuedToCustomer, false);
  assert.ok(data.manualIssuanceLabels.some((item) => item.value === 'manual_insurer_portal'));
  assert.ok(data.manualIssuanceLabels.some((item) => item.value === 'mock_demo'));
});

test('renewal ops status changes require founder or ops role and a real reason', async () => {
  assert.equal(canManageRenewalOps(founderSession), true);
  assert.equal(canManageRenewalOps(opsSession), true);
  assert.equal(canManageRenewalOps(complianceSession), false);

  await assert.rejects(
    () => updateRenewalOpsCaseStatus({
      session: opsSession,
      caseId: 'ops-case-qr-1028',
      status: 'submitted_to_insurer',
      reason: 'short',
    }),
    /at least 8/,
  );

  await assert.rejects(
    () => updateRenewalOpsCaseStatus({
      session: complianceSession,
      caseId: 'ops-case-qr-1028',
      status: 'submitted_to_insurer',
      reason: 'Compliance should only inspect this status update.',
    }),
    /Founder or ops role required/,
  );

  const result = await updateRenewalOpsCaseStatus({
    session: opsSession,
    caseId: 'ops-case-qr-1028',
    status: 'submitted_to_insurer',
    reason: 'Ops submitted this demo case through a manual insurer portal.',
  });

  assert.equal(result.case.status, 'submitted_to_insurer');
  assert.equal(result.case.policyIssuedToCustomer, false);
  assert.equal(result.event.previousStatus, 'quote_review');
  assert.equal(result.event.status, 'submitted_to_insurer');
});

test('renewal ops rejects unsupported or unsafe lifecycle transitions', async () => {
  await assert.rejects(
    () => updateRenewalOpsCaseStatus({
      session: founderSession,
      caseId: 'ops-case-qr-1028',
      status: 'not_a_status',
      reason: 'Founder attempted an unsupported status for testing.',
    }),
    /Unsupported renewal ops status/,
  );

  await assert.rejects(
    () => updateRenewalOpsCaseStatus({
      session: founderSession,
      caseId: 'ops-case-qr-1028',
      status: 'completed',
      reason: 'Completion must be blocked until policy verification exists.',
    }),
    /only be completed after policy document verification/,
  );
});

test('insurer partner submission queue updates remain manual or demo labeled', async () => {
  const result = await updateInsurerPartnerSubmission({
    session: opsSession,
    submissionId: 'sub-qr-1028-etiqa',
    status: 'submitted_to_insurer',
    reason: 'Ops submitted the renewal through a manual insurer portal.',
  });

  assert.equal(result.submission.status, 'submitted_to_insurer');
  assert.equal(result.submission.channel, 'manual_insurer_portal');
  assert.equal(result.submission.sourceLabel, 'mock_demo');
});

test('policy document verification is allowed for compliance and still blocks customer release', async () => {
  assert.equal(canVerifyPolicyDocuments(complianceSession), true);

  const result = await upsertPolicyDocumentVerification({
    session: complianceSession,
    documentId: 'doc-qr-1027-placeholder',
    verificationStatus: 'verified',
    reason: 'Compliance reviewed the manual policy metadata placeholder.',
    reviewerNote: 'Metadata reviewed; no file release is enabled.',
  });

  assert.equal(result.document.verificationStatus, 'verified');
  assert.equal(result.document.noCustomerRelease, true);

  const data = await getPersistedRenewalOpsData({ session: complianceSession });
  const verifiedCase = data.cases.find((item) => item.caseRef === 'QR-1027');
  assert.equal(verifiedCase.status, 'policy_verified');
  assert.equal(verifiedCase.policyIssuedToCustomer, false);
  assert.equal(verifiedCase.customerReleaseBlocked, true);
  assert.equal(canReleasePolicyToCustomer(verifiedCase, true), false);
});
