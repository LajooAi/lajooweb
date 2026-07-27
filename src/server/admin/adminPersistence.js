import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  ADMIN_ROLES,
  ADMIN_PERMISSIONS,
  ROLE_DEFINITIONS,
  canExportAdminData,
  getPermissionsForRole,
  hasAdminPermission,
  normalizeAdminRole,
} from "./adminRoles.js";
import {
  buildTotpQrCodeDataUrl,
  buildTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  verifyTotpCode,
} from "./adminTotp.js";
import {
  checkAdminResendWebhookRegistrationStatus,
  checkAdminInviteEmailProviderStatus,
  classifyAdminEmailDeliveryError,
  extractDomainFromAdminEmailAddress,
  getAdminResendWebhookEndpointUrl,
  getAdminInviteEmailStatus,
  getResendWebhookStatus,
  sanitizeResendWebhookPayload,
  sendAdminInviteEmail,
  sendAdminOperationalEmail,
  verifyResendWebhookSignature,
} from "./adminEmail.js";
import { maskAdminEmail } from "../../lib/admin/piiMasking.js";

const scrypt = promisify(scryptCallback);
const PASSWORD_HASH_PREFIX = "scrypt:v1";
const SESSION_TOKEN_PREFIX = "db";
const ACTIVE_STATUSES = new Set(["active"]);
const ROLE_PRIORITY = ["founder", "compliance", "engineer", "ops", "ai_qa", "agent_manager"];
const MFA_STATUSES = new Set(["not_configured", "pending", "enabled"]);
const EXPORT_APPROVAL_STATUSES = new Set(["approved", "rejected", "completed_mock"]);
const AUDIT_REVIEW_STATUSES = new Set(["unreviewed", "reviewed", "needs_follow_up"]);
const AUDIT_PRIORITIES = new Set(["low", "normal", "high", "critical"]);
const AUDIT_ESCALATION_STATUSES = new Set(["none", "compliance", "founder"]);
const MFA_RECOVERY_STATUSES = new Set(["requested", "approved", "rejected", "completed", "blocked"]);
const ADMIN_NOTIFICATION_CATEGORIES = ["invites", "mfa_recovery", "audit_assignment", "export_artifact_access", "tech_incidents"];
const ADMIN_NOTIFICATION_FREQUENCIES = new Set(["immediate", "hourly", "daily", "manual_only"]);
const WEBHOOK_ALERT_STATUSES = new Set(["open", "acknowledged", "snoozed", "resolved"]);
const WEBHOOK_ALERT_PRIORITIES = new Set(["low", "normal", "high", "critical"]);
const WEBHOOK_ALERT_ACTIVE_STATUSES = ["open", "acknowledged", "snoozed"];
const CRON_ALERT_STATUSES = WEBHOOK_ALERT_STATUSES;
const CRON_ALERT_PRIORITIES = WEBHOOK_ALERT_PRIORITIES;
const CRON_ALERT_ACTIVE_STATUSES = WEBHOOK_ALERT_ACTIVE_STATUSES;
const CRON_ALERT_STALE_THRESHOLD_MINUTES = 26 * 60;
const CRON_ALERT_JOB_LABELS = {
  notification_digest: "admin notification digests",
  mfa_recovery_sla: "MFA recovery SLA reminders",
  webhook_monitoring: "Resend webhook monitoring",
};
const EXPORT_ARTIFACT_POLICY_ENVIRONMENTS = ["development", "preview", "production"];
const INVITE_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MFA_CHALLENGE_MAX_AGE_MS = 5 * 60 * 1000;
const EXPORT_ARTIFACT_ACCESS_DEFAULT_TTL_SECONDS = 10 * 60;
const EXPORT_ARTIFACT_ACCESS_MIN_TTL_SECONDS = 60;
const EXPORT_ARTIFACT_ACCESS_MAX_TTL_SECONDS = 60 * 60;
const MFA_RECOVERY_SLA_HOURS = {
  low: 72,
  normal: 24,
  high: 8,
  critical: 4,
};

const fallbackAdminUsers = [
  {
    id: "adm-001",
    name: "Founder Admin",
    email: maskAdminEmail("founder@lajoo.my"),
    role: "founder",
    roles: ["founder"],
    status: "active",
    createdAt: "2026-06-19T00:00:00.000Z",
    lastActive: "2026-06-19T02:18:00.000Z",
    mfaStatus: "not_configured",
    invitedAt: "2026-06-19T00:00:00.000Z",
    suspendedAt: null,
    source: "mock",
  },
  {
    id: "adm-002",
    name: "Ops Lead",
    email: maskAdminEmail("ops@lajoo.my"),
    role: "ops",
    roles: ["ops"],
    status: "active",
    createdAt: "2026-06-18T00:00:00.000Z",
    lastActive: "2026-06-18T10:40:00.000Z",
    mfaStatus: "pending",
    invitedAt: "2026-06-18T00:00:00.000Z",
    suspendedAt: null,
    source: "mock",
  },
  {
    id: "adm-003",
    name: "AI QA Reviewer",
    email: maskAdminEmail("ai.qa@lajoo.my"),
    role: "ai_qa",
    roles: ["ai_qa"],
    status: "active",
    createdAt: "2026-06-18T00:00:00.000Z",
    lastActive: "2026-06-18T08:22:00.000Z",
    mfaStatus: "not_configured",
    invitedAt: "2026-06-18T00:00:00.000Z",
    suspendedAt: null,
    source: "mock",
  },
  {
    id: "adm-004",
    name: "Compliance Reviewer",
    email: maskAdminEmail("compliance@lajoo.my"),
    role: "compliance",
    roles: ["compliance"],
    status: "invited",
    createdAt: "2026-06-17T00:00:00.000Z",
    lastActive: null,
    mfaStatus: "pending",
    invitedAt: "2026-06-17T00:00:00.000Z",
    suspendedAt: null,
    source: "mock",
  },
  {
    id: "adm-005",
    name: "Engineer",
    email: maskAdminEmail("engineer@lajoo.my"),
    role: "engineer",
    roles: ["engineer"],
    status: "active",
    createdAt: "2026-06-17T00:00:00.000Z",
    lastActive: "2026-06-17T15:05:00.000Z",
    mfaStatus: "enabled",
    invitedAt: "2026-06-17T00:00:00.000Z",
    suspendedAt: null,
    source: "mock",
  },
  {
    id: "adm-006",
    name: "Agent Manager",
    email: maskAdminEmail("agent.manager@lajoo.my"),
    role: "agent_manager",
    roles: ["agent_manager"],
    status: "draft",
    createdAt: "2026-06-16T00:00:00.000Z",
    lastActive: null,
    mfaStatus: "not_configured",
    invitedAt: null,
    suspendedAt: null,
    source: "mock",
  },
];

const fallbackAuditLogs = [
  {
    id: "audit-1",
    action: "reveal_pii",
    actorEmail: "f***@l***.my",
    actorRole: "founder",
    targetType: "customer",
    targetId: "CUS-1024",
    field: "phone",
    reason: "Customer called support to confirm renewal reminder delivery.",
    status: "logged",
    createdAt: "2026-06-19T02:15:00.000Z",
    ipAddress: "mock",
    userAgent: "mock",
    reviewStatus: "unreviewed",
    reviewedAt: null,
    reviewedByEmail: null,
    reviewNote: null,
    mode: "mock",
  },
  {
    id: "audit-2",
    action: "export_blocked",
    actorEmail: "o***@l***.my",
    actorRole: "ops",
    targetType: "renewals",
    targetId: "renewal-pipeline",
    field: "bulk_export",
    reason: "Ops requested spreadsheet for follow-up.",
    status: "blocked",
    createdAt: "2026-06-18T09:45:00.000Z",
    ipAddress: "mock",
    userAgent: "mock",
    reviewStatus: "needs_follow_up",
    reviewedAt: null,
    reviewedByEmail: null,
    reviewNote: null,
    mode: "mock",
  },
  {
    id: "audit-3",
    action: "role_review",
    actorEmail: "c***@l***.my",
    actorRole: "compliance",
    targetType: "admin_access",
    targetId: "role-matrix",
    field: "permissions",
    reason: "Monthly least-privilege review.",
    status: "logged",
    createdAt: "2026-06-17T05:20:00.000Z",
    ipAddress: "mock",
    userAgent: "mock",
    reviewStatus: "reviewed",
    reviewedAt: "2026-06-17T06:00:00.000Z",
    reviewedByEmail: "c***@l***.my",
    reviewNote: "Monthly role matrix review completed.",
    mode: "mock",
  },
];

const fallbackAdminSessions = [
  {
    id: "sess-mock-1",
    userId: "adm-001",
    userName: "Founder Admin",
    userEmail: maskAdminEmail("founder@lajoo.my"),
    role: "founder",
    status: "active",
    ipAddress: "mock",
    userAgent: "mock browser",
    createdAt: "2026-06-19T01:45:00.000Z",
    lastSeenAt: "2026-06-19T02:18:00.000Z",
    expiresAt: "2026-06-19T09:45:00.000Z",
    revokedAt: null,
    mode: "mock",
  },
];

const fallbackMfaRecoveryRequests = [
  {
    id: "mfa-recovery-mock-1",
    requesterEmail: maskAdminEmail("compliance@lajoo.my"),
    requesterRole: "compliance",
    targetUserId: "adm-002",
    targetEmail: maskAdminEmail("ops@lajoo.my"),
    targetName: "Ops Lead",
    targetRoles: ["ops"],
    approverEmail: null,
    status: "requested",
    reason: "Mock recovery request for an admin who lost authenticator access.",
    approvalReason: null,
    rejectionReason: null,
    emergencyOverrideReason: null,
    dueAt: "2026-06-20T02:30:00.000Z",
    priority: "normal",
    notifiedAt: null,
    reminderSentAt: null,
    overdueAt: null,
    notificationStatus: "manual_required",
    notificationProvider: "manual",
    notificationErrorClass: null,
    notificationError: null,
    slaStatus: "on_track",
    founderApprovalRequired: false,
    requestedAt: "2026-06-19T02:30:00.000Z",
    approvedAt: null,
    rejectedAt: null,
    completedAt: null,
    blockedAt: null,
    ipAddress: "mock",
    userAgent: "mock",
    mode: "mock",
  },
];

const fallbackExportEvents = [
  {
    id: "export-mock-1",
    actorEmail: maskAdminEmail("founder@lajoo.my"),
    actorRole: "founder",
    targetType: "renewals",
    targetId: "renewal-pipeline",
    field: "bulk_export",
    reason: "Founder requested mock export approval for investor demo readiness.",
    status: "requested",
    exportKind: "mock",
    approvalReason: null,
    createdAt: "2026-06-19T02:10:00.000Z",
    approvedAt: null,
    rejectedAt: null,
    completedAt: null,
    ipAddress: "mock",
    userAgent: "mock",
    mode: "mock",
  },
  {
    id: "export-mock-2",
    actorEmail: maskAdminEmail("ops@lajoo.my"),
    actorRole: "ops",
    targetType: "admin_audit",
    targetId: "audit-log",
    field: "bulk_export",
    reason: "Ops requested spreadsheet for follow-up.",
    status: "blocked",
    exportKind: "mock",
    approvalReason: null,
    createdAt: "2026-06-18T09:45:00.000Z",
    approvedAt: null,
    rejectedAt: null,
    completedAt: null,
    ipAddress: "mock",
    userAgent: "mock",
    mode: "mock",
  },
];

const fallbackTechLogs = {
  paymentWebhooks: [
    {
      id: "pay-webhook-mock-1",
      provider: "mock",
      eventType: "payment.status.updated",
      eventStatus: "received_mock",
      paymentId: "PAY-8831",
      providerEventId: "evt_mock_8831",
      requestId: "req_mock_payment_1",
      errorCode: null,
      errorMessage: null,
      source: "mock",
      createdAt: "2026-06-19T02:05:00.000Z",
    },
  ],
  insurerAdapters: [
    {
      id: "adapter-mock-1",
      insurerCode: "ETIQA",
      adapterName: "MockEtiqaAdapter",
      operation: "quote_preview",
      status: "mock_success",
      latencyMs: 184,
      requestId: "req_mock_adapter_1",
      errorCode: null,
      errorMessage: null,
      source: "mock",
      createdAt: "2026-06-19T02:03:00.000Z",
    },
  ],
  openAiUsage: [
    {
      id: "openai-mock-1",
      model: "mock-ai-router",
      operation: "renewal_guidance",
      status: "mock_success",
      promptTokens: 1240,
      completionTokens: 360,
      totalTokens: 1600,
      costEstimateUsd: "0.000000",
      requestId: "req_mock_ai_1",
      errorCode: null,
      errorMessage: null,
      source: "mock",
      createdAt: "2026-06-19T02:00:00.000Z",
    },
  ],
  jobQueue: [
    {
      id: "job-mock-1",
      queueName: "reminders",
      jobName: "renewal_follow_up",
      status: "queued_mock",
      attempts: 0,
      scheduledFor: "2026-06-19T03:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
      source: "mock",
      createdAt: "2026-06-19T01:58:00.000Z",
    },
  ],
  cronReminders: [
    {
      id: "cron-mock-1",
      cronName: "daily-renewal-reminders",
      status: "completed_mock",
      scheduledFor: "2026-06-19T00:00:00.000Z",
      startedAt: "2026-06-19T00:00:03.000Z",
      finishedAt: "2026-06-19T00:00:11.000Z",
      affectedCount: 24,
      errorMessage: null,
      source: "mock",
      createdAt: "2026-06-19T00:00:11.000Z",
    },
  ],
};

async function getPrisma() {
  return (await import("../../lib/prisma.js")).default;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashToken(value = "") {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function hashAdminOpaqueToken(value = "") {
  return hashToken(value);
}

function safeEqual(left = "", right = "") {
  const leftHash = createHash("sha256").update(String(left)).digest();
  const rightHash = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function activeRolesFromAssignments(roleAssignments = []) {
  return roleAssignments
    .filter((assignment) => !assignment.revokedAt)
    .map((assignment) => String(assignment.role || "").trim())
    .filter((role) => ADMIN_ROLES.includes(role))
    .filter((role, index, list) => list.indexOf(role) === index);
}

function primaryRole(roles = []) {
  return ROLE_PRIORITY.find((role) => roles.includes(role)) || roles[0] || "unassigned";
}

function dateToIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeAuditPriority(priority = "normal") {
  const normalized = String(priority || "normal").trim();
  return AUDIT_PRIORITIES.has(normalized) ? normalized : "normal";
}

function parseOptionalDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeNotificationCategory(category = "") {
  const normalized = String(category || "").trim();
  return ADMIN_NOTIFICATION_CATEGORIES.includes(normalized) ? normalized : "";
}

function normalizeNotificationFrequency(frequency = "immediate") {
  const normalized = String(frequency || "immediate").trim();
  return ADMIN_NOTIFICATION_FREQUENCIES.has(normalized) ? normalized : "immediate";
}

function normalizeWebhookAlertPriority(priority = "normal") {
  const normalized = String(priority || "normal").trim();
  return WEBHOOK_ALERT_PRIORITIES.has(normalized) ? normalized : "normal";
}

function normalizeWebhookAlertStatus(status = "open") {
  const normalized = String(status || "open").trim();
  return WEBHOOK_ALERT_STATUSES.has(normalized) ? normalized : "open";
}

function normalizeCronExecutionAlertPriority(priority = "normal") {
  const normalized = String(priority || "normal").trim();
  return CRON_ALERT_PRIORITIES.has(normalized) ? normalized : "normal";
}

function normalizeCronExecutionAlertStatus(status = "open") {
  const normalized = String(status || "open").trim();
  return CRON_ALERT_STATUSES.has(normalized) ? normalized : "open";
}

export function getAdminWebhookMonitoringAlertIncidentState(alert = {}, now = new Date()) {
  const status = normalizeWebhookAlertStatus(alert.status);
  if (status === "resolved") return "resolved";
  const current = now instanceof Date ? now : new Date(now);
  const snoozedUntil = alert.snoozedUntil ? new Date(alert.snoozedUntil) : null;
  if (status === "snoozed" && snoozedUntil && !Number.isNaN(snoozedUntil.getTime()) && snoozedUntil <= current) {
    return "snoozed_expired";
  }
  return status;
}

export function summarizeAdminWebhookMonitoringAlertIncidents(alerts = [], session = {}, now = new Date()) {
  const summary = {
    total: alerts.length,
    open: 0,
    acknowledged: 0,
    snoozed: 0,
    resolved: 0,
    assignedToMe: 0,
    snoozedExpired: 0,
    highCriticalUnassigned: 0,
    active: 0,
  };
  for (const alert of alerts) {
    const state = getAdminWebhookMonitoringAlertIncidentState(alert, now);
    if (state === "snoozed_expired") {
      summary.snoozedExpired += 1;
      summary.snoozed += 1;
    } else if (summary[state] !== undefined) {
      summary[state] += 1;
    }
    if (state !== "resolved") summary.active += 1;
    if (session?.id && alert.assignedToUserId === session.id && state !== "resolved") summary.assignedToMe += 1;
    const priority = normalizeWebhookAlertPriority(alert.priority);
    if (["high", "critical"].includes(priority) && !alert.assignedToUserId && state !== "resolved") {
      summary.highCriticalUnassigned += 1;
    }
  }
  return summary;
}

export function getAdminCronExecutionAlertIncidentState(alert = {}, now = new Date()) {
  const status = normalizeCronExecutionAlertStatus(alert.status);
  if (status === "resolved") return "resolved";
  const current = now instanceof Date ? now : new Date(now);
  const snoozedUntil = alert.snoozedUntil ? new Date(alert.snoozedUntil) : null;
  if (status === "snoozed" && snoozedUntil && !Number.isNaN(snoozedUntil.getTime()) && snoozedUntil <= current) {
    return "snoozed_expired";
  }
  return status;
}

export function summarizeAdminCronExecutionAlertIncidents(alerts = [], session = {}, now = new Date()) {
  const summary = {
    total: alerts.length,
    open: 0,
    acknowledged: 0,
    snoozed: 0,
    resolved: 0,
    assignedToMe: 0,
    snoozedExpired: 0,
    highCriticalUnassigned: 0,
    repeatedFailures: 0,
    staleSuccess: 0,
    disabledByEnv: 0,
    skipped: 0,
    failed: 0,
    active: 0,
  };
  for (const alert of alerts) {
    const state = getAdminCronExecutionAlertIncidentState(alert, now);
    if (state === "snoozed_expired") {
      summary.snoozedExpired += 1;
      summary.snoozed += 1;
    } else if (summary[state] !== undefined) {
      summary[state] += 1;
    }
    if (state !== "resolved") summary.active += 1;
    if (session?.id && alert.assignedToUserId === session.id && state !== "resolved") summary.assignedToMe += 1;
    const priority = normalizeCronExecutionAlertPriority(alert.priority);
    if (["high", "critical"].includes(priority) && !alert.assignedToUserId && state !== "resolved") {
      summary.highCriticalUnassigned += 1;
    }
    const alertType = String(alert.alertType || "");
    if (alertType === "repeated_failures") summary.repeatedFailures += 1;
    if (alertType === "last_success_stale") summary.staleSuccess += 1;
    if (alertType === "disabled_by_env") summary.disabledByEnv += 1;
    if (alertType === "skipped") summary.skipped += 1;
    if (alertType === "failed") summary.failed += 1;
  }
  return summary;
}

export function classifyAdminScheduledJobExecutionAlert(attempt = {}, options = {}) {
  const status = String(attempt?.status || "").trim();
  const jobKind = String(attempt?.jobKind || "admin").trim();
  const jobName = String(attempt?.jobName || CRON_ALERT_JOB_LABELS[jobKind] || "admin scheduled job").trim();
  const label = CRON_ALERT_JOB_LABELS[jobKind] || jobName;
  const repeatedFailureCount = Number(options.repeatedFailureCount || 0);
  const metadata = attempt?.metadata || {};
  if (status === "failed" || Number(attempt?.failedCount || 0) > 0) {
    const repeated = repeatedFailureCount >= 3;
    return {
      shouldAlert: true,
      alertType: repeated ? "repeated_failures" : "failed",
      severity: repeated ? "critical" : "high",
      priority: repeated ? "critical" : "high",
      message: repeated
        ? `${label} has failed ${repeatedFailureCount} recent times.`
        : `${label} failed and needs review.`,
    };
  }
  if (status === "partial") {
    return {
      shouldAlert: true,
      alertType: "partial",
      severity: "warning",
      priority: "normal",
      message: `${label} completed with partial failures.`,
    };
  }
  if (status === "skipped") {
    const disabled = Boolean(metadata.disabledReason);
    return {
      shouldAlert: true,
      alertType: disabled ? "disabled_by_env" : "skipped",
      severity: disabled ? "warning" : "info",
      priority: disabled ? "normal" : "low",
      message: disabled
        ? `${label} was skipped because a cron environment flag is disabled.`
        : `${label} was skipped and should be checked.`,
    };
  }
  return { shouldAlert: false, alertType: "none", severity: "info", priority: "low", message: "" };
}

export function classifyAdminScheduledJobStaleAlert({
  jobKind = "admin",
  jobName,
  lastSuccessAt,
  staleThresholdMinutes = CRON_ALERT_STALE_THRESHOLD_MINUTES,
  now = new Date(),
} = {}) {
  const threshold = Math.max(Number(staleThresholdMinutes) || CRON_ALERT_STALE_THRESHOLD_MINUTES, 60);
  const current = now instanceof Date ? now : new Date(now);
  const lastSuccess = lastSuccessAt ? new Date(lastSuccessAt) : null;
  const label = CRON_ALERT_JOB_LABELS[jobKind] || jobName || "admin scheduled job";
  if (!lastSuccess || Number.isNaN(lastSuccess.getTime())) {
    return {
      shouldAlert: true,
      alertType: "last_success_stale",
      severity: "warning",
      priority: "normal",
      message: `${label} has no recorded successful run.`,
      staleThresholdMinutes: threshold,
    };
  }
  const ageMinutes = Math.floor((current.getTime() - lastSuccess.getTime()) / 60000);
  if (ageMinutes <= threshold) {
    return { shouldAlert: false, alertType: "none", severity: "info", priority: "low", message: "", staleThresholdMinutes: threshold };
  }
  return {
    shouldAlert: true,
    alertType: "last_success_stale",
    severity: ageMinutes >= threshold * 2 ? "high" : "warning",
    priority: ageMinutes >= threshold * 2 ? "high" : "normal",
    message: `${label} last succeeded ${ageMinutes} minutes ago, beyond the ${threshold} minute threshold.`,
    staleThresholdMinutes: threshold,
    ageMinutes,
  };
}

function priorityForWebhookAlertSeverity(severity = "warning") {
  const normalized = String(severity || "warning").trim();
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "warning") return "normal";
  return "low";
}

export function normalizeAdminExportArtifactPolicyEnvironment(value = process.env.VERCEL_ENV || process.env.NODE_ENV || "development") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "prod") return "production";
  if (normalized === "dev" || normalized === "test" || normalized === "local") return "development";
  return EXPORT_ARTIFACT_POLICY_ENVIRONMENTS.includes(normalized) ? normalized : "development";
}

