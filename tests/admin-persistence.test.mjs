import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  canDecideAdminExportRequest,
  canApproveAdminMfaRecoveryRequest,
  canCreateAdminMfaRecoveryRequest,
  canManageAdminNotificationPreference,
  canRunAdminNotificationDigestJob,
  canManageAdminMfaRecovery,
  canNotifyAdminMfaRecovery,
  canRevokeAdminExportArtifactAccess,
  canRevokeAdminSessionForActor,
  canRetryAdminScheduledJob,
  canRotateAdminExportArtifactAccess,
  buildAdminAuditSlaTrendBuckets,
  buildAdminScheduledJobRetryDrilldowns,
  buildAdminNotificationDigestBody,
  buildAdminWebhookMonitoringState,
  classifyAdminScheduledJobExecutionAlert,
  classifyAdminScheduledJobStaleAlert,
  getAdminCronExecutionAlertIncidentState,
  getAdminWebhookMonitoringAlertIncidentState,
  getAdminCronAuthorizationState,
  getAdminExportArtifactPolicyConfig,
  getAdminExportArtifactAccessTtlMs,
  getAdminExportArtifactAccessState,
  getAdminMfaRecoveryDueAt,
  getAdminMfaRecoverySlaState,
  getAdminNotificationDigestSchedulerReadiness,
  getAdminNotificationPreferenceDefaults,
  getAdminProviderObservabilityWiring,
  getAdminScheduledWorkflowReadiness,
  hashAdminPassword,
  hashAdminOpaqueToken,
  isAllowedAdminAuditEscalationStatus,
  isAllowedAdminAuditPriority,
  isAllowedAdminAuditReviewStatus,
  isAllowedAdminExportDecision,
  isAllowedAdminMfaRecoveryStatus,
  mapAdminAuditLogForClient,
  mapAdminUserForClient,
  normalizeAdminExportArtifactPolicyEnvironment,
  normalizeAdminNotificationPreferenceForClient,
  summarizeAdminCronExecutionAlertIncidents,
  summarizeAdminWebhookMonitoringAlertIncidents,
  summarizeAdminTechLogsForClient,
  validateAdminActionReason,
  verifyAdminPassword,
} from '../src/server/admin/adminPersistence.js';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  buildTotpQrCodeDataUrl,
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from '../src/server/admin/adminTotp.js';
import {
  checkAdminInviteEmailProviderStatus,
  checkAdminResendWebhookRegistrationStatus,
  classifyAdminEmailDeliveryError,
  classifyResendWebhookStatus,
  extractDomainFromAdminEmailAddress,
  getAdminResendWebhookEndpointUrl,
  getAdminInviteEmailStatus,
  getAdminInviteEmailDeliveryMode,
  getResendWebhookStatus,
  sanitizeResendWebhookListPayload,
  sanitizeResendWebhookPayload,
  sendAdminInviteEmail,
  verifyResendWebhookSignature,
} from '../src/server/admin/adminEmail.js';
import {
  classifyAdminOperationalError,
  normalizeAdminProviderObservabilityForTest,
  normalizeAdminTechLogPayloadForTest,
} from '../src/server/admin/adminTechLogs.js';
import {
  getAdminOperationalJobReadiness,
  previewLoggedMfaRecoverySlaReminderPlaceholder,
  previewLoggedReconciliationJobPlaceholder,
  previewLoggedRenewalReminderPlaceholder,
} from '../src/server/admin/adminOperationalJobPlaceholders.js';
import {
  runAdminLoggedCron,
  runAdminLoggedJob,
} from '../src/server/admin/adminOperationalJobs.js';

test('admin password hashing uses scrypt and verifies without storing plaintext', async () => {
  const hash = await hashAdminPassword('correct horse battery staple');

  assert.match(hash, /^scrypt:v1:/);
  assert.doesNotMatch(hash, /correct horse battery staple/);
  assert.equal(await verifyAdminPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyAdminPassword('wrong password', hash), false);
});

test('admin action reason validation requires a real reason', () => {
  assert.deepEqual(validateAdminActionReason(' Customer asked support to confirm phone number. '), {
    reason: 'Customer asked support to confirm phone number.',
  });
  assert.match(validateAdminActionReason('short').error, /at least 8/);
});

test('admin audit client mapping masks actor email and keeps request metadata', () => {
  const mapped = mapAdminAuditLogForClient({
    id: 'audit_1',
    action: 'reveal_pii',
    actorEmail: 'founder@lajoo.my',
    actorRole: 'founder',
    targetType: 'customer',
    targetId: 'QR-1028',
    field: 'phone',
    reason: 'Customer called support.',
    status: 'logged',
    ipAddress: '127.0.0.1',
    userAgent: 'node-test',
    metadata: { valueType: 'phone' },
    assignmentDueAt: new Date('2026-06-20T00:00:00.000Z'),
    escalationReason: 'Compliance should review this high-risk reveal.',
    createdAt: new Date('2026-06-19T00:00:00.000Z'),
  });

  assert.equal(mapped.actorEmail, 'f***@l***.my');
  assert.equal(mapped.ipAddress, '127.0.0.1');
  assert.equal(mapped.userAgent, 'node-test');
  assert.equal(mapped.createdAt, '2026-06-19T00:00:00.000Z');
  assert.equal(mapped.reviewStatus, 'unreviewed');
  assert.equal(mapped.priority, 'normal');
  assert.equal(mapped.escalationStatus, 'none');
  assert.equal(mapped.assignmentDueAt, '2026-06-20T00:00:00.000Z');
  assert.equal(mapped.escalationReason, 'Compliance should review this high-risk reveal.');
});

test('admin user client mapping masks email and exposes MFA status', () => {
  const mapped = mapAdminUserForClient({
    id: 'admin_1',
    name: 'Ops Reviewer',
    email: 'ops.reviewer@lajoo.my',
    status: 'active',
    mfaStatus: 'pending',
    createdAt: new Date('2026-06-19T00:00:00.000Z'),
    lastActiveAt: null,
    invitedAt: new Date('2026-06-19T00:05:00.000Z'),
    suspendedAt: null,
    roleAssignments: [{ role: 'ops', revokedAt: null }],
  });

  assert.equal(mapped.email, 'o***@l***.my');
  assert.equal(mapped.role, 'ops');
  assert.deepEqual(mapped.roles, ['ops']);
  assert.equal(mapped.mfaStatus, 'pending');
  assert.equal(mapped.invitedAt, '2026-06-19T00:05:00.000Z');
});

