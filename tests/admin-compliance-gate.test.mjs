import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canInspectComplianceGate,
  canManageComplianceGate,
  getPersistedComplianceLaunchGateData,
  recordComplianceLaunchDecision,
  resetAdminComplianceGateMemoryForTest,
  updateComplianceChecklistItem,
  updateComplianceLegalDocument,
  updateComplianceOperatingModel,
  updateInsurerApprovedScriptFact,
} from '../src/server/admin/adminComplianceGate.js';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

const founderSession = {
  id: 'founder-compliance-test',
  source: 'test',
  role: 'founder',
  email: 'founder@lajoo.my',
  permissions: ['security_access', 'business_admin'],
};

const complianceSession = {
  id: 'compliance-test',
  source: 'test',
  role: 'compliance',
  email: 'compliance@lajoo.my',
  permissions: ['security_access', 'reveal_pii'],
};

const opsSession = {
  id: 'ops-test',
  source: 'test',
  role: 'ops',
  email: 'ops@lajoo.my',
  permissions: ['business_admin'],
};

const aiQaSession = {
  id: 'ai-qa-test',
  source: 'test',
  role: 'ai_qa',
  email: 'ai.qa@lajoo.my',
  permissions: ['ai_knowledge'],
};

test.beforeEach(() => {
  delete process.env.DATABASE_URL;
  resetAdminComplianceGateMemoryForTest();
});

test.after(() => {
  if (ORIGINAL_DATABASE_URL) process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

test('compliance launch gate inspection and management permissions are least-privilege', () => {
  assert.equal(canInspectComplianceGate(founderSession), true);
  assert.equal(canInspectComplianceGate(complianceSession), true);
  assert.equal(canInspectComplianceGate(opsSession), true);
  assert.equal(canInspectComplianceGate(aiQaSession), true);
  assert.equal(canInspectComplianceGate(null), false);

  assert.equal(canManageComplianceGate(founderSession), true);
  assert.equal(canManageComplianceGate(complianceSession), true);
  assert.equal(canManageComplianceGate(opsSession), false);
  assert.equal(canManageComplianceGate(aiQaSession), false);
});

test('default compliance gate data is conservative and launch-blocking', async () => {
  const data = await getPersistedComplianceLaunchGateData({ session: complianceSession });

  assert.equal(data.persisted, false);
  assert.equal(data.summary.launchReady, false);
  assert.equal(data.summary.decisionStatus, 'not_ready');
  assert.ok(data.summary.blockerCount > 0);
  assert.ok(data.operatingModels.every((item) => item.launchReady === false));
  assert.ok(data.legalDocuments.some((item) => item.status !== 'approved'));
  assert.ok(data.pdpaChecklist.some((item) => item.status !== 'approved'));
  assert.ok(data.aiChecklist.some((item) => item.itemKey === 'unsupported_claims_blocker' && item.status === 'blocked'));
  assert.ok(data.scriptFacts.every((item) => item.status !== 'approved'));
  assert.ok(data.officialSources.some((item) => item.url.includes('bnm.gov.my')));
  assert.ok(data.officialSources.some((item) => item.url.includes('pdp.gov.my')));
  assert.ok(data.officialSources.some((item) => item.url.includes('jpj.gov.my')));
});

test('legal document status changes require compliance/founder role and a reason', async () => {
  await assert.rejects(
    () => updateComplianceLegalDocument({
      session: opsSession,
      documentId: 'privacy_policy_pdpa_notice',
      status: 'approved',
      reason: 'Ops should not approve legal documents.',
    }),
    /Founder or compliance role required/,
  );

  await assert.rejects(
    () => updateComplianceLegalDocument({
      session: complianceSession,
      documentId: 'privacy_policy_pdpa_notice',
      status: 'approved',
      reason: 'short',
    }),
    /at least 8/,
  );

  const result = await updateComplianceLegalDocument({
    session: complianceSession,
    documentId: 'privacy_policy_pdpa_notice',
    status: 'approved',
    version: 'v1.0-legal-review',
    reason: 'Compliance approved the PDPA notice draft for founder/legal review testing.',
  });

  assert.equal(result.persisted, false);
  assert.equal(result.legalDocument.status, 'approved');
  assert.equal(result.legalDocument.version, 'v1.0-legal-review');
});

test('launch ready decision remains blocked while compliance blockers remain', async () => {
  await assert.rejects(
    () => recordComplianceLaunchDecision({
      session: founderSession,
      status: 'ready',
      reason: 'Founder attempted launch-ready while blockers remain for testing.',
    }),
    /blockers remain/,
  );

  const result = await recordComplianceLaunchDecision({
    session: founderSession,
    status: 'not_ready',
    reason: 'Founder recorded not-ready because legal, PDPA, and insurer-script blockers remain.',
  });

  assert.equal(result.launchDecision.status, 'not_ready');
  assert.ok(result.launchDecision.blockers.length > 0);
});

test('operating model cannot be launch-ready without explicit compliance action', async () => {
  const result = await updateComplianceOperatingModel({
    session: complianceSession,
    modelId: 'sandbox_manual_ops_model',
    status: 'launch_ready',
    reason: 'Compliance marked the manual ops model as launch-ready for controlled testing only.',
    note: 'This still does not clear legal documents, PDPA, or script blockers.',
  });

  assert.equal(result.operatingModel.status, 'launch_ready');
  assert.equal(result.operatingModel.launchReady, true);

  const data = await getPersistedComplianceLaunchGateData({ session: complianceSession });
  assert.equal(data.summary.operatingModelStatus, 'launch_ready');
  assert.equal(data.summary.launchReady, false);
});

test('PDPA checklist and insurer script/fact records stay launch-blocking until approved', async () => {
  const checklistResult = await updateComplianceChecklistItem({
    session: complianceSession,
    itemId: 'admin_pii_audit',
    status: 'approved',
    reason: 'Compliance verified admin PII masking and reveal audit evidence for testing.',
    note: 'Audit evidence reviewed.',
  });

  assert.equal(checklistResult.checklistItem.status, 'approved');

  const scriptResult = await updateInsurerApprovedScriptFact({
    session: founderSession,
    recordId: 'compliance-fact-jpj-lkm-insurance',
    status: 'approved',
    reason: 'Founder approved this official-source fact for limited road-tax explanations in testing.',
  });

  assert.equal(scriptResult.scriptFact.status, 'approved');

  const data = await getPersistedComplianceLaunchGateData({ session: complianceSession });
  assert.equal(data.summary.launchReady, false);
  assert.ok(data.summary.blockerCount > 0);
});