function isTruthyEnvFlag(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

export function getAdminCronAuthorizationState({ authorizationHeader = "", env = process.env } = {}) {
  const cronSecret = String(env.CRON_SECRET || "").trim();
  const configured = Boolean(cronSecret);
  const expected = configured ? `Bearer ${cronSecret}` : "";
  const supplied = String(authorizationHeader || "").trim();
  return {
    configured,
    authorized: configured && safeEqual(supplied, expected),
    status: !configured ? "missing_secret" : (safeEqual(supplied, expected) ? "authorized" : "unauthorized"),
    schemePresent: supplied.toLowerCase().startsWith("bearer "),
  };
}

export function assertAdminCronAuthorized(request, env = process.env) {
  const authorizationHeader = request?.headers?.get?.("authorization") || "";
  const state = getAdminCronAuthorizationState({ authorizationHeader, env });
  if (!state.configured) {
    const error = new Error("CRON_SECRET is not configured.");
    error.status = 503;
    throw error;
  }
  if (!state.authorized) {
    const error = new Error("Cron authorization failed.");
    error.status = 401;
    throw error;
  }
  return state;
}

export function getAdminScheduledWorkflowReadiness({ env = process.env, liveSchedulerConfigured = false } = {}) {
  const cronSecretConfigured = Boolean(String(env.CRON_SECRET || "").trim());
  const globalCronEnabled = isTruthyEnvFlag(env.LAJOO_ADMIN_CRON_ENABLED);
  const digestCronEnabled = globalCronEnabled && isTruthyEnvFlag(env.LAJOO_ADMIN_DIGEST_CRON_ENABLED);
  const mfaRecoveryCronEnabled = globalCronEnabled && isTruthyEnvFlag(env.LAJOO_ADMIN_MFA_RECOVERY_CRON_ENABLED);
  const webhookMonitoringCronEnabled = globalCronEnabled && isTruthyEnvFlag(env.LAJOO_ADMIN_WEBHOOK_MONITOR_CRON_ENABLED);
  const cronEntries = [
    {
      jobKey: "notificationDigests",
      path: "/api/admin/cron/digests?frequency=hourly",
      schedule: "0 * * * *",
      envFlag: "LAJOO_ADMIN_DIGEST_CRON_ENABLED",
    },
    {
      jobKey: "notificationDigests",
      path: "/api/admin/cron/digests?frequency=daily",
      schedule: "10 0 * * *",
      envFlag: "LAJOO_ADMIN_DIGEST_CRON_ENABLED",
    },
    {
      jobKey: "mfaRecoverySla",
      path: "/api/admin/cron/mfa-recovery",
      schedule: "20 * * * *",
      envFlag: "LAJOO_ADMIN_MFA_RECOVERY_CRON_ENABLED",
    },
    {
      jobKey: "webhookMonitoring",
      path: "/api/admin/cron/webhook-monitoring",
      schedule: "35 * * * *",
      envFlag: "LAJOO_ADMIN_WEBHOOK_MONITOR_CRON_ENABLED",
    },
  ];
  const jobs = {
    notificationDigests: {
      enabled: digestCronEnabled,
      liveScheduled: Boolean(liveSchedulerConfigured && digestCronEnabled && cronSecretConfigured),
      route: "/api/admin/cron/digests",
      envFlag: "LAJOO_ADMIN_DIGEST_CRON_ENABLED",
    },
    mfaRecoverySla: {
      enabled: mfaRecoveryCronEnabled,
      liveScheduled: Boolean(liveSchedulerConfigured && mfaRecoveryCronEnabled && cronSecretConfigured),
      route: "/api/admin/cron/mfa-recovery",
      envFlag: "LAJOO_ADMIN_MFA_RECOVERY_CRON_ENABLED",
    },
    webhookMonitoring: {
      enabled: webhookMonitoringCronEnabled,
      liveScheduled: Boolean(liveSchedulerConfigured && webhookMonitoringCronEnabled && cronSecretConfigured),
      route: "/api/admin/cron/webhook-monitoring",
      envFlag: "LAJOO_ADMIN_WEBHOOK_MONITOR_CRON_ENABLED",
    },
  };
  const anyLiveScheduled = Object.values(jobs).some((job) => job.liveScheduled);
  const anyEnabled = Object.values(jobs).some((job) => job.enabled);
  const planLimitKnown = Boolean(String(env.VERCEL_PLAN || env.LAJOO_VERCEL_PLAN || "").trim());
  const registrationBlockers = [
    cronSecretConfigured ? null : "CRON_SECRET missing",
    planLimitKnown ? null : "Vercel plan limits not confirmed",
    anyEnabled ? null : "Admin cron env flags disabled",
    liveSchedulerConfigured ? null : "vercel.json cron registration not detected",
  ].filter(Boolean);
  return {
    status: anyLiveScheduled ? "scheduled" : (cronSecretConfigured && anyEnabled ? "cron_ready" : "manual_only"),
    liveScheduled: anyLiveScheduled,
    wrapperReady: true,
    manualTriggerAvailable: true,
    cronSecretConfigured,
    globalCronEnabled,
    schedulerProvider: "vercel_cron_ready",
    registration: {
      status: liveSchedulerConfigured ? "registered" : "deployment_ready",
      liveRegistrationDetected: Boolean(liveSchedulerConfigured),
      requiredAuthorization: cronSecretConfigured ? "bearer_secret_configured" : "missing_cron_secret",
      envFlagsRequired: [
        "LAJOO_ADMIN_CRON_ENABLED",
        "LAJOO_ADMIN_DIGEST_CRON_ENABLED",
        "LAJOO_ADMIN_MFA_RECOVERY_CRON_ENABLED",
        "LAJOO_ADMIN_WEBHOOK_MONITOR_CRON_ENABLED",
      ],
      cronEntries,
      planLimitStatus: planLimitKnown ? "confirmed" : "unknown",
      blockers: registrationBlockers,
      deploymentInstruction: liveSchedulerConfigured
        ? "Live Vercel Cron registration is present; keep CRON_SECRET and LAJOO_ADMIN_* cron flags configured per environment."
        : "To register live Vercel Cron, confirm plan limits, set CRON_SECRET and LAJOO_ADMIN_* cron flags, then add these paths/schedules to vercel.json.",
      note: liveSchedulerConfigured
        ? "Vercel Cron registration is expected to invoke these CRON_SECRET-protected routes."
        : "Routes are production-ready, but this repository has not registered live Vercel Cron schedules.",
    },
    jobs,
    envKeys: {
      cronSecret: "CRON_SECRET",
      globalCronEnabled: "LAJOO_ADMIN_CRON_ENABLED",
      digestCronEnabled: "LAJOO_ADMIN_DIGEST_CRON_ENABLED",
      mfaRecoveryCronEnabled: "LAJOO_ADMIN_MFA_RECOVERY_CRON_ENABLED",
      webhookMonitoringCronEnabled: "LAJOO_ADMIN_WEBHOOK_MONITOR_CRON_ENABLED",
    },
    note: anyLiveScheduled
      ? "Scheduled admin jobs are enabled and protected by CRON_SECRET."
      : "Cron-ready admin routes are available, but no live scheduler is registered in this repository.",
  };
}

function buildAdminCronServiceSession(role = "founder") {
  return {
    email: "admin-cron@lajoo.internal",
    name: "LAJOO Admin Cron",
    role,
    roles: [role],
    source: "system_cron",
  };
}

export function getAdminMfaRecoveryDueAt(priority = "normal", now = new Date()) {
  const normalizedPriority = normalizeAuditPriority(priority);
  const base = now instanceof Date ? now : new Date(now);
  const hours = MFA_RECOVERY_SLA_HOURS[normalizedPriority] || MFA_RECOVERY_SLA_HOURS.normal;
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

export function getAdminMfaRecoverySlaState(request, now = new Date()) {
  const status = String(request?.status || "requested");
  if (["completed", "rejected", "blocked"].includes(status)) return status;
  const dueAt = request?.dueAt ? new Date(request.dueAt) : null;
  if (!dueAt || Number.isNaN(dueAt.getTime())) return "not_tracked";
  const currentTime = now instanceof Date ? now : new Date(now);
  if (dueAt < currentTime) return "overdue";
  if (dueAt.getTime() - currentTime.getTime() <= 4 * 60 * 60 * 1000) return "due_soon";
  return "on_track";
}

function normalizeEmailDeliveryEvent(delivery = {}) {
  return {
    status: delivery.deliveryStatus || "manual_required",
    provider: delivery.deliveryProvider || "manual",
    messageId: delivery.deliveryMessageId || null,
    errorClass: delivery.deliveryErrorClass || (delivery.deliveryError ? classifyAdminEmailDeliveryError(delivery.deliveryError) : null),
    errorMessage: delivery.deliveryError || null,
    domain: delivery.deliveryDomain || null,
    providerEnvironment: delivery.providerEnvironment || delivery.deliveryProvider || "manual",
  };
}

export function getAdminNotificationPreferenceDefaults(userId = "current") {
  return ADMIN_NOTIFICATION_CATEGORIES.map((category) => ({
    id: `${userId}:${category}:default`,
    userId,
    category,
    emailEnabled: true,
    frequency: category === "tech_incidents" ? "hourly" : "immediate",
    manualFallbackEnabled: true,
    mode: "default",
  }));
}

export function normalizeAdminNotificationPreferenceForClient(preference = {}) {
  return {
    id: preference.id || `${preference.userId || "current"}:${preference.category}`,
    userId: preference.userId || null,
    category: normalizeNotificationCategory(preference.category) || "invites",
    emailEnabled: preference.emailEnabled !== false,
    frequency: normalizeNotificationFrequency(preference.frequency),
    manualFallbackEnabled: preference.manualFallbackEnabled !== false,
    createdAt: dateToIso(preference.createdAt),
    updatedAt: dateToIso(preference.updatedAt),
    mode: preference.mode || "database",
  };
}

export function canManageAdminNotificationPreference({ actorSession, targetUserId }) {
  if (!actorSession?.id) return false;
  if (!targetUserId || targetUserId === actorSession.id) return true;
  return ["founder", "compliance"].includes(actorSession.role);
}

export function canRunAdminNotificationDigestJob(session) {
  return ["founder", "compliance"].includes(session?.role);
}

function isAdminDatabaseUnavailable(error) {
  const message = String(error?.message || "");
  return [
    "P2021",
    "P2022",
    "P1001",
    "P1002",
    "P1003",
    "does not exist",
    "Unknown arg",
    "Can't reach database",
  ].some((needle) => String(error?.code || "").includes(needle) || message.includes(needle));
}

function getRequestIpAddress(request) {
  const forwarded = request?.headers?.get("x-forwarded-for") || "";
  if (forwarded) return forwarded.split(",")[0].trim();
  return request?.headers?.get("x-real-ip") || request?.headers?.get("cf-connecting-ip") || null;
}

function getRequestUserAgent(request) {
  return request?.headers?.get("user-agent") || null;
}

function getRequestOrigin(request) {
  const origin = request?.headers?.get("origin");
  if (origin) return origin;
  const host = request?.headers?.get("host");
  if (!host) return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const protocol = request?.headers?.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

function fallbackConfigAdmin() {
  const email = process.env.LAJOO_ADMIN_EMAIL || "";
  const password = process.env.LAJOO_ADMIN_PASSWORD || "";
  if (!email || !password) return null;
  const role = normalizeAdminRole(process.env.LAJOO_ADMIN_ROLE || "founder");
  return {
    id: "env-bootstrap",
    email,
    name: process.env.LAJOO_ADMIN_NAME || "LAJOO Admin",
    role,
    roles: [role],
    mfaStatus: "not_configured",
    source: "env_fallback",
  };
}

function mapAdminUserForSession(user, source = "database") {
  const roles = activeRolesFromAssignments(user.roleAssignments);
  if (!roles.length) return null;
  const role = primaryRole(roles);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    roles,
    mfaStatus: MFA_STATUSES.has(user.mfaStatus) ? user.mfaStatus : "not_configured",
    source,
  };
}

export function getFallbackAdminUsers() {
  return fallbackAdminUsers;
}

export function getFallbackAdminAuditLogs(options = {}) {
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 20;
  return fallbackAuditLogs.slice(0, limit);
}

function parseFilterDate(value, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    parsed.setUTCHours(23, 59, 59, 999);
  }
  return parsed;
}

export function mapAdminAuditLogForClient(log) {
  return {
    id: log.id,
    action: log.action,
    actorEmail: log.actorEmail ? maskAdminEmail(log.actorEmail) : "Unknown",
    actorRole: log.actorRole,
    targetType: log.targetType,
    targetId: log.targetId,
    field: log.field,
    reason: log.reason,
    status: log.status,
    ipAddress: log.ipAddress || "Not captured",
    userAgent: log.userAgent || "Not captured",
    metadata: log.metadata || {},
    reviewStatus: log.reviewStatus || "unreviewed",
    reviewedAt: dateToIso(log.reviewedAt),
    reviewedByEmail: log.reviewedBy?.email
      ? maskAdminEmail(log.reviewedBy.email)
      : log.reviewedByEmail || null,
    reviewNote: log.reviewNote || null,
    assignedToUserId: log.assignedToUserId || null,
    assignedToEmail: log.assignedTo?.email
      ? maskAdminEmail(log.assignedTo.email)
      : log.assignedToEmail || null,
    ownerRole: log.ownerRole || null,
    priority: AUDIT_PRIORITIES.has(log.priority) ? log.priority : "normal",
    escalationStatus: AUDIT_ESCALATION_STATUSES.has(log.escalationStatus) ? log.escalationStatus : "none",
    escalatedAt: dateToIso(log.escalatedAt),
    assignmentDueAt: dateToIso(log.assignmentDueAt),
    escalationReason: log.escalationReason || null,
    escalationResolvedAt: dateToIso(log.escalationResolvedAt),
    assignmentHistory: Array.isArray(log.assignmentEvents)
      ? log.assignmentEvents.map((event) => ({
          id: event.id,
          actorUserId: event.actorUserId || null,
          assignedToUserId: event.assignedToUserId || null,
          ownerRole: event.ownerRole || null,
          priority: event.priority || null,
          escalationStatus: event.escalationStatus || null,
          assignmentDueAt: dateToIso(event.assignmentDueAt),
          escalationReason: event.escalationReason || null,
          reason: event.reason,
          createdAt: dateToIso(event.createdAt),
        }))
      : [],
    reviewQueueStatus: log.assignmentDueAt && !log.reviewedAt && new Date(log.assignmentDueAt) < new Date() ? "overdue" : "open",
    createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
    mode: log.mode || "persisted",
  };
}

export function mapAdminUserForClient(user) {
  const roles = activeRolesFromAssignments(user.roleAssignments || []);
  const role = primaryRole(roles);
  return {
    id: user.id,
    name: user.name,
    email: maskAdminEmail(user.email),
    role,
    roles,
    status: user.status,
    createdAt: dateToIso(user.createdAt),
    lastActive: dateToIso(user.lastActiveAt),
    invitedAt: dateToIso(user.invitedAt),
    suspendedAt: dateToIso(user.suspendedAt),
    mfaStatus: MFA_STATUSES.has(user.mfaStatus) ? user.mfaStatus : "not_configured",
    mfaEnabledAt: dateToIso(user.mfaEnabledAt),
    source: user.bootstrapSource || "database",
  };
}

function mapAdminSessionForClient(session) {
  const user = session.user || {};
  const roles = activeRolesFromAssignments(user.roleAssignments || []);
  return {
    id: session.id,
    userId: session.userId,
    userName: user.name || "Unknown admin",
    userEmail: user.email ? maskAdminEmail(user.email) : "Unknown",
    role: normalizeAdminRole(session.role || primaryRole(roles)),
    status: session.status,
    ipAddress: session.ipAddress || "Not captured",
    userAgent: session.userAgent || "Not captured",
    createdAt: dateToIso(session.createdAt),
    lastSeenAt: dateToIso(session.lastSeenAt),
    expiresAt: dateToIso(session.expiresAt),
    revokedAt: dateToIso(session.revokedAt),
    mode: "persisted",
  };
}

function mapAdminExportEventForClient(event) {
  return {
    id: event.id,
    auditLogId: event.auditLogId,
    actorEmail: event.auditLog?.actorEmail ? maskAdminEmail(event.auditLog.actorEmail) : "Unknown",
    actorRole: event.actorRole,
    targetType: event.targetType,
    targetId: event.targetId,
    field: event.field,
    reason: event.reason,
    status: event.status,
    exportKind: event.exportKind,
    approvalReason: event.approvalReason,
    approvedByUserId: event.approvedByUserId,
    createdAt: dateToIso(event.createdAt),
    approvedAt: dateToIso(event.approvedAt),
    rejectedAt: dateToIso(event.rejectedAt),
    completedAt: dateToIso(event.completedAt),
    artifactMetadata: event.artifactMetadata || null,
    artifactReadyAt: dateToIso(event.artifactReadyAt),
    artifactAccessCount: event._count?.artifactAccesses || 0,
    artifactAccesses: (event.artifactAccesses || []).map(mapAdminExportArtifactAccessForClient),
    ipAddress: event.ipAddress || "Not captured",
    userAgent: event.userAgent || "Not captured",
    metadata: event.metadata || {},
    mode: "persisted",
  };
}

function mapAdminExportArtifactAccessForClient(access) {
  const state = getAdminExportArtifactAccessState(access);
  return {
    id: access.id,
    exportEventId: access.exportEventId,
    status: access.status,
    state,
    requestedByUserId: access.requestedByUserId || null,
    requestedByEmail: access.requestedBy?.email ? maskAdminEmail(access.requestedBy.email) : null,
    requestedByRole: access.requestedByRole,
    reason: access.reason,
    expiresAt: dateToIso(access.expiresAt),
    accessedAt: dateToIso(access.accessedAt),
    revokedAt: dateToIso(access.revokedAt),
    revokedByEmail: access.revokedBy?.email ? maskAdminEmail(access.revokedBy.email) : null,
    revokedReason: access.revokedReason || null,
    rotatedFromAccessId: access.rotatedFromAccessId || null,
    rotatedAt: dateToIso(access.rotatedAt),
    rotationReason: access.rotationReason || null,
    ipAddress: access.ipAddress || "Not captured",
    userAgent: access.userAgent || "Not captured",
    lastAccessedIpAddress: access.lastAccessedIpAddress || null,
    lastAccessedUserAgent: access.lastAccessedUserAgent || null,
    createdAt: dateToIso(access.createdAt),
  };
}

function mapAdminMfaRecoveryRequestForClient(request) {
  const targetRoles = activeRolesFromAssignments(request.targetUser?.roleAssignments || []);
  const founderApprovalRequired = (request.targetRoles || targetRoles).includes("founder");
  return {
    id: request.id,
    requesterUserId: request.requesterUserId || null,
    requesterEmail: request.requester?.email ? maskAdminEmail(request.requester.email) : request.requesterEmail || "Unknown",
    requesterRole: request.requesterRole || primaryRole(activeRolesFromAssignments(request.requester?.roleAssignments || [])),
    targetUserId: request.targetUserId,
    targetEmail: request.targetUser?.email ? maskAdminEmail(request.targetUser.email) : request.targetEmail || "Unknown",
    targetName: request.targetUser?.name || request.targetName || "Unknown admin",
    targetRoles: request.targetRoles || targetRoles,
    approverUserId: request.approverUserId || null,
    approverEmail: request.approver?.email ? maskAdminEmail(request.approver.email) : request.approverEmail || null,
    status: MFA_RECOVERY_STATUSES.has(request.status) ? request.status : "requested",
    reason: request.reason,
    approvalReason: request.approvalReason || null,
    rejectionReason: request.rejectionReason || null,
    emergencyOverrideReason: request.emergencyOverrideReason || null,
    dueAt: dateToIso(request.dueAt),
    priority: normalizeAuditPriority(request.priority),
    notifiedAt: dateToIso(request.notifiedAt),
    reminderSentAt: dateToIso(request.reminderSentAt),
    overdueAt: dateToIso(request.overdueAt),
    notificationStatus: request.notificationStatus || null,
    notificationProvider: request.notificationProvider || null,
    notificationErrorClass: request.notificationErrorClass || null,
    notificationError: request.notificationError || null,
    reminderEvents: Array.isArray(request.reminderEvents)
      ? request.reminderEvents.map((event) => ({
          id: event.id,
          action: event.action,
          status: event.status,
          priority: event.priority,
          deliveryStatus: event.deliveryStatus || null,
          deliveryProvider: event.deliveryProvider || null,
          escalationTargetRole: event.escalationTargetRole || null,
          createdAt: dateToIso(event.createdAt),
        }))
      : [],
    slaStatus: request.slaStatus || getAdminMfaRecoverySlaState(request),
    founderApprovalRequired,
    requestedAt: dateToIso(request.requestedAt || request.createdAt),
    approvedAt: dateToIso(request.approvedAt),
    rejectedAt: dateToIso(request.rejectedAt),
    completedAt: dateToIso(request.completedAt),
    blockedAt: dateToIso(request.blockedAt),
    ipAddress: request.ipAddress || "Not captured",
    userAgent: request.userAgent || "Not captured",
    metadata: request.metadata || {},
    mode: request.mode || "persisted",
  };
}

function mapAdminInviteEmailEventForClient(event) {
  return {
    id: event.id,
    inviteTokenId: event.inviteTokenId || null,
    actorUserId: event.actorUserId || null,
    actorEmail: event.actorUser?.email ? maskAdminEmail(event.actorUser.email) : null,
    email: event.email ? maskAdminEmail(event.email) : "Unknown",
    provider: event.provider,
    status: event.status,
    errorClass: event.errorClass || null,
    errorMessage: event.errorMessage || null,
    messageIdPresent: Boolean(event.messageId),
    domain: event.domain || null,
    providerEnvironment: event.providerEnvironment || null,
    metadata: event.metadata || {},
    ipAddress: event.ipAddress || "Not captured",
    userAgent: event.userAgent || "Not captured",
    createdAt: dateToIso(event.createdAt),
  };
}

function mapAdminEmailWebhookEventForClient(event) {
  return {
    id: event.id,
    inviteEmailEventId: event.inviteEmailEventId || null,
    provider: event.provider,
    svixIdPresent: Boolean(event.svixId),
    eventType: event.eventType,
    status: event.status,
    providerEventId: event.providerEventId || null,
    providerMessageId: event.providerMessageId || null,
    recipientMasked: event.recipientMasked || null,
    verificationStatus: event.verificationStatus,
    errorClass: event.errorClass || null,
    payloadSummary: event.payloadSummary || null,
    linkedBy: event.linkedBy || null,
    ipAddress: event.ipAddress || "Not captured",
    userAgent: event.userAgent || "Not captured",
    receivedAt: dateToIso(event.receivedAt),
    createdAt: dateToIso(event.createdAt),
    mode: "persisted",
  };
}

function mapAdminResendWebhookStatusCheckForClient(check) {
  return {
    id: check.id,
    actorUserId: check.actorUserId || null,
    actorEmail: check.actorUser?.email ? maskAdminEmail(check.actorUser.email) : null,
    provider: check.provider || "resend",
    status: check.status,
    endpointUrl: check.endpointUrl || null,
    endpointMatched: Boolean(check.endpointMatched),
    matchedWebhookIdPresent: Boolean(check.matchedWebhookId),
    matchedWebhookStatus: check.matchedWebhookStatus || null,
    matchedWebhookEvents: check.matchedWebhookEvents || [],
    webhookCount: check.webhookCount || 0,
    requiredEventsMissing: check.requiredEventsMissing || [],
    errorClass: check.errorClass || null,
    errorMessage: check.errorMessage || null,
    providerEnvironment: check.providerEnvironment || null,
    checkedAt: dateToIso(check.checkedAt),
    createdAt: dateToIso(check.createdAt),
  };
}

function mapAdminNotificationDigestEventForClient(event) {
  return {
    id: event.id,
    userId: event.userId,
    userEmail: event.user?.email ? maskAdminEmail(event.user.email) : null,
    actorUserId: event.actorUserId || null,
    actorEmail: event.actorUser?.email ? maskAdminEmail(event.actorUser.email) : null,
    frequency: event.frequency,
    status: event.status,
    deliveryProvider: event.deliveryProvider || null,
    deliveryStatus: event.deliveryStatus || null,
    deliveryMessageIdPresent: Boolean(event.deliveryMessageId),
    deliveryErrorClass: event.deliveryErrorClass || null,
    deliveryError: event.deliveryError || null,
    manualFallback: Boolean(event.manualFallback),
    categorySummary: event.categorySummary || {},
    itemCount: event.itemCount || 0,
    reason: event.reason || null,
    sentAt: dateToIso(event.sentAt),
    createdAt: dateToIso(event.createdAt),
  };
}

function mapAdminNotificationDigestJobAttemptForClient(attempt) {
  return {
    id: attempt.id,
    actorUserId: attempt.actorUserId || null,
    actorEmail: attempt.actorUser?.email ? maskAdminEmail(attempt.actorUser.email) : null,
    jobName: attempt.jobName || "admin-notification-digest",
    frequency: attempt.frequency,
    triggerSource: attempt.triggerSource,
    status: attempt.status,
    reason: attempt.reason || null,
    targetUserCount: attempt.targetUserCount || 0,
    attemptedCount: attempt.attemptedCount || 0,
    sentCount: attempt.sentCount || 0,
    manualFallbackCount: attempt.manualFallbackCount || 0,
    failedCount: attempt.failedCount || 0,
    skippedCount: attempt.skippedCount || 0,
    itemCount: attempt.itemCount || 0,
    deliveryProvider: attempt.deliveryProvider || null,
    deliveryStatus: attempt.deliveryStatus || null,
    errorClass: attempt.errorClass || null,
    errorMessage: attempt.errorMessage || null,
    liveCron: Boolean(attempt.liveCron),
    ipAddress: attempt.ipAddress || "Not captured",
    userAgent: attempt.userAgent || "Not captured",
    metadata: attempt.metadata || {},
    startedAt: dateToIso(attempt.startedAt),
    finishedAt: dateToIso(attempt.finishedAt),
    createdAt: dateToIso(attempt.createdAt),
    mode: "persisted",
  };
}

function mapAdminScheduledJobAttemptForClient(attempt) {
  const metadata = attempt.metadata || {};
  return {
    id: attempt.id,
    actorUserId: attempt.actorUserId || null,
    actorEmail: attempt.actorUser?.email ? maskAdminEmail(attempt.actorUser.email) : null,
    jobName: attempt.jobName,
    jobKind: attempt.jobKind,
    triggerSource: attempt.triggerSource || "cron",
    status: attempt.status,
    reason: attempt.reason || null,
    matchedCount: attempt.matchedCount || 0,
    processedCount: attempt.processedCount || 0,
    successCount: attempt.successCount || 0,
    failedCount: attempt.failedCount || 0,
    skippedCount: attempt.skippedCount || 0,
    itemCount: attempt.itemCount || 0,
    liveCron: Boolean(attempt.liveCron),
    errorClass: attempt.errorClass || null,
    errorMessage: attempt.errorMessage || null,
    ipAddress: attempt.ipAddress || "Not captured",
    userAgent: attempt.userAgent || "Not captured",
    metadata,
    retryOfAttemptId: metadata.retryOfAttemptId || null,
    retryRequestedByRole: metadata.retryRequestedByRole || null,
    retryCount: Array.isArray(attempt.retryAttempts) ? attempt.retryAttempts.length : 0,
    startedAt: dateToIso(attempt.startedAt),
    finishedAt: dateToIso(attempt.finishedAt),
    createdAt: dateToIso(attempt.createdAt),
    mode: "persisted",
  };
}

export function buildAdminScheduledJobRetryDrilldowns(attempts = []) {
  const mappedAttempts = attempts.map((attempt) => (attempt?.mode === "persisted" ? attempt : mapAdminScheduledJobAttemptForClient(attempt)));
  const byId = new Map(mappedAttempts.map((attempt) => [attempt.id, attempt]));
  return mappedAttempts
    .filter((attempt) => attempt.retryOfAttemptId)
    .map((retry) => {
      const original = byId.get(retry.retryOfAttemptId) || {};
      return {
        id: `${retry.retryOfAttemptId}:${retry.id}`,
        originalAttemptId: retry.retryOfAttemptId,
        retryAttemptId: retry.id,
        jobName: retry.jobName || original.jobName || "admin scheduled job",
        jobKind: retry.jobKind || original.jobKind || "admin",
        originalStatus: original.status || "not_in_view",
        retryStatus: retry.status,
        retryTriggerSource: retry.triggerSource,
        retryRequestedByRole: retry.retryRequestedByRole || null,
        actorUserId: retry.actorUserId || null,
        actorEmail: retry.actorEmail || null,
        resultCounts: {
          matched: retry.matchedCount || 0,
          processed: retry.processedCount || 0,
          success: retry.successCount || 0,
          failed: retry.failedCount || 0,
          skipped: retry.skippedCount || 0,
          items: retry.itemCount || 0,
        },
        safeErrorClass: retry.errorClass || null,
        safeErrorMessage: retry.errorMessage || null,
        startedAt: retry.startedAt,
        finishedAt: retry.finishedAt,
      };
    });
}

function mapAdminWebhookMonitoringAlertForClient(alert) {
  return {
    id: alert.id,
    actorUserId: alert.actorUserId || null,
    actorEmail: alert.actorUser?.email ? maskAdminEmail(alert.actorUser.email) : null,
    assignedToUserId: alert.assignedToUserId || null,
    assignedToEmail: alert.assignedTo?.email ? maskAdminEmail(alert.assignedTo.email) : null,
    resolvedByUserId: alert.resolvedByUserId || null,
    resolvedByEmail: alert.resolvedBy?.email ? maskAdminEmail(alert.resolvedBy.email) : null,
    statusCheckId: alert.statusCheckId || null,
    provider: alert.provider || "resend",
    alertType: alert.alertType,
    priority: normalizeWebhookAlertPriority(alert.priority),
    severity: alert.severity || "warning",
    status: normalizeWebhookAlertStatus(alert.status),
    incidentState: getAdminWebhookMonitoringAlertIncidentState(alert),
    message: alert.message,
    note: alert.note || null,
    snoozedUntil: dateToIso(alert.snoozedUntil),
    endpointUrl: alert.endpointUrl || null,
    providerStatus: alert.providerStatus || null,
    secretConfigured: Boolean(alert.secretConfigured),
    endpointMatched: Boolean(alert.endpointMatched),
    requiredEventsMissing: alert.requiredEventsMissing || [],
    lastVerifiedWebhookAt: dateToIso(alert.lastVerifiedWebhookAt),
    detectedAt: dateToIso(alert.detectedAt),
    acknowledgedAt: dateToIso(alert.acknowledgedAt),
    resolvedAt: dateToIso(alert.resolvedAt),
    workflowEvents: Array.isArray(alert.workflowEvents)
      ? alert.workflowEvents.map((event) => ({
          id: event.id,
          actorUserId: event.actorUserId || null,
          action: event.action,
          previousStatus: event.previousStatus || null,
          status: normalizeWebhookAlertStatus(event.status),
          previousPriority: event.previousPriority || null,
          priority: event.priority || null,
          assignedToUserId: event.assignedToUserId || null,
          reason: event.reason,
          note: event.note || null,
          snoozedUntil: dateToIso(event.snoozedUntil),
          createdAt: dateToIso(event.createdAt),
        }))
      : [],
    notificationCount: Array.isArray(alert.notifications) ? alert.notifications.length : 0,
    notifications: Array.isArray(alert.notifications)
      ? alert.notifications.map((notification) => ({
          id: notification.id,
          recipientUserId: notification.recipientUserId || null,
          recipientRole: notification.recipientRole || null,
          status: notification.status,
          deliveryProvider: notification.deliveryProvider || null,
          deliveryStatus: notification.deliveryStatus || null,
          errorClass: notification.errorClass || null,
          manualFallback: Boolean(notification.manualFallback),
          createdAt: dateToIso(notification.createdAt),
        }))
      : [],
    ipAddress: alert.ipAddress || "Not captured",
    userAgent: alert.userAgent || "Not captured",
    metadata: alert.metadata || {},
    createdAt: dateToIso(alert.createdAt),
    updatedAt: dateToIso(alert.updatedAt),
  };
}

function mapAdminCronExecutionAlertForClient(alert) {
  return {
    id: alert.id,
    actorUserId: alert.actorUserId || null,
    actorEmail: alert.actorUser?.email ? maskAdminEmail(alert.actorUser.email) : null,
    assignedToUserId: alert.assignedToUserId || null,
    assignedToEmail: alert.assignedTo?.email ? maskAdminEmail(alert.assignedTo.email) : null,
    resolvedByUserId: alert.resolvedByUserId || null,
    resolvedByEmail: alert.resolvedBy?.email ? maskAdminEmail(alert.resolvedBy.email) : null,
    scheduledJobAttemptId: alert.scheduledJobAttemptId || null,
    scheduledJobAttempt: alert.scheduledJobAttempt ? mapAdminScheduledJobAttemptForClient(alert.scheduledJobAttempt) : null,
    jobName: alert.jobName,
    jobKind: alert.jobKind,
    alertType: alert.alertType,
    priority: normalizeCronExecutionAlertPriority(alert.priority),
    severity: alert.severity || "warning",
    status: normalizeCronExecutionAlertStatus(alert.status),
    incidentState: getAdminCronExecutionAlertIncidentState(alert),
    message: alert.message,
    note: alert.note || null,
    snoozedUntil: dateToIso(alert.snoozedUntil),
    lastAttemptStatus: alert.lastAttemptStatus || null,
    lastAttemptAt: dateToIso(alert.lastAttemptAt),
    lastSuccessAt: dateToIso(alert.lastSuccessAt),
    failureCount: alert.failureCount || 0,
    skippedCount: alert.skippedCount || 0,
    staleThresholdMinutes: alert.staleThresholdMinutes || null,
    detectedAt: dateToIso(alert.detectedAt),
    acknowledgedAt: dateToIso(alert.acknowledgedAt),
    resolvedAt: dateToIso(alert.resolvedAt),
    workflowEvents: Array.isArray(alert.workflowEvents)
      ? alert.workflowEvents.map((event) => ({
          id: event.id,
          actorUserId: event.actorUserId || null,
          action: event.action,
          previousStatus: event.previousStatus || null,
          status: normalizeCronExecutionAlertStatus(event.status),
          previousPriority: event.previousPriority || null,
          priority: event.priority || null,
          assignedToUserId: event.assignedToUserId || null,
          reason: event.reason,
          note: event.note || null,
          snoozedUntil: dateToIso(event.snoozedUntil),
          createdAt: dateToIso(event.createdAt),
        }))
      : [],
    notificationCount: Array.isArray(alert.notifications) ? alert.notifications.length : 0,
    notifications: Array.isArray(alert.notifications)
      ? alert.notifications.map((notification) => ({
          id: notification.id,
          recipientUserId: notification.recipientUserId || null,
          recipientRole: notification.recipientRole || null,
          status: notification.status,
          deliveryProvider: notification.deliveryProvider || null,
          deliveryStatus: notification.deliveryStatus || null,
          errorClass: notification.errorClass || null,
          manualFallback: Boolean(notification.manualFallback),
          createdAt: dateToIso(notification.createdAt),
        }))
      : [],
    ipAddress: alert.ipAddress || "Not captured",
    userAgent: alert.userAgent || "Not captured",
    metadata: alert.metadata || {},
    createdAt: dateToIso(alert.createdAt),
    updatedAt: dateToIso(alert.updatedAt),
  };
}

function mapAdminExportArtifactPolicyForClient(policy, fallbackConfig = getAdminExportArtifactPolicyConfig()) {
  const ttlSeconds = Number(policy?.ttlSeconds || fallbackConfig.effectiveTtlSeconds);
  return {
    id: policy?.id || null,
    environment: normalizeAdminExportArtifactPolicyEnvironment(policy?.environment),
    status: policy?.status || fallbackConfig.status || "default",
    ttlSeconds,
    ttlMinutes: Math.round((ttlSeconds / 60) * 10) / 10,
    minTtlSeconds: Number(policy?.minTtlSeconds || fallbackConfig.minTtlSeconds),
    maxTtlSeconds: Number(policy?.maxTtlSeconds || fallbackConfig.maxTtlSeconds),
    changedByUserId: policy?.changedByUserId || null,
    changedByEmail: policy?.changedBy?.email ? maskAdminEmail(policy.changedBy.email) : null,
    reason: policy?.reason || "Environment/default policy.",
    effectiveFrom: dateToIso(policy?.effectiveFrom),
    supersededAt: dateToIso(policy?.supersededAt),
    createdAt: dateToIso(policy?.createdAt),
    metadata: policy?.metadata || {},
    mode: policy?.id ? "persisted" : fallbackConfig.ttlSource || "default",
  };
}

function decimalToString(value) {
  if (value === null || value === undefined) return null;
  return typeof value?.toString === "function" ? value.toString() : String(value);
}

function normalizeTechLogDates(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (value instanceof Date) return [key, value.toISOString()];
      if (key === "costEstimateUsd") return [key, decimalToString(value)];
      return [key, value];
    }),
  );
}

function assertFounderSession(session) {
  if (session?.role !== "founder") {
    const error = new Error("Founder role required.");
    error.status = 403;
    throw error;
  }
}

function persistedActorUserId(session) {
  return session?.source === "database" && session?.id ? session.id : undefined;
}

function hasSecuritySession(session) {
  return Boolean(session?.role && hasAdminPermission(session.role, ADMIN_PERMISSIONS.SECURITY_ACCESS));
}

export function canRevokeAdminSessionForActor({ actorSession, targetSession }) {
  if (!actorSession?.id || !targetSession?.id) return false;
  if (targetSession.id === actorSession.sessionId) return false;
  return actorSession.role === "founder" || targetSession.userId === actorSession.id;
}

export function isAllowedAdminExportDecision(status) {
  return EXPORT_APPROVAL_STATUSES.has(String(status || "").trim());
}

export function isAllowedAdminAuditReviewStatus(status) {
  return AUDIT_REVIEW_STATUSES.has(String(status || "").trim());
}

export function isAllowedAdminAuditPriority(priority) {
  return AUDIT_PRIORITIES.has(String(priority || "").trim());
}

export function isAllowedAdminAuditEscalationStatus(status) {
  return AUDIT_ESCALATION_STATUSES.has(String(status || "").trim());
}

export function isAllowedAdminMfaRecoveryStatus(status) {
  return MFA_RECOVERY_STATUSES.has(String(status || "").trim());
}

export function canDecideAdminExportRequest(session) {
  return ["founder", "compliance"].includes(session?.role);
}

export function canRevokeAdminExportArtifactAccess(session) {
  return ["founder", "compliance"].includes(session?.role);
}

export function canRotateAdminExportArtifactAccess(session) {
  return canRevokeAdminExportArtifactAccess(session);
}

export function canRetryAdminScheduledJob({ actorSession, scheduledJobAttempt } = {}) {
  const role = actorSession?.role;
  if (!["founder", "compliance", "engineer"].includes(role)) return false;
  const status = String(scheduledJobAttempt?.status || "");
  if (!["failed", "partial"].includes(status)) return false;
  const jobKind = String(scheduledJobAttempt?.jobKind || "");
  if (!["notification_digest", "mfa_recovery_sla", "webhook_monitoring"].includes(jobKind)) return false;
  if (role === "engineer") return jobKind === "webhook_monitoring";
  return true;
}

export function canManageAdminCronExecutionAlert(session) {
  return ["founder", "compliance", "engineer"].includes(session?.role);
}

export function canManageAdminMfaRecovery({ actorSession, targetUser }) {
  if (!actorSession?.role || !targetUser?.id) return false;
  if (targetUser.id === actorSession.id) return true;
  const targetRoles = activeRolesFromAssignments(targetUser.roleAssignments || []);
  if (targetRoles.includes("founder") && actorSession.role !== "founder") return false;
  return ["founder", "compliance"].includes(actorSession.role);
}

export function canCreateAdminMfaRecoveryRequest({ actorSession, targetUser }) {
  if (!actorSession?.role || !targetUser?.id) return false;
  if (targetUser.id === actorSession.id) return false;
  const targetRoles = activeRolesFromAssignments(targetUser.roleAssignments || []);
  if (targetRoles.includes("founder") && actorSession.role !== "founder") {
    return actorSession.role === "compliance";
  }
  return ["founder", "compliance"].includes(actorSession.role);
}

export function canApproveAdminMfaRecoveryRequest({ actorSession, recoveryRequest }) {
  if (!actorSession?.role || !recoveryRequest?.id) return false;
  if (recoveryRequest.status !== "requested") return false;
  if (recoveryRequest.targetUserId === actorSession.id) return false;
  const targetRoles = activeRolesFromAssignments(recoveryRequest.targetUser?.roleAssignments || []);
  if (targetRoles.includes("founder")) return actorSession.role === "founder";
  return ["founder", "compliance"].includes(actorSession.role);
}

export function canNotifyAdminMfaRecovery({ actorSession, recoveryRequest }) {
  if (!actorSession?.role || !recoveryRequest?.id) return false;
  if (!["requested", "approved"].includes(recoveryRequest.status)) return false;
  return ["founder", "compliance"].includes(actorSession.role);
}

export function getAdminExportArtifactAccessState(access, now = new Date()) {
  if (!access || access.status !== "active") return "inactive";
  const currentTime = now instanceof Date ? now : new Date(now);
  const expiresAt = access.expiresAt instanceof Date ? access.expiresAt : new Date(access.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt < currentTime) return "expired";
  return "active";
}

function parsePositiveIntegerEnv(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.trunc(numeric);
}

export function getAdminExportArtifactPolicyConfig(env = process.env) {
  const validationWarnings = [];
  const configuredMin = parsePositiveIntegerEnv(env.LAJOO_ADMIN_EXPORT_ARTIFACT_MIN_TTL_SECONDS);
  const configuredMax = parsePositiveIntegerEnv(env.LAJOO_ADMIN_EXPORT_ARTIFACT_MAX_TTL_SECONDS);
  const minTtlSeconds = configuredMin || EXPORT_ARTIFACT_ACCESS_MIN_TTL_SECONDS;
  let maxTtlSeconds = configuredMax || EXPORT_ARTIFACT_ACCESS_MAX_TTL_SECONDS;

  if (configuredMax && configuredMax < minTtlSeconds) {
    maxTtlSeconds = Math.max(minTtlSeconds, EXPORT_ARTIFACT_ACCESS_MAX_TTL_SECONDS);
    validationWarnings.push("Configured maximum TTL is below minimum TTL; safe default maximum is used.");
  }

  const rawTtl = String(env.LAJOO_ADMIN_EXPORT_ARTIFACT_TTL_SECONDS ?? "").trim();
  const configuredTtl = parsePositiveIntegerEnv(rawTtl);
  let status = configuredTtl ? "configured" : "default";
  let effectiveTtlSeconds = configuredTtl || EXPORT_ARTIFACT_ACCESS_DEFAULT_TTL_SECONDS;

  if (rawTtl && !configuredTtl) {
    status = "invalid_env";
    validationWarnings.push("Configured artifact TTL is invalid; safe default TTL is used.");
  }

  if (effectiveTtlSeconds < minTtlSeconds) {
    validationWarnings.push("Configured artifact TTL is below the minimum; it has been clamped.");
    effectiveTtlSeconds = minTtlSeconds;
    status = status === "default" ? "default" : "clamped";
  }
  if (effectiveTtlSeconds > maxTtlSeconds) {
    validationWarnings.push("Configured artifact TTL is above the maximum; it has been clamped.");
    effectiveTtlSeconds = maxTtlSeconds;
    status = status === "default" ? "default" : "clamped";
  }

  return {
    status,
    ttlSource: configuredTtl ? "env" : "default",
    effectiveTtlSeconds,
    ttlMinutes: Math.round((effectiveTtlSeconds / 60) * 10) / 10,
    minTtlSeconds,
    maxTtlSeconds,
    validationWarnings,
    envKeys: {
      ttl: "LAJOO_ADMIN_EXPORT_ARTIFACT_TTL_SECONDS",
      min: "LAJOO_ADMIN_EXPORT_ARTIFACT_MIN_TTL_SECONDS",
      max: "LAJOO_ADMIN_EXPORT_ARTIFACT_MAX_TTL_SECONDS",
    },
  };
}

export function getAdminExportArtifactAccessTtlMs(env = process.env) {
  return getAdminExportArtifactPolicyConfig(env).effectiveTtlSeconds * 1000;
}

async function getActiveAdminExportArtifactPolicy({ prisma, environment = normalizeAdminExportArtifactPolicyEnvironment() } = {}) {
  const fallbackConfig = getAdminExportArtifactPolicyConfig();
  const normalizedEnvironment = normalizeAdminExportArtifactPolicyEnvironment(environment);
  if (!prisma?.adminExportArtifactPolicy) {
    return mapAdminExportArtifactPolicyForClient({
      environment: normalizedEnvironment,
      status: fallbackConfig.status,
      ttlSeconds: fallbackConfig.effectiveTtlSeconds,
      minTtlSeconds: fallbackConfig.minTtlSeconds,
      maxTtlSeconds: fallbackConfig.maxTtlSeconds,
      reason: "Environment/default policy.",
    }, fallbackConfig);
  }
  const policy = await prisma.adminExportArtifactPolicy.findFirst({
    where: {
      environment: normalizedEnvironment,
      status: { in: ["active", "disabled"] },
      supersededAt: null,
    },
    include: { changedBy: true },
    orderBy: { effectiveFrom: "desc" },
  });
  return mapAdminExportArtifactPolicyForClient(policy || {
    environment: normalizedEnvironment,
    status: fallbackConfig.status,
    ttlSeconds: fallbackConfig.effectiveTtlSeconds,
    minTtlSeconds: fallbackConfig.minTtlSeconds,
    maxTtlSeconds: fallbackConfig.maxTtlSeconds,
    reason: "Environment/default policy.",
  }, fallbackConfig);
}