test('admin user client mapping does not promote users without active roles', () => {
  const mapped = mapAdminUserForClient({
    id: 'admin_2',
    name: 'Suspended Reviewer',
    email: 'reviewer@lajoo.my',
    status: 'suspended',
    mfaStatus: 'not_configured',
    createdAt: new Date('2026-06-19T00:00:00.000Z'),
    lastActiveAt: null,
    roleAssignments: [{ role: 'founder', revokedAt: new Date('2026-06-19T01:00:00.000Z') }],
  });

  assert.equal(mapped.role, 'unassigned');
  assert.deepEqual(mapped.roles, []);
});

test('admin invite token hashing is deterministic and does not store plaintext token', () => {
  const token = 'plain-one-time-token';
  const first = hashAdminOpaqueToken(token);
  const second = hashAdminOpaqueToken(token);

  assert.equal(first, second);
  assert.notEqual(first, token);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('admin TOTP secrets verify and are encrypted at rest', () => {
  process.env.LAJOO_ADMIN_MFA_SECRET = 'unit-test-mfa-secret';
  const secret = generateTotpSecret();
  const code = generateTotpCode(secret, Date.UTC(2026, 5, 19, 0, 0, 0));
  const encrypted = encryptTotpSecret(secret);

  assert.equal(verifyTotpCode(secret, code, Date.UTC(2026, 5, 19, 0, 0, 0)), true);
  assert.doesNotMatch(encrypted, new RegExp(secret));
  assert.equal(decryptTotpSecret(encrypted), secret);
});

test('admin TOTP setup can render a local QR data URL', async () => {
  const qr = await buildTotpQrCodeDataUrl('otpauth://totp/LAJOO%20Admin:test@example.com?secret=ABCDEF234567');

  assert.match(qr, /^data:image\/png;base64,/);
});

test('admin invite email falls back when provider env is not configured', async () => {
  const env = {
    LAJOO_ADMIN_INVITE_EMAIL_PROVIDER: 'resend',
  };

  assert.deepEqual(getAdminInviteEmailDeliveryMode(env), {
    provider: 'resend',
    configured: false,
    missing: ['RESEND_API_KEY', 'LAJOO_ADMIN_INVITE_FROM'],
  });

  const delivery = await sendAdminInviteEmail({
    email: 'new.admin@lajoo.my',
    name: 'New Admin',
    role: 'ops',
    inviteUrl: 'http://localhost:3000/admin/invite/test',
    expiresAt: '2026-06-26T00:00:00.000Z',
    env,
  });

  assert.equal(delivery.deliveryStatus, 'manual_required');
  assert.equal(delivery.deliveryProvider, 'resend');
  assert.match(delivery.deliveryError, /not fully configured/);
});

test('admin invite email status reports env readiness without exposing secrets', () => {
  const env = {
    LAJOO_ADMIN_INVITE_EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_live_secret_value',
    LAJOO_ADMIN_INVITE_FROM: 'LAJOO Admin <admin@lajoo.my>',
    LAJOO_ADMIN_INVITE_REPLY_TO: 'support@lajoo.my',
  };
  const status = getAdminInviteEmailStatus(env);

  assert.equal(status.provider, 'resend');
  assert.equal(status.configured, true);
  assert.equal(status.deliveryMode, 'resend');
  assert.equal(status.status, 'configured');
  assert.equal(status.domain, 'lajoo.my');
  assert.equal(status.required.every((item) => item.configured), true);
  assert.doesNotMatch(JSON.stringify(status), /re_live_secret_value/);
  assert.doesNotMatch(JSON.stringify(status), /admin@lajoo\.my/);
});

test('admin email provider status checks classify errors without exposing secrets', async () => {
  const env = {
    LAJOO_ADMIN_INVITE_EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_live_secret_value',
    LAJOO_ADMIN_INVITE_FROM: 'LAJOO Admin <admin@lajoo.my>',
  };
  const status = await checkAdminInviteEmailProviderStatus({
    env,
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized API key re_live_secret_value' }),
    }),
  });

  assert.equal(extractDomainFromAdminEmailAddress('LAJOO Admin <admin@lajoo.my>'), 'lajoo.my');
  assert.equal(classifyAdminEmailDeliveryError({ status: 429, message: 'too many requests' }), 'rate_limit');
  assert.equal(status.status, 'provider_error');
  assert.equal(status.providerErrorClass, 'auth');
  assert.doesNotMatch(JSON.stringify(status), /re_live_secret_value/);
  assert.doesNotMatch(JSON.stringify(status), /admin@lajoo\.my/);
});

test('admin email provider status reads domain state without mutating verification', async () => {
  const env = {
    LAJOO_ADMIN_INVITE_EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_live_secret_value',
    LAJOO_ADMIN_INVITE_FROM: 'LAJOO Admin <admin@lajoo.my>',
  };
  let requestedUrl = '';
  const status = await checkAdminInviteEmailProviderStatus({
    env,
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.method, 'GET');
      return {
        ok: true,
        json: async () => ({ data: [{ id: 'domain_1', name: 'lajoo.my', status: 'verified', region: 'us-east-1' }] }),
      };
    },
  });

  assert.match(requestedUrl, /\/domains$/);
  assert.equal(status.status, 'configured');
  assert.equal(status.domainStatus, 'verified');
  assert.equal(status.domainIdPresent, true);
});