async function getPersistedAdminExportArtifactAccessTtlMs(env = process.env) {
  if (!process.env.DATABASE_URL) return getAdminExportArtifactAccessTtlMs(env);
  try {
    const prisma = await getPrisma();
    const policy = await getActiveAdminExportArtifactPolicy({
      prisma,
      environment: normalizeAdminExportArtifactPolicyEnvironment(env.VERCEL_ENV || env.NODE_ENV),
    });
    return policy.ttlSeconds * 1000;
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return getAdminExportArtifactAccessTtlMs(env);
  }
}

function buildExportArtifactMetadata(exportEvent, status, reason, session) {
  return {
    artifactType: "mock_export_approval",
    artifactVersion: "phase5",
    containsPii: false,
    generatedAt: new Date().toISOString(),
    exportEventId: exportEvent.id,
    exportKind: exportEvent.exportKind || "mock",
    status,
    targetType: exportEvent.targetType,
    targetId: exportEvent.targetId,
    field: exportEvent.field,
    requestedAt: dateToIso(exportEvent.createdAt),
    decidedBy: session?.email ? maskAdminEmail(session.email) : "Unknown",
    decisionRole: session?.role || "unknown",
    decisionReason: reason,
    note: "Approval artifact only. No customer rows, IC, phone, email, address, payment details, or policy data are included.",
  };
}

export async function hashAdminPassword(password) {
  const salt = randomBytes(18).toString("base64url");
  const derivedKey = await scrypt(String(password || ""), salt, 64);
  return `${PASSWORD_HASH_PREFIX}:${salt}:${Buffer.from(derivedKey).toString("base64url")}`;
}

export async function verifyAdminPassword(password, storedHash) {
  const [algorithm, version, salt, encodedKey] = String(storedHash || "").split(":");
  if (`${algorithm}:${version}` !== PASSWORD_HASH_PREFIX || !salt || !encodedKey) return false;
  const derivedKey = await scrypt(String(password || ""), salt, 64);
  return safeEqual(Buffer.from(derivedKey).toString("base64url"), encodedKey);
}

export function validateAdminActionReason(reason) {
  const normalized = String(reason || "").trim();
  if (normalized.length < 8) {
    return { error: "An admin action reason of at least 8 characters is required." };
  }
  return { reason: normalized };
}

export async function ensureBootstrapAdminUser() {
  const email = normalizeEmail(process.env.LAJOO_ADMIN_EMAIL);
  const password = process.env.LAJOO_ADMIN_PASSWORD || "";
  if (!email || !password) return null;

  const prisma = await getPrisma();
  const passwordHash = await hashAdminPassword(password);
  const existing = await prisma.adminUser.findUnique({
    where: { email },
    include: { roleAssignments: true },
  });

  if (!existing) {
    return prisma.adminUser.create({
      data: {
        email,
        name: process.env.LAJOO_ADMIN_NAME || "LAJOO Admin",
        passwordHash,
        status: "active",
        bootstrapSource: "env_bootstrap",
        roleAssignments: {
          create: {
            role: "founder",
            grantedReason: "Environment bootstrap founder account.",
          },
        },
      },
      include: { roleAssignments: true },
    });
  }

  const updates = {};
  if (existing.status !== "active") updates.status = "active";
  if (existing.bootstrapSource === "env_bootstrap" && !(await verifyAdminPassword(password, existing.passwordHash))) {
    updates.passwordHash = passwordHash;
  }

  const hasFounder = existing.roleAssignments.some((assignment) => assignment.role === "founder" && !assignment.revokedAt);
  if (!hasFounder) {
    await prisma.adminRoleAssignment.create({
      data: {
        userId: existing.id,
        role: "founder",
        grantedReason: "Environment bootstrap founder role.",
      },
    });
  }

  if (Object.keys(updates).length) {
    return prisma.adminUser.update({
      where: { id: existing.id },
      data: updates,
      include: { roleAssignments: true },
    });
  }

  return prisma.adminUser.findUnique({
    where: { id: existing.id },
    include: { roleAssignments: true },
  });
}

export async function authenticateAdminCredentials(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) return null;

  if (process.env.DATABASE_URL) {
    try {
      await ensureBootstrapAdminUser();
      const prisma = await getPrisma();
      const user = await prisma.adminUser.findUnique({
        where: { email: normalizedEmail },
        include: { roleAssignments: true },
      });
      if (!user || !ACTIVE_STATUSES.has(user.status) || !user.passwordHash) return null;
      const passwordMatches = await verifyAdminPassword(password, user.passwordHash);
      if (!passwordMatches) return null;

      const updatedUser = await prisma.adminUser.update({
        where: { id: user.id },
        data: { lastActiveAt: new Date() },
        include: { roleAssignments: true },
      });
      return mapAdminUserForSession(updatedUser);
    } catch (error) {
      if (!isAdminDatabaseUnavailable(error)) throw error;
    }
  }

  const fallbackAdmin = fallbackConfigAdmin();
  if (!fallbackAdmin) return null;
  const emailMatches = safeEqual(normalizedEmail, normalizeEmail(fallbackAdmin.email));
  const passwordMatches = safeEqual(password, process.env.LAJOO_ADMIN_PASSWORD || "");
  return emailMatches && passwordMatches ? fallbackAdmin : null;
}

export function createLegacySignedSessionPayload(admin) {
  return {
    sub: admin.id || admin.email,
    email: admin.email,
    name: admin.name || "LAJOO Admin",
    role: normalizeAdminRole(admin.role),
    roles: admin.roles || [normalizeAdminRole(admin.role)],
    mfaStatus: admin.mfaStatus || "not_configured",
  };
}

export async function createPersistedAdminSession(admin, request, maxAgeSeconds) {
  if (!process.env.DATABASE_URL || !admin?.id || admin.id === "env-bootstrap") return null;
  try {
    const prisma = await getPrisma();
    const tokenSecret = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);
    const session = await prisma.adminSession.create({
      data: {
        userId: admin.id,
        tokenHash: hashToken(tokenSecret),
        role: normalizeAdminRole(admin.role),
        expiresAt,
        ipAddress: getRequestIpAddress(request),
        userAgent: getRequestUserAgent(request),
      },
    });
    return `${SESSION_TOKEN_PREFIX}.${session.id}.${tokenSecret}`;
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return null;
  }
}

export async function verifyPersistedAdminSessionToken(token) {
  const [prefix, sessionId, tokenSecret] = String(token || "").split(".");
  if (prefix !== SESSION_TOKEN_PREFIX || !sessionId || !tokenSecret || !process.env.DATABASE_URL) return null;

  try {
    const prisma = await getPrisma();
    const session = await prisma.adminSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          include: { roleAssignments: true },
        },
      },
    });
    if (!session || session.status !== "active" || session.revokedAt || session.expiresAt < new Date()) return null;
    if (!safeEqual(session.tokenHash, hashToken(tokenSecret))) return null;
    if (!session.user || !ACTIVE_STATUSES.has(session.user.status)) return null;

    await prisma.adminSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    }).catch(() => null);

    const admin = mapAdminUserForSession(session.user);
    if (!admin) return null;
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      roles: admin.roles,
      mfaStatus: admin.mfaStatus,
      issuedAt: Math.floor(session.createdAt.getTime() / 1000),
      expiresAt: Math.floor(session.expiresAt.getTime() / 1000),
      sessionId: session.id,
      permissions: getPermissionsForRole(admin.role),
      source: "database",
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return null;
  }
}

export async function revokePersistedAdminSessionToken(token) {
  const [prefix, sessionId] = String(token || "").split(".");
  if (prefix !== SESSION_TOKEN_PREFIX || !sessionId || !process.env.DATABASE_URL) return false;
  try {
    const prisma = await getPrisma();
    await prisma.adminSession.update({
      where: { id: sessionId },
      data: {
        status: "revoked",
        revokedAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return false;
  }
}

export async function createPersistedAdminMfaChallenge(admin, request) {
  assertDatabaseConfigured();
  if (!admin?.id || admin.source !== "database") {
    const error = new Error("Persisted admin user is required for MFA.");
    error.status = 400;
    throw error;
  }

  const prisma = await getPrisma();
  const challengeToken = randomBytes(32).toString("base64url");
  const challenge = await prisma.adminMfaChallenge.create({
    data: {
      userId: admin.id,
      tokenHash: hashToken(challengeToken),
      status: "pending",
      expiresAt: new Date(Date.now() + MFA_CHALLENGE_MAX_AGE_MS),
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
    },
  });

  return {
    challengeToken,
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt.toISOString(),
    email: maskAdminEmail(admin.email),
  };
}

export async function verifyPersistedAdminMfaChallenge({ challengeToken, code, request }) {
  assertDatabaseConfigured();
  const prisma = await getPrisma();
  const challenge = await prisma.adminMfaChallenge.findUnique({
    where: { tokenHash: hashToken(challengeToken) },
    include: {
      user: {
        include: { roleAssignments: true },
      },
    },
  });

  if (!challenge || challenge.status !== "pending") {
    const error = new Error("MFA challenge is invalid or already used.");
    error.status = 401;
    throw error;
  }
  if (challenge.expiresAt < new Date()) {
    await prisma.adminMfaChallenge.update({
      where: { id: challenge.id },
      data: { status: "expired" },
    });
    const error = new Error("MFA challenge expired. Sign in again.");
    error.status = 401;
    throw error;
  }
  if (!challenge.user || !ACTIVE_STATUSES.has(challenge.user.status) || challenge.user.mfaStatus !== "enabled") {
    const error = new Error("MFA is not enabled for this admin user.");
    error.status = 401;
    throw error;
  }

  const secret = decryptTotpSecret(challenge.user.mfaSecretEncrypted);
  const valid = verifyTotpCode(secret, code);
  const roles = activeRolesFromAssignments(challenge.user.roleAssignments);
  const auditSession = {
    id: challenge.user.id,
    email: challenge.user.email,
    role: primaryRole(roles),
    source: "database",
  };

  if (!valid) {
    await prisma.adminMfaChallenge.update({
      where: { id: challenge.id },
      data: { status: "failed", failedAt: new Date() },
    });
    await recordPersistedAdminAuditEvent({
      session: auditSession,
      action: "mfa_challenge_failed",
      targetType: "admin_user",
      targetId: challenge.user.id,
      field: "totp",
      reason: "Invalid MFA challenge code during admin login.",
      status: "failed",
      metadata: { challengeId: challenge.id },
      request,
    });
    const error = new Error("Invalid MFA code.");
    error.status = 401;
    throw error;
  }

  await prisma.adminMfaChallenge.update({
    where: { id: challenge.id },
    data: { status: "verified", verifiedAt: new Date() },
  });
  await recordPersistedAdminAuditEvent({
    session: auditSession,
    action: "mfa_challenge_verified",
    targetType: "admin_user",
    targetId: challenge.user.id,
    field: "totp",
    reason: "Admin completed MFA challenge during login.",
    status: "logged",
    metadata: { challengeId: challenge.id },
    request,
  });

  await prisma.adminUser.update({
    where: { id: challenge.user.id },
    data: { lastActiveAt: new Date() },
  });

  return mapAdminUserForSession(challenge.user);
}

export async function listPersistedAdminUsers() {
  if (!process.env.DATABASE_URL) {
    return { users: fallbackAdminUsers, persisted: false };
  }

  try {
    await ensureBootstrapAdminUser();
    const prisma = await getPrisma();
    const users = await prisma.adminUser.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      include: { roleAssignments: true },
      take: 50,
    });
    return {
      users: users.map(mapAdminUserForClient),
      persisted: true,
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return { users: fallbackAdminUsers, persisted: false };
  }
}

export async function listPersistedAdminAuditLogs(options = {}) {
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 20;
  if (!process.env.DATABASE_URL) {
    return { logs: getFallbackAdminAuditLogs({ limit }), persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const where = {};
    const actor = String(options.actor || "").trim();
    const target = String(options.target || "").trim();
    const createdAt = {};
    const from = parseFilterDate(options.dateFrom);
    const to = parseFilterDate(options.dateTo, true);
    if (actor) {
      where.OR = [
        { actorEmail: { contains: actor, mode: "insensitive" } },
        { actorRole: { contains: actor, mode: "insensitive" } },
      ];
    }
    if (target) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { targetType: { contains: target, mode: "insensitive" } },
            { targetId: { contains: target, mode: "insensitive" } },
            { field: { contains: target, mode: "insensitive" } },
          ],
        },
      ];
    }
    for (const [key, value] of [
      ["actorRole", options.role],
      ["action", options.action],
      ["targetType", options.targetType],
      ["status", options.status],
      ["reviewStatus", options.reviewStatus],
      ["assignedToUserId", options.assignedToUserId],
      ["ownerRole", options.ownerRole],
      ["priority", options.priority],
      ["escalationStatus", options.escalationStatus],
    ]) {
      const normalized = String(value || "").trim();
      if (normalized && normalized !== "all") where[key] = normalized;
    }
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
    if (Object.keys(createdAt).length) where.createdAt = createdAt;

    const logs = await prisma.adminAuditLog.findMany({
      where,
      include: {
        reviewedBy: true,
        assignedTo: true,
        assignmentEvents: {
          orderBy: { createdAt: "desc" },
          take: 6,
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return {
      logs: logs.map(mapAdminAuditLogForClient),
      persisted: true,
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return { logs: getFallbackAdminAuditLogs({ limit }), persisted: false };
  }
}

export async function listPersistedAdminAuditEscalationQueues({ session, limit = 8 } = {}) {
  const fallbackLogs = getFallbackAdminAuditLogs({ limit });
  const fallbackBuckets = {
    assignedToMe: [],
    myAssignments: [],
    founderQueue: fallbackLogs.filter((log) => log.ownerRole === "founder" || log.escalationStatus === "founder").slice(0, limit),
    complianceQueue: fallbackLogs.filter((log) => log.ownerRole === "compliance" || log.escalationStatus === "compliance").slice(0, limit),
    unassignedCritical: fallbackLogs.filter((log) => log.priority === "critical").slice(0, limit),
    overdueBySla: [],
    unassignedHighPriority: fallbackLogs.filter((log) => ["high", "critical"].includes(log.priority)).slice(0, limit),
    escalatedToCompliance: fallbackLogs.filter((log) => log.escalationStatus === "compliance").slice(0, limit),
    escalatedToFounder: fallbackLogs.filter((log) => log.escalationStatus === "founder").slice(0, limit),
    overdueReview: [],
  };
  if (!process.env.DATABASE_URL) {
    return { queues: fallbackBuckets, persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const now = new Date();
    const baseWhere = { reviewStatus: { not: "reviewed" } };
    const include = { reviewedBy: true, assignedTo: true };
    const take = Number.isFinite(Number(limit)) ? Number(limit) : 8;
    const [
      assignedToMe,
      unassignedHighPriority,
      escalatedToCompliance,
      escalatedToFounder,
      overdueReview,
      founderQueue,
      complianceQueue,
      unassignedCritical,
      overdueBySla,
    ] = await Promise.all([
      session?.id
        ? prisma.adminAuditLog.findMany({
            where: { ...baseWhere, assignedToUserId: session.id },
            include,
            orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
            take,
          })
        : Promise.resolve([]),
      prisma.adminAuditLog.findMany({
        where: {
          ...baseWhere,
          assignedToUserId: null,
          priority: { in: ["high", "critical"] },
        },
        include,
        orderBy: [{ createdAt: "desc" }],
        take,
      }),
      prisma.adminAuditLog.findMany({
        where: {
          ...baseWhere,
          escalationStatus: "compliance",
          escalationResolvedAt: null,
        },
        include,
        orderBy: [{ escalatedAt: "desc" }, { createdAt: "desc" }],
        take,
      }),
      prisma.adminAuditLog.findMany({
        where: {
          ...baseWhere,
          escalationStatus: "founder",
          escalationResolvedAt: null,
        },
        include,
        orderBy: [{ escalatedAt: "desc" }, { createdAt: "desc" }],
        take,
      }),
      prisma.adminAuditLog.findMany({
        where: {
          ...baseWhere,
          assignmentDueAt: { lt: now },
        },
        include,
        orderBy: [{ assignmentDueAt: "asc" }],
        take,
      }),
      prisma.adminAuditLog.findMany({
        where: {
          ...baseWhere,
          OR: [
            { ownerRole: "founder" },
            { escalationStatus: "founder", escalationResolvedAt: null },
          ],
        },
        include,
        orderBy: [{ assignmentDueAt: "asc" }, { createdAt: "desc" }],
        take,
      }),
      prisma.adminAuditLog.findMany({
        where: {
          ...baseWhere,
          OR: [
            { ownerRole: "compliance" },
            { escalationStatus: "compliance", escalationResolvedAt: null },
          ],
        },
        include,
        orderBy: [{ assignmentDueAt: "asc" }, { createdAt: "desc" }],
        take,
      }),
      prisma.adminAuditLog.findMany({
        where: {
          ...baseWhere,
          assignedToUserId: null,
          priority: "critical",
        },
        include,
        orderBy: [{ createdAt: "desc" }],
        take,
      }),
      prisma.adminAuditLog.findMany({
        where: {
          ...baseWhere,
          assignmentDueAt: { lt: now },
        },
        include,
        orderBy: [{ assignmentDueAt: "asc" }],
        take,
      }),
    ]);

    return {
      queues: {
        assignedToMe: assignedToMe.map(mapAdminAuditLogForClient),
        myAssignments: assignedToMe.map(mapAdminAuditLogForClient),
        founderQueue: founderQueue.map(mapAdminAuditLogForClient),
        complianceQueue: complianceQueue.map(mapAdminAuditLogForClient),
        unassignedCritical: unassignedCritical.map(mapAdminAuditLogForClient),
        overdueBySla: overdueBySla.map(mapAdminAuditLogForClient),
        unassignedHighPriority: unassignedHighPriority.map(mapAdminAuditLogForClient),
        escalatedToCompliance: escalatedToCompliance.map(mapAdminAuditLogForClient),
        escalatedToFounder: escalatedToFounder.map(mapAdminAuditLogForClient),
        overdueReview: overdueReview.map(mapAdminAuditLogForClient),
      },
      persisted: true,
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return { queues: fallbackBuckets, persisted: false };
  }
}

function averageHoursSince(rows = [], now = new Date()) {
  if (!rows.length) return 0;
  const current = now instanceof Date ? now : new Date(now);
  const totalHours = rows.reduce((total, row) => {
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    if (Number.isNaN(createdAt.getTime())) return total;
    return total + Math.max(0, current.getTime() - createdAt.getTime()) / (60 * 60 * 1000);
  }, 0);
  return Math.round((totalHours / rows.length) * 10) / 10;
}

function mapAuditWorkloadOwnerRow(row) {
  return {
    ownerRole: row.ownerRole || "unassigned",
    assignedToUserId: row.assignedToUserId || null,
    assignedToEmail: row.assignedTo?.email ? maskAdminEmail(row.assignedTo.email) : null,
    priority: row.priority || "normal",
    escalationStatus: row.escalationStatus || "none",
    reviewStatus: row.reviewStatus || "unreviewed",
    dueAt: dateToIso(row.assignmentDueAt),
    createdAt: dateToIso(row.createdAt),
  };
}

export async function getPersistedAdminAuditWorkload({ session } = {}) {
  const fallbackLogs = getFallbackAdminAuditLogs({ limit: 20 });
  const fallbackOpen = fallbackLogs.filter((log) => (log.reviewStatus || "unreviewed") !== "reviewed");
  if (!process.env.DATABASE_URL) {
    return {
      persisted: false,
      generatedAt: new Date().toISOString(),
      metrics: {
        assignedToMe: 0,
        criticalUnassigned: fallbackOpen.filter((log) => log.priority === "critical" && !log.assignedToUserId).length,
        founderQueueVolume: fallbackOpen.filter((log) => log.ownerRole === "founder" || log.escalationStatus === "founder").length,
        complianceQueueVolume: fallbackOpen.filter((log) => log.ownerRole === "compliance" || log.escalationStatus === "compliance").length,
        averageReviewAgeHours: averageHoursSince(fallbackOpen),
      },
      overdueByOwner: [],
      filters: {
        ownerRoles: ["all", "founder", "compliance", "ops", "engineer", "ai_qa", "agent_manager", "unassigned"],
        priorities: ["all", "critical", "high", "normal", "low"],
        escalationStatuses: ["all", "founder", "compliance", "none"],
        reviewStatuses: ["all", "unreviewed", "needs_follow_up", "reviewed"],
      },
    };
  }

  try {
    const prisma = await getPrisma();
    const now = new Date();
    const openWhere = { reviewStatus: { not: "reviewed" } };
    const [
      assignedToMe,
      criticalUnassigned,
      founderQueueVolume,
      complianceQueueVolume,
      overdueRows,
      openRows,
    ] = await Promise.all([
      session?.id
        ? prisma.adminAuditLog.count({ where: { ...openWhere, assignedToUserId: session.id } })
        : Promise.resolve(0),
      prisma.adminAuditLog.count({ where: { ...openWhere, assignedToUserId: null, priority: "critical" } }),
      prisma.adminAuditLog.count({
        where: {
          ...openWhere,
          OR: [{ ownerRole: "founder" }, { escalationStatus: "founder", escalationResolvedAt: null }],
        },
      }),
      prisma.adminAuditLog.count({
        where: {
          ...openWhere,
          OR: [{ ownerRole: "compliance" }, { escalationStatus: "compliance", escalationResolvedAt: null }],
        },
      }),
      prisma.adminAuditLog.findMany({
        where: { ...openWhere, assignmentDueAt: { lt: now } },
        include: { assignedTo: true },
        orderBy: [{ assignmentDueAt: "asc" }],
        take: 20,
      }),
      prisma.adminAuditLog.findMany({
        where: openWhere,
        select: { createdAt: true },
        take: 200,
      }),
    ]);
    const overdueByOwnerMap = new Map();
    for (const row of overdueRows) {
      const key = row.ownerRole || row.assignedToUserId || "unassigned";
      const existing = overdueByOwnerMap.get(key) || {
        ownerRole: row.ownerRole || "unassigned",
        assignedToUserId: row.assignedToUserId || null,
        assignedToEmail: row.assignedTo?.email ? maskAdminEmail(row.assignedTo.email) : null,
        count: 0,
        criticalCount: 0,
        oldestDueAt: dateToIso(row.assignmentDueAt),
      };
      existing.count += 1;
      if (row.priority === "critical") existing.criticalCount += 1;
      overdueByOwnerMap.set(key, existing);
    }
    return {
      persisted: true,
      generatedAt: now.toISOString(),
      metrics: {
        assignedToMe,
        criticalUnassigned,
        founderQueueVolume,
        complianceQueueVolume,
        averageReviewAgeHours: averageHoursSince(openRows, now),
      },
      overdueByOwner: Array.from(overdueByOwnerMap.values()),
      overdueRows: overdueRows.map(mapAuditWorkloadOwnerRow),
      filters: {
        ownerRoles: ["all", "founder", "compliance", "ops", "engineer", "ai_qa", "agent_manager", "unassigned"],
        priorities: ["all", "critical", "high", "normal", "low"],
        escalationStatuses: ["all", "founder", "compliance", "none"],
        reviewStatuses: ["all", "unreviewed", "needs_follow_up", "reviewed"],
      },
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return {
      persisted: false,
      generatedAt: new Date().toISOString(),
      metrics: {
        assignedToMe: 0,
        criticalUnassigned: fallbackOpen.filter((log) => log.priority === "critical" && !log.assignedToUserId).length,
        founderQueueVolume: fallbackOpen.filter((log) => log.ownerRole === "founder" || log.escalationStatus === "founder").length,
        complianceQueueVolume: fallbackOpen.filter((log) => log.ownerRole === "compliance" || log.escalationStatus === "compliance").length,
        averageReviewAgeHours: averageHoursSince(fallbackOpen),
      },
      overdueByOwner: [],
      filters: {
        ownerRoles: ["all", "founder", "compliance", "ops", "engineer", "ai_qa", "agent_manager", "unassigned"],
        priorities: ["all", "critical", "high", "normal", "low"],
        escalationStatuses: ["all", "founder", "compliance", "none"],
        reviewStatuses: ["all", "unreviewed", "needs_follow_up", "reviewed"],
      },
    };
  }
}

function dayKeyFromDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildTrendDayRange(now = new Date(), days = 14) {
  const current = now instanceof Date ? now : new Date(now);
  const safeDays = Math.min(Math.max(Number(days) || 14, 1), 30);
  const range = [];
  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()));
    date.setUTCDate(date.getUTCDate() - offset);
    range.push(date.toISOString().slice(0, 10));
  }
  return range;
}

function isAuditRowOpen(row) {
  return (row?.reviewStatus || "unreviewed") !== "reviewed";
}

export function buildAdminAuditSlaTrendBuckets(rows = [], { now = new Date(), days = 14 } = {}) {
  const dayRange = buildTrendDayRange(now, days);
  const buckets = dayRange.map((day) => ({
    day,
    assignedWorkload: 0,
    overdueCount: 0,
    criticalUnassigned: 0,
    founderQueueVolume: 0,
    complianceQueueVolume: 0,
    averageReviewAgeHours: 0,
  }));
  const bucketByDay = new Map(buckets.map((bucket) => [bucket.day, bucket]));

  for (const row of rows) {
    const createdDay = dayKeyFromDate(row.createdAt);
    const dueDay = row.assignmentDueAt ? dayKeyFromDate(row.assignmentDueAt) : null;
    const open = isAuditRowOpen(row);
    if (open && createdDay && bucketByDay.has(createdDay)) {
      const createdBucket = bucketByDay.get(createdDay);
      if (row.assignedToUserId || row.ownerRole) createdBucket.assignedWorkload += 1;
      if (row.priority === "critical" && !row.assignedToUserId) createdBucket.criticalUnassigned += 1;
      if (row.ownerRole === "founder" || row.escalationStatus === "founder") createdBucket.founderQueueVolume += 1;
      if (row.ownerRole === "compliance" || row.escalationStatus === "compliance") createdBucket.complianceQueueVolume += 1;
    }
    if (open && dueDay && bucketByDay.has(dueDay)) {
      const dueAt = row.assignmentDueAt instanceof Date ? row.assignmentDueAt : new Date(row.assignmentDueAt);
      const current = now instanceof Date ? now : new Date(now);
      if (!Number.isNaN(dueAt.getTime()) && dueAt < current) bucketByDay.get(dueDay).overdueCount += 1;
    }
  }

  return buckets.map((bucket) => {
    const bucketEnd = new Date(`${bucket.day}T23:59:59.999Z`);
    const openRowsAtBucket = rows.filter((row) => {
      const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
      return isAuditRowOpen(row) && !Number.isNaN(createdAt.getTime()) && createdAt <= bucketEnd;
    });
    return {
      ...bucket,
      averageReviewAgeHours: averageHoursSince(openRowsAtBucket, bucketEnd),
    };
  });
}

function buildAdminAuditOwnerTrendRows(rows = [], now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  const ownerMap = new Map();
  for (const row of rows.filter(isAuditRowOpen)) {
    const key = row.assignedToUserId || row.ownerRole || row.escalationStatus || "unassigned";
    const existing = ownerMap.get(key) || {
      ownerKey: key,
      ownerRole: row.ownerRole || "unassigned",
      assignedToUserId: row.assignedToUserId || null,
      assignedToEmail: row.assignedTo?.email ? maskAdminEmail(row.assignedTo.email) : null,
      assignedCount: 0,
      overdueCount: 0,
      criticalCount: 0,
      oldestCreatedAt: dateToIso(row.createdAt),
      averageReviewAgeHours: 0,
    };
    existing.assignedCount += 1;
    if (row.priority === "critical") existing.criticalCount += 1;
    const dueAt = row.assignmentDueAt instanceof Date ? row.assignmentDueAt : new Date(row.assignmentDueAt || "");
    if (!Number.isNaN(dueAt.getTime()) && dueAt < current) existing.overdueCount += 1;
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    const oldest = existing.oldestCreatedAt ? new Date(existing.oldestCreatedAt) : null;
    if (!Number.isNaN(createdAt.getTime()) && (!oldest || createdAt < oldest)) existing.oldestCreatedAt = createdAt.toISOString();
    ownerMap.set(key, existing);
  }

  return Array.from(ownerMap.values())
    .map((owner) => {
      const ownerRows = rows.filter((row) => (
        isAuditRowOpen(row) && (row.assignedToUserId || row.ownerRole || row.escalationStatus || "unassigned") === owner.ownerKey
      ));
      return {
        ...owner,
        averageReviewAgeHours: averageHoursSince(ownerRows, current),
      };
    })
    .sort((left, right) => right.overdueCount - left.overdueCount || right.criticalCount - left.criticalCount || right.assignedCount - left.assignedCount);
}

export async function getPersistedAdminAuditSlaTrends({ session, days = 14 } = {}) {
  if (!hasSecuritySession(session)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  const now = new Date();
  if (!process.env.DATABASE_URL) {
    const fallbackRows = getFallbackAdminAuditLogs({ limit: 20 }).map((row) => ({
      ...row,
      assignmentDueAt: row.assignmentDueAt || row.createdAt,
      createdAt: row.createdAt,
    }));
    return {
      persisted: false,
      generatedAt: now.toISOString(),
      days: Math.min(Math.max(Number(days) || 14, 1), 30),
      buckets: buildAdminAuditSlaTrendBuckets(fallbackRows, { now, days }),
      ownerRows: buildAdminAuditOwnerTrendRows(fallbackRows, now),
    };
  }

  try {
    const prisma = await getPrisma();
    const safeDays = Math.min(Math.max(Number(days) || 14, 1), 30);
    const since = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);
    const rows = await prisma.adminAuditLog.findMany({
      where: {
        OR: [
          { createdAt: { gte: since } },
          { assignmentDueAt: { gte: since } },
          { reviewStatus: { not: "reviewed" } },
        ],
      },
      include: { assignedTo: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return {
      persisted: true,
      generatedAt: now.toISOString(),
      days: safeDays,
      buckets: buildAdminAuditSlaTrendBuckets(rows, { now, days: safeDays }),
      ownerRows: buildAdminAuditOwnerTrendRows(rows, now),
      filters: {
        ownerRoles: ["all", "founder", "compliance", "ops", "engineer", "ai_qa", "agent_manager", "unassigned"],
        priorities: ["all", "critical", "high", "normal", "low"],
        escalationStatuses: ["all", "founder", "compliance", "none"],
        reviewStatuses: ["all", "unreviewed", "needs_follow_up", "reviewed"],
      },
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    const fallbackRows = getFallbackAdminAuditLogs({ limit: 20 });
    return {
      persisted: false,
      generatedAt: now.toISOString(),
      days: Math.min(Math.max(Number(days) || 14, 1), 30),
      buckets: buildAdminAuditSlaTrendBuckets(fallbackRows, { now, days }),
      ownerRows: buildAdminAuditOwnerTrendRows(fallbackRows, now),
    };
  }
}

export async function recordPersistedAdminEmailDeliveryEvent({
  session,
  inviteTokenId,
  email,
  delivery,
  metadata = {},
  request,
} = {}) {
  const normalizedDelivery = normalizeEmailDeliveryEvent(delivery);
  const normalizedEmail = normalizeEmail(email);
  if (!process.env.DATABASE_URL || !normalizedEmail) return null;

  try {
    const prisma = await getPrisma();
    const event = await prisma.adminInviteEmailEvent.create({
      data: {
        inviteTokenId: inviteTokenId || null,
        actorUserId: persistedActorUserId(session),
        email: normalizedEmail,
        provider: normalizedDelivery.provider,
        status: normalizedDelivery.status,
        errorClass: normalizedDelivery.errorClass,
        errorMessage: normalizedDelivery.errorMessage,
        messageId: normalizedDelivery.messageId,
        domain: normalizedDelivery.domain || extractDomainFromAdminEmailAddress(email),
        providerEnvironment: normalizedDelivery.providerEnvironment,
        metadata,
        ipAddress: getRequestIpAddress(request),
        userAgent: getRequestUserAgent(request),
      },
      include: { actorUser: true },
    });
    return mapAdminInviteEmailEventForClient(event);
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return null;
  }
}

export async function recordPersistedAdminResendWebhookEvent({
  rawBody,
  headers,
  request,
  env = process.env,
} = {}) {
  const verification = verifyResendWebhookSignature({
    rawBody,
    headers,
    secret: env.RESEND_WEBHOOK_SECRET,
  });

  if (!process.env.DATABASE_URL) {
    return { event: null, persisted: false, verification };
  }

  const prisma = await getPrisma();
  let payload = null;
  let sanitized = {
    provider: "resend",
    svixId: verification.svixId || null,
    eventType: "unknown",
    status: "unknown",
    providerEventId: verification.svixId || null,
    providerMessageId: null,
    recipientMasked: null,
    emailDigest: null,
    verificationStatus: verification.status,
    errorClass: verification.status,
    payloadSummary: { verificationStatus: verification.status },
  };

  if (verification.ok) {
    try {
      payload = JSON.parse(String(rawBody || "{}"));
      sanitized = sanitizeResendWebhookPayload(payload, verification);
    } catch {
      sanitized = {
        ...sanitized,
        verificationStatus: "verified",
        errorClass: "invalid_json",
        payloadSummary: { verificationStatus: "verified", parseStatus: "invalid_json" },
      };
    }
  }

  let inviteEmailEvent = null;
  if (verification.ok && sanitized.providerMessageId) {
    inviteEmailEvent = await prisma.adminInviteEmailEvent.findFirst({
      where: {
        provider: "resend",
        messageId: sanitized.providerMessageId,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  try {
    const event = await prisma.adminEmailWebhookEvent.create({
      data: {
        inviteEmailEventId: inviteEmailEvent?.id || null,
        provider: "resend",
        svixId: sanitized.svixId || null,
        eventType: sanitized.eventType,
        status: sanitized.status,
        providerEventId: sanitized.providerEventId,
        providerMessageId: sanitized.providerMessageId,
        recipientMasked: sanitized.recipientMasked,
        emailDigest: sanitized.emailDigest,
        verificationStatus: sanitized.verificationStatus,
        errorClass: sanitized.errorClass,
        payloadSummary: sanitized.payloadSummary,
        linkedBy: inviteEmailEvent ? "provider_message_id" : null,
        ipAddress: getRequestIpAddress(request),
        userAgent: getRequestUserAgent(request),
      },
    });
    return {
      event: mapAdminEmailWebhookEventForClient(event),
      persisted: true,
      verification,
      linkedInviteEmailEventId: inviteEmailEvent?.id || null,
      payloadParsed: Boolean(payload),
    };
  } catch (error) {
    if (error?.code === "P2002" && sanitized.svixId) {
      const existing = await prisma.adminEmailWebhookEvent.findUnique({
        where: { svixId: sanitized.svixId },
      });
      return {
        event: existing ? mapAdminEmailWebhookEventForClient(existing) : null,
        persisted: true,
        duplicate: true,
        verification,
      };
    }
    throw error;
  }
}

export async function listPersistedAdminInviteEmailEvents({ limit = 8 } = {}) {
  if (!process.env.DATABASE_URL) return { emailEvents: [], persisted: false };

  try {
    const prisma = await getPrisma();
    const events = await prisma.adminInviteEmailEvent.findMany({
      include: { actorUser: true },
      orderBy: { createdAt: "desc" },
      take: Number.isFinite(Number(limit)) ? Number(limit) : 8,
    });
    return { emailEvents: events.map(mapAdminInviteEmailEventForClient), persisted: true };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return { emailEvents: [], persisted: false };
  }
}

export async function listPersistedAdminEmailWebhookEvents({ limit = 8 } = {}) {
  if (!process.env.DATABASE_URL) return { webhookEvents: [], persisted: false };

  try {
    const prisma = await getPrisma();
    const events = await prisma.adminEmailWebhookEvent.findMany({
      orderBy: { receivedAt: "desc" },
      take: Number.isFinite(Number(limit)) ? Number(limit) : 8,
    });
    return { webhookEvents: events.map(mapAdminEmailWebhookEventForClient), persisted: true };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return { webhookEvents: [], persisted: false };
  }
}

function normalizeRequiredEventsMissing(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function monitoringSeverityScore(severity = "warning") {
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function highestMonitoringSeverity(alerts = []) {
  return alerts.reduce((current, alert) => (
    monitoringSeverityScore(alert.severity) > monitoringSeverityScore(current) ? alert.severity : current
  ), "none");
}

export function buildAdminWebhookMonitoringState({
  webhookStatus = getResendWebhookStatus(),
  statusCheck = null,
  lastWebhookEvent = null,
  now = new Date(),
} = {}) {
  const checkedAt = statusCheck?.checkedAt || statusCheck?.createdAt || null;
  const endpointUrl = statusCheck?.endpointUrl || webhookStatus?.endpointUrl || webhookStatus?.endpoint || getAdminResendWebhookEndpointUrl();
  const secretConfigured = Boolean(
    webhookStatus?.configured ??
    webhookStatus?.secretConfigured ??
    statusCheck?.metadata?.secretConfigured ??
    false,
  );
  const endpointMatched = Boolean(statusCheck?.endpointMatched);
  const providerStatus = statusCheck?.status || webhookStatus?.registrationStatus || webhookStatus?.status || "not_checked";
  const requiredEventsMissing = normalizeRequiredEventsMissing(statusCheck?.requiredEventsMissing || webhookStatus?.requiredEventsMissing);
  const lastVerifiedWebhookAt = lastWebhookEvent?.verificationStatus === "verified"
    ? lastWebhookEvent.receivedAt || lastWebhookEvent.createdAt || null
    : null;
  const alerts = [];

  if (!secretConfigured) {
    alerts.push({
      alertType: "webhook_secret_missing",
      severity: "critical",
      message: "RESEND_WEBHOOK_SECRET is missing, so webhook verification cannot be trusted.",
    });
  }

  if (!statusCheck) {
    alerts.push({
      alertType: "webhook_registration_not_checked",
      severity: "warning",
      message: "Resend webhook registration has not been checked from the admin backend yet.",
    });
  } else if (providerStatus === "provider_error") {
    alerts.push({
      alertType: "provider_check_failed",
      severity: "high",
      message: "Resend provider webhook status check failed. Check provider configuration without exposing API keys.",
    });
  } else if (!endpointMatched) {
    alerts.push({
      alertType: "endpoint_missing",
      severity: "high",
      message: "Configured Resend webhooks do not include the LAJOO admin webhook endpoint.",
    });
  } else if (providerStatus === "registered_disabled") {
    alerts.push({
      alertType: "endpoint_disabled",
      severity: "high",
      message: "The matched Resend webhook endpoint is disabled.",
    });
  }

  if (requiredEventsMissing.length) {
    alerts.push({
      alertType: "required_events_missing",
      severity: "warning",
      message: "The matched Resend webhook is missing one or more required delivery events.",
    });
  }

  if (lastWebhookEvent && lastWebhookEvent.verificationStatus !== "verified") {
    alerts.push({
      alertType: "last_webhook_verification_failed",
      severity: "high",
      message: "The most recent Resend webhook event failed verification and was sanitized before storage.",
    });
  }

  return {
    provider: "resend",
    status: alerts.length ? "alert" : "healthy",
    severity: highestMonitoringSeverity(alerts),
    endpointUrl,
    providerStatus,
    secretConfigured,
    endpointMatched,
    requiredEventsMissing,
    lastVerifiedWebhookAt: dateToIso(lastVerifiedWebhookAt),
    lastWebhookStatus: lastWebhookEvent?.status || null,
    lastVerificationStatus: lastWebhookEvent?.verificationStatus || null,
    checkedAt: dateToIso(checkedAt),
    generatedAt: dateToIso(now instanceof Date ? now : new Date(now)),
    alerts: alerts.map((alert) => ({
      ...alert,
      provider: "resend",
      status: "open",
      endpointUrl,
      providerStatus,
      secretConfigured,
      endpointMatched,
      requiredEventsMissing,
      lastVerifiedWebhookAt: dateToIso(lastVerifiedWebhookAt),
    })),
  };
}

export async function listPersistedAdminWebhookMonitoringAlerts({
  limit = 8,
  status,
  priority,
  assignedToUserId,
} = {}) {
  if (!process.env.DATABASE_URL) return { alerts: [], persisted: false };

  try {
    const prisma = await getPrisma();
    if (!prisma.adminWebhookMonitoringAlert) return { alerts: [], persisted: false };
    const where = {};
    const normalizedStatus = String(status || "").trim();
    if (normalizedStatus && normalizedStatus !== "all") where.status = normalizeWebhookAlertStatus(normalizedStatus);
    const normalizedPriority = String(priority || "").trim();
    if (normalizedPriority && normalizedPriority !== "all") where.priority = normalizeWebhookAlertPriority(normalizedPriority);
    const assignee = String(assignedToUserId || "").trim();
    if (assignee && assignee !== "all") where.assignedToUserId = assignee === "unassigned" ? null : assignee;
    const alerts = await prisma.adminWebhookMonitoringAlert.findMany({
      where,
      include: {
        actorUser: true,
        assignedTo: true,
        resolvedBy: true,
        workflowEvents: {
          orderBy: { createdAt: "desc" },
          take: 6,
        },
        notifications: {
          orderBy: { createdAt: "desc" },
          take: 6,
        },
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { detectedAt: "desc" }],
      take: Number.isFinite(Number(limit)) ? Number(limit) : 8,
    });
    return { alerts: alerts.map(mapAdminWebhookMonitoringAlertForClient), persisted: true };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return { alerts: [], persisted: false };
  }
}

async function persistAdminWebhookMonitoringAlerts({ prisma, session, statusCheck, webhookStatus, lastWebhookEvent, request } = {}) {
  if (!prisma?.adminWebhookMonitoringAlert) {
    return buildAdminWebhookMonitoringState({ webhookStatus, statusCheck, lastWebhookEvent });
  }
  const state = buildAdminWebhookMonitoringState({ webhookStatus, statusCheck, lastWebhookEvent });
  const now = new Date();
  if (!state.alerts.length) {
    const resolved = await prisma.adminWebhookMonitoringAlert.findMany({
      where: { provider: "resend", status: { in: WEBHOOK_ALERT_ACTIVE_STATUSES } },
      select: { id: true, status: true, priority: true },
    });
    await prisma.adminWebhookMonitoringAlert.updateMany({
      where: { id: { in: resolved.map((alert) => alert.id) } },
      data: { status: "resolved", resolvedAt: now },
    });
    return state;
  }

  const createdAlertIds = [];
  const updatedAlertIds = [];
  for (const alert of state.alerts) {
    const priority = priorityForWebhookAlertSeverity(alert.severity);
    const existing = await prisma.adminWebhookMonitoringAlert.findFirst({
      where: {
        provider: "resend",
        alertType: alert.alertType,
        status: { in: WEBHOOK_ALERT_ACTIVE_STATUSES },
      },
      orderBy: { createdAt: "desc" },
    });
    const data = {
      actorUserId: persistedActorUserId(session),
      statusCheckId: statusCheck?.id || null,
      provider: "resend",
      alertType: alert.alertType,
      priority,
      severity: alert.severity,
      message: alert.message,
      endpointUrl: alert.endpointUrl,
      providerStatus: alert.providerStatus,
      secretConfigured: alert.secretConfigured,
      endpointMatched: alert.endpointMatched,
      requiredEventsMissing: alert.requiredEventsMissing,
      lastVerifiedWebhookAt: alert.lastVerifiedWebhookAt ? new Date(alert.lastVerifiedWebhookAt) : null,
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        containsSecrets: false,
        source: "resend_webhook_registration_monitor",
      },
    };
    if (existing) {
      await prisma.adminWebhookMonitoringAlert.update({
        where: { id: existing.id },
        data,
      });
      updatedAlertIds.push(existing.id);
    } else {
      const created = await prisma.adminWebhookMonitoringAlert.create({
        data: {
          ...data,
          status: "open",
        },
      });
      await prisma.adminWebhookMonitoringAlertEvent.create({
        data: {
          alertId: created.id,
          actorUserId: persistedActorUserId(session),
          action: "created",
          status: "open",
          priority,
          reason: "Webhook monitoring detected a new Resend configuration alert.",
          ipAddress: getRequestIpAddress(request),
          userAgent: getRequestUserAgent(request),
          metadata: { alertType: alert.alertType, containsSecrets: false },
        },
      });
      createdAlertIds.push(created.id);
    }
  }
  return {
    ...state,
    createdAlertIds,
    updatedAlertIds,
  };
}

export async function notifyPersistedAdminWebhookMonitoringAlerts({
  session,
  alertIds = [],
  reason = "Webhook monitoring detected a Resend configuration alert.",
  request,
  limit = 12,
} = {}) {
  if (!hasSecuritySession(session)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const prisma = await getPrisma();
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 30);
  const ids = (Array.isArray(alertIds) ? alertIds : [alertIds]).map((id) => String(id || "").trim()).filter(Boolean);
  const alerts = await prisma.adminWebhookMonitoringAlert.findMany({
    where: ids.length ? { id: { in: ids } } : { provider: "resend", status: { in: WEBHOOK_ALERT_ACTIVE_STATUSES } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: safeLimit,
  });
  if (!alerts.length) {
    return { sentCount: 0, manualFallbackCount: 0, failedCount: 0, notificationEvents: [] };
  }

  const recipients = await prisma.adminUser.findMany({
    where: {
      status: "active",
      roleAssignments: {
        some: {
          role: { in: ["founder", "compliance", "engineer"] },
          revokedAt: null,
        },
      },
    },
    include: {
      roleAssignments: true,
      notificationPreferences: true,
    },
    take: 20,
  });

  const origin = getRequestOrigin(request);
  const notificationEvents = [];
  for (const user of recipients) {
    if (!user.notificationPreferences?.length) {
      await ensureAdminNotificationPreferenceDefaults(prisma, user.id);
      user.notificationPreferences = await prisma.adminNotificationPreference.findMany({ where: { userId: user.id } });
    }
    const preference = user.notificationPreferences.find((item) => item.category === "tech_incidents");
    if (!preference || (!preference.emailEnabled && !preference.manualFallbackEnabled)) continue;
    const role = primaryRole(activeRolesFromAssignments(user.roleAssignments));

    for (const alert of alerts) {
      const delivery = await sendAdminOperationalEmail({
        email: user.email,
        subject: "LAJOO Admin Resend webhook alert",
        heading: "Webhook monitoring alert",
        body: [
          `Alert: ${alert.alertType}.`,
          `Priority: ${normalizeWebhookAlertPriority(alert.priority)}.`,
          `Status: ${normalizeWebhookAlertStatus(alert.status)}.`,
          alert.message,
          "No API keys, webhook secrets, signatures, raw payloads, or customer PII are included.",
        ].join("\n\n"),
        actionUrl: `${origin}/admin/security`,
        actionLabel: "Open Security & Access",
      });
      const normalizedDelivery = normalizeEmailDeliveryEvent(delivery);
      await recordPersistedAdminEmailDeliveryEvent({
        session,
        email: user.email,
        delivery,
        metadata: {
          emailKind: "webhook_monitoring_alert",
          alertId: alert.id,
          alertType: alert.alertType,
          containsPii: false,
          containsSecrets: false,
        },
        request,
      });
      const notification = await prisma.adminWebhookMonitoringAlertNotification.create({
        data: {
          alertId: alert.id,
          recipientUserId: user.id,
          recipientRole: role,
          status: normalizedDelivery.status === "sent" ? "sent" : (normalizedDelivery.status === "failed" ? "failed" : "manual_fallback"),
          deliveryProvider: normalizedDelivery.provider,
          deliveryStatus: normalizedDelivery.status,
          deliveryMessageId: normalizedDelivery.messageId,
          errorClass: normalizedDelivery.errorClass,
          errorMessage: normalizedDelivery.errorMessage,
          manualFallback: normalizedDelivery.status !== "sent",
          reason: actionReason,
          ipAddress: getRequestIpAddress(request),
          userAgent: getRequestUserAgent(request),
          metadata: {
            preferenceFrequency: preference.frequency,
            containsPii: false,
            containsSecrets: false,
          },
        },
      });
      notificationEvents.push(notification);
    }
  }

  const sentCount = notificationEvents.filter((event) => event.status === "sent").length;
  const failedCount = notificationEvents.filter((event) => event.status === "failed").length;
  const manualFallbackCount = notificationEvents.filter((event) => event.manualFallback).length;
  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "webhook_monitoring_alert_notifications",
    targetType: "admin_webhook_monitoring",
    targetId: "resend",
    field: "notifications",
    reason: actionReason,
    status: failedCount && !sentCount && !manualFallbackCount ? "failed" : "logged",
    metadata: {
      alertIds: alerts.map((alert) => alert.id),
      recipientCount: recipients.length,
      sentCount,
      failedCount,
      manualFallbackCount,
      containsPii: false,
      containsSecrets: false,
    },
    request,
  });

  return {
    sentCount,
    manualFallbackCount,
    failedCount,
    notificationEvents: notificationEvents.map((notification) => ({
      id: notification.id,
      alertId: notification.alertId,
      status: notification.status,
      deliveryStatus: notification.deliveryStatus,
      manualFallback: notification.manualFallback,
      createdAt: dateToIso(notification.createdAt),
    })),
    event,
  };
}

export async function updatePersistedAdminWebhookMonitoringAlert({
  session,
  alertId,
  operation,
  reason,
  assignedToUserId,
  priority,
  note,
  snoozedUntil,
  request,
} = {}) {
  if (!hasSecuritySession(session)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }
  const normalizedOperation = String(operation || "").trim();
  if (!["acknowledge", "assign", "snooze", "resolve", "reopen"].includes(normalizedOperation)) {
    const operationError = new Error("Unsupported webhook alert operation.");
    operationError.status = 400;
    throw operationError;
  }

  const prisma = await getPrisma();
  const existing = await prisma.adminWebhookMonitoringAlert.findUnique({
    where: { id: String(alertId || "") },
    include: { assignedTo: true, resolvedBy: true },
  });
  if (!existing) {
    const notFound = new Error("Webhook monitoring alert was not found.");
    notFound.status = 404;
    throw notFound;
  }

  const data = {};
  const now = new Date();
  const nextPriority = priority ? normalizeWebhookAlertPriority(priority) : normalizeWebhookAlertPriority(existing.priority);
  const cleanNote = String(note || "").trim();
  let nextStatus = normalizeWebhookAlertStatus(existing.status);
  let nextSnoozedUntil = existing.snoozedUntil;

  if (normalizedOperation === "acknowledge") {
    nextStatus = "acknowledged";
    data.acknowledgedAt = existing.acknowledgedAt || now;
  }
  if (normalizedOperation === "assign") {
    const assignee = String(assignedToUserId || "").trim();
    if (!assignee || assignee === "unassigned") {
      data.assignedToUserId = null;
    } else {
      const user = await prisma.adminUser.findUnique({ where: { id: assignee } });
      if (!user || user.status === "suspended") {
        const assigneeError = new Error("Alert assignee was not found or is suspended.");
        assigneeError.status = 400;
        throw assigneeError;
      }
      data.assignedToUserId = user.id;
    }
  }
  if (normalizedOperation === "snooze") {
    const parsed = parseOptionalDateTime(snoozedUntil) || new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (parsed <= now) {
      const dateError = new Error("Snooze expiry must be in the future.");
      dateError.status = 400;
      throw dateError;
    }
    nextStatus = "snoozed";
    nextSnoozedUntil = parsed;
    data.snoozedUntil = parsed;
    data.acknowledgedAt = existing.acknowledgedAt || now;
  }
  if (normalizedOperation === "resolve") {
    nextStatus = "resolved";
    data.resolvedAt = now;
    data.resolvedByUserId = persistedActorUserId(session);
  }
  if (normalizedOperation === "reopen") {
    nextStatus = "open";
    nextSnoozedUntil = null;
    data.snoozedUntil = null;
    data.resolvedAt = null;
    data.resolvedByUserId = null;
  }

  data.status = nextStatus;
  data.priority = nextPriority;
  if (cleanNote) data.note = cleanNote.slice(0, 500);

  const updated = await prisma.adminWebhookMonitoringAlert.update({
    where: { id: existing.id },
    data,
    include: {
      actorUser: true,
      assignedTo: true,
      resolvedBy: true,
      workflowEvents: {
        orderBy: { createdAt: "desc" },
        take: 6,
      },
      notifications: {
        orderBy: { createdAt: "desc" },
        take: 6,
      },
    },
  });

  await prisma.adminWebhookMonitoringAlertEvent.create({
    data: {
      alertId: existing.id,
      actorUserId: persistedActorUserId(session),
      action: normalizedOperation,
      previousStatus: normalizeWebhookAlertStatus(existing.status),
      status: nextStatus,
      previousPriority: normalizeWebhookAlertPriority(existing.priority),
      priority: nextPriority,
      assignedToUserId: data.assignedToUserId === undefined ? existing.assignedToUserId : data.assignedToUserId,
      reason: actionReason,
      note: cleanNote || null,
      snoozedUntil: nextSnoozedUntil || null,
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        alertType: existing.alertType,
        provider: existing.provider,
        containsPii: false,
        containsSecrets: false,
      },
    },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: `webhook_alert_${normalizedOperation}`,
    targetType: "admin_webhook_monitoring_alert",
    targetId: existing.id,
    field: existing.alertType,
    reason: actionReason,
    status: "logged",
    metadata: {
      previousStatus: existing.status,
      status: nextStatus,
      previousPriority: existing.priority,
      priority: nextPriority,
      assignedToUserId: data.assignedToUserId === undefined ? existing.assignedToUserId : data.assignedToUserId,
      snoozedUntil: dateToIso(nextSnoozedUntil),
      containsPii: false,
      containsSecrets: false,
    },
    request,
  });

  return {
    alert: mapAdminWebhookMonitoringAlertForClient(updated),
    event,
  };
}

export async function getPersistedAdminInviteEmailStatus() {
  const baseStatus = await checkAdminInviteEmailProviderStatus();
  const { emailEvents } = await listPersistedAdminInviteEmailEvents({ limit: 6 });
  const { webhookEvents } = await listPersistedAdminEmailWebhookEvents({ limit: 6 });
  const { statusChecks } = await listPersistedAdminResendWebhookStatusChecks({ limit: 3 });
  const { alerts: webhookMonitoringAlerts } = await listPersistedAdminWebhookMonitoringAlerts({ limit: 30, status: "all" });
  const lastEvent = emailEvents[0] || null;
  const lastWebhookEvent = webhookEvents[0] || null;
  const lastStatusCheck = statusChecks[0] || null;
  const webhookStatus = baseStatus.webhook || getResendWebhookStatus();
  const monitoringState = buildAdminWebhookMonitoringState({
    webhookStatus,
    statusCheck: lastStatusCheck,
    lastWebhookEvent,
  });
  const productionReadiness = {
    resendApiConfigured: Boolean(baseStatus.configured),
    senderDomainStatus: baseStatus.domainStatus || "unchecked",
    webhookSecretConfigured: Boolean(webhookStatus.configured),
    webhookEndpointRegistered: Boolean(lastStatusCheck?.endpointMatched),
    requiredEventsCovered: !lastStatusCheck?.requiredEventsMissing?.length,
    lastVerifiedWebhookEvent: lastWebhookEvent?.verificationStatus === "verified",
    alertState: monitoringState.status || "not_checked",
    deliveryMode: baseStatus.deliveryMode || "manual_fallback",
    ready: Boolean(
      baseStatus.configured &&
      webhookStatus.configured &&
      lastStatusCheck?.endpointMatched &&
      !lastStatusCheck?.requiredEventsMissing?.length &&
      monitoringState.status !== "alert"
    ),
    containsSecrets: false,
  };
  const incidentSummary = summarizeAdminWebhookMonitoringAlertIncidents(webhookMonitoringAlerts);
  return {
    ...baseStatus,
    productionReadiness,
    webhook: {
      ...webhookStatus,
      registration: lastStatusCheck,
      registrationStatus: lastStatusCheck?.status || null,
      registrationCheckedAt: lastStatusCheck?.checkedAt || null,
      endpointUrl: lastStatusCheck?.endpointUrl || webhookStatus.endpointUrl || getAdminResendWebhookEndpointUrl(),
      lastWebhookStatus: lastWebhookEvent?.status || null,
      lastWebhookAt: lastWebhookEvent?.receivedAt || null,
      lastVerificationStatus: lastWebhookEvent?.verificationStatus || null,
      monitoringState,
      incidentSummary,
      monitoringAlerts: webhookMonitoringAlerts,
    },
    lastSendStatus: lastEvent?.status || null,
    lastSendAt: lastEvent?.createdAt || null,
    lastErrorClass: lastEvent?.errorClass || null,
    lastError: lastEvent?.errorMessage || null,
    lastDeliveryProvider: lastEvent?.provider || null,
    deliveryEvents: emailEvents,
    webhookEvents,
    webhookStatusChecks: statusChecks,
    webhookMonitoringAlerts,
    webhookIncidentSummary: incidentSummary,
  };
}

export async function listPersistedAdminResendWebhookStatusChecks({ limit = 6 } = {}) {
  if (!process.env.DATABASE_URL) return { statusChecks: [], persisted: false };

  try {
    const prisma = await getPrisma();
    if (!prisma.adminResendWebhookStatusCheck) return { statusChecks: [], persisted: false };
    const checks = await prisma.adminResendWebhookStatusCheck.findMany({
      include: { actorUser: true },
      orderBy: { checkedAt: "desc" },
      take: Number.isFinite(Number(limit)) ? Number(limit) : 6,
    });
    return { statusChecks: checks.map(mapAdminResendWebhookStatusCheckForClient), persisted: true };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return { statusChecks: [], persisted: false };
  }
}

export async function checkPersistedAdminResendWebhookRegistration({ session, request } = {}) {
  if (!hasSecuritySession(session)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const endpointUrl = `${getRequestOrigin(request)}/api/admin/webhooks/resend`;
  const result = await checkAdminResendWebhookRegistrationStatus({ endpointUrl });
  const prisma = await getPrisma();
  const persisted = await prisma.adminResendWebhookStatusCheck.create({
    data: {
      actorUserId: persistedActorUserId(session),
      provider: "resend",
      status: result.status,
      endpointUrl: result.endpointUrl || endpointUrl,
      endpointMatched: Boolean(result.endpointMatched),
      matchedWebhookId: result.matchedWebhookId || null,
      matchedWebhookStatus: result.matchedWebhookStatus || null,
      matchedWebhookEvents: result.matchedWebhookEvents || [],
      webhookCount: Number.isFinite(Number(result.webhookCount)) ? Number(result.webhookCount) : 0,
      requiredEventsMissing: result.requiredEventsMissing || [],
      errorClass: result.errorClass || null,
      errorMessage: result.errorMessage || null,
      providerEnvironment: result.providerEnvironment || "resend",
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        secretConfigured: Boolean(result.secretConfigured),
        apiKeyConfigured: Boolean(result.apiKeyConfigured),
        requiredEvents: result.requiredEvents || [],
        webhooks: result.webhooks || [],
      },
    },
    include: { actorUser: true },
  });
  const lastWebhookEvent = await prisma.adminEmailWebhookEvent.findFirst({
    orderBy: { receivedAt: "desc" },
  });
  const monitoringState = await persistAdminWebhookMonitoringAlerts({
    prisma,
    session,
    statusCheck: persisted,
    webhookStatus: getResendWebhookStatus(),
    lastWebhookEvent,
    request,
  });
  let notificationResult = null;
  if (monitoringState.createdAlertIds?.length) {
    notificationResult = await notifyPersistedAdminWebhookMonitoringAlerts({
      session,
      alertIds: monitoringState.createdAlertIds,
      reason: "Resend webhook monitoring detected a new configuration alert.",
      request,
    });
  }
  const { alerts: monitoringAlerts } = await listPersistedAdminWebhookMonitoringAlerts({ limit: 30, status: "all" });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "resend_webhook_registration_checked",
    targetType: "admin_email_provider",
    targetId: "resend",
    field: "webhook_registration",
    reason: "Admin checked Resend webhook registration status.",
    status: result.status === "provider_error" ? "failed" : "logged",
    metadata: {
      status: result.status,
      endpointMatched: Boolean(result.endpointMatched),
      webhookCount: result.webhookCount || 0,
      requiredEventsMissing: result.requiredEventsMissing || [],
      monitoringStatus: monitoringState.status,
      monitoringSeverity: monitoringState.severity,
    },
    request,
  });

  return {
    statusCheck: mapAdminResendWebhookStatusCheckForClient(persisted),
    monitoringState,
    monitoringAlerts,
    notificationResult,
    event,
  };
}

function digestSinceForFrequency(frequency, now = new Date()) {
  const normalized = normalizeNotificationFrequency(frequency);
  const current = now instanceof Date ? now : new Date(now);
  if (normalized === "daily") return new Date(current.getTime() - 24 * 60 * 60 * 1000);
  return new Date(current.getTime() - 60 * 60 * 1000);
}

export function buildAdminNotificationDigestBody(summary = {}) {
  const lines = [
    `${String(summary.frequency || "hourly").toUpperCase()} LAJOO Admin digest`,
    `Window start: ${summary.since || "not tracked"}`,
    `Total no-PII items: ${summary.itemCount || 0}`,
    "",
  ];
  for (const item of summary.categories || []) {
    lines.push(`${item.label}: ${item.itemCount || 0}`);
    if (item.detail) lines.push(item.detail);
  }
  lines.push("");
  lines.push("This digest contains counts and operational statuses only. It does not include customer PII, prompts, provider secrets, or raw payloads.");
  return lines.join("\n");
}

export async function compilePersistedAdminNotificationDigest({ userId, frequency = "hourly", categories, now = new Date() } = {}) {
  assertDatabaseConfigured();
  const normalizedFrequency = normalizeNotificationFrequency(frequency);
  if (!["hourly", "daily"].includes(normalizedFrequency)) {
    const error = new Error("Digest frequency must be hourly or daily.");
    error.status = 400;
    throw error;
  }
  const prisma = await getPrisma();
  const targetUser = await prisma.adminUser.findUnique({
    where: { id: String(userId || "") },
    select: { id: true, email: true, name: true, status: true },
  });
  if (!targetUser) {
    const notFound = new Error("Admin user was not found.");
    notFound.status = 404;
    throw notFound;
  }

  await ensureAdminNotificationPreferenceDefaults(prisma, targetUser.id);
  const preferences = await prisma.adminNotificationPreference.findMany({ where: { userId: targetUser.id } });
  const selectedCategories = (Array.isArray(categories) && categories.length
    ? categories.map(normalizeNotificationCategory).filter(Boolean)
    : preferences
        .filter((preference) => preference.frequency === normalizedFrequency && (preference.emailEnabled || preference.manualFallbackEnabled))
        .map((preference) => preference.category))
    .filter((category, index, list) => category && list.indexOf(category) === index);
  const since = digestSinceForFrequency(normalizedFrequency, now);
  const current = now instanceof Date ? now : new Date(now);
  const sections = [];

  if (selectedCategories.includes("invites")) {
    const [deliveryEvents, pendingInvites] = await Promise.all([
      prisma.adminInviteEmailEvent.count({ where: { createdAt: { gte: since, lte: current } } }),
      prisma.adminInviteToken.count({ where: { status: "pending", expiresAt: { gt: current } } }),
    ]);
    sections.push({
      category: "invites",
      label: "Invite delivery",
      itemCount: deliveryEvents + pendingInvites,
      detail: `${deliveryEvents} delivery events and ${pendingInvites} pending setup links.`,
    });
  }

  if (selectedCategories.includes("mfa_recovery")) {
    const [requested, overdue] = await Promise.all([
      prisma.adminMfaRecoveryRequest.count({ where: { status: "requested" } }),
      prisma.adminMfaRecoveryRequest.count({ where: { status: "requested", dueAt: { lt: current } } }),
    ]);
    sections.push({
      category: "mfa_recovery",
      label: "MFA recovery",
      itemCount: requested,
      detail: `${requested} pending requests; ${overdue} overdue by SLA.`,
    });
  }

  if (selectedCategories.includes("audit_assignment")) {
    const [assigned, overdue, criticalUnassigned] = await Promise.all([
      prisma.adminAuditLog.count({ where: { assignedToUserId: targetUser.id, reviewStatus: { not: "reviewed" } } }),
      prisma.adminAuditLog.count({ where: { assignedToUserId: targetUser.id, reviewStatus: { not: "reviewed" }, assignmentDueAt: { lt: current } } }),
      prisma.adminAuditLog.count({ where: { assignedToUserId: null, reviewStatus: { not: "reviewed" }, priority: "critical" } }),
    ]);
    sections.push({
      category: "audit_assignment",
      label: "Audit assignments",
      itemCount: assigned + criticalUnassigned,
      detail: `${assigned} assigned to you; ${overdue} overdue; ${criticalUnassigned} critical unassigned.`,
    });
  }

  if (selectedCategories.includes("export_artifact_access")) {
    const [activeLinks, accessEvents, revokedLinks] = await Promise.all([
      prisma.adminExportArtifactAccess.count({ where: { status: "active", expiresAt: { gt: current } } }),
      prisma.adminExportArtifactAccess.count({ where: { createdAt: { gte: since, lte: current } } }),
      prisma.adminExportArtifactAccess.count({ where: { status: { in: ["revoked", "rotated"] }, revokedAt: { gte: since, lte: current } } }),
    ]);
    sections.push({
      category: "export_artifact_access",
      label: "Export artifact access",
      itemCount: activeLinks + accessEvents + revokedLinks,
      detail: `${activeLinks} active links; ${accessEvents} link events; ${revokedLinks} revoked or rotated in window.`,
    });
  }

  if (selectedCategories.includes("tech_incidents")) {
    const [payments, insurers, openAi, jobs, cron] = await Promise.all([
      prisma.adminPaymentWebhookLog.count({ where: { createdAt: { gte: since, lte: current }, OR: [{ eventStatus: { in: ["failed", "blocked", "error"] } }, { errorClass: { not: null } }] } }),
      prisma.adminInsurerAdapterLog.count({ where: { createdAt: { gte: since, lte: current }, OR: [{ status: { in: ["failed", "blocked", "error"] } }, { errorClass: { not: null } }] } }),
      prisma.adminOpenAiUsageLog.count({ where: { createdAt: { gte: since, lte: current }, OR: [{ status: { in: ["failed", "error"] } }, { errorClass: { not: null } }] } }),
      prisma.adminJobQueueLog.count({ where: { createdAt: { gte: since, lte: current }, OR: [{ status: { in: ["failed", "error"] } }, { errorClass: { not: null } }] } }),
      prisma.adminCronReminderLog.count({ where: { createdAt: { gte: since, lte: current }, OR: [{ status: { in: ["failed", "error"] } }, { errorClass: { not: null } }] } }),
    ]);
    const total = payments + insurers + openAi + jobs + cron;
    sections.push({
      category: "tech_incidents",
      label: "Tech incidents",
      itemCount: total,
      detail: `${payments} payment, ${insurers} insurer, ${openAi} OpenAI, ${jobs} job, ${cron} cron incidents.`,
    });
  }

  return {
    userId: targetUser.id,
    userEmailMasked: maskAdminEmail(targetUser.email),
    frequency: normalizedFrequency,
    since: since.toISOString(),
    generatedAt: current.toISOString(),
    categories: sections,
    itemCount: sections.reduce((total, section) => total + Number(section.itemCount || 0), 0),
  };
}

export async function listPersistedAdminNotificationDigestEvents({ session, userId, limit = 8 } = {}) {
  const targetUserId = String(userId || session?.id || "").trim();
  if (!canManageAdminNotificationPreference({ actorSession: session, targetUserId })) {
    const error = new Error("You can only view your own digests unless you are founder or compliance.");
    error.status = 403;
    throw error;
  }
  if (!process.env.DATABASE_URL) return { digestEvents: [], persisted: false };

  try {
    const prisma = await getPrisma();
    if (!prisma.adminNotificationDigestEvent) return { digestEvents: [], persisted: false };
    const events = await prisma.adminNotificationDigestEvent.findMany({
      where: targetUserId ? { userId: targetUserId } : {},
      include: { user: true, actorUser: true },
      orderBy: { createdAt: "desc" },
      take: Number.isFinite(Number(limit)) ? Number(limit) : 8,
    });
    return { digestEvents: events.map(mapAdminNotificationDigestEventForClient), persisted: true };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return { digestEvents: [], persisted: false };
  }
}

export async function sendPersistedAdminNotificationDigest({ session, userId, frequency = "hourly", reason, request } = {}) {
  const targetUserId = String(userId || session?.id || "").trim();
  if (!canManageAdminNotificationPreference({ actorSession: session, targetUserId })) {
    const error = new Error("You can only send your own digest unless you are founder or compliance.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const normalizedFrequency = normalizeNotificationFrequency(frequency);
  if (!["hourly", "daily"].includes(normalizedFrequency)) {
    const error = new Error("Digest frequency must be hourly or daily.");
    error.status = 400;
    throw error;
  }
  const { reason: actionReason, error } = validateAdminActionReason(reason || `Manual ${normalizedFrequency} notification digest trigger.`);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const prisma = await getPrisma();
  const user = await prisma.adminUser.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, name: true, status: true },
  });
  if (!user) {
    const notFound = new Error("Admin user was not found.");
    notFound.status = 404;
    throw notFound;
  }
  const summary = await compilePersistedAdminNotificationDigest({ userId: user.id, frequency: normalizedFrequency });
  const body = buildAdminNotificationDigestBody(summary);
  const delivery = await sendAdminOperationalEmail({
    email: user.email,
    subject: `LAJOO Admin ${normalizedFrequency} digest`,
    heading: `${normalizedFrequency === "daily" ? "Daily" : "Hourly"} admin digest`,
    body,
    actionUrl: `${getRequestOrigin(request)}/admin/security`,
    actionLabel: "Open Security & Access",
  });
  const normalizedDelivery = normalizeEmailDeliveryEvent(delivery);
  const digestStatus = normalizedDelivery.status === "sent"
    ? "sent"
    : (normalizedDelivery.status === "failed" ? "failed" : "manual_fallback");
  const emailEvent = await recordPersistedAdminEmailDeliveryEvent({
    session,
    email: user.email,
    delivery,
    metadata: {
      emailKind: "notification_digest",
      frequency: normalizedFrequency,
      itemCount: summary.itemCount,
      containsPii: false,
    },
    request,
  });
  const digest = await prisma.adminNotificationDigestEvent.create({
    data: {
      userId: user.id,
      actorUserId: persistedActorUserId(session),
      frequency: normalizedFrequency,
      status: digestStatus,
      deliveryProvider: normalizedDelivery.provider,
      deliveryStatus: normalizedDelivery.status,
      deliveryMessageId: normalizedDelivery.messageId,
      deliveryErrorClass: normalizedDelivery.errorClass,
      deliveryError: normalizedDelivery.errorMessage,
      manualFallback: normalizedDelivery.status !== "sent",
      categorySummary: summary,
      itemCount: summary.itemCount,
      reason: actionReason,
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
      sentAt: normalizedDelivery.status === "sent" ? new Date() : null,
    },
    include: { user: true, actorUser: true },
  });
  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "admin_notification_digest_sent",
    targetType: "admin_user",
    targetId: user.id,
    field: "notification_digest",
    reason: actionReason,
    status: normalizedDelivery.status === "failed" ? "failed" : "logged",
    metadata: {
      frequency: normalizedFrequency,
      itemCount: summary.itemCount,
      deliveryStatus: normalizedDelivery.status,
      deliveryProvider: normalizedDelivery.provider,
      containsPii: false,
    },
    request,
  });

  return {
    digestEvent: mapAdminNotificationDigestEventForClient(digest),
    emailEvent,
    event,
  };
}

export function getAdminNotificationDigestSchedulerReadiness({
  env = process.env,
  liveSchedulerConfigured = false,
} = {}) {
  const cronSecretConfigured = Boolean(String(env.CRON_SECRET || "").trim());
  const digestCronEnabled = isTruthyEnvFlag(env.LAJOO_ADMIN_CRON_ENABLED) && isTruthyEnvFlag(env.LAJOO_ADMIN_DIGEST_CRON_ENABLED);
  const liveScheduled = Boolean(liveSchedulerConfigured && digestCronEnabled && cronSecretConfigured);
  return {
    status: liveScheduled ? "scheduled" : "manual_only",
    liveScheduled,
    wrapperReady: true,
    manualTriggerAvailable: true,
    cronSecretConfigured,
    digestCronEnabled,
    supportedFrequencies: ["hourly", "daily"],
    envKeys: {
      cronSecret: "CRON_SECRET",
      globalCronEnabled: "LAJOO_ADMIN_CRON_ENABLED",
      digestCronEnabled: "LAJOO_ADMIN_DIGEST_CRON_ENABLED",
    },
    note: liveScheduled
      ? "Digest scheduler is configured and should only send no-PII admin summaries."
      : "No live digest cron is configured in this deployment; admins can run wrapper-ready hourly or daily digest jobs manually.",
  };
}

export async function listPersistedAdminNotificationDigestJobAttempts({ session, limit = 8 } = {}) {
  if (!hasSecuritySession(session)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  if (!process.env.DATABASE_URL) {
    return {
      digestJobAttempts: [],
      persisted: false,
      schedulerReadiness: getAdminNotificationDigestSchedulerReadiness(),
    };
  }

  try {
    const prisma = await getPrisma();
    if (!prisma.adminNotificationDigestJobAttempt) {
      return {
        digestJobAttempts: [],
        persisted: false,
        schedulerReadiness: getAdminNotificationDigestSchedulerReadiness(),
      };
    }
    const attempts = await prisma.adminNotificationDigestJobAttempt.findMany({
      include: { actorUser: true },
      orderBy: { startedAt: "desc" },
      take: Number.isFinite(Number(limit)) ? Number(limit) : 8,
    });
    return {
      digestJobAttempts: attempts.map(mapAdminNotificationDigestJobAttemptForClient),
      persisted: true,
      schedulerReadiness: getAdminNotificationDigestSchedulerReadiness(),
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return {
      digestJobAttempts: [],
      persisted: false,
      schedulerReadiness: getAdminNotificationDigestSchedulerReadiness(),
    };
  }
}

function aggregateDigestJobDeliveryStatus(results = []) {
  const providers = new Set(results.map((result) => result?.deliveryProvider).filter(Boolean));
  const statuses = new Set(results.map((result) => result?.deliveryStatus).filter(Boolean));
  return {
    deliveryProvider: providers.size > 1 ? "mixed" : Array.from(providers)[0] || "manual",
    deliveryStatus: statuses.size > 1 ? "mixed" : Array.from(statuses)[0] || "not_sent",
  };
}

function classifyDigestJobStatus({ attemptedCount = 0, sentCount = 0, manualFallbackCount = 0, failedCount = 0 } = {}) {
  if (!attemptedCount) return "skipped";
  if (failedCount && sentCount + manualFallbackCount > 0) return "partial";
  if (failedCount) return "failed";
  if (manualFallbackCount && !sentCount) return "manual_fallback";
  return "completed";
}

export async function runPersistedAdminNotificationDigestJob({
  session,
  frequency = "hourly",
  reason,
  request,
  triggerSource = "manual_admin",
  liveCron = false,
  limit = 50,
} = {}) {
  if (!canRunAdminNotificationDigestJob(session)) {
    const error = new Error("Founder or compliance role required to run multi-user notification digest jobs.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const normalizedFrequency = normalizeNotificationFrequency(frequency);
  if (!["hourly", "daily"].includes(normalizedFrequency)) {
    const error = new Error("Digest job frequency must be hourly or daily.");
    error.status = 400;
    throw error;
  }
  const { reason: actionReason, error } = validateAdminActionReason(reason || `Manual ${normalizedFrequency} admin digest job trigger.`);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const prisma = await getPrisma();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const attempt = await prisma.adminNotificationDigestJobAttempt.create({
    data: {
      actorUserId: persistedActorUserId(session),
      frequency: normalizedFrequency,
      triggerSource: String(triggerSource || "manual_admin").slice(0, 80),
      status: "running",
      reason: actionReason,
      liveCron: Boolean(liveCron),
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        containsPii: false,
        includesRawPrompts: false,
        includesSecrets: false,
      },
    },
  });

  const activeUsers = await prisma.adminUser.findMany({
    where: { status: "active" },
    include: { notificationPreferences: true },
    orderBy: { createdAt: "asc" },
    take: safeLimit,
  });

  const eligibleUsers = [];
  for (const user of activeUsers) {
    if (!user.notificationPreferences?.length) {
      await ensureAdminNotificationPreferenceDefaults(prisma, user.id);
      user.notificationPreferences = await prisma.adminNotificationPreference.findMany({ where: { userId: user.id } });
    }
    const hasEligiblePreference = user.notificationPreferences.some((preference) => (
      preference.frequency === normalizedFrequency && (preference.emailEnabled || preference.manualFallbackEnabled)
    ));
    if (hasEligiblePreference) eligibleUsers.push(user);
  }

  const deliveryResults = [];
  const failures = [];
  let itemCount = 0;
  for (const user of eligibleUsers) {
    try {
      const result = await sendPersistedAdminNotificationDigest({
        session,
        userId: user.id,
        frequency: normalizedFrequency,
        reason: actionReason,
        request,
      });
      const digestEvent = result?.digestEvent || {};
      itemCount += Number(digestEvent.itemCount || 0);
      deliveryResults.push({
        deliveryProvider: digestEvent.deliveryProvider || "manual",
        deliveryStatus: digestEvent.deliveryStatus || (digestEvent.manualFallback ? "manual_required" : digestEvent.status),
        status: digestEvent.status,
        manualFallback: Boolean(digestEvent.manualFallback),
      });
    } catch (digestError) {
      failures.push({
        userId: user.id,
        errorClass: classifyAdminEmailDeliveryError(digestError?.message || digestError?.code || "digest_error"),
        message: String(digestError?.message || "Digest delivery failed.").slice(0, 180),
      });
    }
  }

  const sentCount = deliveryResults.filter((result) => result.status === "sent" || result.deliveryStatus === "sent").length;
  const manualFallbackCount = deliveryResults.filter((result) => result.manualFallback || result.status === "manual_fallback").length;
  const failedCount = failures.length + deliveryResults.filter((result) => result.status === "failed" || result.deliveryStatus === "failed").length;
  const attemptedCount = deliveryResults.length + failures.length;
  const skippedCount = Math.max(0, activeUsers.length - eligibleUsers.length);
  const delivery = aggregateDigestJobDeliveryStatus(deliveryResults);
  const status = classifyDigestJobStatus({ attemptedCount, sentCount, manualFallbackCount, failedCount });
  const updated = await prisma.adminNotificationDigestJobAttempt.update({
    where: { id: attempt.id },
    data: {
      status,
      targetUserCount: eligibleUsers.length,
      attemptedCount,
      sentCount,
      manualFallbackCount,
      failedCount,
      skippedCount,
      itemCount,
      deliveryProvider: delivery.deliveryProvider,
      deliveryStatus: delivery.deliveryStatus,
      errorClass: failures[0]?.errorClass || null,
      errorMessage: failures[0]?.message || null,
      finishedAt: new Date(),
      metadata: {
        containsPii: false,
        includesRawPrompts: false,
        includesSecrets: false,
        activeUsersConsidered: activeUsers.length,
        failureClasses: failures.map((failure) => failure.errorClass).filter(Boolean).slice(0, 10),
      },
    },
    include: { actorUser: true },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "admin_notification_digest_job_run",
    targetType: "admin_notifications",
    targetId: "notification_digest_job",
    field: normalizedFrequency,
    reason: actionReason,
    status: failedCount ? (attemptedCount > failedCount ? "logged" : "failed") : "logged",
    metadata: {
      frequency: normalizedFrequency,
      triggerSource,
      liveCron: Boolean(liveCron),
      targetUserCount: eligibleUsers.length,
      attemptedCount,
      sentCount,
      manualFallbackCount,
      failedCount,
      skippedCount,
      itemCount,
      containsPii: false,
    },
    request,
  });

  return {
    digestJobAttempt: mapAdminNotificationDigestJobAttemptForClient(updated),
    schedulerReadiness: getAdminNotificationDigestSchedulerReadiness(),
    event,
  };
}

async function createPersistedAdminScheduledJobAttempt({
  session,
  jobName,
  jobKind,
  triggerSource = "cron",
  reason,
  request,
  liveCron = true,
  metadata = {},
} = {}) {
  assertDatabaseConfigured();
  const prisma = await getPrisma();
  return prisma.adminScheduledJobAttempt.create({
    data: {
      actorUserId: persistedActorUserId(session),
      jobName: String(jobName || "admin-scheduled-job").slice(0, 100),
      jobKind: String(jobKind || "admin").slice(0, 80),
      triggerSource: String(triggerSource || "cron").slice(0, 80),
      status: "running",
      reason: String(reason || "Scheduled admin job run.").slice(0, 500),
      liveCron: Boolean(liveCron),
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        containsPii: false,
        includesRawPrompts: false,
        includesSecrets: false,
        ...metadata,
      },
    },
  });
}

async function finishPersistedAdminScheduledJobAttempt(attemptId, data = {}) {
  const prisma = await getPrisma();
  const updated = await prisma.adminScheduledJobAttempt.update({
    where: { id: attemptId },
    data: {
      status: data.status || "completed",
      matchedCount: Number.isFinite(Number(data.matchedCount)) ? Number(data.matchedCount) : 0,
      processedCount: Number.isFinite(Number(data.processedCount)) ? Number(data.processedCount) : 0,
      successCount: Number.isFinite(Number(data.successCount)) ? Number(data.successCount) : 0,
      failedCount: Number.isFinite(Number(data.failedCount)) ? Number(data.failedCount) : 0,
      skippedCount: Number.isFinite(Number(data.skippedCount)) ? Number(data.skippedCount) : 0,
      itemCount: Number.isFinite(Number(data.itemCount)) ? Number(data.itemCount) : 0,
      errorClass: data.errorClass || null,
      errorMessage: data.errorMessage || null,
      finishedAt: new Date(),
      metadata: {
        containsPii: false,
        includesRawPrompts: false,
        includesSecrets: false,
        ...(data.metadata || {}),
      },
    },
    include: { actorUser: true },
  });
  try {
    await persistAdminCronExecutionAlertForAttempt({
      prisma,
      session: data.session,
      attempt: updated,
      request: data.request,
    });
  } catch {
    // Cron alert persistence is best-effort and must not change the underlying job result.
  }
  return mapAdminScheduledJobAttemptForClient(updated);
}

function scheduledJobDisabledResult(jobName, readinessJob, scheduledJobAttempt) {
  return {
    scheduledJobAttempt: scheduledJobAttempt || null,
    status: "disabled",
    jobName,
    readinessJob,
  };
}

function cronExecutionAlertInclude() {
  return {
    actorUser: true,
    assignedTo: true,
    resolvedBy: true,
    scheduledJobAttempt: { include: { actorUser: true } },
    workflowEvents: {
      orderBy: { createdAt: "desc" },
      take: 8,
    },
    notifications: {
      orderBy: { createdAt: "desc" },
      take: 5,
    },
  };
}

async function countRecentFailedScheduledJobAttempts(prisma, jobKind, now = new Date()) {
  const since = new Date((now instanceof Date ? now : new Date(now)).getTime() - 7 * 24 * 60 * 60 * 1000);
  return prisma.adminScheduledJobAttempt.count({
    where: {
      jobKind,
      status: "failed",
      startedAt: { gte: since },
    },
  });
}

async function resolveRecoveredAdminCronExecutionAlerts({ prisma, attempt, request } = {}) {
  if (!prisma?.adminCronExecutionAlert) return [];
  const activeAlerts = await prisma.adminCronExecutionAlert.findMany({
    where: {
      jobKind: attempt.jobKind,
      status: { in: CRON_ALERT_ACTIVE_STATUSES },
    },
  });
  const resolved = [];
  for (const alert of activeAlerts) {
    const updated = await prisma.adminCronExecutionAlert.update({
      where: { id: alert.id },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        resolvedByUserId: null,
        scheduledJobAttemptId: attempt.id,
        lastAttemptStatus: attempt.status,
        lastAttemptAt: attempt.finishedAt || attempt.startedAt || new Date(),
        lastSuccessAt: attempt.finishedAt || attempt.startedAt || new Date(),
        note: "Auto-resolved after a successful scheduled job run.",
        metadata: {
          ...(alert.metadata || {}),
          containsPii: false,
          includesRawPrompts: false,
          includesSecrets: false,
          autoResolvedByAttemptId: attempt.id,
        },
        workflowEvents: {
          create: {
            action: "auto_resolved_after_success",
            previousStatus: alert.status,
            status: "resolved",
            previousPriority: alert.priority,
            priority: alert.priority,
            assignedToUserId: alert.assignedToUserId,
            reason: "Scheduled job recovered after a successful run.",
            note: "Auto-resolved by cron execution monitor.",
            ipAddress: getRequestIpAddress(request),
            userAgent: getRequestUserAgent(request),
            metadata: {
              scheduledJobAttemptId: attempt.id,
              containsPii: false,
              includesRawPrompts: false,
              includesSecrets: false,
            },
          },
        },
      },
      include: cronExecutionAlertInclude(),
    });
    resolved.push(mapAdminCronExecutionAlertForClient(updated));
  }
  return resolved;
}

async function persistAdminCronExecutionAlertForAttempt({ prisma, session, attempt, request } = {}) {
  if (!prisma?.adminCronExecutionAlert || !attempt?.id) return null;
  const now = new Date();
  if (attempt.status === "completed" && Number(attempt.failedCount || 0) === 0 && Number(attempt.skippedCount || 0) === 0) {
    await resolveRecoveredAdminCronExecutionAlerts({ prisma, attempt, request });
    return null;
  }
  const repeatedFailureCount = attempt.status === "failed"
    ? await countRecentFailedScheduledJobAttempts(prisma, attempt.jobKind, now)
    : 0;
  const classification = classifyAdminScheduledJobExecutionAlert(attempt, { repeatedFailureCount });
  if (!classification.shouldAlert) return null;
  const existing = await prisma.adminCronExecutionAlert.findFirst({
    where: {
      jobKind: attempt.jobKind,
      alertType: classification.alertType,
      status: { in: CRON_ALERT_ACTIVE_STATUSES },
    },
    orderBy: { detectedAt: "desc" },
  });
  const baseData = {
    actorUserId: persistedActorUserId(session),
    scheduledJobAttemptId: attempt.id,
    jobName: attempt.jobName,
    jobKind: attempt.jobKind,
    alertType: classification.alertType,
    priority: classification.priority,
    severity: classification.severity,
    message: classification.message,
    lastAttemptStatus: attempt.status,
    lastAttemptAt: attempt.finishedAt || attempt.startedAt || now,
    failureCount: attempt.status === "failed" ? Math.max(repeatedFailureCount, 1) : Number(attempt.failedCount || 0),
    skippedCount: attempt.status === "skipped" ? Math.max(Number(attempt.skippedCount || 0), 1) : Number(attempt.skippedCount || 0),
    ipAddress: getRequestIpAddress(request),
    userAgent: getRequestUserAgent(request),
    metadata: {
      containsPii: false,
      includesRawPrompts: false,
      includesSecrets: false,
      scheduledJobAttemptId: attempt.id,
      triggerSource: attempt.triggerSource,
      liveCron: Boolean(attempt.liveCron),
      errorClass: attempt.errorClass || null,
      disabledReason: attempt.metadata?.disabledReason || null,
    },
  };
  const eventData = {
    actorUserId: persistedActorUserId(session),
    action: existing ? "refreshed_from_attempt" : "created_from_attempt",
    previousStatus: existing?.status || null,
    status: existing?.status || "open",
    previousPriority: existing?.priority || null,
    priority: classification.priority,
    assignedToUserId: existing?.assignedToUserId || null,
    reason: classification.message,
    note: attempt.errorMessage || null,
    ipAddress: getRequestIpAddress(request),
    userAgent: getRequestUserAgent(request),
    metadata: {
      scheduledJobAttemptId: attempt.id,
      containsPii: false,
      includesRawPrompts: false,
      includesSecrets: false,
    },
  };
  const saved = existing
    ? await prisma.adminCronExecutionAlert.update({
        where: { id: existing.id },
        data: {
          ...baseData,
          status: existing.status,
          acknowledgedAt: existing.acknowledgedAt,
          resolvedAt: null,
          workflowEvents: { create: eventData },
        },
        include: cronExecutionAlertInclude(),
      })
    : await prisma.adminCronExecutionAlert.create({
        data: {
          ...baseData,
          status: "open",
          detectedAt: now,
          workflowEvents: { create: eventData },
        },
        include: cronExecutionAlertInclude(),
      });
  if (!existing) {
    try {
      await notifyPersistedAdminCronExecutionAlerts({
        session: session || buildAdminCronServiceSession("engineer"),
        alertIds: [saved.id],
        reason: "Cron execution monitor created a new admin scheduled job alert.",
        request,
        limit: 8,
      });
    } catch {
      // Alert notification failures are recorded by email helpers when possible and must not fail the job.
    }
  }
  return mapAdminCronExecutionAlertForClient(saved);
}

async function persistAdminStaleCronExecutionAlerts({ prisma, session, request } = {}) {
  if (!prisma?.adminCronExecutionAlert) return [];
  const readiness = getAdminScheduledWorkflowReadiness();
  const now = new Date();
  const jobDefinitions = [
    { jobKind: "notification_digest", jobName: "admin-notification-digests", enabled: readiness.jobs.notificationDigests.enabled },
    { jobKind: "mfa_recovery_sla", jobName: "admin-mfa-recovery-sla", enabled: readiness.jobs.mfaRecoverySla.enabled },
    { jobKind: "webhook_monitoring", jobName: "admin-resend-webhook-monitoring", enabled: readiness.jobs.webhookMonitoring.enabled },
  ];
  const alerts = [];
  for (const job of jobDefinitions) {
    if (!job.enabled) continue;
    const lastSuccess = await prisma.adminScheduledJobAttempt.findFirst({
      where: { jobKind: job.jobKind, status: "completed" },
      orderBy: { finishedAt: "desc" },
    });
    const classification = classifyAdminScheduledJobStaleAlert({
      jobKind: job.jobKind,
      jobName: job.jobName,
      lastSuccessAt: lastSuccess?.finishedAt || lastSuccess?.startedAt || null,
      staleThresholdMinutes: CRON_ALERT_STALE_THRESHOLD_MINUTES,
      now,
    });
    const active = await prisma.adminCronExecutionAlert.findFirst({
      where: {
        jobKind: job.jobKind,
        alertType: "last_success_stale",
        status: { in: CRON_ALERT_ACTIVE_STATUSES },
      },
    });
    if (!classification.shouldAlert) {
      if (active) {
        const resolved = await prisma.adminCronExecutionAlert.update({
          where: { id: active.id },
          data: {
            status: "resolved",
            resolvedAt: now,
            lastSuccessAt: lastSuccess?.finishedAt || lastSuccess?.startedAt || now,
            note: "Auto-resolved because a recent successful run exists.",
            workflowEvents: {
              create: {
                actorUserId: persistedActorUserId(session),
                action: "auto_resolved_after_recent_success",
                previousStatus: active.status,
                status: "resolved",
                previousPriority: active.priority,
                priority: active.priority,
                assignedToUserId: active.assignedToUserId,
                reason: "Scheduled job has a recent successful run.",
                ipAddress: getRequestIpAddress(request),
                userAgent: getRequestUserAgent(request),
                metadata: { containsPii: false, includesRawPrompts: false, includesSecrets: false },
              },
            },
          },
          include: cronExecutionAlertInclude(),
        });
        alerts.push(mapAdminCronExecutionAlertForClient(resolved));
      }
      continue;
    }
    const baseData = {
      actorUserId: persistedActorUserId(session),
      scheduledJobAttemptId: lastSuccess?.id || null,
      jobName: job.jobName,
      jobKind: job.jobKind,
      alertType: classification.alertType,
      priority: classification.priority,
      severity: classification.severity,
      message: classification.message,
      lastAttemptStatus: lastSuccess?.status || null,
      lastAttemptAt: lastSuccess?.finishedAt || lastSuccess?.startedAt || null,
      lastSuccessAt: lastSuccess?.finishedAt || lastSuccess?.startedAt || null,
      staleThresholdMinutes: classification.staleThresholdMinutes,
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        containsPii: false,
        includesRawPrompts: false,
        includesSecrets: false,
        staleAgeMinutes: classification.ageMinutes || null,
      },
    };
    const saved = active
      ? await prisma.adminCronExecutionAlert.update({
          where: { id: active.id },
          data: {
            ...baseData,
            status: active.status,
            workflowEvents: {
              create: {
                actorUserId: persistedActorUserId(session),
                action: "refreshed_stale_success",
                previousStatus: active.status,
                status: active.status,
                previousPriority: active.priority,
                priority: classification.priority,
                assignedToUserId: active.assignedToUserId,
                reason: classification.message,
                ipAddress: getRequestIpAddress(request),
                userAgent: getRequestUserAgent(request),
                metadata: { containsPii: false, includesRawPrompts: false, includesSecrets: false },
              },
            },
          },
          include: cronExecutionAlertInclude(),
        })
      : await prisma.adminCronExecutionAlert.create({
          data: {
            ...baseData,
            status: "open",
            detectedAt: now,
            workflowEvents: {
              create: {
                actorUserId: persistedActorUserId(session),
                action: "created_stale_success",
                status: "open",
                priority: classification.priority,
                reason: classification.message,
                ipAddress: getRequestIpAddress(request),
                userAgent: getRequestUserAgent(request),
                metadata: { containsPii: false, includesRawPrompts: false, includesSecrets: false },
              },
            },
          },
          include: cronExecutionAlertInclude(),
        });
    alerts.push(mapAdminCronExecutionAlertForClient(saved));
  }
  return alerts;
}

export async function listPersistedAdminScheduledJobAttempts({ session, limit = 12, jobKind } = {}) {
  if (!hasSecuritySession(session)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  if (!process.env.DATABASE_URL) {
    return {
      scheduledJobAttempts: [],
      retryDrilldowns: [],
      persisted: false,
      schedulerReadiness: getAdminScheduledWorkflowReadiness(),
    };
  }

  try {
    const prisma = await getPrisma();
    if (!prisma.adminScheduledJobAttempt) {
      return {
        scheduledJobAttempts: [],
        retryDrilldowns: [],
        persisted: false,
        schedulerReadiness: getAdminScheduledWorkflowReadiness(),
      };
    }
    const where = {};
    const normalizedKind = String(jobKind || "").trim();
    if (normalizedKind && normalizedKind !== "all") where.jobKind = normalizedKind;
    const attempts = await prisma.adminScheduledJobAttempt.findMany({
      where,
      include: { actorUser: true },
      orderBy: { startedAt: "desc" },
      take: Number.isFinite(Number(limit)) ? Number(limit) : 12,
    });
    const scheduledJobAttempts = attempts.map(mapAdminScheduledJobAttemptForClient);
    return {
      scheduledJobAttempts,
      retryDrilldowns: buildAdminScheduledJobRetryDrilldowns(scheduledJobAttempts),
      persisted: true,
      schedulerReadiness: getAdminScheduledWorkflowReadiness(),
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return {
      scheduledJobAttempts: [],
      retryDrilldowns: [],
      persisted: false,
      schedulerReadiness: getAdminScheduledWorkflowReadiness(),
    };
  }
}

export async function listPersistedAdminCronExecutionAlerts({
  session,
  limit = 20,
  status = "all",
  priority = "all",
  assignedToUserId = "all",
  jobKind = "all",
  refreshStale = true,
  request,
} = {}) {
  if (!hasSecuritySession(session)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  if (!process.env.DATABASE_URL) {
    return {
      cronExecutionAlerts: [],
      cronExecutionAlertSummary: summarizeAdminCronExecutionAlertIncidents([], session),
      persisted: false,
    };
  }
  try {
    const prisma = await getPrisma();
    if (!prisma.adminCronExecutionAlert) {
      return {
        cronExecutionAlerts: [],
        cronExecutionAlertSummary: summarizeAdminCronExecutionAlertIncidents([], session),
        persisted: false,
      };
    }
    if (refreshStale) {
      await persistAdminStaleCronExecutionAlerts({ prisma, session, request });
    }
    const where = {};
    const normalizedStatus = normalizeCronExecutionAlertStatus(status);
    if (status && status !== "all") where.status = normalizedStatus;
    const normalizedPriority = normalizeCronExecutionAlertPriority(priority);
    if (priority && priority !== "all") where.priority = normalizedPriority;
    const normalizedAssigned = String(assignedToUserId || "all").trim();
    if (normalizedAssigned && normalizedAssigned !== "all") {
      where.assignedToUserId = normalizedAssigned === "unassigned" ? null : normalizedAssigned;
    }
    const normalizedKind = String(jobKind || "all").trim();
    if (normalizedKind && normalizedKind !== "all") where.jobKind = normalizedKind;
    const alerts = await prisma.adminCronExecutionAlert.findMany({
      where,
      include: cronExecutionAlertInclude(),
      orderBy: [{ status: "asc" }, { priority: "desc" }, { detectedAt: "desc" }],
      take: Math.min(Math.max(Number(limit) || 20, 1), 50),
    });
    const mapped = alerts.map(mapAdminCronExecutionAlertForClient);
    return {
      cronExecutionAlerts: mapped,
      cronExecutionAlertSummary: summarizeAdminCronExecutionAlertIncidents(mapped, session),
      persisted: true,
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return {
      cronExecutionAlerts: [],
      cronExecutionAlertSummary: summarizeAdminCronExecutionAlertIncidents([], session),
      persisted: false,
    };
  }
}

export async function notifyPersistedAdminCronExecutionAlerts({
  session,
  alertIds = [],
  reason = "Cron execution monitoring detected an admin scheduled job alert.",
  request,
  limit = 12,
} = {}) {
  if (!canManageAdminCronExecutionAlert(session)) {
    const error = new Error("Founder, compliance, or engineer role required.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }
  const prisma = await getPrisma();
  if (!prisma.adminCronExecutionAlert) {
    return { sentCount: 0, manualFallbackCount: 0, failedCount: 0, notificationEvents: [] };
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 30);
  const ids = (Array.isArray(alertIds) ? alertIds : [alertIds]).map((id) => String(id || "").trim()).filter(Boolean);
  const alerts = await prisma.adminCronExecutionAlert.findMany({
    where: ids.length ? { id: { in: ids } } : { status: { in: CRON_ALERT_ACTIVE_STATUSES } },
    orderBy: [{ priority: "desc" }, { detectedAt: "desc" }],
    take: safeLimit,
  });
  if (!alerts.length) {
    return { sentCount: 0, manualFallbackCount: 0, failedCount: 0, notificationEvents: [] };
  }
  const recipients = await prisma.adminUser.findMany({
    where: {
      status: "active",
      roleAssignments: {
        some: {
          role: { in: ["founder", "compliance", "engineer"] },
          revokedAt: null,
        },
      },
    },
    include: {
      roleAssignments: true,
      notificationPreferences: true,
    },
    take: 20,
  });
  const origin = getRequestOrigin(request);
  const notificationEvents = [];
  for (const user of recipients) {
    if (!user.notificationPreferences?.length) {
      await ensureAdminNotificationPreferenceDefaults(prisma, user.id);
      user.notificationPreferences = await prisma.adminNotificationPreference.findMany({ where: { userId: user.id } });
    }
    const preference = user.notificationPreferences.find((item) => item.category === "tech_incidents");
    if (!preference || (!preference.emailEnabled && !preference.manualFallbackEnabled)) continue;
    const role = primaryRole(activeRolesFromAssignments(user.roleAssignments));
    for (const alert of alerts) {
      const delivery = await sendAdminOperationalEmail({
        email: user.email,
        subject: "LAJOO Admin cron execution alert",
        heading: "Scheduled admin job alert",
        body: [
          `Job: ${alert.jobName}.`,
          `Alert: ${alert.alertType}.`,
          `Priority: ${normalizeCronExecutionAlertPriority(alert.priority)}.`,
          `Status: ${normalizeCronExecutionAlertStatus(alert.status)}.`,
          alert.message,
          "No customer PII, prompts, provider payloads, auth headers, signatures, or secrets are included.",
        ].join("\n\n"),
        actionUrl: `${origin}/admin/security`,
        actionLabel: "Open Security & Access",
      });
      const normalizedDelivery = normalizeEmailDeliveryEvent(delivery);
      await recordPersistedAdminEmailDeliveryEvent({
        session,
        email: user.email,
        delivery,
        metadata: {
          emailKind: "cron_execution_alert",
          alertId: alert.id,
          alertType: alert.alertType,
          jobKind: alert.jobKind,
          containsPii: false,
        },
        request,
      });
      const event = await prisma.adminCronExecutionAlertNotification.create({
        data: {
          alertId: alert.id,
          recipientUserId: user.id,
          recipientRole: role,
          status: normalizedDelivery.status === "sent" ? "sent" : (normalizedDelivery.status === "failed" ? "failed" : "manual_fallback"),
          deliveryProvider: normalizedDelivery.provider,
          deliveryStatus: normalizedDelivery.status,
          deliveryMessageId: normalizedDelivery.messageId,
          errorClass: normalizedDelivery.errorClass,
          errorMessage: normalizedDelivery.errorMessage,
          manualFallback: normalizedDelivery.status !== "sent",
          reason: actionReason,
          ipAddress: getRequestIpAddress(request),
          userAgent: getRequestUserAgent(request),
          metadata: {
            providerEnvironment: normalizedDelivery.providerEnvironment,
            containsPii: false,
            includesRawPrompts: false,
            includesSecrets: false,
          },
        },
      });
      notificationEvents.push(event);
    }
  }
  return {
    sentCount: notificationEvents.filter((event) => event.status === "sent").length,
    manualFallbackCount: notificationEvents.filter((event) => event.manualFallback).length,
    failedCount: notificationEvents.filter((event) => event.status === "failed").length,
    notificationEvents,
  };
}

export async function updatePersistedAdminCronExecutionAlert({
  session,
  alertId,
  operation,
  reason,
  assignedToUserId,
  priority,
  note,
  snoozedUntil,
  request,
} = {}) {
  if (!canManageAdminCronExecutionAlert(session)) {
    const error = new Error("Founder, compliance, or engineer role required.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }
  const prisma = await getPrisma();
  const alert = await prisma.adminCronExecutionAlert.findUnique({ where: { id: String(alertId || "") } });
  if (!alert) {
    const notFound = new Error("Cron execution alert was not found.");
    notFound.status = 404;
    throw notFound;
  }
  const op = String(operation || "").trim();
  const data = {};
  const eventData = {
    actorUserId: persistedActorUserId(session),
    action: op,
    previousStatus: alert.status,
    status: alert.status,
    previousPriority: alert.priority,
    priority: alert.priority,
    assignedToUserId: alert.assignedToUserId,
    reason: actionReason,
    note: note ? String(note).trim().slice(0, 500) : null,
    ipAddress: getRequestIpAddress(request),
    userAgent: getRequestUserAgent(request),
    metadata: {
      containsPii: false,
      includesRawPrompts: false,
      includesSecrets: false,
    },
  };
  if (op === "acknowledge") {
    data.status = "acknowledged";
    data.acknowledgedAt = new Date();
    eventData.status = "acknowledged";
  } else if (op === "assign") {
    const targetId = String(assignedToUserId || "").trim();
    if (!targetId || targetId === "unassigned") {
      const badRequest = new Error("Assigned admin user is required.");
      badRequest.status = 400;
      throw badRequest;
    }
    data.assignedToUserId = targetId;
    eventData.assignedToUserId = targetId;
    eventData.status = alert.status;
  } else if (op === "set_priority") {
    data.priority = normalizeCronExecutionAlertPriority(priority);
    eventData.priority = data.priority;
  } else if (op === "snooze") {
    const parsed = parseOptionalDateTime(snoozedUntil);
    if (!parsed) {
      const badRequest = new Error("A valid snooze-until date is required.");
      badRequest.status = 400;
      throw badRequest;
    }
    data.status = "snoozed";
    data.snoozedUntil = parsed;
    eventData.status = "snoozed";
    eventData.snoozedUntil = parsed;
  } else if (op === "resolve") {
    data.status = "resolved";
    data.resolvedAt = new Date();
    data.resolvedByUserId = persistedActorUserId(session) || null;
    eventData.status = "resolved";
  } else if (op === "reopen") {
    data.status = "open";
    data.resolvedAt = null;
    data.resolvedByUserId = null;
    data.snoozedUntil = null;
    eventData.status = "open";
  } else if (op === "note") {
    // Note-only update.
  } else {
    const badRequest = new Error("Unsupported cron alert operation.");
    badRequest.status = 400;
    throw badRequest;
  }
  if (note) data.note = String(note).trim().slice(0, 500);
  const updated = await prisma.adminCronExecutionAlert.update({
    where: { id: alert.id },
    data: {
      ...data,
      workflowEvents: { create: eventData },
    },
    include: cronExecutionAlertInclude(),
  });
  await recordPersistedAdminAuditEvent({
    session,
    action: `admin_cron_execution_alert_${op}`,
    targetType: "admin_cron_execution_alert",
    targetId: alert.id,
    field: alert.jobKind,
    reason: actionReason,
    status: "logged",
    metadata: {
      alertType: alert.alertType,
      previousStatus: alert.status,
      newStatus: data.status || alert.status,
      containsPii: false,
      includesRawPrompts: false,
      includesSecrets: false,
    },
    request,
  });
  return {
    alert: mapAdminCronExecutionAlertForClient(updated),
    cronExecutionAlertSummary: summarizeAdminCronExecutionAlertIncidents([mapAdminCronExecutionAlertForClient(updated)], session),
  };
}

export async function runPersistedAdminNotificationDigestCronJob({
  frequency = "hourly",
  request,
  limit = 50,
  session,
  triggerSource = "cron",
  liveCron = true,
  requireEnabled = true,
  reason,
  metadata = {},
} = {}) {
  assertDatabaseConfigured();
  const readiness = getAdminScheduledWorkflowReadiness();
  const normalizedFrequency = normalizeNotificationFrequency(frequency);
  const actorSession = session || buildAdminCronServiceSession("founder");
  const actionReason = reason || `Scheduled ${normalizedFrequency} no-PII admin notification digest job.`;
  const attempt = await createPersistedAdminScheduledJobAttempt({
    session: actorSession,
    jobName: "admin-notification-digests",
    jobKind: "notification_digest",
    triggerSource,
    reason: actionReason,
    request,
    liveCron,
    metadata: { frequency: normalizedFrequency, ...metadata },
  });

  if (requireEnabled && !readiness.jobs.notificationDigests.enabled) {
    const scheduledJobAttempt = await finishPersistedAdminScheduledJobAttempt(attempt.id, {
      session: actorSession,
      request,
      status: "skipped",
      skippedCount: 1,
      metadata: { disabledReason: "LAJOO_ADMIN_CRON_ENABLED and LAJOO_ADMIN_DIGEST_CRON_ENABLED must be true." },
    });
    return { ...scheduledJobDisabledResult("admin-notification-digests", readiness.jobs.notificationDigests, scheduledJobAttempt), schedulerReadiness: readiness };
  }

  try {
    const result = await runPersistedAdminNotificationDigestJob({
      session: actorSession,
      frequency: normalizedFrequency,
      reason: actionReason,
      request,
      triggerSource,
      liveCron,
      limit,
    });
    const digestAttempt = result.digestJobAttempt || {};
    const scheduledJobAttempt = await finishPersistedAdminScheduledJobAttempt(attempt.id, {
      session: actorSession,
      request,
      status: digestAttempt.status || "completed",
      matchedCount: digestAttempt.targetUserCount || 0,
      processedCount: digestAttempt.attemptedCount || 0,
      successCount: digestAttempt.sentCount || 0,
      failedCount: digestAttempt.failedCount || 0,
      skippedCount: digestAttempt.skippedCount || 0,
      itemCount: digestAttempt.itemCount || 0,
      metadata: {
        frequency: normalizedFrequency,
        digestJobAttemptId: digestAttempt.id,
        deliveryStatus: digestAttempt.deliveryStatus,
      },
    });
    return {
      ...result,
      scheduledJobAttempt,
      schedulerReadiness: readiness,
    };
  } catch (error) {
    const scheduledJobAttempt = await finishPersistedAdminScheduledJobAttempt(attempt.id, {
      session: actorSession,
      request,
      status: "failed",
      failedCount: 1,
      errorClass: classifyAdminEmailDeliveryError(error?.message || error?.code || "digest_cron_failed"),
      errorMessage: String(error?.message || "Digest cron failed.").slice(0, 240),
    });
    throw Object.assign(error, { scheduledJobAttempt });
  }
}

export async function runPersistedAdminMfaRecoverySlaCronJob({
  request,
  limit = 20,
  session,
  triggerSource = "cron",
  liveCron = true,
  requireEnabled = true,
  reason,
  metadata = {},
} = {}) {
  assertDatabaseConfigured();
  const readiness = getAdminScheduledWorkflowReadiness();
  const actorSession = session || buildAdminCronServiceSession("compliance");
  const actionReason = reason || "Scheduled MFA recovery SLA reminder and escalation check.";
  const attempt = await createPersistedAdminScheduledJobAttempt({
    session: actorSession,
    jobName: "admin-mfa-recovery-sla",
    jobKind: "mfa_recovery_sla",
    triggerSource,
    reason: actionReason,
    request,
    liveCron,
    metadata,
  });

  if (requireEnabled && !readiness.jobs.mfaRecoverySla.enabled) {
    const scheduledJobAttempt = await finishPersistedAdminScheduledJobAttempt(attempt.id, {
      session: actorSession,
      request,
      status: "skipped",
      skippedCount: 1,
      metadata: { disabledReason: "LAJOO_ADMIN_CRON_ENABLED and LAJOO_ADMIN_MFA_RECOVERY_CRON_ENABLED must be true." },
    });
    return { ...scheduledJobDisabledResult("admin-mfa-recovery-sla", readiness.jobs.mfaRecoverySla, scheduledJobAttempt), schedulerReadiness: readiness };
  }

  try {
    const result = await triggerPersistedAdminMfaRecoverySlaReminders({
      session: actorSession,
      reason: actionReason,
      request,
      limit,
      triggerSource,
      liveCron,
    });
    const scheduledJobAttempt = await finishPersistedAdminScheduledJobAttempt(attempt.id, {
      session: actorSession,
      request,
      status: "completed",
      matchedCount: result.matchedCount || 0,
      processedCount: result.sentCount || 0,
      successCount: result.sentCount || 0,
      itemCount: result.sentCount || 0,
      metadata: { reminderEventCount: result.sentCount || 0 },
    });
    return { ...result, scheduledJobAttempt, schedulerReadiness: readiness };
  } catch (error) {
    const scheduledJobAttempt = await finishPersistedAdminScheduledJobAttempt(attempt.id, {
      session: actorSession,
      request,
      status: "failed",
      failedCount: 1,
      errorClass: classifyAdminEmailDeliveryError(error?.message || error?.code || "mfa_recovery_sla_cron_failed"),
      errorMessage: String(error?.message || "MFA recovery SLA cron failed.").slice(0, 240),
    });
    throw Object.assign(error, { scheduledJobAttempt });
  }
}

export async function runPersistedAdminWebhookMonitoringCronJob({
  request,
  session,
  triggerSource = "cron",
  liveCron = true,
  requireEnabled = true,
  reason,
  metadata = {},
} = {}) {
  assertDatabaseConfigured();
  const readiness = getAdminScheduledWorkflowReadiness();
  const actorSession = session || buildAdminCronServiceSession("engineer");
  const actionReason = reason || "Scheduled Resend webhook monitoring check.";
  const attempt = await createPersistedAdminScheduledJobAttempt({
    session: actorSession,
    jobName: "admin-resend-webhook-monitoring",
    jobKind: "webhook_monitoring",
    triggerSource,
    reason: actionReason,
    request,
    liveCron,
    metadata,
  });

  if (requireEnabled && !readiness.jobs.webhookMonitoring.enabled) {
    const scheduledJobAttempt = await finishPersistedAdminScheduledJobAttempt(attempt.id, {
      session: actorSession,
      request,
      status: "skipped",
      skippedCount: 1,
      metadata: { disabledReason: "LAJOO_ADMIN_CRON_ENABLED and LAJOO_ADMIN_WEBHOOK_MONITOR_CRON_ENABLED must be true." },
    });
    return { ...scheduledJobDisabledResult("admin-resend-webhook-monitoring", readiness.jobs.webhookMonitoring, scheduledJobAttempt), schedulerReadiness: readiness };
  }

  try {
    const result = await checkPersistedAdminResendWebhookRegistration({ session: actorSession, request });
    const alertCount = result.monitoringAlerts?.length || 0;
    const failed = result.statusCheck?.status === "provider_error";
    const scheduledJobAttempt = await finishPersistedAdminScheduledJobAttempt(attempt.id, {
      session: actorSession,
      request,
      status: failed ? "failed" : "completed",
      matchedCount: alertCount,
      processedCount: 1,
      successCount: failed ? 0 : 1,
      failedCount: failed ? 1 : 0,
      itemCount: alertCount,
      errorClass: result.statusCheck?.errorClass || null,
      errorMessage: result.statusCheck?.errorMessage || null,
      metadata: {
        providerStatus: result.statusCheck?.status,
        monitoringStatus: result.monitoringState?.status,
        alertCount,
      },
    });
    return { ...result, scheduledJobAttempt, schedulerReadiness: readiness };
  } catch (error) {
    const scheduledJobAttempt = await finishPersistedAdminScheduledJobAttempt(attempt.id, {
      session: actorSession,
      request,
      status: "failed",
      failedCount: 1,
      errorClass: classifyAdminEmailDeliveryError(error?.message || error?.code || "webhook_monitoring_cron_failed"),
      errorMessage: String(error?.message || "Webhook monitoring cron failed.").slice(0, 240),
    });
    throw Object.assign(error, { scheduledJobAttempt });
  }
}

export async function retryPersistedAdminScheduledJobAttempt({
  session,
  attemptId,
  reason,
  request,
} = {}) {
  if (!hasSecuritySession(session)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const prisma = await getPrisma();
  const original = await prisma.adminScheduledJobAttempt.findUnique({
    where: { id: String(attemptId || "") },
    include: { actorUser: true },
  });
  if (!original) {
    const notFound = new Error("Scheduled job attempt was not found.");
    notFound.status = 404;
    throw notFound;
  }
  const originalForClient = mapAdminScheduledJobAttemptForClient(original);
  if (!canRetryAdminScheduledJob({ actorSession: session, scheduledJobAttempt: originalForClient })) {
    const forbidden = new Error("This scheduled job attempt cannot be retried by your role or is not in a failed/partial state.");
    forbidden.status = 403;
    throw forbidden;
  }

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "admin_scheduled_job_retry_requested",
    targetType: "admin_scheduled_job_attempt",
    targetId: original.id,
    field: original.jobKind,
    reason: actionReason,
    status: "logged",
    metadata: {
      originalStatus: original.status,
      originalJobName: original.jobName,
      triggerSource: "manual_retry",
      containsPii: false,
      containsSecrets: false,
    },
    request,
  });

  const retryMetadata = {
    retryOfAttemptId: original.id,
    retryRequestedByRole: session.role,
  };
  if (original.jobKind === "notification_digest") {
    const frequency = original.metadata?.frequency || "hourly";
    const result = await runPersistedAdminNotificationDigestCronJob({
      frequency,
      request,
      limit: Number(original.metadata?.limit || 50),
      session,
      triggerSource: "manual_retry",
      liveCron: false,
      requireEnabled: false,
      reason: actionReason,
      metadata: retryMetadata,
    });
    return { ...result, originalAttempt: originalForClient, event };
  }
  if (original.jobKind === "mfa_recovery_sla") {
    const result = await runPersistedAdminMfaRecoverySlaCronJob({
      request,
      limit: Number(original.metadata?.limit || 20),
      session,
      triggerSource: "manual_retry",
      liveCron: false,
      requireEnabled: false,
      reason: actionReason,
      metadata: retryMetadata,
    });
    return { ...result, originalAttempt: originalForClient, event };
  }
  if (original.jobKind === "webhook_monitoring") {
    const result = await runPersistedAdminWebhookMonitoringCronJob({
      request,
      session,
      triggerSource: "manual_retry",
      liveCron: false,
      requireEnabled: false,
      reason: actionReason,
      metadata: retryMetadata,
    });
    return { ...result, originalAttempt: originalForClient, event };
  }

  const unsupported = new Error("Unsupported scheduled job kind.");
  unsupported.status = 400;
  throw unsupported;
}

async function ensureAdminNotificationPreferenceDefaults(prisma, userId) {
  await prisma.adminNotificationPreference.createMany({
    data: getAdminNotificationPreferenceDefaults(userId).map((preference) => ({
      userId,
      category: preference.category,
      emailEnabled: preference.emailEnabled,
      frequency: preference.frequency,
      manualFallbackEnabled: preference.manualFallbackEnabled,
    })),
    skipDuplicates: true,
  });
}

export async function listPersistedAdminNotificationPreferences({ session, userId } = {}) {
  const targetUserId = String(userId || session?.id || "").trim();
  if (!canManageAdminNotificationPreference({ actorSession: session, targetUserId })) {
    const error = new Error("You can only manage your own notification preferences unless you are founder or compliance.");
    error.status = 403;
    throw error;
  }
  if (!process.env.DATABASE_URL || !targetUserId) {
    return {
      notificationPreferences: getAdminNotificationPreferenceDefaults(targetUserId || "current").map(normalizeAdminNotificationPreferenceForClient),
      persisted: false,
    };
  }

  try {
    const prisma = await getPrisma();
    const user = await prisma.adminUser.findUnique({
      where: { id: targetUserId },
      select: { id: true, status: true },
    });
    if (!user) {
      const notFound = new Error("Admin user was not found.");
      notFound.status = 404;
      throw notFound;
    }
    await ensureAdminNotificationPreferenceDefaults(prisma, user.id);
    const preferences = await prisma.adminNotificationPreference.findMany({
      where: { userId: user.id },
      orderBy: { category: "asc" },
    });
    return {
      notificationPreferences: preferences.map(normalizeAdminNotificationPreferenceForClient),
      persisted: true,
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return {
      notificationPreferences: getAdminNotificationPreferenceDefaults(targetUserId).map(normalizeAdminNotificationPreferenceForClient),
      persisted: false,
    };
  }
}

export async function updatePersistedAdminNotificationPreference({
  session,
  userId,
  category,
  emailEnabled,
  frequency,
  manualFallbackEnabled,
  reason,
  request,
} = {}) {
  const targetUserId = String(userId || session?.id || "").trim();
  if (!canManageAdminNotificationPreference({ actorSession: session, targetUserId })) {
    const error = new Error("You can only manage your own notification preferences unless you are founder or compliance.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const normalizedCategory = normalizeNotificationCategory(category);
  if (!normalizedCategory) {
    const error = new Error("Unsupported notification category.");
    error.status = 400;
    throw error;
  }
  const normalizedFrequency = normalizeNotificationFrequency(frequency);
  const crossUserChange = targetUserId !== session?.id;
  const actionReason = crossUserChange
    ? validateAdminActionReason(reason).reason
    : String(reason || `Updated ${normalizedCategory} notification preference.`).trim();
  if (crossUserChange && !actionReason) {
    const reasonError = new Error(validateAdminActionReason(reason).error || "A reason is required.");
    reasonError.status = 400;
    throw reasonError;
  }

  const prisma = await getPrisma();
  const user = await prisma.adminUser.findUnique({
    where: { id: targetUserId },
    select: { id: true, status: true },
  });
  if (!user) {
    const notFound = new Error("Admin user was not found.");
    notFound.status = 404;
    throw notFound;
  }
  await ensureAdminNotificationPreferenceDefaults(prisma, user.id);
  const preference = await prisma.adminNotificationPreference.upsert({
    where: {
      userId_category: {
        userId: user.id,
        category: normalizedCategory,
      },
    },
    create: {
      userId: user.id,
      category: normalizedCategory,
      emailEnabled: emailEnabled !== false,
      frequency: normalizedFrequency,
      manualFallbackEnabled: manualFallbackEnabled !== false,
    },
    update: {
      emailEnabled: emailEnabled !== false,
      frequency: normalizedFrequency,
      manualFallbackEnabled: manualFallbackEnabled !== false,
    },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "admin_notification_preference_update",
    targetType: "admin_user",
    targetId: user.id,
    field: normalizedCategory,
    reason: actionReason || `Updated ${normalizedCategory} notification preference.`,
    status: "logged",
    metadata: {
      category: normalizedCategory,
      emailEnabled: preference.emailEnabled,
      frequency: preference.frequency,
      manualFallbackEnabled: preference.manualFallbackEnabled,
      selfService: user.id === session?.id,
    },
    request,
  });

  return { notificationPreference: normalizeAdminNotificationPreferenceForClient(preference), event };
}

export async function updatePersistedAdminAuditReview({
  session,
  auditLogId,
  reviewStatus,
  reviewNote,
  assignedToUserId,
  priority,
  escalationStatus,
  assignmentDueAt,
  escalationReason,
  request,
}) {
  if (!hasSecuritySession(session)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();

  const normalizedStatus = String(reviewStatus || "").trim();
  if (!isAllowedAdminAuditReviewStatus(normalizedStatus)) {
    const statusError = new Error("Unsupported audit review status.");
    statusError.status = 400;
    throw statusError;
  }
  const normalizedPriority = String(priority || "normal").trim();
  if (!isAllowedAdminAuditPriority(normalizedPriority)) {
    const priorityError = new Error("Unsupported audit priority.");
    priorityError.status = 400;
    throw priorityError;
  }
  const normalizedEscalationStatus = String(escalationStatus || "none").trim();
  if (!isAllowedAdminAuditEscalationStatus(normalizedEscalationStatus)) {
    const escalationError = new Error("Unsupported audit escalation status.");
    escalationError.status = 400;
    throw escalationError;
  }
  const dueAt = parseOptionalDateTime(assignmentDueAt);
  const rawDueAt = String(assignmentDueAt || "").trim();
  if (rawDueAt && !dueAt) {
    const dueError = new Error("Assignment due date is invalid.");
    dueError.status = 400;
    throw dueError;
  }
  const escalationReasonText = String(escalationReason || "").trim();
  if (normalizedEscalationStatus !== "none" && escalationReasonText.length < 8) {
    const reasonError = new Error("An escalation reason is required.");
    reasonError.status = 400;
    throw reasonError;
  }
  const note = String(reviewNote || "").trim();
  if ((normalizedStatus !== "unreviewed" || normalizedEscalationStatus !== "none") && note.length < 4) {
    const noteError = new Error("A reviewer note is required.");
    noteError.status = 400;
    throw noteError;
  }

  const prisma = await getPrisma();
  const assigneeId = String(assignedToUserId || "").trim();
  let validAssigneeId = null;
  let assigneeOwnerRole = null;
  if (assigneeId && assigneeId !== "unassigned") {
    const assignee = await prisma.adminUser.findUnique({
      where: { id: assigneeId },
      include: { roleAssignments: true },
    });
    if (!assignee || assignee.status === "suspended") {
      const assigneeError = new Error("Audit assignee was not found or is suspended.");
      assigneeError.status = 400;
      throw assigneeError;
    }
    validAssigneeId = assignee.id;
    assigneeOwnerRole = primaryRole(activeRolesFromAssignments(assignee.roleAssignments));
  }
  const existing = await prisma.adminAuditLog.findUnique({
    where: { id: String(auditLogId || "") },
  });
  if (!existing) {
    const notFound = new Error("Audit event was not found.");
    notFound.status = 404;
    throw notFound;
  }

  const reviewed = normalizedStatus !== "unreviewed";
  const ownerRole = normalizedEscalationStatus === "founder" || normalizedEscalationStatus === "compliance"
    ? normalizedEscalationStatus
    : assigneeOwnerRole || null;
  const updated = await prisma.adminAuditLog.update({
    where: { id: existing.id },
    data: {
      reviewStatus: normalizedStatus,
      reviewedByUserId: reviewed ? persistedActorUserId(session) : null,
      reviewedAt: reviewed ? new Date() : null,
      reviewNote: reviewed ? note : null,
      assignedToUserId: validAssigneeId,
      ownerRole,
      priority: normalizedPriority,
      escalationStatus: normalizedEscalationStatus,
      assignmentDueAt: dueAt,
      escalationReason: normalizedEscalationStatus === "none" ? null : escalationReasonText,
      escalationResolvedAt: normalizedEscalationStatus === "none"
        ? (existing.escalationStatus && existing.escalationStatus !== "none" ? existing.escalationResolvedAt || new Date() : null)
        : null,
      escalatedAt: normalizedEscalationStatus === "none"
        ? null
        : existing.escalationStatus === normalizedEscalationStatus && existing.escalatedAt
          ? existing.escalatedAt
          : new Date(),
    },
    include: { reviewedBy: true, assignedTo: true },
  });

  const assignmentChanged = existing.assignedToUserId !== validAssigneeId
    || existing.ownerRole !== ownerRole
    || existing.priority !== normalizedPriority
    || existing.escalationStatus !== normalizedEscalationStatus
    || dateToIso(existing.assignmentDueAt) !== dateToIso(dueAt)
    || (existing.escalationReason || null) !== (normalizedEscalationStatus === "none" ? null : escalationReasonText);
  if (assignmentChanged) {
    await prisma.adminAuditAssignmentEvent.create({
      data: {
        auditLogId: existing.id,
        actorUserId: persistedActorUserId(session),
        previousAssignedToUserId: existing.assignedToUserId,
        assignedToUserId: validAssigneeId,
        previousOwnerRole: existing.ownerRole,
        ownerRole,
        previousPriority: existing.priority,
        priority: normalizedPriority,
        previousEscalationStatus: existing.escalationStatus,
        escalationStatus: normalizedEscalationStatus,
        previousAssignmentDueAt: existing.assignmentDueAt,
        assignmentDueAt: dueAt,
        previousEscalationReason: existing.escalationReason,
        escalationReason: normalizedEscalationStatus === "none" ? null : escalationReasonText,
        reason: reviewed ? note : "Audit ownership fields updated.",
        ipAddress: getRequestIpAddress(request),
        userAgent: getRequestUserAgent(request),
      },
    });
  }

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "admin_audit_review",
    targetType: "admin_audit_log",
    targetId: existing.id,
    field: "review_status",
    reason: reviewed ? note : "Audit review status reset to unreviewed.",
    status: "logged",
    metadata: {
      reviewStatus: normalizedStatus,
      priority: normalizedPriority,
      escalationStatus: normalizedEscalationStatus,
      ownerRole,
      assignmentDueAt: dateToIso(dueAt),
      escalationReason: normalizedEscalationStatus === "none" ? null : escalationReasonText,
      assignedToUserId: validAssigneeId,
      reviewedAuditAction: existing.action,
      reviewedAuditStatus: existing.status,
    },
    request,
  });

  return { log: mapAdminAuditLogForClient(updated), event };
}

export async function startPersistedAdminMfaEnrollment({ session, request }) {
  assertDatabaseConfigured();
  if (!session?.id) {
    const error = new Error("Admin session required.");
    error.status = 401;
    throw error;
  }

  const prisma = await getPrisma();
  const user = await prisma.adminUser.findUnique({
    where: { id: session.id },
    include: { roleAssignments: true },
  });
  if (!user || !ACTIVE_STATUSES.has(user.status)) {
    const error = new Error("Active admin user was not found.");
    error.status = 404;
    throw error;
  }
  if (user.mfaStatus === "enabled") {
    const error = new Error("Disable MFA before starting a new authenticator setup.");
    error.status = 409;
    throw error;
  }

  const secret = generateTotpSecret();
  const encryptedSecret = encryptTotpSecret(secret);
  const updated = await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      mfaStatus: "pending",
      mfaSecretEncrypted: encryptedSecret,
      mfaSecretUpdatedAt: new Date(),
      mfaEnabledAt: null,
    },
    include: { roleAssignments: true },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "mfa_enrollment_started",
    targetType: "admin_user",
    targetId: user.id,
    field: "totp",
    reason: "Admin started TOTP MFA enrollment.",
    status: "logged",
    metadata: { mfaStatus: "pending" },
    request,
  });

  const otpauthUrl = buildTotpUri({ secret, email: user.email });
  const qrCodeDataUrl = await buildTotpQrCodeDataUrl(otpauthUrl);

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
    user: mapAdminUserForClient(updated),
    event,
  };
}

export async function verifyPersistedAdminMfaEnrollment({ session, code, request }) {
  assertDatabaseConfigured();
  if (!session?.id) {
    const error = new Error("Admin session required.");
    error.status = 401;
    throw error;
  }

  const prisma = await getPrisma();
  const user = await prisma.adminUser.findUnique({
    where: { id: session.id },
    include: { roleAssignments: true },
  });
  if (!user || !ACTIVE_STATUSES.has(user.status) || !user.mfaSecretEncrypted) {
    const error = new Error("MFA enrollment has not been started.");
    error.status = 400;
    throw error;
  }

  const secret = decryptTotpSecret(user.mfaSecretEncrypted);
  const valid = verifyTotpCode(secret, code);
  if (!valid) {
    await recordPersistedAdminAuditEvent({
      session,
      action: "mfa_enrollment_failed",
      targetType: "admin_user",
      targetId: user.id,
      field: "totp",
      reason: "Invalid TOTP code during MFA enrollment.",
      status: "failed",
      metadata: { mfaStatus: user.mfaStatus },
      request,
    });
    const error = new Error("Invalid MFA code.");
    error.status = 400;
    throw error;
  }

  const updated = await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      mfaStatus: "enabled",
      mfaEnabledAt: new Date(),
    },
    include: { roleAssignments: true },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "mfa_enabled",
    targetType: "admin_user",
    targetId: user.id,
    field: "totp",
    reason: "Admin verified TOTP code and enabled MFA.",
    status: "logged",
    metadata: { mfaStatus: "enabled" },
    request,
  });

  return { user: mapAdminUserForClient(updated), event };
}

export async function disablePersistedAdminMfa({ session, targetUserId, reason, request, emergencyOverride = false }) {
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const userId = targetUserId || session?.id;
  if (!userId) {
    const authError = new Error("Admin session required.");
    authError.status = 401;
    throw authError;
  }

  const prisma = await getPrisma();
  const user = await prisma.adminUser.findUnique({
    where: { id: String(userId) },
    include: { roleAssignments: true },
  });
  if (!user) {
    const notFound = new Error("Admin user was not found.");
    notFound.status = 404;
    throw notFound;
  }
  const disabledSelf = user.id === session?.id;
  if (!disabledSelf && !emergencyOverride) {
    await recordPersistedAdminAuditEvent({
      session,
      action: "mfa_disable_recovery_required",
      targetType: "admin_user",
      targetId: user.id,
      field: "totp",
      reason: actionReason,
      status: "blocked",
      metadata: { targetUserId: user.id, actorRole: session?.role || "unknown" },
      request,
    });
    const recoveryRequired = new Error("Use the MFA recovery approval workflow to disable MFA for another admin.");
    recoveryRequired.status = 409;
    throw recoveryRequired;
  }
  if (emergencyOverride && session?.role !== "founder") {
    await recordPersistedAdminAuditEvent({
      session,
      action: "mfa_emergency_disable_denied",
      targetType: "admin_user",
      targetId: user.id,
      field: "totp",
      reason: actionReason,
      status: "blocked",
      metadata: { actorRole: session?.role || "unknown" },
      request,
    });
    const forbidden = new Error("Founder role required for emergency MFA recovery override.");
    forbidden.status = 403;
    throw forbidden;
  }
  if (!canManageAdminMfaRecovery({ actorSession: session, targetUser: user })) {
    await recordPersistedAdminAuditEvent({
      session,
      action: "mfa_disable_denied",
      targetType: "admin_user",
      targetId: user.id,
      field: "totp",
      reason: actionReason,
      status: "blocked",
      metadata: { disabledSelf, actorRole: session?.role || "unknown" },
      request,
    });
    const forbidden = new Error("Founder or compliance role required for MFA recovery on another admin user.");
    forbidden.status = 403;
    throw forbidden;
  }

  const updated = await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      mfaStatus: "not_configured",
      mfaSecretEncrypted: null,
      mfaEnabledAt: null,
      mfaSecretUpdatedAt: null,
    },
    include: { roleAssignments: true },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "mfa_disabled",
    targetType: "admin_user",
    targetId: user.id,
    field: "totp",
    reason: actionReason,
    status: "logged",
    metadata: { disabledSelf, emergencyOverride: Boolean(emergencyOverride) },
    request,
  });

  return { user: mapAdminUserForClient(updated), event };
}

export async function listPersistedAdminMfaRecoveryRequests(options = {}) {
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 20;
  if (!process.env.DATABASE_URL) {
    return { recoveryRequests: fallbackMfaRecoveryRequests.slice(0, limit), persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const now = new Date();
    await prisma.adminMfaRecoveryRequest.updateMany({
      where: {
        status: "requested",
        dueAt: { lt: now },
        overdueAt: null,
      },
      data: { overdueAt: now },
    });
    const where = {};
    const status = String(options.status || "").trim();
    if (status && status !== "all") where.status = status;
    const priority = String(options.priority || "").trim();
    if (priority && priority !== "all" && isAllowedAdminAuditPriority(priority)) where.priority = priority;
    if (options.overdue === true || String(options.overdue || "") === "true") {
      where.overdueAt = { not: null };
    }
    const requests = await prisma.adminMfaRecoveryRequest.findMany({
      where,
      include: {
        requester: { include: { roleAssignments: true } },
        targetUser: { include: { roleAssignments: true } },
        approver: { include: { roleAssignments: true } },
        reminderEvents: {
          orderBy: { createdAt: "desc" },
          take: 8,
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return {
      recoveryRequests: requests.map(mapAdminMfaRecoveryRequestForClient),
      persisted: true,
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return { recoveryRequests: fallbackMfaRecoveryRequests.slice(0, limit), persisted: false };
  }
}

async function notifyAdminMfaRecoveryRequest({ session, recoveryRequest, reason, request, isReminder = false }) {
  const requesterEmail = recoveryRequest.requester?.email || session?.email;
  const targetRoles = activeRolesFromAssignments(recoveryRequest.targetUser?.roleAssignments || []);
  const targetIsFounder = targetRoles.includes("founder");
  const origin = getRequestOrigin(request);
  const delivery = await sendAdminOperationalEmail({
    email: requesterEmail,
    subject: isReminder ? "LAJOO Admin MFA recovery reminder" : "LAJOO Admin MFA recovery request",
    heading: isReminder ? "MFA recovery review reminder" : "MFA recovery request created",
    body: [
      `Recovery request ${recoveryRequest.id} is ${recoveryRequest.status}.`,
      `Target admin: ${recoveryRequest.targetUser?.name || recoveryRequest.targetUserId}.`,
      `Priority: ${normalizeAuditPriority(recoveryRequest.priority)}.`,
      targetIsFounder ? "Founder approval is required for this target admin." : "Founder or compliance can review this request.",
      "No customer PII is included in this notification.",
    ].join("\n\n"),
    actionUrl: `${origin}/admin/security`,
    actionLabel: "Review MFA recovery",
  });

  const emailEvent = await recordPersistedAdminEmailDeliveryEvent({
    session,
    email: requesterEmail,
    delivery,
    metadata: {
      emailKind: isReminder ? "mfa_recovery_reminder" : "mfa_recovery_notification",
      recoveryRequestId: recoveryRequest.id,
      targetUserId: recoveryRequest.targetUserId,
      targetIsFounder,
    },
    request,
  });

  const prisma = await getPrisma();
  const now = new Date();
  const escalationTargetRole = targetIsFounder
    ? "founder"
    : (normalizeAuditPriority(recoveryRequest.priority) === "critical" ? "founder" : "compliance");
  const updateData = {
    notificationStatus: delivery.deliveryStatus,
    notificationProvider: delivery.deliveryProvider,
    notificationErrorClass: delivery.deliveryErrorClass || null,
    notificationError: delivery.deliveryError || null,
  };
  if (isReminder) updateData.reminderSentAt = now;
  else updateData.notifiedAt = now;
  const updated = await prisma.adminMfaRecoveryRequest.update({
    where: { id: recoveryRequest.id },
    data: updateData,
    include: {
      requester: { include: { roleAssignments: true } },
      targetUser: { include: { roleAssignments: true } },
      approver: { include: { roleAssignments: true } },
      reminderEvents: {
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
  });

  const auditEvent = await recordPersistedAdminAuditEvent({
    session,
    action: isReminder ? "mfa_recovery_reminder_sent" : "mfa_recovery_notification_sent",
    targetType: "admin_mfa_recovery",
    targetId: recoveryRequest.id,
    field: "email_notification",
    reason,
    status: delivery.deliveryStatus === "failed" ? "failed" : "logged",
    metadata: {
      deliveryStatus: delivery.deliveryStatus,
      deliveryProvider: delivery.deliveryProvider,
      deliveryErrorClass: delivery.deliveryErrorClass || null,
      targetUserId: recoveryRequest.targetUserId,
      hasManualFallback: delivery.deliveryStatus !== "sent",
    },
    request,
  });

  await prisma.adminMfaRecoveryReminderEvent.create({
    data: {
      recoveryRequestId: recoveryRequest.id,
      actorUserId: persistedActorUserId(session),
      action: isReminder ? "reminder_sent" : "notification_sent",
      status: delivery.deliveryStatus === "failed" ? "failed" : "logged",
      priority: normalizeAuditPriority(recoveryRequest.priority),
      reason,
      deliveryStatus: delivery.deliveryStatus,
      deliveryProvider: delivery.deliveryProvider,
      errorClass: delivery.deliveryErrorClass || null,
      escalationTargetRole,
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        targetUserId: recoveryRequest.targetUserId,
        targetIsFounder,
        hasManualFallback: delivery.deliveryStatus !== "sent",
      },
    },
  });

  return {
    recoveryRequest: mapAdminMfaRecoveryRequestForClient(updated),
    event: auditEvent,
    deliveryEvent: emailEvent,
  };
}

export async function createPersistedAdminMfaRecoveryRequest({ session, targetUserId, reason, priority = "normal", request }) {
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }
  const normalizedPriority = normalizeAuditPriority(priority);

  const prisma = await getPrisma();
  const targetUser = await prisma.adminUser.findUnique({
    where: { id: String(targetUserId || "") },
    include: { roleAssignments: true },
  });
  if (!targetUser) {
    const notFound = new Error("Admin user was not found.");
    notFound.status = 404;
    throw notFound;
  }
  if (!canCreateAdminMfaRecoveryRequest({ actorSession: session, targetUser })) {
    const blocked = await prisma.adminMfaRecoveryRequest.create({
      data: {
        requesterUserId: persistedActorUserId(session),
        targetUserId: targetUser.id,
        status: "blocked",
        reason: actionReason,
        blockedAt: new Date(),
        priority: normalizedPriority,
        dueAt: getAdminMfaRecoveryDueAt(normalizedPriority),
        ipAddress: getRequestIpAddress(request),
        userAgent: getRequestUserAgent(request),
        metadata: { actorRole: session?.role || "unknown" },
      },
      include: {
        requester: { include: { roleAssignments: true } },
        targetUser: { include: { roleAssignments: true } },
        approver: { include: { roleAssignments: true } },
      },
    });
    await recordPersistedAdminAuditEvent({
      session,
      action: "mfa_recovery_request_blocked",
      targetType: "admin_user",
      targetId: targetUser.id,
      field: "totp",
      reason: actionReason,
      status: "blocked",
      metadata: { recoveryRequestId: blocked.id },
      request,
    });
    const forbidden = new Error("Founder or compliance role required to create MFA recovery for another admin.");
    forbidden.status = 403;
    throw forbidden;
  }

  const recoveryRequest = await prisma.adminMfaRecoveryRequest.create({
    data: {
      requesterUserId: persistedActorUserId(session),
      targetUserId: targetUser.id,
      status: "requested",
      reason: actionReason,
      priority: normalizedPriority,
      dueAt: getAdminMfaRecoveryDueAt(normalizedPriority),
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        requesterRole: session?.role || "unknown",
        targetRoles: activeRolesFromAssignments(targetUser.roleAssignments),
      },
    },
    include: {
      requester: { include: { roleAssignments: true } },
      targetUser: { include: { roleAssignments: true } },
      approver: { include: { roleAssignments: true } },
    },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "mfa_recovery_requested",
    targetType: "admin_user",
    targetId: targetUser.id,
    field: "totp",
    reason: actionReason,
    status: "requested",
    metadata: { recoveryRequestId: recoveryRequest.id },
    request,
  });

  const notification = await notifyAdminMfaRecoveryRequest({
    session,
    recoveryRequest,
    reason: actionReason,
    request,
  });

  return { recoveryRequest: notification.recoveryRequest, event, notificationEvent: notification.event, deliveryEvent: notification.deliveryEvent };
}

export async function notifyPersistedAdminMfaRecoveryRequest({ session, recoveryRequestId, reason, request, isReminder = true }) {
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const prisma = await getPrisma();
  const existing = await prisma.adminMfaRecoveryRequest.findUnique({
    where: { id: String(recoveryRequestId || "") },
    include: {
      requester: { include: { roleAssignments: true } },
      targetUser: { include: { roleAssignments: true } },
      approver: { include: { roleAssignments: true } },
    },
  });
  if (!existing) {
    const notFound = new Error("MFA recovery request was not found.");
    notFound.status = 404;
    throw notFound;
  }
  if (!canNotifyAdminMfaRecovery({ actorSession: session, recoveryRequest: existing })) {
    const forbidden = new Error("Founder or compliance role required to send MFA recovery notifications.");
    forbidden.status = 403;
    throw forbidden;
  }

  return notifyAdminMfaRecoveryRequest({
    session,
    recoveryRequest: existing,
    reason: actionReason,
    request,
    isReminder,
  });
}

export async function triggerPersistedAdminMfaRecoverySlaReminders({
  session,
  reason,
  request,
  limit = 10,
  triggerSource = "manual_admin",
  liveCron = false,
} = {}) {
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }
  if (!["founder", "compliance"].includes(session?.role)) {
    const forbidden = new Error("Founder or compliance role required to trigger MFA recovery SLA reminders.");
    forbidden.status = 403;
    throw forbidden;
  }

  const prisma = await getPrisma();
  const now = new Date();
  await prisma.adminMfaRecoveryRequest.updateMany({
    where: {
      status: "requested",
      dueAt: { lt: now },
      overdueAt: null,
    },
    data: { overdueAt: now },
  });
  const requests = await prisma.adminMfaRecoveryRequest.findMany({
    where: {
      status: "requested",
      dueAt: { lt: now },
    },
    include: {
      requester: { include: { roleAssignments: true } },
      targetUser: { include: { roleAssignments: true } },
      approver: { include: { roleAssignments: true } },
      reminderEvents: {
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
    orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
    take: Number.isFinite(Number(limit)) ? Number(limit) : 10,
  });

  const results = [];
  for (const recoveryRequest of requests) {
    if (!canNotifyAdminMfaRecovery({ actorSession: session, recoveryRequest })) continue;
    results.push(await notifyAdminMfaRecoveryRequest({
      session,
      recoveryRequest,
      reason: actionReason,
      request,
      isReminder: true,
    }));
  }

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "mfa_recovery_sla_reminders_triggered",
    targetType: "admin_mfa_recovery",
    targetId: "overdue",
    field: "sla_reminder",
    reason: actionReason,
    status: "logged",
    metadata: {
      matchedCount: requests.length,
      sentCount: results.length,
      triggerSource,
      liveCron: Boolean(liveCron),
    },
    request,
  });

  return {
    sentCount: results.length,
    matchedCount: requests.length,
    recoveryRequests: results.map((result) => result.recoveryRequest),
    event,
  };
}

export async function decidePersistedAdminMfaRecoveryRequest({ session, recoveryRequestId, status, reason, request }) {
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }
  const normalizedStatus = String(status || "").trim();
  if (!["approved", "rejected"].includes(normalizedStatus)) {
    const statusError = new Error("Unsupported MFA recovery decision.");
    statusError.status = 400;
    throw statusError;
  }

  const prisma = await getPrisma();
  const existing = await prisma.adminMfaRecoveryRequest.findUnique({
    where: { id: String(recoveryRequestId || "") },
    include: {
      requester: { include: { roleAssignments: true } },
      targetUser: { include: { roleAssignments: true } },
      approver: { include: { roleAssignments: true } },
    },
  });
  if (!existing) {
    const notFound = new Error("MFA recovery request was not found.");
    notFound.status = 404;
    throw notFound;
  }
  if (!canApproveAdminMfaRecoveryRequest({ actorSession: session, recoveryRequest: existing })) {
    const forbidden = new Error("You cannot approve or reject this MFA recovery request.");
    forbidden.status = 403;
    throw forbidden;
  }

  const now = new Date();
  const updated = await prisma.adminMfaRecoveryRequest.update({
    where: { id: existing.id },
    data: {
      status: normalizedStatus,
      approverUserId: persistedActorUserId(session),
      approvalReason: normalizedStatus === "approved" ? actionReason : existing.approvalReason,
      rejectionReason: normalizedStatus === "rejected" ? actionReason : existing.rejectionReason,
      approvedAt: normalizedStatus === "approved" ? now : existing.approvedAt,
      rejectedAt: normalizedStatus === "rejected" ? now : existing.rejectedAt,
    },
    include: {
      requester: { include: { roleAssignments: true } },
      targetUser: { include: { roleAssignments: true } },
      approver: { include: { roleAssignments: true } },
    },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: `mfa_recovery_${normalizedStatus}`,
    targetType: "admin_mfa_recovery",
    targetId: existing.id,
    field: "totp",
    reason: actionReason,
    status: "logged",
    metadata: { targetUserId: existing.targetUserId },
    request,
  });

  return { recoveryRequest: mapAdminMfaRecoveryRequestForClient(updated), event };
}

export async function completePersistedAdminMfaRecoveryRequest({ session, recoveryRequestId, reason, request }) {
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const prisma = await getPrisma();
  const existing = await prisma.adminMfaRecoveryRequest.findUnique({
    where: { id: String(recoveryRequestId || "") },
    include: {
      requester: { include: { roleAssignments: true } },
      targetUser: { include: { roleAssignments: true } },
      approver: { include: { roleAssignments: true } },
    },
  });
  if (!existing) {
    const notFound = new Error("MFA recovery request was not found.");
    notFound.status = 404;
    throw notFound;
  }
  if (existing.status !== "approved") {
    const stateError = new Error("MFA recovery must be approved before completion.");
    stateError.status = 409;
    throw stateError;
  }
  if (!canManageAdminMfaRecovery({ actorSession: session, targetUser: existing.targetUser })) {
    const forbidden = new Error("Founder or compliance role required to complete MFA recovery.");
    forbidden.status = 403;
    throw forbidden;
  }

  await prisma.adminUser.update({
    where: { id: existing.targetUserId },
    data: {
      mfaStatus: "not_configured",
      mfaSecretEncrypted: null,
      mfaEnabledAt: null,
      mfaSecretUpdatedAt: null,
    },
  });

  const updated = await prisma.adminMfaRecoveryRequest.update({
    where: { id: existing.id },
    data: {
      status: "completed",
      completedAt: new Date(),
      approvalReason: existing.approvalReason || actionReason,
    },
    include: {
      requester: { include: { roleAssignments: true } },
      targetUser: { include: { roleAssignments: true } },
      approver: { include: { roleAssignments: true } },
    },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "mfa_recovery_completed",
    targetType: "admin_user",
    targetId: existing.targetUserId,
    field: "totp",
    reason: actionReason,
    status: "logged",
    metadata: { recoveryRequestId: existing.id },
    request,
  });

  return { recoveryRequest: mapAdminMfaRecoveryRequestForClient(updated), event };
}

export async function emergencyDisablePersistedAdminMfa({ session, targetUserId, reason, request }) {
  assertDatabaseConfigured();
  if (session?.role !== "founder") {
    const error = new Error("Founder role required for emergency MFA recovery override.");
    error.status = 403;
    throw error;
  }
  const result = await disablePersistedAdminMfa({
    session,
    targetUserId,
    reason,
    request,
    emergencyOverride: true,
  });

  const prisma = await getPrisma();
  await prisma.adminMfaRecoveryRequest.create({
    data: {
      requesterUserId: persistedActorUserId(session),
      targetUserId: String(targetUserId || ""),
      approverUserId: persistedActorUserId(session),
      status: "completed",
      reason,
      approvalReason: reason,
      emergencyOverrideReason: reason,
      approvedAt: new Date(),
      completedAt: new Date(),
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
      metadata: { emergencyOverride: true },
    },
  });

  return result;
}

export async function getAdminSecurityMetrics() {
  if (!process.env.DATABASE_URL) {
    return {
      persisted: false,
      activeAdmins: fallbackAdminUsers.filter((user) => user.status === "active").length,
      revealEvents: 1,
      blockedExports: 1,
      activeSessions: fallbackAdminSessions.length,
      exportRequests: fallbackExportEvents.filter((event) => event.status === "requested").length,
      unreviewedAuditLogs: fallbackAuditLogs.filter((log) => (log.reviewStatus || "unreviewed") === "unreviewed").length,
      escalatedAuditLogs: fallbackAuditLogs.filter((log) => (log.escalationStatus || "none") !== "none").length,
      artifactAccesses: 0,
      revokedArtifactAccesses: 0,
      mfaRecoveryRequests: fallbackMfaRecoveryRequests.filter((item) => item.status === "requested").length,
      overdueMfaRecoveries: fallbackMfaRecoveryRequests.filter((item) => item.slaStatus === "overdue").length,
      emailDeliveryEvents: 0,
      emailWebhookEvents: 0,
      emailWebhookStatusChecks: 0,
      notificationDigests: 0,
    };
  }

  try {
    await ensureBootstrapAdminUser();
    const prisma = await getPrisma();
    const [
      activeAdmins,
      revealEvents,
      blockedExports,
      activeSessions,
      exportRequests,
      unreviewedAuditLogs,
      escalatedAuditLogs,
      artifactAccesses,
      revokedArtifactAccesses,
      mfaRecoveryRequests,
      overdueMfaRecoveries,
      emailDeliveryEvents,
      emailWebhookEvents,
      emailWebhookStatusChecks,
      notificationDigests,
    ] = await Promise.all([
      prisma.adminUser.count({ where: { status: "active" } }),
      prisma.piiRevealEvent.count(),
      prisma.adminExportEvent.count({ where: { status: "blocked" } }),
      prisma.adminSession.count({
        where: {
          status: "active",
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
      prisma.adminExportEvent.count({ where: { status: "requested" } }),
      prisma.adminAuditLog.count({ where: { reviewStatus: "unreviewed" } }),
      prisma.adminAuditLog.count({ where: { escalationStatus: { not: "none" } } }),
      prisma.adminExportArtifactAccess.count(),
      prisma.adminExportArtifactAccess.count({ where: { status: { in: ["revoked", "rotated"] } } }),
      prisma.adminMfaRecoveryRequest.count({ where: { status: "requested" } }),
      prisma.adminMfaRecoveryRequest.count({ where: { status: "requested", overdueAt: { not: null } } }),
      prisma.adminInviteEmailEvent.count(),
      prisma.adminEmailWebhookEvent.count(),
      prisma.adminResendWebhookStatusCheck ? prisma.adminResendWebhookStatusCheck.count() : Promise.resolve(0),
      prisma.adminNotificationDigestEvent ? prisma.adminNotificationDigestEvent.count() : Promise.resolve(0),
    ]);
    return {
      persisted: true,
      activeAdmins,
      revealEvents,
      blockedExports,
      activeSessions,
      exportRequests,
      unreviewedAuditLogs,
      escalatedAuditLogs,
      artifactAccesses,
      revokedArtifactAccesses,
      mfaRecoveryRequests,
      overdueMfaRecoveries,
      emailDeliveryEvents,
      emailWebhookEvents,
      emailWebhookStatusChecks,
      notificationDigests,
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return {
      persisted: false,
      activeAdmins: fallbackAdminUsers.filter((user) => user.status === "active").length,
      revealEvents: 1,
      blockedExports: 1,
      activeSessions: fallbackAdminSessions.length,
      exportRequests: fallbackExportEvents.filter((event) => event.status === "requested").length,
      unreviewedAuditLogs: fallbackAuditLogs.filter((log) => (log.reviewStatus || "unreviewed") === "unreviewed").length,
      escalatedAuditLogs: fallbackAuditLogs.filter((log) => (log.escalationStatus || "none") !== "none").length,
      artifactAccesses: 0,
      revokedArtifactAccesses: 0,
      mfaRecoveryRequests: fallbackMfaRecoveryRequests.filter((item) => item.status === "requested").length,
      overdueMfaRecoveries: fallbackMfaRecoveryRequests.filter((item) => item.slaStatus === "overdue").length,
      emailDeliveryEvents: 0,
      emailWebhookEvents: 0,
      emailWebhookStatusChecks: 0,
      notificationDigests: 0,
    };
  }
}

function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL) {
    const error = new Error("Admin database is not configured.");
    error.status = 503;
    throw error;
  }
}

function requireValidAdminRole(role) {
  const normalized = String(role || "").trim();
  if (!ADMIN_ROLES.includes(normalized)) {
    const error = new Error("Invalid admin role.");
    error.status = 400;
    throw error;
  }
  return normalized;
}

async function countActiveFounderUsers(prisma) {
  const founders = await prisma.adminRoleAssignment.findMany({
    where: {
      role: "founder",
      revokedAt: null,
      user: {
        status: "active",
      },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  return founders.length;
}

export async function createPersistedAdminUser({ session, email, name, role, password, reason, request }) {
  assertFounderSession(session);
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(name || "").trim();
  const normalizedRole = requireValidAdminRole(role);
  const temporaryPassword = String(password || "");

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    const emailError = new Error("A valid admin email is required.");
    emailError.status = 400;
    throw emailError;
  }
  if (normalizedName.length < 2) {
    const nameError = new Error("Admin name is required.");
    nameError.status = 400;
    throw nameError;
  }
  if (temporaryPassword.length < 8) {
    const passwordError = new Error("Temporary password must be at least 8 characters.");
    passwordError.status = 400;
    throw passwordError;
  }

  await ensureBootstrapAdminUser();
  const prisma = await getPrisma();
  try {
    const user = await prisma.adminUser.create({
      data: {
        email: normalizedEmail,
        name: normalizedName,
        passwordHash: await hashAdminPassword(temporaryPassword),
        status: "active",
        invitedAt: new Date(),
        mfaStatus: "not_configured",
        roleAssignments: {
          create: {
            role: normalizedRole,
            grantedByUserId: persistedActorUserId(session),
            grantedReason: actionReason,
          },
        },
      },
      include: { roleAssignments: true },
    });

    const event = await recordPersistedAdminAuditEvent({
      session,
      action: "admin_user_create",
      targetType: "admin_user",
      targetId: user.id,
      field: "account",
      reason: actionReason,
      status: "logged",
      metadata: { assignedRole: normalizedRole, mfaStatus: user.mfaStatus },
      request,
    });

    return { user: mapAdminUserForClient(user), event };
  } catch (error) {
    if (error?.code === "P2002") {
      const uniqueError = new Error("An admin user with this email already exists.");
      uniqueError.status = 409;
      throw uniqueError;
    }
    throw error;
  }
}

export async function createPersistedAdminInvite({ session, email, name, role, reason, request }) {
  assertFounderSession(session);
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(name || "").trim();
  const normalizedRole = requireValidAdminRole(role);

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    const emailError = new Error("A valid admin email is required.");
    emailError.status = 400;
    throw emailError;
  }
  if (normalizedName.length < 2) {
    const nameError = new Error("Admin name is required.");
    nameError.status = 400;
    throw nameError;
  }

  await ensureBootstrapAdminUser();
  const prisma = await getPrisma();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_MAX_AGE_MS);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.adminUser.findUnique({
        where: { email: normalizedEmail },
        include: { roleAssignments: true },
      });

      if (existing?.status === "active" && existing.passwordHash) {
        const existsError = new Error("An active admin user with this email already exists.");
        existsError.status = 409;
        throw existsError;
      }

      const user = existing
        ? await tx.adminUser.update({
            where: { id: existing.id },
            data: {
              name: normalizedName,
              status: "invited",
              invitedAt: new Date(),
              mfaStatus: "not_configured",
            },
            include: { roleAssignments: true },
          })
        : await tx.adminUser.create({
            data: {
              email: normalizedEmail,
              name: normalizedName,
              passwordHash: null,
              status: "invited",
              invitedAt: new Date(),
              mfaStatus: "not_configured",
              roleAssignments: {
                create: {
                  role: normalizedRole,
                  grantedByUserId: persistedActorUserId(session),
                  grantedReason: actionReason,
                },
              },
            },
            include: { roleAssignments: true },
          });

      if (existing && !user.roleAssignments.some((assignment) => assignment.role === normalizedRole && !assignment.revokedAt)) {
        await tx.adminRoleAssignment.create({
          data: {
            userId: user.id,
            role: normalizedRole,
            grantedByUserId: persistedActorUserId(session),
            grantedReason: actionReason,
          },
        });
      }

      await tx.adminInviteToken.updateMany({
        where: { userId: user.id, status: "pending" },
        data: { status: "revoked", revokedAt: new Date() },
      });

      const invite = await tx.adminInviteToken.create({
        data: {
          userId: user.id,
          email: normalizedEmail,
          role: normalizedRole,
          tokenHash,
          status: "pending",
          expiresAt,
          createdByUserId: persistedActorUserId(session),
          createdReason: actionReason,
          ipAddress: getRequestIpAddress(request),
          userAgent: getRequestUserAgent(request),
        },
      });

      const updatedUser = await tx.adminUser.findUnique({
        where: { id: user.id },
        include: { roleAssignments: true },
      });

      return { user: updatedUser, invite };
    });

    const inviteUrl = `${getRequestOrigin(request)}/admin/invite/${token}`;
    const delivery = await sendAdminInviteEmail({
      email: normalizedEmail,
      name: normalizedName,
      role: normalizedRole,
      inviteUrl,
      expiresAt: result.invite.expiresAt,
    });
    const updatedInvite = await prisma.adminInviteToken.update({
      where: { id: result.invite.id },
      data: {
        deliveryStatus: delivery.deliveryStatus,
        deliveryProvider: delivery.deliveryProvider,
        deliveryMessageId: delivery.deliveryMessageId,
        deliveryError: delivery.deliveryError,
        deliverySentAt: delivery.deliverySentAt,
      },
    });
    const persistedDeliveryEvent = await recordPersistedAdminEmailDeliveryEvent({
      session,
      inviteTokenId: result.invite.id,
      email: normalizedEmail,
      delivery,
      metadata: {
        emailKind: "admin_invite",
        role: normalizedRole,
        hasManualFallback: delivery.deliveryStatus !== "sent",
      },
      request,
    });
    const event = await recordPersistedAdminAuditEvent({
      session,
      action: "admin_invite_create",
      targetType: "admin_user",
      targetId: result.user.id,
      field: "invite",
      reason: actionReason,
      status: "logged",
      metadata: {
        role: normalizedRole,
        inviteId: result.invite.id,
        expiresAt: result.invite.expiresAt.toISOString(),
        delivery: delivery.deliveryStatus,
        deliveryProvider: delivery.deliveryProvider,
        deliveryErrorClass: delivery.deliveryErrorClass || null,
      },
      request,
    });
    const deliveryAction = delivery.deliveryStatus === "sent"
      ? "admin_invite_email_sent"
      : delivery.deliveryStatus === "failed"
        ? "admin_invite_email_failed"
        : "admin_invite_email_manual_fallback";
    const deliveryEvent = await recordPersistedAdminAuditEvent({
      session,
      action: deliveryAction,
      targetType: "admin_invite",
      targetId: result.invite.id,
      field: "email_delivery",
      reason: actionReason,
      status: delivery.deliveryStatus === "failed" ? "failed" : "logged",
      metadata: {
        deliveryStatus: delivery.deliveryStatus,
        deliveryProvider: delivery.deliveryProvider,
        deliveryErrorClass: delivery.deliveryErrorClass || null,
        hasMessageId: Boolean(delivery.deliveryMessageId),
        hasManualFallback: delivery.deliveryStatus !== "sent",
      },
      request,
    });

    return {
      user: mapAdminUserForClient(result.user),
      invite: {
        id: updatedInvite.id,
        email: maskAdminEmail(updatedInvite.email),
        role: updatedInvite.role,
        status: updatedInvite.status,
        expiresAt: updatedInvite.expiresAt.toISOString(),
        deliveryStatus: updatedInvite.deliveryStatus,
        deliveryProvider: updatedInvite.deliveryProvider,
        deliverySentAt: dateToIso(updatedInvite.deliverySentAt),
        deliveryError: updatedInvite.deliveryError,
        manualInviteUrl: inviteUrl,
      },
      event,
      emailEvent: deliveryEvent,
      deliveryEvent: persistedDeliveryEvent,
    };
  } catch (error) {
    if (error?.code === "P2002") {
      const uniqueError = new Error("Unable to create a unique invite token. Please try again.");
      uniqueError.status = 409;
      throw uniqueError;
    }
    throw error;
  }
}

export async function getPersistedAdminInviteByToken(token) {
  assertDatabaseConfigured();
  const tokenHash = hashToken(token);
  const prisma = await getPrisma();
  const invite = await prisma.adminInviteToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { roleAssignments: true },
      },
    },
  });

  if (!invite) return { valid: false, reason: "not_found" };
  if (invite.status !== "pending") return { valid: false, reason: invite.status };
  if (invite.expiresAt < new Date()) {
    await prisma.adminInviteToken.update({
      where: { id: invite.id },
      data: { status: "expired" },
    });
    return { valid: false, reason: "expired" };
  }

  return {
    valid: true,
    invite: {
      id: invite.id,
      email: maskAdminEmail(invite.email),
      name: invite.user?.name || "Invited admin",
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    },
  };
}

export async function acceptPersistedAdminInvite({ token, password, request }) {
  assertDatabaseConfigured();
  const temporaryPassword = String(password || "");
  if (temporaryPassword.length < 8) {
    const passwordError = new Error("Password must be at least 8 characters.");
    passwordError.status = 400;
    throw passwordError;
  }

  const tokenHash = hashToken(token);
  const prisma = await getPrisma();
  const invite = await prisma.adminInviteToken.findUnique({
    where: { tokenHash },
    include: {
      user: { include: { roleAssignments: true } },
    },
  });

  if (!invite || invite.status !== "pending") {
    const invalid = new Error("Invite link is invalid or already used.");
    invalid.status = 404;
    throw invalid;
  }
  if (invite.expiresAt < new Date()) {
    await prisma.adminInviteToken.update({
      where: { id: invite.id },
      data: { status: "expired" },
    });
    const expired = new Error("Invite link has expired.");
    expired.status = 410;
    throw expired;
  }

  const passwordHash = await hashAdminPassword(temporaryPassword);
  const user = await prisma.adminUser.update({
    where: { id: invite.userId },
    data: {
      passwordHash,
      status: "active",
      mfaStatus: "not_configured",
      mfaSecretEncrypted: null,
      mfaSecretUpdatedAt: null,
    },
    include: { roleAssignments: true },
  });
  await prisma.adminInviteToken.update({
    where: { id: invite.id },
    data: {
      status: "accepted",
      acceptedAt: new Date(),
    },
  });

  const roles = activeRolesFromAssignments(user.roleAssignments);
  const event = await recordPersistedAdminAuditEvent({
    session: {
      id: user.id,
      email: user.email,
      role: primaryRole(roles),
      source: "database",
    },
    action: "admin_invite_accept",
    targetType: "admin_user",
    targetId: user.id,
    field: "invite",
    reason: "Invited admin completed first password setup.",
    status: "logged",
    metadata: { inviteId: invite.id, role: invite.role },
    request,
  });

  return { user: mapAdminUserForClient(user), event };
}

export async function assignPersistedAdminRole({ session, userId, role, reason, request }) {
  assertFounderSession(session);
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }
  const normalizedRole = requireValidAdminRole(role);
  await ensureBootstrapAdminUser();
  const prisma = await getPrisma();
  const user = await prisma.adminUser.findUnique({
    where: { id: String(userId || "") },
    include: { roleAssignments: true },
  });
  if (!user) {
    const notFound = new Error("Admin user was not found.");
    notFound.status = 404;
    throw notFound;
  }

  const existing = user.roleAssignments.find((assignment) => assignment.role === normalizedRole && !assignment.revokedAt);
  if (!existing) {
    await prisma.adminRoleAssignment.create({
      data: {
        userId: user.id,
        role: normalizedRole,
        grantedByUserId: persistedActorUserId(session),
        grantedReason: actionReason,
      },
    });
  }

  const updatedUser = await prisma.adminUser.findUnique({
    where: { id: user.id },
    include: { roleAssignments: true },
  });
  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "admin_role_assign",
    targetType: "admin_user",
    targetId: user.id,
    field: normalizedRole,
    reason: actionReason,
    status: existing ? "no_change" : "logged",
    metadata: { assignedRole: normalizedRole },
    request,
  });

  return { user: mapAdminUserForClient(updatedUser), event };
}