test('admin Resend webhook signature verification uses raw body and Svix headers', () => {
  const payload = '{"type":"email.delivered","data":{"email_id":"email_123","to":["new.admin@lajoo.my"],"subject":"Invite"}}';
  const secret = `whsec_${Buffer.from('unit-test-webhook-secret').toString('base64')}`;
  const id = 'msg_unit_test';
  const timestamp = '1781870400';
  const signature = createHmac('sha256', Buffer.from(secret.split('_')[1], 'base64'))
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  const headers = {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`,
  };

  assert.deepEqual(verifyResendWebhookSignature({
    rawBody: payload,
    headers,
    secret,
    now: new Date('2026-06-19T12:00:00.000Z'),
  }), {
    ok: true,
    status: 'verified',
    svixId: id,
  });
  assert.equal(verifyResendWebhookSignature({
    rawBody: `${payload}\n`,
    headers,
    secret,
    now: new Date('2026-06-19T12:00:00.000Z'),
  }).status, 'invalid_signature');
  assert.equal(verifyResendWebhookSignature({
    rawBody: payload,
    headers,
    secret,
    now: new Date('2026-06-19T13:00:00.000Z'),
  }).status, 'stale_timestamp');
});

test('admin Resend webhook sanitization maps statuses without storing raw PII', () => {
  const payload = {
    type: 'email.bounced',
    created_at: '2026-06-19T12:00:00.000Z',
    data: {
      email_id: 'email_123',
      to: ['new.admin@lajoo.my'],
      subject: 'Private invite subject',
      bounce: { type: 'Permanent', subType: 'Suppressed', message: 'raw provider detail' },
      tags: { category: 'admin_invite' },
    },
  };
  const sanitized = sanitizeResendWebhookPayload(payload, { status: 'verified', svixId: 'msg_123' });

  assert.equal(classifyResendWebhookStatus('email.delivered'), 'delivered');
  assert.equal(classifyResendWebhookStatus('email.clicked'), 'clicked');
  assert.equal(classifyResendWebhookStatus('email.failed'), 'failed');
  assert.equal(classifyResendWebhookStatus('domain.updated'), 'unknown');
  assert.equal(sanitized.status, 'bounced');
  assert.equal(sanitized.providerMessageId, 'email_123');
  assert.equal(sanitized.recipientMasked, 'n***@l***.my');
  assert.match(sanitized.emailDigest, /^[a-f0-9]{64}$/);
  assert.equal(sanitized.payloadSummary.hasSubject, true);
  assert.doesNotMatch(JSON.stringify(sanitized), /new\.admin@lajoo\.my/);
  assert.doesNotMatch(JSON.stringify(sanitized), /Private invite subject/);
});

test('admin Resend webhook registration status checks endpoint coverage without exposing secrets', async () => {
  const endpoint = 'https://admin.lajoo.my/api/admin/webhooks/resend';
  const payload = {
    data: [
      {
        id: 'wh_123',
        status: 'active',
        endpoint,
        events: ['email.delivered', 'email.bounced', 'email.complained', 'email.opened', 'email.clicked', 'email.failed'],
        created_at: '2026-06-19T12:00:00.000Z',
      },
    ],
  };
  const sanitized = sanitizeResendWebhookListPayload(payload, endpoint);

  assert.equal(sanitized.status, 'registered');
  assert.equal(sanitized.endpointMatched, true);
  assert.equal(sanitized.matchedWebhookId, 'wh_123');
  assert.deepEqual(sanitized.requiredEventsMissing, []);
  assert.equal(getAdminResendWebhookEndpointUrl({ LAJOO_ADMIN_PUBLIC_BASE_URL: 'https://admin.lajoo.my/' }), endpoint);

  let authorization = '';
  const result = await checkAdminResendWebhookRegistrationStatus({
    env: {
      RESEND_API_KEY: 're_secret_unit_test',
      RESEND_WEBHOOK_SECRET: 'whsec_secret',
      LAJOO_ADMIN_PUBLIC_BASE_URL: 'https://admin.lajoo.my',
    },
    fetchImpl: async (url, options) => {
      assert.match(url, /\/webhooks$/);
      authorization = options.headers.authorization;
      return {
        ok: true,
        json: async () => payload,
      };
    },
  });

  assert.equal(authorization, 'Bearer re_secret_unit_test');
  assert.equal(result.status, 'registered');
  assert.doesNotMatch(JSON.stringify(result), /re_secret_unit_test/);

  const failed = await checkAdminResendWebhookRegistrationStatus({
    env: {
      RESEND_API_KEY: 're_secret_unit_test',
      LAJOO_ADMIN_PUBLIC_BASE_URL: 'https://admin.lajoo.my',
    },
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid key re_secret_unit_test' }),
    }),
  });

  assert.equal(failed.status, 'provider_error');
  assert.equal(failed.errorClass, 'auth');
  assert.doesNotMatch(failed.errorMessage, /re_secret_unit_test/);
});

test('admin Resend webhook monitoring state detects missing setup without exposing secrets', () => {
  const state = buildAdminWebhookMonitoringState({
    webhookStatus: {
      configured: false,
      endpointUrl: 'https://admin.lajoo.my/api/admin/webhooks/resend',
      status: 'missing_env',
    },
    statusCheck: {
      id: 'check_1',
      status: 'configured_partial',
      endpointUrl: 'https://admin.lajoo.my/api/admin/webhooks/resend',
      endpointMatched: true,
      requiredEventsMissing: ['email.clicked'],
      checkedAt: new Date('2026-06-19T12:00:00.000Z'),
    },
    lastWebhookEvent: {
      status: 'delivered',
      verificationStatus: 'invalid_signature',
      receivedAt: '2026-06-19T12:05:00.000Z',
    },
    now: new Date('2026-06-19T12:10:00.000Z'),
  });

  assert.equal(state.status, 'alert');
  assert.equal(state.severity, 'critical');
  assert.deepEqual(state.requiredEventsMissing, ['email.clicked']);
  assert.equal(state.alerts.some((alert) => alert.alertType === 'webhook_secret_missing'), true);
  assert.equal(state.alerts.some((alert) => alert.alertType === 'last_webhook_verification_failed'), true);
  assert.doesNotMatch(JSON.stringify(state), /whsec_|re_secret|v1,/i);
});

test('admin notification digest body is no-PII operational summary only', () => {
  const body = buildAdminNotificationDigestBody({
    frequency: 'hourly',
    since: '2026-06-19T11:00:00.000Z',
    itemCount: 7,
    categories: [
      { label: 'Invite delivery', itemCount: 2, detail: '1 delivery event and 1 pending setup link.' },
      { label: 'MFA recovery', itemCount: 1, detail: '1 pending request; 0 overdue by SLA.' },
      { label: 'Tech incidents', itemCount: 4, detail: '0 payment, 1 insurer, 2 OpenAI, 1 job, 0 cron incidents.' },
    ],
  });

  assert.match(body, /Total no-PII items: 7/);
  assert.match(body, /Tech incidents: 4/);
  assert.doesNotMatch(body, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(body, /\b\d{6}-?\d{2}-?\d{4}\b/);
  assert.doesNotMatch(body, /\+?6?0?1\d[\d\s-]{6,}\d/);
});

test('admin notification digest scheduler is wrapper-ready and least privilege', () => {
  const readiness = getAdminNotificationDigestSchedulerReadiness({
    env: {
      CRON_SECRET: 'cron_secret_value',
      LAJOO_ADMIN_CRON_ENABLED: 'true',
      LAJOO_ADMIN_DIGEST_CRON_ENABLED: 'true',
    },
    liveSchedulerConfigured: false,
  });

  assert.equal(readiness.status, 'manual_only');
  assert.equal(readiness.liveScheduled, false);
  assert.equal(readiness.wrapperReady, true);
  assert.equal(readiness.cronSecretConfigured, true);
  assert.deepEqual(readiness.supportedFrequencies, ['hourly', 'daily']);
  assert.equal(canRunAdminNotificationDigestJob({ role: 'founder' }), true);
  assert.equal(canRunAdminNotificationDigestJob({ role: 'compliance' }), true);
  assert.equal(canRunAdminNotificationDigestJob({ role: 'engineer' }), false);
  assert.doesNotMatch(JSON.stringify(readiness), /cron_secret_value/);
});

test('admin scheduled workflows require CRON_SECRET without exposing it', () => {
  const authorized = getAdminCronAuthorizationState({
    authorizationHeader: 'Bearer cron_secret_value',
    env: { CRON_SECRET: 'cron_secret_value' },
  });
  const denied = getAdminCronAuthorizationState({
    authorizationHeader: 'Bearer wrong_value',
    env: { CRON_SECRET: 'cron_secret_value' },
  });
  const missing = getAdminCronAuthorizationState({ authorizationHeader: '', env: {} });
  const readiness = getAdminScheduledWorkflowReadiness({
    env: {
      CRON_SECRET: 'cron_secret_value',
      LAJOO_ADMIN_CRON_ENABLED: 'true',
      LAJOO_ADMIN_DIGEST_CRON_ENABLED: 'true',
      LAJOO_ADMIN_MFA_RECOVERY_CRON_ENABLED: 'true',
      LAJOO_ADMIN_WEBHOOK_MONITOR_CRON_ENABLED: 'false',
    },
    liveSchedulerConfigured: false,
  });

  assert.equal(authorized.status, 'authorized');
  assert.equal(authorized.authorized, true);
  assert.equal(denied.status, 'unauthorized');
  assert.equal(denied.authorized, false);
  assert.equal(missing.status, 'missing_secret');
  assert.equal(readiness.status, 'cron_ready');
  assert.equal(readiness.jobs.notificationDigests.enabled, true);
  assert.equal(readiness.jobs.mfaRecoverySla.enabled, true);
  assert.equal(readiness.jobs.webhookMonitoring.enabled, false);
  assert.equal(readiness.registration.status, 'deployment_ready');
  assert.equal(readiness.registration.planLimitStatus, 'unknown');
  assert.equal(readiness.registration.blockers.includes('Vercel plan limits not confirmed'), true);
  assert.equal(readiness.registration.cronEntries.some((entry) => entry.path === '/api/admin/cron/webhook-monitoring'), true);
  assert.doesNotMatch(JSON.stringify({ authorized, denied, missing, readiness }), /cron_secret_value/);
});

test('admin scheduled job retry guard is least privilege and status-aware', () => {
  const failedWebhook = { jobKind: 'webhook_monitoring', status: 'failed' };
  const failedDigest = { jobKind: 'notification_digest', status: 'failed' };
  const completedWebhook = { jobKind: 'webhook_monitoring', status: 'completed' };

  assert.equal(canRetryAdminScheduledJob({ actorSession: { role: 'engineer' }, scheduledJobAttempt: failedWebhook }), true);
  assert.equal(canRetryAdminScheduledJob({ actorSession: { role: 'engineer' }, scheduledJobAttempt: failedDigest }), false);
  assert.equal(canRetryAdminScheduledJob({ actorSession: { role: 'compliance' }, scheduledJobAttempt: failedDigest }), true);
  assert.equal(canRetryAdminScheduledJob({ actorSession: { role: 'founder' }, scheduledJobAttempt: { jobKind: 'mfa_recovery_sla', status: 'partial' } }), true);
  assert.equal(canRetryAdminScheduledJob({ actorSession: { role: 'ops' }, scheduledJobAttempt: failedWebhook }), false);
  assert.equal(canRetryAdminScheduledJob({ actorSession: { role: 'founder' }, scheduledJobAttempt: completedWebhook }), false);
});

test('admin cron execution alert classifiers cover failures, skipped env, stale success, and retry drilldowns', () => {
  const failed = classifyAdminScheduledJobExecutionAlert({
    jobName: 'admin-resend-webhook-monitoring',
    jobKind: 'webhook_monitoring',
    status: 'failed',
    failedCount: 1,
  }, { repeatedFailureCount: 3 });
  const skipped = classifyAdminScheduledJobExecutionAlert({
    jobName: 'admin-mfa-recovery-sla',
    jobKind: 'mfa_recovery_sla',
    status: 'skipped',
    skippedCount: 1,
    metadata: { disabledReason: 'LAJOO_ADMIN_CRON_ENABLED must be true.' },
  });
  const stale = classifyAdminScheduledJobStaleAlert({
    jobKind: 'notification_digest',
    jobName: 'admin-notification-digests',
    lastSuccessAt: '2026-06-18T00:00:00.000Z',
    staleThresholdMinutes: 60,
    now: new Date('2026-06-18T03:30:00.000Z'),
  });
  const retryDrilldowns = buildAdminScheduledJobRetryDrilldowns([
    {
      id: 'attempt_original',
      jobName: 'admin-resend-webhook-monitoring',
      jobKind: 'webhook_monitoring',
      status: 'failed',
      metadata: {},
      startedAt: '2026-06-20T00:00:00.000Z',
    },
    {
      id: 'attempt_retry',
      actorEmail: 'e***@l***.my',
      jobName: 'admin-resend-webhook-monitoring',
      jobKind: 'webhook_monitoring',
      status: 'completed',
      triggerSource: 'manual_retry',
      successCount: 1,
      failedCount: 0,
      skippedCount: 0,
      metadata: { retryOfAttemptId: 'attempt_original', retryRequestedByRole: 'engineer' },
      startedAt: '2026-06-20T00:10:00.000Z',
      finishedAt: '2026-06-20T00:11:00.000Z',
    },
  ]);

  assert.equal(failed.alertType, 'repeated_failures');
  assert.equal(failed.priority, 'critical');
  assert.equal(skipped.alertType, 'disabled_by_env');
  assert.equal(skipped.priority, 'normal');
  assert.equal(stale.alertType, 'last_success_stale');
  assert.equal(stale.priority, 'high');
  assert.equal(retryDrilldowns.length, 1);
  assert.equal(retryDrilldowns[0].originalAttemptId, 'attempt_original');
  assert.equal(retryDrilldowns[0].retryAttemptId, 'attempt_retry');
  assert.equal(retryDrilldowns[0].resultCounts.success, 1);
  assert.doesNotMatch(JSON.stringify({ failed, skipped, stale, retryDrilldowns }), /Bearer|secret|prompt|customer@example\.com/);
});

test('admin cron execution alert summary tracks ownership and incident state safely', () => {
  const now = new Date('2026-06-20T10:00:00.000Z');
  const alerts = [
    { id: 'cron_1', status: 'open', priority: 'critical', alertType: 'repeated_failures', assignedToUserId: null },
    { id: 'cron_2', status: 'acknowledged', priority: 'normal', alertType: 'disabled_by_env', assignedToUserId: 'admin_1' },
    { id: 'cron_3', status: 'snoozed', priority: 'high', alertType: 'last_success_stale', assignedToUserId: null, snoozedUntil: '2026-06-20T09:00:00.000Z' },
    { id: 'cron_4', status: 'resolved', priority: 'low', alertType: 'failed', assignedToUserId: 'admin_1' },
  ];
  const summary = summarizeAdminCronExecutionAlertIncidents(alerts, { id: 'admin_1' }, now);

  assert.equal(getAdminCronExecutionAlertIncidentState(alerts[2], now), 'snoozed_expired');
  assert.equal(summary.open, 1);
  assert.equal(summary.acknowledged, 1);
  assert.equal(summary.snoozedExpired, 1);
  assert.equal(summary.resolved, 1);
  assert.equal(summary.repeatedFailures, 1);
  assert.equal(summary.staleSuccess, 1);
  assert.equal(summary.disabledByEnv, 1);
  assert.equal(summary.highCriticalUnassigned, 2);
  assert.equal(summary.assignedToMe, 1);
});

test('admin webhook incident summary detects ownership, priority, and expired snoozes', () => {
  const now = new Date('2026-06-20T10:00:00.000Z');
  const alerts = [
    { id: 'alert_1', status: 'open', priority: 'critical', assignedToUserId: null },
    { id: 'alert_2', status: 'acknowledged', priority: 'normal', assignedToUserId: 'admin_1' },
    { id: 'alert_3', status: 'snoozed', priority: 'high', assignedToUserId: null, snoozedUntil: '2026-06-20T09:00:00.000Z' },
    { id: 'alert_4', status: 'resolved', priority: 'low', assignedToUserId: 'admin_1' },
  ];
  const summary = summarizeAdminWebhookMonitoringAlertIncidents(alerts, { id: 'admin_1' }, now);

  assert.equal(getAdminWebhookMonitoringAlertIncidentState(alerts[2], now), 'snoozed_expired');
  assert.equal(summary.open, 1);
  assert.equal(summary.acknowledged, 1);
  assert.equal(summary.snoozedExpired, 1);
  assert.equal(summary.snoozed, 1);
  assert.equal(summary.resolved, 1);
  assert.equal(summary.assignedToMe, 1);
  assert.equal(summary.highCriticalUnassigned, 2);
  assert.doesNotMatch(JSON.stringify(summary), /@|whsec_|Bearer/i);
});

test('admin notification preference defaults and guards are least privilege', () => {
  const defaults = getAdminNotificationPreferenceDefaults('admin_1');
  const tech = defaults.find((preference) => preference.category === 'tech_incidents');

  assert.equal(defaults.length, 5);
  assert.equal(tech.frequency, 'hourly');
  assert.equal(getResendWebhookStatus({}).status, 'missing_env');
  assert.equal(getResendWebhookStatus({ RESEND_WEBHOOK_SECRET: 'whsec_secret' }).configured, true);
  assert.equal(canManageAdminNotificationPreference({ actorSession: { id: 'admin_1', role: 'ops' }, targetUserId: 'admin_1' }), true);
  assert.equal(canManageAdminNotificationPreference({ actorSession: { id: 'admin_1', role: 'compliance' }, targetUserId: 'admin_2' }), true);
  assert.equal(canManageAdminNotificationPreference({ actorSession: { id: 'admin_1', role: 'ops' }, targetUserId: 'admin_2' }), false);
  assert.deepEqual(normalizeAdminNotificationPreferenceForClient({
    id: 'pref_1',
    userId: 'admin_1',
    category: 'mfa_recovery',
    emailEnabled: false,
    frequency: 'not_real',
    manualFallbackEnabled: false,
  }), {
    id: 'pref_1',
    userId: 'admin_1',
    category: 'mfa_recovery',
    emailEnabled: false,
    frequency: 'immediate',
    manualFallbackEnabled: false,
    createdAt: null,
    updatedAt: null,
    mode: 'database',
  });
});

test('admin session revocation guard protects current session and allows own other sessions', () => {
  const founder = { id: 'founder_1', role: 'founder', sessionId: 'sess_current' };
  const ops = { id: 'ops_1', role: 'ops', sessionId: 'ops_current' };

  assert.equal(canRevokeAdminSessionForActor({
    actorSession: founder,
    targetSession: { id: 'sess_other', userId: 'ops_1' },
  }), true);
  assert.equal(canRevokeAdminSessionForActor({
    actorSession: founder,
    targetSession: { id: 'sess_current', userId: 'founder_1' },
  }), false);
  assert.equal(canRevokeAdminSessionForActor({
    actorSession: ops,
    targetSession: { id: 'ops_other', userId: 'ops_1' },
  }), true);
  assert.equal(canRevokeAdminSessionForActor({
    actorSession: ops,
    targetSession: { id: 'founder_other', userId: 'founder_1' },
  }), false);
});

test('admin export workflow accepts only supported decision statuses', () => {
  assert.equal(isAllowedAdminExportDecision('approved'), true);
  assert.equal(isAllowedAdminExportDecision('rejected'), true);
  assert.equal(isAllowedAdminExportDecision('completed_mock'), true);
  assert.equal(isAllowedAdminExportDecision('blocked'), false);
  assert.equal(isAllowedAdminExportDecision('real_export'), false);
});

test('admin export approval and audit review guards allow only intended states', () => {
  assert.equal(canDecideAdminExportRequest({ role: 'founder' }), true);
  assert.equal(canDecideAdminExportRequest({ role: 'compliance' }), true);
  assert.equal(canDecideAdminExportRequest({ role: 'engineer' }), false);

  assert.equal(isAllowedAdminAuditReviewStatus('reviewed'), true);
  assert.equal(isAllowedAdminAuditReviewStatus('needs_follow_up'), true);
  assert.equal(isAllowedAdminAuditReviewStatus('unreviewed'), true);
  assert.equal(isAllowedAdminAuditReviewStatus('deleted'), false);

  assert.equal(isAllowedAdminAuditPriority('normal'), true);
  assert.equal(isAllowedAdminAuditPriority('critical'), true);
  assert.equal(isAllowedAdminAuditPriority('urgent'), false);
  assert.equal(isAllowedAdminAuditEscalationStatus('none'), true);
  assert.equal(isAllowedAdminAuditEscalationStatus('founder'), true);
  assert.equal(isAllowedAdminAuditEscalationStatus('external'), false);
});

test('admin MFA recovery guard prevents unsafe cross-role recovery', () => {
  const founder = { id: 'founder_1', role: 'founder' };
  const compliance = { id: 'compliance_1', role: 'compliance' };
  const ops = { id: 'ops_1', role: 'ops' };
  const founderUser = { id: 'founder_2', roleAssignments: [{ role: 'founder', revokedAt: null }] };
  const opsUser = { id: 'ops_2', roleAssignments: [{ role: 'ops', revokedAt: null }] };

  assert.equal(canManageAdminMfaRecovery({ actorSession: founder, targetUser: founderUser }), true);
  assert.equal(canManageAdminMfaRecovery({ actorSession: compliance, targetUser: opsUser }), true);
  assert.equal(canManageAdminMfaRecovery({ actorSession: compliance, targetUser: founderUser }), false);
  assert.equal(canManageAdminMfaRecovery({ actorSession: ops, targetUser: opsUser }), false);
  assert.equal(canManageAdminMfaRecovery({ actorSession: ops, targetUser: { id: 'ops_1', roleAssignments: [] } }), true);
});

test('admin MFA recovery approval workflow guards founder targets and self-lockout', () => {
  const founder = { id: 'founder_1', role: 'founder' };
  const compliance = { id: 'compliance_1', role: 'compliance' };
  const ops = { id: 'ops_1', role: 'ops' };
  const founderUser = { id: 'founder_2', roleAssignments: [{ role: 'founder', revokedAt: null }] };
  const opsUser = { id: 'ops_2', roleAssignments: [{ role: 'ops', revokedAt: null }] };

  assert.equal(isAllowedAdminMfaRecoveryStatus('requested'), true);
  assert.equal(isAllowedAdminMfaRecoveryStatus('completed'), true);
  assert.equal(isAllowedAdminMfaRecoveryStatus('deleted'), false);
  assert.equal(canCreateAdminMfaRecoveryRequest({ actorSession: compliance, targetUser: founderUser }), true);
  assert.equal(canCreateAdminMfaRecoveryRequest({ actorSession: ops, targetUser: opsUser }), false);
  assert.equal(canCreateAdminMfaRecoveryRequest({ actorSession: founder, targetUser: { id: 'founder_1', roleAssignments: [] } }), false);
  assert.equal(canApproveAdminMfaRecoveryRequest({
    actorSession: compliance,
    recoveryRequest: { id: 'req_1', status: 'requested', targetUserId: 'ops_2', targetUser: opsUser },
  }), true);
  assert.equal(canApproveAdminMfaRecoveryRequest({
    actorSession: compliance,
    recoveryRequest: { id: 'req_2', status: 'requested', targetUserId: 'founder_2', targetUser: founderUser },
  }), false);
  assert.equal(canApproveAdminMfaRecoveryRequest({
    actorSession: founder,
    recoveryRequest: { id: 'req_3', status: 'requested', targetUserId: 'founder_1', targetUser: founderUser },
  }), false);
});

test('admin MFA recovery SLA and notification guards are deterministic', () => {
  const now = new Date('2026-06-19T00:00:00.000Z');
  const founder = { id: 'founder_1', role: 'founder' };
  const compliance = { id: 'compliance_1', role: 'compliance' };
  const ops = { id: 'ops_1', role: 'ops' };
  const request = {
    id: 'req_sla',
    status: 'requested',
    targetUserId: 'ops_2',
    dueAt: '2026-06-19T03:30:00.000Z',
  };

  assert.equal(getAdminMfaRecoveryDueAt('critical', now).toISOString(), '2026-06-19T04:00:00.000Z');
  assert.equal(getAdminMfaRecoveryDueAt('normal', now).toISOString(), '2026-06-20T00:00:00.000Z');
  assert.equal(getAdminMfaRecoverySlaState(request, now), 'due_soon');
  assert.equal(getAdminMfaRecoverySlaState({ ...request, dueAt: '2026-06-18T23:00:00.000Z' }, now), 'overdue');
  assert.equal(getAdminMfaRecoverySlaState({ ...request, status: 'completed' }, now), 'completed');
  assert.equal(canNotifyAdminMfaRecovery({ actorSession: founder, recoveryRequest: request }), true);
  assert.equal(canNotifyAdminMfaRecovery({ actorSession: compliance, recoveryRequest: request }), true);
  assert.equal(canNotifyAdminMfaRecovery({ actorSession: ops, recoveryRequest: request }), false);
});

test('admin export artifact signed access state handles inactive and expiry', () => {
  const now = new Date('2026-06-19T00:00:00.000Z');

  assert.equal(getAdminExportArtifactAccessState({
    status: 'active',
    expiresAt: '2026-06-19T00:10:00.000Z',
  }, now), 'active');
  assert.equal(getAdminExportArtifactAccessState({
    status: 'active',
    expiresAt: '2026-06-18T23:59:00.000Z',
  }, now), 'expired');
  assert.equal(getAdminExportArtifactAccessState({
    status: 'revoked',
    expiresAt: '2026-06-19T00:10:00.000Z',
  }, now), 'inactive');
  assert.equal(canRevokeAdminExportArtifactAccess({ role: 'founder' }), true);
  assert.equal(canRevokeAdminExportArtifactAccess({ role: 'compliance' }), true);
  assert.equal(canRevokeAdminExportArtifactAccess({ role: 'ops' }), false);
  assert.equal(canRotateAdminExportArtifactAccess({ role: 'founder' }), true);
  assert.equal(canRotateAdminExportArtifactAccess({ role: 'ops' }), false);
  assert.equal(getAdminExportArtifactAccessTtlMs({}), 10 * 60 * 1000);
  assert.equal(getAdminExportArtifactAccessTtlMs({ LAJOO_ADMIN_EXPORT_ARTIFACT_TTL_SECONDS: '30' }), 60 * 1000);
  assert.equal(getAdminExportArtifactAccessTtlMs({ LAJOO_ADMIN_EXPORT_ARTIFACT_TTL_SECONDS: '7200' }), 60 * 60 * 1000);
  assert.deepEqual(getAdminExportArtifactPolicyConfig({
    LAJOO_ADMIN_EXPORT_ARTIFACT_TTL_SECONDS: '900',
    LAJOO_ADMIN_EXPORT_ARTIFACT_MIN_TTL_SECONDS: '120',
    LAJOO_ADMIN_EXPORT_ARTIFACT_MAX_TTL_SECONDS: '1800',
  }), {
    status: 'configured',
    ttlSource: 'env',
    effectiveTtlSeconds: 900,
    ttlMinutes: 15,
    minTtlSeconds: 120,
    maxTtlSeconds: 1800,
    validationWarnings: [],
    envKeys: {
      ttl: 'LAJOO_ADMIN_EXPORT_ARTIFACT_TTL_SECONDS',
      min: 'LAJOO_ADMIN_EXPORT_ARTIFACT_MIN_TTL_SECONDS',
      max: 'LAJOO_ADMIN_EXPORT_ARTIFACT_MAX_TTL_SECONDS',
    },
  });
  const invalidPolicy = getAdminExportArtifactPolicyConfig({
    LAJOO_ADMIN_EXPORT_ARTIFACT_TTL_SECONDS: 'unsafe',
  });
  assert.equal(invalidPolicy.status, 'invalid_env');
  assert.equal(invalidPolicy.effectiveTtlSeconds, 600);
  assert.equal(invalidPolicy.validationWarnings.length, 1);
  assert.equal(normalizeAdminExportArtifactPolicyEnvironment('prod'), 'production');
  assert.equal(normalizeAdminExportArtifactPolicyEnvironment('preview'), 'preview');
  assert.equal(normalizeAdminExportArtifactPolicyEnvironment('test'), 'development');
});

test('admin tech log payload summaries redact secrets, raw PII, nested values, and long values', () => {
  const summary = normalizeAdminTechLogPayloadForTest({
    token: 'secret-token',
    authorization: 'Bearer secret',
    safe: 'ok',
    email: 'customer@example.com',
    note: 'Call +60 12 448 7789 about IC 920418-14-5582.',
    nested: {
      signature: 'signed-value',
      comment: 'new.admin@lajoo.my',
    },
    longText: 'x'.repeat(220),
  });

  assert.equal(summary.token, '[redacted]');
  assert.equal(summary.authorization, '[redacted]');
  assert.equal(summary.safe, 'ok');
  assert.equal(summary.email, '[redacted]');
  assert.equal(summary.nested.signature, '[redacted]');
  assert.equal(summary.nested.comment, '[redacted_email]');
  assert.match(summary.note, /\[redacted_phone\]/);
  assert.match(summary.note, /\[redacted_ic\]/);
  assert.match(summary.longText, /\.\.\.$/);
});

test('admin provider observability metadata is safe and classified', () => {
  const metadata = normalizeAdminProviderObservabilityForTest({
    providerEnvironment: 'production',
    signatureStatus: 'verified',
    adapterVersion: 'adapter-v2',
    retryCount: 2,
    latencyMs: 185,
    errorMessage: 'Provider timeout while calling customer@example.com with token secret',
    payload: {
      authorization: 'Bearer secret',
      requestId: 'req_123',
      phone: '+60 12 448 7789',
    },
  });

  assert.equal(metadata.providerEnvironment, 'production');
  assert.equal(metadata.verificationStatus, 'verified');
  assert.equal(metadata.adapterVersion, 'adapter-v2');
  assert.equal(metadata.retryCount, 2);
  assert.equal(metadata.latencyMs, 185);
  assert.equal(metadata.errorClass, 'timeout');
  assert.equal(metadata.payloadSummary.authorization, '[redacted]');
  assert.equal(metadata.payloadSummary.phone, '[redacted]');
  assert.equal(classifyAdminOperationalError({ statusCode: 401, message: 'Unauthorized API key' }), 'auth');
});

test('admin audit SLA trend buckets count workload without PII', () => {
  const buckets = buildAdminAuditSlaTrendBuckets([
    {
      createdAt: '2026-06-18T10:00:00.000Z',
      assignmentDueAt: '2026-06-18T18:00:00.000Z',
      reviewStatus: 'unreviewed',
      assignedToUserId: null,
      ownerRole: 'compliance',
      priority: 'critical',
      escalationStatus: 'compliance',
    },
    {
      createdAt: '2026-06-19T10:00:00.000Z',
      assignmentDueAt: '2026-06-21T18:00:00.000Z',
      reviewStatus: 'reviewed',
      assignedToUserId: 'admin_1',
      ownerRole: 'founder',
      priority: 'high',
      escalationStatus: 'founder',
    },
  ], {
    now: new Date('2026-06-20T00:00:00.000Z'),
    days: 3,
  });

  const june18 = buckets.find((bucket) => bucket.day === '2026-06-18');
  assert.equal(june18.assignedWorkload, 1);
  assert.equal(june18.overdueCount, 1);
  assert.equal(june18.criticalUnassigned, 1);
  assert.equal(june18.complianceQueueVolume, 1);
  assert.doesNotMatch(JSON.stringify(buckets), /@|920418|\+60/);
});

test('admin tech observability summaries expose safe counts and filters only', () => {
  const summary = summarizeAdminTechLogsForClient({
    paymentWebhooks: [
      {
        id: 'pay_1',
        provider: 'stripe',
        providerEnvironment: 'test',
        eventStatus: 'failed',
        retryCount: 2,
        latencyMs: 120,
        errorClass: 'auth',
        source: 'system',
        payloadSummary: { authorization: '[redacted]' },
      },
      {
        id: 'pay_2',
        provider: 'mock',
        providerEnvironment: 'mock',
        eventStatus: 'received_mock',
        retryCount: 0,
        source: 'mock',
      },
    ],
    insurerAdapters: [
      {
        id: 'adapter_1',
        insurerCode: 'ETIQA',
        status: 'success',
        providerEnvironment: 'sandbox',
        retryCount: 1,
        latencyMs: 240,
        source: 'system',
      },
    ],
    openAiUsage: [],
    jobQueue: [],
    cronReminders: [],
  });

  assert.equal(summary.totals.rows, 3);
  assert.equal(summary.totals.systemRows, 2);
  assert.equal(summary.totals.mockRows, 1);
  assert.equal(summary.totals.errorRows, 1);
  assert.equal(summary.categories.paymentWebhooks.avgLatencyMs, 120);
  assert.equal(summary.categories.paymentWebhooks.latencyP50Ms, 120);
  assert.equal(summary.categories.paymentWebhooks.latencyP95Ms, 120);
  assert.equal(summary.categories.paymentWebhooks.errorRate, 50);
  assert.equal(summary.categories.paymentWebhooks.retryRate, 50);
  assert.equal(summary.categories.paymentWebhooks.uptimePercent, 50);
  assert.deepEqual(summary.categories.paymentWebhooks.incidentTrend, [{ date: 'unknown', count: 1 }]);
  assert.deepEqual(summary.categories.paymentWebhooks.sloTrend, [{
    date: 'unknown',
    total: 2,
    errorCount: 1,
    retryCount: 1,
    errorRate: 50,
    retryRate: 50,
    uptimePercent: 50,
    avgLatencyMs: 120,
    latencyP50Ms: 120,
    latencyP95Ms: 120,
    errorClassCounts: { auth: 1 },
  }]);
  assert.deepEqual(summary.categories.paymentWebhooks.retryTrend, [{ date: 'unknown', retryCount: 1, retryRate: 50 }]);
  assert.deepEqual(summary.categories.paymentWebhooks.errorClassTrend, [{ date: 'unknown', errorClass: 'auth', count: 1 }]);
  assert.deepEqual(summary.redaction, {
    containsSecrets: false,
    containsRawPayloads: false,
    containsRawPrompts: false,
    containsRawPii: false,
  });
  assert.equal(summary.wiring.paymentWebhooks.status, 'wired');
  assert.equal(summary.wiring.insurerAdapters.status, 'wired');
  assert.equal(summary.wiring.openAiUsage.status, 'wired');
  assert.equal(summary.wiring.jobQueue.status, 'wrapper_ready');
  assert.equal(getAdminProviderObservabilityWiring().cronReminders.status, 'wired_for_admin_cron');
  assert.equal(summary.filters.providers.includes('stripe'), true);
  assert.doesNotMatch(JSON.stringify(summary), /authorization|Bearer|customer@example\.com/);
});

test('admin job and cron wrappers execute handlers and preserve failures', async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const jobResult = await runAdminLoggedJob({ queueName: 'unit', jobName: 'sample' }, async () => 'done');
    const cronResult = await runAdminLoggedCron({ cronName: 'unit-cron' }, async () => ({ affectedCount: 2 }));

    assert.equal(jobResult, 'done');
    assert.deepEqual(cronResult, { affectedCount: 2 });
    await assert.rejects(
      () => runAdminLoggedJob({ queueName: 'unit', jobName: 'failing' }, async () => {
        const error = new Error('provider timeout');
        error.code = 'ETIMEDOUT';
        throw error;
      }),
      /provider timeout/,
    );
  } finally {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

test('admin operational job placeholders are explicit and unscheduled', async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const readiness = getAdminOperationalJobReadiness();
    assert.equal(readiness.status, 'placeholder');
    assert.equal(readiness.liveReminderCron, false);
    assert.equal(readiness.liveReconciliationJob, false);
    assert.equal(readiness.liveDigestScheduler, false);
    assert.equal(readiness.placeholders.includes('admin-notification-digests'), true);
    assert.match(readiness.note, /Phase 11/);

    const reminderPreview = await previewLoggedRenewalReminderPlaceholder(async () => ({ affectedCount: 0, wired: false }));
    const reconciliationPreview = await previewLoggedReconciliationJobPlaceholder(async () => ({ processedCount: 0, wired: false }));
    const mfaReminderPreview = await previewLoggedMfaRecoverySlaReminderPlaceholder(async () => ({ matchedCount: 0, sentCount: 0, wired: false }));

    assert.deepEqual(reminderPreview, { affectedCount: 0, wired: false });
    assert.deepEqual(reconciliationPreview, { processedCount: 0, wired: false });
    assert.deepEqual(mfaReminderPreview, { matchedCount: 0, sentCount: 0, wired: false });
  } finally {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
  }
});