export async function revokePersistedAdminRole({ session, userId, role, reason, request }) {
  assertFounderSession(session);
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }
  const normalizedRole = requireValidAdminRole(role);
  await ensureBootstrapAdminUser();
  const prisma = await getPrisma();
  const user = await prisma.adminUser.findUnique({
    where: { id: String(userId || "") },
    include: { roleAssignments: true },
  });
  if (!user) {
    const notFound = new Error("Admin user was not found.");
    notFound.status = 404;
    throw notFound;
  }

  if (normalizedRole === "founder" && (await countActiveFounderUsers(prisma)) <= 1) {
    const lastFounder = new Error("Cannot revoke the last active founder role.");
    lastFounder.status = 409;
    throw lastFounder;
  }

  const activeAssignment = user.roleAssignments.find((assignment) => assignment.role === normalizedRole && !assignment.revokedAt);
  if (activeAssignment) {
    await prisma.adminRoleAssignment.update({
      where: { id: activeAssignment.id },
      data: { revokedAt: new Date() },
    });
  }

  const updatedUser = await prisma.adminUser.findUnique({
    where: { id: user.id },
    include: { roleAssignments: true },
  });
  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "admin_role_revoke",
    targetType: "admin_user",
    targetId: user.id,
    field: normalizedRole,
    reason: actionReason,
    status: activeAssignment ? "logged" : "no_change",
    metadata: { revokedRole: normalizedRole },
    request,
  });

  return { user: mapAdminUserForClient(updatedUser), event };
}

export async function updatePersistedAdminUserStatus({ session, userId, status, reason, request }) {
  assertFounderSession(session);
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }
  const normalizedStatus = String(status || "").trim();
  if (!["active", "suspended"].includes(normalizedStatus)) {
    const statusError = new Error("Unsupported admin user status.");
    statusError.status = 400;
    throw statusError;
  }
  if (String(userId || "") === session?.id && normalizedStatus === "suspended") {
    const selfError = new Error("You cannot suspend your own active founder session.");
    selfError.status = 409;
    throw selfError;
  }

  await ensureBootstrapAdminUser();
  const prisma = await getPrisma();
  const user = await prisma.adminUser.findUnique({
    where: { id: String(userId || "") },
    include: { roleAssignments: true },
  });
  if (!user) {
    const notFound = new Error("Admin user was not found.");
    notFound.status = 404;
    throw notFound;
  }

  const userRoles = activeRolesFromAssignments(user.roleAssignments);
  if (normalizedStatus === "suspended" && userRoles.includes("founder") && (await countActiveFounderUsers(prisma)) <= 1) {
    const lastFounder = new Error("Cannot suspend the last active founder.");
    lastFounder.status = 409;
    throw lastFounder;
  }

  const updatedUser = await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      status: normalizedStatus,
      suspendedAt: normalizedStatus === "suspended" ? new Date() : null,
    },
    include: { roleAssignments: true },
  });

  if (normalizedStatus === "suspended") {
    await prisma.adminSession.updateMany({
      where: { userId: user.id, status: "active" },
      data: { status: "revoked", revokedAt: new Date() },
    });
  }

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: normalizedStatus === "suspended" ? "admin_user_suspend" : "admin_user_reactivate",
    targetType: "admin_user",
    targetId: user.id,
    field: "status",
    reason: actionReason,
    status: "logged",
    metadata: { status: normalizedStatus },
    request,
  });

  return { user: mapAdminUserForClient(updatedUser), event };
}

export async function listPersistedAdminSessions() {
  if (!process.env.DATABASE_URL) {
    return { sessions: fallbackAdminSessions, persisted: false };
  }

  try {
    await ensureBootstrapAdminUser();
    const prisma = await getPrisma();
    const sessions = await prisma.adminSession.findMany({
      where: {
        status: "active",
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: { include: { roleAssignments: true } },
      },
      orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
      take: 50,
    });
    return { sessions: sessions.map(mapAdminSessionForClient), persisted: true };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return { sessions: fallbackAdminSessions, persisted: false };
  }
}

export async function revokePersistedAdminSessionById({ session, sessionId, reason, request }) {
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const prisma = await getPrisma();
  const targetSession = await prisma.adminSession.findUnique({
    where: { id: String(sessionId || "") },
    include: { user: true },
  });
  if (!targetSession) {
    const notFound = new Error("Admin session was not found.");
    notFound.status = 404;
    throw notFound;
  }
  if (targetSession.id === session?.sessionId) {
    const currentError = new Error("Use logout to revoke your current session.");
    currentError.status = 409;
    throw currentError;
  }
  if (!canRevokeAdminSessionForActor({ actorSession: session, targetSession })) {
    const forbidden = new Error("You can only revoke your own sessions unless you are founder.");
    forbidden.status = 403;
    throw forbidden;
  }

  await prisma.adminSession.update({
    where: { id: targetSession.id },
    data: { status: "revoked", revokedAt: new Date() },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "admin_session_revoke",
    targetType: "admin_session",
    targetId: targetSession.id,
    field: "session",
    reason: actionReason,
    status: "logged",
    metadata: {
      targetUserId: targetSession.userId,
      targetUserEmail: targetSession.user?.email ? maskAdminEmail(targetSession.user.email) : undefined,
    },
    request,
  });

  return { event };
}

export async function listPersistedAdminExportEvents(options = {}) {
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 30;
  if (!process.env.DATABASE_URL) {
    return { exportEvents: fallbackExportEvents.slice(0, limit), persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const events = await prisma.adminExportEvent.findMany({
      include: {
        auditLog: true,
        artifactAccesses: {
          include: { requestedBy: true, revokedBy: true },
          orderBy: { createdAt: "desc" },
          take: 8,
        },
        _count: { select: { artifactAccesses: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return { exportEvents: events.map(mapAdminExportEventForClient), persisted: true };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return { exportEvents: fallbackExportEvents.slice(0, limit), persisted: false };
  }
}

export async function getPersistedAdminExportArtifactPolicy({ session } = {}) {
  const policyConfig = getAdminExportArtifactPolicyConfig();
  const ttlSeconds = policyConfig.effectiveTtlSeconds;
  const ttlSource = policyConfig.ttlSource;
  const currentEnvironment = normalizeAdminExportArtifactPolicyEnvironment();
  if (!hasSecuritySession(session)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  if (!process.env.DATABASE_URL) {
    return {
      persisted: false,
      ttlSeconds,
      ttlMinutes: policyConfig.ttlMinutes,
      ttlSource,
      config: policyConfig,
      currentEnvironment,
      activePolicies: EXPORT_ARTIFACT_POLICY_ENVIRONMENTS.map((environment) => mapAdminExportArtifactPolicyForClient({
        environment,
        status: policyConfig.status,
        ttlSeconds,
        minTtlSeconds: policyConfig.minTtlSeconds,
        maxTtlSeconds: policyConfig.maxTtlSeconds,
        reason: "Environment/default policy.",
      }, policyConfig)),
      policyHistory: [],
      counts: { active: 0, expired: 0, revoked: 0, rotated: 0, total: 0 },
      activeLinks: [],
    };
  }

  try {
    const prisma = await getPrisma();
    const now = new Date();
    const [active, expired, revoked, rotated, total, activeLinks, persistedPolicies, policyHistory] = await Promise.all([
      prisma.adminExportArtifactAccess.count({ where: { status: "active", expiresAt: { gt: now } } }),
      prisma.adminExportArtifactAccess.count({
        where: {
          OR: [
            { status: "expired" },
            { status: "active", expiresAt: { lte: now } },
          ],
        },
      }),
      prisma.adminExportArtifactAccess.count({ where: { status: "revoked" } }),
      prisma.adminExportArtifactAccess.count({ where: { status: "rotated" } }),
      prisma.adminExportArtifactAccess.count(),
      prisma.adminExportArtifactAccess.findMany({
        where: { status: "active" },
        include: { requestedBy: true, revokedBy: true },
        orderBy: { expiresAt: "asc" },
        take: 8,
      }),
      Promise.all(EXPORT_ARTIFACT_POLICY_ENVIRONMENTS.map((environment) => getActiveAdminExportArtifactPolicy({ prisma, environment }))),
      prisma.adminExportArtifactPolicy
        ? prisma.adminExportArtifactPolicy.findMany({
            include: { changedBy: true },
            orderBy: { effectiveFrom: "desc" },
            take: 20,
          })
        : Promise.resolve([]),
    ]);
    const activePolicy = persistedPolicies.find((policy) => policy.environment === currentEnvironment) || persistedPolicies[0];
    return {
      persisted: true,
      ttlSeconds: activePolicy?.ttlSeconds || ttlSeconds,
      ttlMinutes: activePolicy?.ttlMinutes || policyConfig.ttlMinutes,
      ttlSource: activePolicy?.mode || ttlSource,
      config: policyConfig,
      currentEnvironment,
      activePolicy,
      activePolicies: persistedPolicies,
      policyHistory: policyHistory.map((policy) => mapAdminExportArtifactPolicyForClient(policy, policyConfig)),
      generatedAt: now.toISOString(),
      counts: { active, expired, revoked, rotated, total },
      activeLinks: activeLinks.map(mapAdminExportArtifactAccessForClient),
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return {
      persisted: false,
      ttlSeconds,
      ttlMinutes: policyConfig.ttlMinutes,
      ttlSource,
      config: policyConfig,
      currentEnvironment,
      activePolicies: EXPORT_ARTIFACT_POLICY_ENVIRONMENTS.map((environment) => mapAdminExportArtifactPolicyForClient({
        environment,
        status: policyConfig.status,
        ttlSeconds,
        minTtlSeconds: policyConfig.minTtlSeconds,
        maxTtlSeconds: policyConfig.maxTtlSeconds,
        reason: "Environment/default policy.",
      }, policyConfig)),
      policyHistory: [],
      counts: { active: 0, expired: 0, revoked: 0, rotated: 0, total: 0 },
      activeLinks: [],
    };
  }
}

export async function updatePersistedAdminExportArtifactPolicy({
  session,
  environment,
  ttlSeconds,
  minTtlSeconds,
  maxTtlSeconds,
  status = "active",
  reason,
  request,
} = {}) {
  if (!["founder", "compliance"].includes(session?.role)) {
    const error = new Error("Founder or compliance role required to update export artifact policy.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const normalizedEnvironment = normalizeAdminExportArtifactPolicyEnvironment(environment);
  const normalizedStatus = String(status || "active").trim();
  if (!["active", "disabled"].includes(normalizedStatus)) {
    const statusError = new Error("Unsupported export artifact policy status.");
    statusError.status = 400;
    throw statusError;
  }
  const fallbackConfig = getAdminExportArtifactPolicyConfig();
  const minTtl = Number(minTtlSeconds || fallbackConfig.minTtlSeconds);
  const maxTtl = Number(maxTtlSeconds || fallbackConfig.maxTtlSeconds);
  const ttl = Number(ttlSeconds || fallbackConfig.effectiveTtlSeconds);
  if (![minTtl, maxTtl, ttl].every((value) => Number.isFinite(value) && value > 0)) {
    const ttlError = new Error("TTL values must be positive numbers.");
    ttlError.status = 400;
    throw ttlError;
  }
  if (minTtl > maxTtl) {
    const ttlError = new Error("Minimum TTL cannot exceed maximum TTL.");
    ttlError.status = 400;
    throw ttlError;
  }
  if (ttl < minTtl || ttl > maxTtl) {
    const ttlError = new Error("Effective TTL must be within the configured min/max bounds.");
    ttlError.status = 400;
    throw ttlError;
  }

  const prisma = await getPrisma();
  const now = new Date();
  const [, policy] = await prisma.$transaction([
    prisma.adminExportArtifactPolicy.updateMany({
      where: {
        environment: normalizedEnvironment,
        status: { in: ["active", "disabled"] },
        supersededAt: null,
      },
      data: {
        status: "superseded",
        supersededAt: now,
      },
    }),
    prisma.adminExportArtifactPolicy.create({
      data: {
        environment: normalizedEnvironment,
        status: normalizedStatus,
        ttlSeconds: Math.trunc(ttl),
        minTtlSeconds: Math.trunc(minTtl),
        maxTtlSeconds: Math.trunc(maxTtl),
        changedByUserId: persistedActorUserId(session),
        reason: actionReason,
        effectiveFrom: now,
        ipAddress: getRequestIpAddress(request),
        userAgent: getRequestUserAgent(request),
        metadata: {
          containsPii: false,
          noBulkExport: true,
        },
      },
      include: { changedBy: true },
    }),
  ]);

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "export_artifact_policy_update",
    targetType: "admin_export_artifact_policy",
    targetId: normalizedEnvironment,
    field: "ttl_policy",
    reason: actionReason,
    status: "logged",
    metadata: {
      environment: normalizedEnvironment,
      policyStatus: normalizedStatus,
      ttlSeconds: Math.trunc(ttl),
      minTtlSeconds: Math.trunc(minTtl),
      maxTtlSeconds: Math.trunc(maxTtl),
      containsPii: false,
      noBulkExport: true,
    },
    request,
  });

  return {
    policy: mapAdminExportArtifactPolicyForClient(policy, fallbackConfig),
    event,
  };
}

export async function listPersistedAdminExportArtifactAccesses({ session, exportEventId } = {}) {
  if (!hasSecuritySession(session)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const prisma = await getPrisma();
  const accessRows = await prisma.adminExportArtifactAccess.findMany({
    where: { exportEventId: String(exportEventId || "") },
    include: { requestedBy: true, revokedBy: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return { artifactAccesses: accessRows.map(mapAdminExportArtifactAccessForClient) };
}

export async function updatePersistedAdminExportEvent({ session, exportEventId, status, reason, request }) {
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }
  const normalizedStatus = String(status || "").trim();
  if (!isAllowedAdminExportDecision(normalizedStatus)) {
    const statusError = new Error("Unsupported export status.");
    statusError.status = 400;
    throw statusError;
  }
  if (["approved", "rejected"].includes(normalizedStatus) && !canDecideAdminExportRequest(session)) {
    const forbidden = new Error("Founder or compliance role required for export approval decisions.");
    forbidden.status = 403;
    throw forbidden;
  }
  if (normalizedStatus === "completed_mock" && session?.role !== "founder") {
    const forbidden = new Error("Founder role required to mark a mock export completed.");
    forbidden.status = 403;
    throw forbidden;
  }

  const prisma = await getPrisma();
  const existing = await prisma.adminExportEvent.findUnique({
    where: { id: String(exportEventId || "") },
    include: { auditLog: true },
  });
  if (!existing) {
    const notFound = new Error("Export request was not found.");
    notFound.status = 404;
    throw notFound;
  }
  if (existing.status === "blocked") {
    const blocked = new Error("Blocked export attempts cannot be approved or completed.");
    blocked.status = 409;
    throw blocked;
  }

  const now = new Date();
  const artifactMetadata = buildExportArtifactMetadata(existing, normalizedStatus, actionReason, session);
  const data = {
    status: normalizedStatus,
    approvalReason: actionReason,
    artifactMetadata,
    artifactReadyAt: now,
  };
  if (normalizedStatus === "approved") {
    data.approvedByUserId = persistedActorUserId(session);
    data.approvedAt = now;
    data.rejectedAt = null;
  }
  if (normalizedStatus === "rejected") {
    data.rejectedAt = now;
  }
  if (normalizedStatus === "completed_mock") {
    data.completedAt = now;
  }

  const updated = await prisma.adminExportEvent.update({
    where: { id: existing.id },
    data,
    include: { auditLog: true },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: `export_${normalizedStatus}`,
    targetType: "admin_export",
    targetId: existing.id,
    field: existing.field,
    reason: actionReason,
    status: "logged",
    metadata: { exportStatus: normalizedStatus, exportKind: existing.exportKind, artifactContainsPii: false },
    request,
  });

  return { exportEvent: mapAdminExportEventForClient(updated), event };
}

export async function revokePersistedAdminExportArtifactAccess({ session, exportEventId, accessId, reason, request }) {
  if (!canRevokeAdminExportArtifactAccess(session)) {
    const error = new Error("Founder or compliance role required to revoke artifact access.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const prisma = await getPrisma();
  const access = await prisma.adminExportArtifactAccess.findUnique({
    where: { id: String(accessId || "") },
    include: { requestedBy: true, revokedBy: true },
  });
  if (!access || access.exportEventId !== String(exportEventId || "")) {
    const notFound = new Error("Signed artifact access link was not found.");
    notFound.status = 404;
    throw notFound;
  }
  if (access.status !== "active") {
    const inactive = new Error("Signed artifact access link is already inactive.");
    inactive.status = 409;
    throw inactive;
  }

  const updated = await prisma.adminExportArtifactAccess.update({
    where: { id: access.id },
    data: {
      status: "revoked",
      revokedAt: new Date(),
      revokedByUserId: persistedActorUserId(session),
      revokedReason: actionReason,
    },
    include: { requestedBy: true, revokedBy: true },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "export_artifact_access_revoked",
    targetType: "admin_export_artifact",
    targetId: access.exportEventId,
    field: "signed_access",
    reason: actionReason,
    status: "logged",
    metadata: {
      accessId: access.id,
      previousStatus: access.status,
      containsPii: false,
    },
    request,
  });

  return { access: mapAdminExportArtifactAccessForClient(updated), event };
}

export async function rotatePersistedAdminExportArtifactAccess({ session, exportEventId, accessId, reason, request }) {
  if (!canRotateAdminExportArtifactAccess(session)) {
    const error = new Error("Founder or compliance role required to rotate artifact access.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const prisma = await getPrisma();
  const access = await prisma.adminExportArtifactAccess.findUnique({
    where: { id: String(accessId || "") },
    include: {
      requestedBy: true,
      revokedBy: true,
      exportEvent: true,
    },
  });
  if (!access || access.exportEventId !== String(exportEventId || "")) {
    const notFound = new Error("Signed artifact access link was not found.");
    notFound.status = 404;
    throw notFound;
  }
  if (getAdminExportArtifactAccessState(access) !== "active") {
    const inactive = new Error("Only an active signed artifact link can be rotated.");
    inactive.status = 409;
    throw inactive;
  }
  if (!access.exportEvent?.artifactMetadata) {
    const unavailable = new Error("Approval artifact is not ready for this export request.");
    unavailable.status = 404;
    throw unavailable;
  }

  const accessToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(Date.now() + await getPersistedAdminExportArtifactAccessTtlMs());
  const [rotatedOldAccess, newAccess] = await prisma.$transaction([
    prisma.adminExportArtifactAccess.update({
      where: { id: access.id },
      data: {
        status: "rotated",
        revokedAt: now,
        revokedByUserId: persistedActorUserId(session),
        revokedReason: actionReason,
        rotatedAt: now,
        rotationReason: actionReason,
      },
      include: { requestedBy: true, revokedBy: true },
    }),
    prisma.adminExportArtifactAccess.create({
      data: {
        exportEventId: access.exportEventId,
        tokenHash: hashToken(accessToken),
        status: "active",
        requestedByUserId: persistedActorUserId(session),
        requestedByRole: session.role,
        reason: actionReason,
        expiresAt,
        rotatedFromAccessId: access.id,
        rotationReason: actionReason,
        ipAddress: getRequestIpAddress(request),
        userAgent: getRequestUserAgent(request),
      },
      include: { requestedBy: true, revokedBy: true },
    }),
  ]);

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "export_artifact_access_rotated",
    targetType: "admin_export_artifact",
    targetId: access.exportEventId,
    field: "signed_access",
    reason: actionReason,
    status: "logged",
    metadata: {
      oldAccessId: access.id,
      newAccessId: newAccess.id,
      newExpiresAt: expiresAt.toISOString(),
      containsPii: false,
    },
    request,
  });

  return {
    previousAccess: mapAdminExportArtifactAccessForClient(rotatedOldAccess),
    access: {
      ...mapAdminExportArtifactAccessForClient(newAccess),
      signedArtifactUrl: `${getRequestOrigin(request)}/api/admin/exports/${access.exportEventId}/artifact?token=${accessToken}`,
    },
    event,
  };
}

export async function createPersistedAdminExportArtifactAccess({ session, exportEventId, reason, request }) {
  if (!hasSecuritySession(session)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  assertDatabaseConfigured();
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }

  const prisma = await getPrisma();
  const exportEvent = await prisma.adminExportEvent.findUnique({
    where: { id: String(exportEventId || "") },
    include: { auditLog: true },
  });
  if (!exportEvent) {
    const notFound = new Error("Export request was not found.");
    notFound.status = 404;
    throw notFound;
  }
  if (!exportEvent.artifactMetadata) {
    const unavailable = new Error("Approval artifact is not ready for this export request.");
    unavailable.status = 404;
    throw unavailable;
  }

  const accessToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + await getPersistedAdminExportArtifactAccessTtlMs());
  const access = await prisma.adminExportArtifactAccess.create({
    data: {
      exportEventId: exportEvent.id,
      tokenHash: hashToken(accessToken),
      status: "active",
      requestedByUserId: persistedActorUserId(session),
      requestedByRole: session.role,
      reason: actionReason,
      expiresAt,
      ipAddress: getRequestIpAddress(request),
      userAgent: getRequestUserAgent(request),
    },
  });

  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "export_artifact_access_granted",
    targetType: "admin_export_artifact",
    targetId: exportEvent.id,
    field: "signed_access",
    reason: actionReason,
    status: "logged",
    metadata: {
      accessId: access.id,
      expiresAt: expiresAt.toISOString(),
      containsPii: false,
    },
    request,
  });

  return {
    access: {
      id: access.id,
      status: access.status,
      expiresAt: expiresAt.toISOString(),
      signedArtifactUrl: `${getRequestOrigin(request)}/api/admin/exports/${exportEvent.id}/artifact?token=${accessToken}`,
    },
    event,
  };
}

function auditSessionFromArtifactAccess(access) {
  return {
    id: access.requestedBy?.id || access.requestedByUserId || undefined,
    email: access.requestedBy?.email || "artifact-access@lajoo.internal",
    role: access.requestedByRole || "compliance",
    source: access.requestedByUserId ? "database" : "artifact_access",
  };
}

export async function getPersistedAdminExportArtifact({ exportEventId, token, request }) {
  assertDatabaseConfigured();
  const tokenHash = hashToken(token);
  if (!token || tokenHash === hashToken("")) {
    const error = new Error("Signed artifact access token required.");
    error.status = 401;
    throw error;
  }

  const prisma = await getPrisma();
  const access = await prisma.adminExportArtifactAccess.findUnique({
    where: { tokenHash },
    include: {
      requestedBy: { include: { roleAssignments: true } },
      exportEvent: { include: { auditLog: true } },
    },
  });
  if (!access || access.exportEventId !== String(exportEventId || "")) {
    const invalid = new Error("Signed artifact access token is invalid.");
    invalid.status = 401;
    throw invalid;
  }
  const auditSession = auditSessionFromArtifactAccess(access);
  const accessState = getAdminExportArtifactAccessState(access);
  if (accessState === "inactive") {
    await recordPersistedAdminAuditEvent({
      session: auditSession,
      action: "export_artifact_access_denied",
      targetType: "admin_export_artifact",
      targetId: access.exportEventId,
      field: "signed_access",
      reason: access.reason,
      status: "blocked",
      metadata: { accessId: access.id, accessStatus: access.status },
      request,
    });
    const inactive = new Error("Signed artifact access token is no longer active.");
    inactive.status = 401;
    throw inactive;
  }
  if (accessState === "expired") {
    await prisma.adminExportArtifactAccess.update({
      where: { id: access.id },
      data: { status: "expired" },
    });
    await recordPersistedAdminAuditEvent({
      session: auditSession,
      action: "export_artifact_access_expired",
      targetType: "admin_export_artifact",
      targetId: access.exportEventId,
      field: "signed_access",
      reason: access.reason,
      status: "blocked",
      metadata: { accessId: access.id, expiresAt: access.expiresAt.toISOString() },
      request,
    });
    const expired = new Error("Signed artifact access token expired.");
    expired.status = 410;
    throw expired;
  }

  const exportEvent = access.exportEvent;
  if (!exportEvent?.artifactMetadata) {
    const unavailable = new Error("Approval artifact is not ready for this export request.");
    unavailable.status = 404;
    throw unavailable;
  }

  await prisma.adminExportArtifactAccess.update({
    where: { id: access.id },
    data: {
      accessedAt: new Date(),
      lastAccessedIpAddress: getRequestIpAddress(request),
      lastAccessedUserAgent: getRequestUserAgent(request),
    },
  });
  await recordPersistedAdminAuditEvent({
    session: auditSession,
    action: "export_artifact_download",
    targetType: "admin_export_artifact",
    targetId: exportEvent.id,
    field: "download",
    reason: access.reason,
    status: "logged",
    metadata: {
      accessId: access.id,
      containsPii: false,
    },
    request,
  });

  return {
    fileName: `lajoo-admin-export-artifact-${exportEvent.id}.json`,
    artifact: exportEvent.artifactMetadata,
  };
}

function incrementSummaryCounter(target, key) {
  const normalized = String(key || "not_captured").trim() || "not_captured";
  target[normalized] = (target[normalized] || 0) + 1;
}

function numericValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getTechProviderLabel(category, row = {}) {
  if (category === "paymentWebhooks") return row.provider || "unknown";
  if (category === "insurerAdapters") return row.insurerCode || row.adapterName || "unknown";
  if (category === "openAiUsage") return row.model || "unknown";
  if (category === "jobQueue") return row.queueName || "default";
  if (category === "cronReminders") return row.cronName || "unknown";
  return "unknown";
}

function getTechStatusValue(category, row = {}) {
  if (category === "paymentWebhooks") return row.eventStatus || "unknown";
  return row.status || "unknown";
}

function isTechFailureStatus(status = "") {
  return ["failed", "error", "blocked", "rejected", "timeout"].includes(String(status || "").trim().toLowerCase());
}

function percentile(values = [], percentileRank = 0.95) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileRank) - 1));
  return Math.round(sorted[index]);
}

function dateBucket(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "unknown";
  return date.toISOString().slice(0, 10);
}

function ensureSloTrendBucket(buckets, date) {
  if (!buckets[date]) {
    buckets[date] = {
      date,
      total: 0,
      errorCount: 0,
      retryCount: 0,
      latencyTotal: 0,
      latencyCount: 0,
      latencyValues: [],
      errorClassCounts: {},
    };
  }
  return buckets[date];
}

function finalizeSloTrendBucket(bucket) {
  const errorRate = bucket.total ? Math.round((bucket.errorCount / bucket.total) * 1000) / 10 : 0;
  const retryRate = bucket.total ? Math.round((bucket.retryCount / bucket.total) * 1000) / 10 : 0;
  return {
    date: bucket.date,
    total: bucket.total,
    errorCount: bucket.errorCount,
    retryCount: bucket.retryCount,
    errorRate,
    retryRate,
    uptimePercent: bucket.total ? Math.max(0, Math.round((1 - (bucket.errorCount / bucket.total)) * 1000) / 10) : 100,
    avgLatencyMs: bucket.latencyCount ? Math.round(bucket.latencyTotal / bucket.latencyCount) : null,
    latencyP50Ms: percentile(bucket.latencyValues, 0.5),
    latencyP95Ms: percentile(bucket.latencyValues, 0.95),
    errorClassCounts: bucket.errorClassCounts,
  };
}

function summarizeAdminTechLogRows(category, rows = []) {
  const summary = {
    category,
    total: rows.length,
    systemCount: 0,
    mockCount: 0,
    errorCount: 0,
    successCount: 0,
    avgLatencyMs: null,
    latencyP50Ms: null,
    latencyP95Ms: null,
    maxRetryCount: 0,
    retryRate: 0,
    errorRate: 0,
    uptimePercent: 100,
    providerCounts: {},
    environmentCounts: {},
    sourceCounts: {},
    statusCounts: {},
    errorClassCounts: {},
    incidentTrend: [],
    incidentTrendCounts: {},
    sloTrend: [],
    latencyTrend: [],
    retryTrend: [],
    errorClassTrend: [],
  };
  let latencyTotal = 0;
  let latencyCount = 0;
  const latencyValues = [];
  let retriedRows = 0;
  const sloTrendBuckets = {};
  for (const row of rows) {
    const bucket = ensureSloTrendBucket(sloTrendBuckets, dateBucket(row.createdAt));
    bucket.total += 1;
    const source = row.source || "unknown";
    if (source === "mock" || source === "placeholder") summary.mockCount += 1;
    else summary.systemCount += 1;
    incrementSummaryCounter(summary.sourceCounts, source);
    incrementSummaryCounter(summary.providerCounts, getTechProviderLabel(category, row));
    incrementSummaryCounter(summary.environmentCounts, row.providerEnvironment || row.environment || "not_captured");
    const status = getTechStatusValue(category, row);
    incrementSummaryCounter(summary.statusCounts, status);
    const failed = Boolean(row.errorClass) || isTechFailureStatus(status);
    if (failed) {
      summary.errorCount += 1;
      incrementSummaryCounter(summary.errorClassCounts, row.errorClass || status);
      incrementSummaryCounter(summary.incidentTrendCounts, dateBucket(row.createdAt));
      bucket.errorCount += 1;
      incrementSummaryCounter(bucket.errorClassCounts, row.errorClass || status);
    } else {
      summary.successCount += 1;
    }
    const latency = numericValue(row.latencyMs);
    if (latency !== null) {
      latencyTotal += latency;
      latencyCount += 1;
      latencyValues.push(latency);
      bucket.latencyTotal += latency;
      bucket.latencyCount += 1;
      bucket.latencyValues.push(latency);
    }
    const retryCount = numericValue(row.retryCount ?? row.attempts);
    if (retryCount !== null) {
      summary.maxRetryCount = Math.max(summary.maxRetryCount, retryCount);
      if (retryCount > 0) {
        retriedRows += 1;
        bucket.retryCount += 1;
      }
    }
  }
  summary.avgLatencyMs = latencyCount ? Math.round(latencyTotal / latencyCount) : null;
  summary.latencyP50Ms = percentile(latencyValues, 0.5);
  summary.latencyP95Ms = percentile(latencyValues, 0.95);
  summary.errorRate = summary.total ? Math.round((summary.errorCount / summary.total) * 1000) / 10 : 0;
  summary.retryRate = summary.total ? Math.round((retriedRows / summary.total) * 1000) / 10 : 0;
  summary.uptimePercent = summary.total ? Math.max(0, Math.round((1 - (summary.errorCount / summary.total)) * 1000) / 10) : 100;
  summary.incidentTrend = Object.entries(summary.incidentTrendCounts)
    .map(([date, count]) => ({ date, count }))
    .sort((left, right) => left.date.localeCompare(right.date));
  summary.sloTrend = Object.values(sloTrendBuckets)
    .map(finalizeSloTrendBucket)
    .sort((left, right) => left.date.localeCompare(right.date));
  summary.latencyTrend = summary.sloTrend.map((bucket) => ({
    date: bucket.date,
    avgLatencyMs: bucket.avgLatencyMs,
    latencyP50Ms: bucket.latencyP50Ms,
    latencyP95Ms: bucket.latencyP95Ms,
  }));
  summary.retryTrend = summary.sloTrend.map((bucket) => ({
    date: bucket.date,
    retryCount: bucket.retryCount,
    retryRate: bucket.retryRate,
  }));
  summary.errorClassTrend = summary.sloTrend
    .flatMap((bucket) => Object.entries(bucket.errorClassCounts || {}).map(([errorClass, count]) => ({
      date: bucket.date,
      errorClass,
      count,
    })))
    .sort((left, right) => left.date.localeCompare(right.date) || left.errorClass.localeCompare(right.errorClass));
  return summary;
}

function sortedCounterKeys(counter = {}) {
  return Object.keys(counter).sort((left, right) => left.localeCompare(right));
}

export function getAdminProviderObservabilityWiring() {
  return {
    paymentWebhooks: {
      status: "wired",
      source: "system",
      path: "/api/payment/webhook/[provider]",
      note: "Payment webhook route records sanitized DB-backed admin payment logs when invoked.",
    },
    insurerAdapters: {
      status: "wired",
      source: "system",
      path: "src/lib/insurerGateway.js",
      note: "Insurer gateway and direct adapter factory record sanitized adapter success/failure logs.",
    },
    openAiUsage: {
      status: "wired",
      source: "system",
      path: "src/app/api/chat/route.js",
      note: "Chat and semantic search paths record sanitized OpenAI usage/error metadata without raw prompts.",
    },
    jobQueue: {
      status: "wrapper_ready",
      source: "placeholder",
      path: "src/server/admin/adminOperationalJobPlaceholders.js",
      note: "Queue logging helpers are ready; no production queue handler is claimed live.",
    },
    cronReminders: {
      status: "wired_for_admin_cron",
      source: "system",
      path: "/api/admin/cron/*",
      note: "Admin cron routes persist scheduled job attempts and cron execution alerts; customer reminder cron remains placeholder until a real handler exists.",
    },
  };
}

export function summarizeAdminTechLogsForClient(techLogs = {}) {
  const categories = {
    paymentWebhooks: summarizeAdminTechLogRows("paymentWebhooks", techLogs.paymentWebhooks || []),
    insurerAdapters: summarizeAdminTechLogRows("insurerAdapters", techLogs.insurerAdapters || []),
    openAiUsage: summarizeAdminTechLogRows("openAiUsage", techLogs.openAiUsage || []),
    jobQueue: summarizeAdminTechLogRows("jobQueue", techLogs.jobQueue || []),
    cronReminders: summarizeAdminTechLogRows("cronReminders", techLogs.cronReminders || []),
  };
  const allSummaries = Object.values(categories);
  const merged = {
    providers: new Set(),
    environments: new Set(),
    sources: new Set(),
    statuses: new Set(),
    errorClasses: new Set(),
  };
  for (const summary of allSummaries) {
    sortedCounterKeys(summary.providerCounts).forEach((value) => merged.providers.add(value));
    sortedCounterKeys(summary.environmentCounts).forEach((value) => merged.environments.add(value));
    sortedCounterKeys(summary.sourceCounts).forEach((value) => merged.sources.add(value));
    sortedCounterKeys(summary.statusCounts).forEach((value) => merged.statuses.add(value));
    sortedCounterKeys(summary.errorClassCounts).forEach((value) => merged.errorClasses.add(value));
  }
  return {
    generatedAt: new Date().toISOString(),
    categories,
    totals: {
      rows: allSummaries.reduce((total, summary) => total + summary.total, 0),
      systemRows: allSummaries.reduce((total, summary) => total + summary.systemCount, 0),
      mockRows: allSummaries.reduce((total, summary) => total + summary.mockCount, 0),
      errorRows: allSummaries.reduce((total, summary) => total + summary.errorCount, 0),
    },
    filters: {
      providers: ["all", ...Array.from(merged.providers)],
      environments: ["all", ...Array.from(merged.environments)],
      sources: ["all", ...Array.from(merged.sources)],
      statuses: ["all", ...Array.from(merged.statuses)],
      errorClasses: ["all", ...Array.from(merged.errorClasses)],
    },
    redaction: {
      containsSecrets: false,
      containsRawPayloads: false,
      containsRawPrompts: false,
      containsRawPii: false,
    },
    wiring: getAdminProviderObservabilityWiring(),
  };
}

async function ensureMockAdminTechLogs(prisma) {
  const [paymentCount, adapterCount, openAiCount, jobCount, cronCount] = await Promise.all([
    prisma.adminPaymentWebhookLog.count(),
    prisma.adminInsurerAdapterLog.count(),
    prisma.adminOpenAiUsageLog.count(),
    prisma.adminJobQueueLog.count(),
    prisma.adminCronReminderLog.count(),
  ]);

  await Promise.all([
    paymentCount
      ? null
      : prisma.adminPaymentWebhookLog.createMany({
          data: fallbackTechLogs.paymentWebhooks.map((row) => ({ ...row, createdAt: new Date(row.createdAt) })),
          skipDuplicates: true,
        }),
    adapterCount
      ? null
      : prisma.adminInsurerAdapterLog.createMany({
          data: fallbackTechLogs.insurerAdapters.map((row) => ({ ...row, createdAt: new Date(row.createdAt) })),
          skipDuplicates: true,
        }),
    openAiCount
      ? null
      : prisma.adminOpenAiUsageLog.createMany({
          data: fallbackTechLogs.openAiUsage.map((row) => ({ ...row, createdAt: new Date(row.createdAt) })),
          skipDuplicates: true,
        }),
    jobCount
      ? null
      : prisma.adminJobQueueLog.createMany({
          data: fallbackTechLogs.jobQueue.map((row) => ({
            ...row,
            createdAt: new Date(row.createdAt),
            scheduledFor: row.scheduledFor ? new Date(row.scheduledFor) : null,
            startedAt: row.startedAt ? new Date(row.startedAt) : null,
            finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
          })),
          skipDuplicates: true,
        }),
    cronCount
      ? null
      : prisma.adminCronReminderLog.createMany({
          data: fallbackTechLogs.cronReminders.map((row) => ({
            ...row,
            createdAt: new Date(row.createdAt),
            scheduledFor: row.scheduledFor ? new Date(row.scheduledFor) : null,
            startedAt: row.startedAt ? new Date(row.startedAt) : null,
            finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
          })),
          skipDuplicates: true,
        }),
  ]);
}

export async function listPersistedAdminTechLogs() {
  if (!process.env.DATABASE_URL) {
    return { techLogs: fallbackTechLogs, observability: summarizeAdminTechLogsForClient(fallbackTechLogs), persisted: false };
  }

  try {
    const prisma = await getPrisma();
    await ensureMockAdminTechLogs(prisma);
    const [paymentWebhooks, insurerAdapters, openAiUsage, jobQueue, cronReminders] = await Promise.all([
      prisma.adminPaymentWebhookLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.adminInsurerAdapterLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.adminOpenAiUsageLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.adminJobQueueLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.adminCronReminderLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    const techLogs = {
      paymentWebhooks: paymentWebhooks.map(normalizeTechLogDates),
      insurerAdapters: insurerAdapters.map(normalizeTechLogDates),
      openAiUsage: openAiUsage.map(normalizeTechLogDates),
      jobQueue: jobQueue.map(normalizeTechLogDates),
      cronReminders: cronReminders.map(normalizeTechLogDates),
    };
    return {
      techLogs,
      observability: summarizeAdminTechLogsForClient(techLogs),
      persisted: true,
    };
  } catch (error) {
    if (!isAdminDatabaseUnavailable(error)) throw error;
    return { techLogs: fallbackTechLogs, observability: summarizeAdminTechLogsForClient(fallbackTechLogs), persisted: false };
  }
}

export async function recordPersistedAdminAuditEvent({
  session,
  action,
  targetType,
  targetId,
  field,
  reason,
  status = "logged",
  metadata = {},
  request,
}) {
  const normalizedAction = action || "admin_action";
  const actorRole = normalizeAdminRole(session?.role || "founder");
  const data = {
    actorUserId: persistedActorUserId(session),
    actorEmail: session?.email || "unknown@lajoo.my",
    actorRole,
    action: normalizedAction,
    targetType: targetType || "unknown",
    targetId: targetId || "unknown",
    field: field || "record",
    reason: String(reason || "").trim(),
    status,
    ipAddress: getRequestIpAddress(request),
    userAgent: getRequestUserAgent(request),
    metadata,
  };

  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      const log = await prisma.adminAuditLog.create({ data });

      if (normalizedAction === "reveal_pii") {
        await prisma.piiRevealEvent.create({
          data: {
            auditLogId: log.id,
            actorUserId: data.actorUserId,
            actorRole,
            targetType: data.targetType,
            targetId: data.targetId,
            field: data.field,
            reason: data.reason,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            metadata,
          },
        });
      }

      if (normalizedAction === "export_data" || normalizedAction === "export_blocked") {
        await prisma.adminExportEvent.create({
          data: {
            auditLogId: log.id,
            actorUserId: data.actorUserId,
            actorRole,
            targetType: data.targetType,
            targetId: data.targetId,
            field: data.field,
            reason: data.reason,
            status,
            exportKind: metadata?.mock ? "mock" : "unknown",
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            metadata,
          },
        });
      }

      return mapAdminAuditLogForClient(log);
    } catch (error) {
      if (!isAdminDatabaseUnavailable(error)) throw error;
    }
  }

  return mapAdminAuditLogForClient({
    id: `audit-fallback-${Date.now()}`,
    ...data,
    createdAt: new Date(),
    mode: "mock",
  });
}

export function getRolePermissionMatrixFromDefinitions() {
  return ADMIN_ROLES.map((role) => ({
    role,
    label: ROLE_DEFINITIONS[role].label,
    description: ROLE_DEFINITIONS[role].description,
    permissions: getPermissionsForRole(role),
    canExport: canExportAdminData(role),
  }));
}
