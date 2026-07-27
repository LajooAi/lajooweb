import {
  getAdminSecurityMetrics,
  getFallbackAdminUsers,
  getPersistedAdminAuditWorkload,
  getPersistedAdminAuditSlaTrends,
  getPersistedAdminExportArtifactPolicy,
  getPersistedAdminInviteEmailStatus,
  getRolePermissionMatrixFromDefinitions,
  listPersistedAdminAuditEscalationQueues,
  listPersistedAdminExportEvents,
  listPersistedAdminAuditLogs,
  listPersistedAdminMfaRecoveryRequests,
  listPersistedAdminNotificationDigestEvents,
  listPersistedAdminNotificationDigestJobAttempts,
  listPersistedAdminNotificationPreferences,
  listPersistedAdminCronExecutionAlerts,
  listPersistedAdminScheduledJobAttempts,
  listPersistedAdminSessions,
  listPersistedAdminTechLogs,
  listPersistedAdminUsers,
} from "./adminPersistence.js";
import { getAdminOperationalJobReadiness } from "./adminOperationalJobPlaceholders.js";
import {
  getMockRenewalOpsSensitiveValue,
  getPersistedRenewalOpsData,
} from "./adminRenewalOps.js";
import { getPersistedComplianceLaunchGateData } from "./adminComplianceGate.js";
import { getPersistedCustomerLaunchQaData } from "./adminCustomerLaunchQa.js";
import { maskSensitiveAdminValue } from "../../lib/admin/piiMasking.js";
import { getPersistedAdminPaymentLaunchData } from "../payment/paymentLaunchReadiness.js";

const nowLabel = "19 Jun 2026";

const RENEWAL_REQUESTS = [
  {
    id: "QR-1028",
    customerName: "Nur Aisyah Rahman",
    ic: "920418-14-5582",
    email: "aisyah.rahman@example.com",
    phone: "+60 12 448 7789",
    address: "No. 18, Jalan SS 2/24, Petaling Jaya, Selangor",
    vehicle: "Honda City 1.5V",
    plate: "VBP 8124",
    insurer: "Etiqa",
    premium: "RM 1,248.40",
    roadTax: "Selected",
    status: "quote_review",
    owner: "Ops Lead",
    updatedAt: "2026-06-19T01:55:00.000Z",
  },
  {
    id: "QR-1027",
    customerName: "Daniel Tan",
    ic: "880907-10-2194",
    email: "daniel.tan@example.com",
    phone: "+60 17 620 4412",
    address: "Block B, Jalan Kiara 3, Kuala Lumpur",
    vehicle: "Toyota Vios 1.5G",
    plate: "WXY 6148",
    insurer: "Allianz",
    premium: "RM 1,036.80",
    roadTax: "Declined",
    status: "payment_pending",
    owner: "Finance",
    updatedAt: "2026-06-18T13:20:00.000Z",
  },
  {
    id: "QR-1025",
    customerName: "Siti Mariam",
    ic: "951012-08-7640",
    email: "siti.mariam@example.com",
    phone: "+60 13 775 9021",
    address: "Jalan Tun Razak, Johor Bahru, Johor",
    vehicle: "Perodua Myvi AV",
    plate: "JRF 2208",
    insurer: "Lonpac",
    premium: "RM 812.50",
    roadTax: "Selected",
    status: "support_needed",
    owner: "Support",
    updatedAt: "2026-06-18T08:05:00.000Z",
  },
];

const PII_FIELD_TYPES = {
  ic: "ic",
  email: "email",
  phone: "phone",
  address: "address",
};

function maskRenewalRequest(record) {
  return {
    ...record,
    ic: maskSensitiveAdminValue(record.ic, "ic"),
    email: maskSensitiveAdminValue(record.email, "email"),
    phone: maskSensitiveAdminValue(record.phone, "phone"),
    address: maskSensitiveAdminValue(record.address, "address"),
    sensitiveFields: PII_FIELD_TYPES,
  };
}

export function getMockTeamMembers() {
  return getFallbackAdminUsers();
}

export function getRolePermissionMatrix() {
  return getRolePermissionMatrixFromDefinitions();
}

export async function getBusinessAdminData(session) {
  const [{ logs, persisted }, paymentLaunch, renewalOps, customerLaunchQa] = await Promise.all([
    listPersistedAdminAuditLogs({ limit: 6 }),
    getPersistedAdminPaymentLaunchData({ session }),
    getPersistedRenewalOpsData({ session }),
    getPersistedCustomerLaunchQaData({ session }),
  ]);
  const paymentMetrics = paymentLaunch?.metrics || {};
  const renewalMetrics = renewalOps?.metrics || {};
  const qaSummary = customerLaunchQa?.summary || {};
  return {
    generatedAt: nowLabel,
    dataMode: renewalOps?.persisted && customerLaunchQa?.persisted ? "Persisted renewal ops + launch QA" : renewalOps?.persisted ? "Persisted renewal ops" : persisted ? "Persisted audit + mock ops" : "Mock fallback",
    dataModeDetail: renewalOps?.persisted && customerLaunchQa?.persisted
      ? "Renewal ops, customer launch QA, audit logs, and payment readiness queues are database-backed where migrations are applied. Rows marked mock/demo are not live insurer activity."
      : renewalOps?.persisted
      ? "Renewal ops, audit logs, and payment readiness queues are database-backed where migrations are applied. Customer launch QA uses fallback rows until the Phase 17 migration is applied."
      : paymentLaunch?.persisted
      ? "Audit logs and payment readiness queues are database-backed. Renewal ops uses manual/mock fallback rows until the Phase 15 migration is applied."
      : persisted
        ? "Audit logs are database-backed. Payment readiness uses fallback rows until the Phase 14 migration is applied."
        : "Database audit tables unavailable; admin logs are mock fallback.",
    metrics: [
      { label: "Renewal pipeline", value: `RM ${Number(renewalMetrics.grossPremium || 0).toFixed(2)}`, detail: `${renewalMetrics.activeCases ?? 0} active cases`, tone: "blue" },
      { label: "Quotes waiting", value: String(renewalMetrics.quoteWaiting ?? 0), detail: `${renewalMetrics.manualSubmissions ?? 0} manual insurer submissions`, tone: "amber" },
      { label: "Payment reviews", value: String(paymentMetrics.manualReview ?? 0), detail: `${paymentMetrics.openExceptions ?? 0} exception records`, tone: "red" },
      { label: "Policy docs queue", value: String(renewalMetrics.policyDocumentsPending ?? 0), detail: "Customer release remains blocked", tone: "green" },
      { label: "Launch QA blockers", value: String(qaSummary.blockerCount ?? 0), detail: `${qaSummary.coveragePercent ?? 0}% checklist coverage`, tone: qaSummary.launchReady ? "green" : "red" },
    ],
    renewalOps,
    customerLaunchQa,
    renewalRequests: RENEWAL_REQUESTS.map(maskRenewalRequest),
    paymentEvents: [
      { id: "PAY-8831", method: "FPX", amount: "RM 1,248.40", status: "awaiting_provider", customerRef: "QR-1028" },
      { id: "PAY-8829", method: "Card", amount: "RM 1,036.80", status: "failed_mock", customerRef: "QR-1027" },
      { id: "PAY-8824", method: "E-wallet", amount: "RM 812.50", status: "manual_follow_up", customerRef: "QR-1025" },
    ],
    paymentLaunch,
    supportInbox: [
      { id: "SUP-441", topic: "Change insurer after quote", priority: "high", age: "14m", owner: "Ops" },
      { id: "SUP-438", topic: "Road tax delivery area check", priority: "medium", age: "1h", owner: "Support" },
      { id: "SUP-433", topic: "Payment proof review", priority: "medium", age: "2h", owner: "Finance" },
    ],
    auditLogs: logs,
  };
}

export async function getAiKnowledgeAdminData(session) {
  const [{ logs, persisted }, customerLaunchQa] = await Promise.all([
    listPersistedAdminAuditLogs({ limit: 6 }),
    getPersistedCustomerLaunchQaData({ session }),
  ]);
  const qaSummary = customerLaunchQa?.summary || {};
  return {
    generatedAt: nowLabel,
    dataMode: persisted && customerLaunchQa?.persisted ? "Persisted audit + launch QA" : persisted ? "Persisted audit + mock AI queues" : "Mock fallback",
    dataModeDetail: persisted && customerLaunchQa?.persisted ? "Audit logs and customer launch QA records are database-backed. AI review queues are demo data." : persisted ? "Audit logs are database-backed. AI review queues are demo data." : "Database audit tables unavailable; AI admin logs are mock fallback.",
    metrics: [
      { label: "AI review queue", value: "27", detail: "9 high-priority answers", tone: "amber" },
      { label: "Wrong answer queue", value: "4", detail: "Needs prompt or fact fix", tone: "red" },
      { label: "Golden eval pass", value: "91%", detail: "Last mock eval run", tone: "green" },
      { label: "Facts expiring", value: "12", detail: "Within 30 days", tone: "blue" },
      { label: "Stuck-flow QA", value: String(qaSummary.stuckFlowBlockers ?? 0), detail: "Open launch QA blockers", tone: qaSummary.stuckFlowBlockers ? "red" : "green" },
    ],
    customerLaunchQa,
    reviewQueue: [
      {
        id: "CONV-7742",
        userQuestion: "Can I switch from Allianz to Etiqa after selecting add-ons?",
        category: "flow_flexibility",
        status: "needs_review",
        sourceTrace: "quote-flow-policy-v3",
        reviewer: "AI QA",
      },
      {
        id: "CONV-7739",
        userQuestion: "Is windscreen cover included for my Honda City?",
        category: "coverage_fact",
        status: "wrong_answer",
        sourceTrace: "etiqa-pds-2026",
        reviewer: "Unassigned",
      },
      {
        id: "CONV-7731",
        userQuestion: "What happens if I do not renew road tax today?",
        category: "compliance",
        status: "pending_source",
        sourceTrace: "road-tax-guide",
        reviewer: "Compliance",
      },
    ],
    approvedFacts: [
      {
        id: "FACT-1182",
        insurer: "Etiqa",
        title: "Windscreen cover is optional unless specified in quote add-ons.",
        status: "verified",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-12-31",
        source: "Product Disclosure Sheet",
      },
      {
        id: "FACT-1174",
        insurer: "Allianz",
        title: "Flood cover requires add-on selection and premium recalculation.",
        status: "verified",
        effectiveFrom: "2025-11-01",
        effectiveTo: "2026-10-31",
        source: "Policy wording PDF",
      },
      {
        id: "FACT-1159",
        insurer: "Lonpac",
        title: "NCD follows vehicle owner eligibility and insurer validation.",
        status: "needs_dates",
        effectiveFrom: "Not approved",
        effectiveTo: "Not approved",
        source: "Imported PDF chunk",
      },
    ],
    promptPolicies: [
      { id: "POL-01", name: "No policy issuance claim", status: "active", owner: "Founder" },
      { id: "POL-02", name: "Source trace required for insurer facts", status: "active", owner: "AI QA" },
      { id: "POL-03", name: "Escalate payment uncertainty", status: "active", owner: "Compliance" },
    ],
    auditLogs: logs,
  };
}

export async function getSecurityAccessAdminData(session) {
  const [
    { users, persisted: usersPersisted },
    { logs, persisted: logsPersisted },
    { sessions, persisted: sessionsPersisted },
    { exportEvents, persisted: exportsPersisted },
    { recoveryRequests, persisted: recoveryPersisted },
    { queues: auditEscalationQueues, persisted: queuePersisted },
    { notificationPreferences, persisted: notificationPersisted },
    { digestEvents, persisted: digestPersisted },
    { digestJobAttempts, schedulerReadiness, persisted: digestJobPersisted },
    { scheduledJobAttempts, retryDrilldowns, schedulerReadiness: scheduledWorkflowReadiness, persisted: scheduledJobsPersisted },
    { cronExecutionAlerts, cronExecutionAlertSummary, persisted: cronAlertsPersisted },
    auditWorkload,
    auditSlaTrends,
    exportArtifactPolicy,
    complianceLaunchGate,
    customerLaunchQa,
    metrics,
    emailProviderStatus,
  ] = await Promise.all([
    listPersistedAdminUsers(),
    listPersistedAdminAuditLogs({ limit: 12 }),
    listPersistedAdminSessions(),
    listPersistedAdminExportEvents({ limit: 20 }),
    listPersistedAdminMfaRecoveryRequests({ limit: 20 }),
    listPersistedAdminAuditEscalationQueues({ session, limit: 6 }),
    listPersistedAdminNotificationPreferences({ session }),
    listPersistedAdminNotificationDigestEvents({ session, limit: 8 }),
    listPersistedAdminNotificationDigestJobAttempts({ session, limit: 8 }),
    listPersistedAdminScheduledJobAttempts({ session, limit: 10 }),
    listPersistedAdminCronExecutionAlerts({ session, limit: 20 }),
    getPersistedAdminAuditWorkload({ session }),
    getPersistedAdminAuditSlaTrends({ session, days: 14 }),
    getPersistedAdminExportArtifactPolicy({ session }),
    getPersistedComplianceLaunchGateData({ session }),
    getPersistedCustomerLaunchQaData({ session }),
    getAdminSecurityMetrics(),
    getPersistedAdminInviteEmailStatus(),
  ]);
  const persisted = usersPersisted && logsPersisted && sessionsPersisted && exportsPersisted && recoveryPersisted && queuePersisted && notificationPersisted && digestPersisted && digestJobPersisted && scheduledJobsPersisted && cronAlertsPersisted && metrics.persisted && complianceLaunchGate?.persisted && customerLaunchQa?.persisted;
  const complianceSummary = complianceLaunchGate?.summary || {};
  const qaSummary = customerLaunchQa?.summary || {};
  return {
    generatedAt: nowLabel,
    dataMode: persisted ? "Persisted admin security" : "Mock fallback",
    dataModeDetail: persisted
      ? "Admin users, role assignments, sessions, reveal logs, export requests, and admin actions are database-backed."
      : "Database admin tables unavailable or pending migration; security data is using fallback mock rows.",
    metrics: [
      { label: "Active admins", value: String(metrics.activeAdmins), detail: persisted ? "Persisted users" : "Fallback users", tone: "blue" },
      { label: "Reveal events", value: String(metrics.revealEvents), detail: persisted ? "Persisted PII reveals" : "Fallback reveals", tone: "amber" },
      { label: "Audit review", value: String(metrics.unreviewedAuditLogs || 0), detail: `${metrics.escalatedAuditLogs || 0} escalated`, tone: "green" },
      { label: "MFA recovery", value: String(metrics.mfaRecoveryRequests || 0), detail: `${metrics.overdueMfaRecoveries || 0} overdue`, tone: "amber" },
      { label: "Exports", value: String(metrics.exportRequests), detail: `${metrics.blockedExports} blocked, ${metrics.revokedArtifactAccesses || 0} revoked links`, tone: "red" },
      { label: "Invite email", value: String(metrics.emailDeliveryEvents || 0), detail: `${metrics.emailWebhookEvents || 0} webhooks, ${emailProviderStatus?.status || "manual_fallback"}`, tone: "blue" },
      { label: "Digests", value: String(metrics.notificationDigests || 0), detail: `${metrics.emailWebhookStatusChecks || 0} webhook checks`, tone: "green" },
      { label: "Cron alerts", value: String(cronExecutionAlertSummary?.active || 0), detail: `${cronExecutionAlertSummary?.highCriticalUnassigned || 0} high/critical unassigned`, tone: "red" },
      { label: "Launch blockers", value: String(complianceSummary.blockerCount || 0), detail: complianceSummary.launchReady ? "Compliance gate ready" : "Legal/PDPA launch gate not ready", tone: complianceSummary.launchReady ? "green" : "red" },
      { label: "Customer QA", value: String(qaSummary.blockerCount || 0), detail: `${qaSummary.uatSignoffStatus || "not_ready"} UAT`, tone: qaSummary.launchReady ? "green" : "red" },
    ],
    complianceLaunchGate,
    customerLaunchQa,
    emailProviderStatus,
    notificationPreferences,
    notificationDigestEvents: digestEvents,
    notificationDigestJobAttempts: digestJobAttempts,
    notificationDigestSchedulerReadiness: schedulerReadiness,
    scheduledJobAttempts,
    scheduledJobRetryDrilldowns: retryDrilldowns,
    scheduledWorkflowReadiness,
    cronExecutionAlerts,
    cronExecutionAlertSummary,
    auditEscalationQueues,
    auditWorkload,
    auditSlaTrends,
    exportArtifactPolicy,
    teamMembers: users,
    sessions,
    mfaRecoveryRequests: recoveryRequests,
    exportEvents,
    roleMatrix: getRolePermissionMatrix(),
    auditLogs: logs,
    piiExamples: [
      { id: "pii-example-ic", field: "IC", value: maskSensitiveAdminValue("920418-14-5582", "ic"), type: "ic" },
      { id: "pii-example-phone", field: "Phone", value: maskSensitiveAdminValue("+60 12 448 7789", "phone"), type: "phone" },
      { id: "pii-example-email", field: "Email", value: maskSensitiveAdminValue("aisyah.rahman@example.com", "email"), type: "email" },
      { id: "pii-example-address", field: "Address", value: maskSensitiveAdminValue("No. 18, Jalan SS 2/24, Petaling Jaya, Selangor", "address"), type: "address" },
    ],
  };
}

export async function getTechAdminData() {
  const [{ techLogs, observability, persisted: techPersisted }, { logs, persisted: logsPersisted }] = await Promise.all([
    listPersistedAdminTechLogs(),
    listPersistedAdminAuditLogs({ limit: 8 }),
  ]);
  const paymentCount = techLogs.paymentWebhooks.length;
  const adapterCount = techLogs.insurerAdapters.length;
  const openAiCount = techLogs.openAiUsage.length;
  const jobCount = techLogs.jobQueue.length + techLogs.cronReminders.length;
  return {
    generatedAt: nowLabel,
    dataMode: techPersisted ? "Persisted tech logs" : "Mock fallback",
    dataModeDetail: techPersisted
      ? "Tech log tables are database-backed. Rows marked system come from wired code paths; mock rows remain labeled mock."
      : "Tech log tables are unavailable or pending migration; rows are fallback mock samples.",
    metrics: [
      { label: "Payment webhooks", value: String(paymentCount), detail: "Provider-agnostic events", tone: "blue" },
      { label: "Insurer adapters", value: String(adapterCount), detail: "No real insurer API yet", tone: "amber" },
      { label: "OpenAI events", value: String(openAiCount), detail: "Usage/error foundation", tone: "green" },
      { label: "Jobs and cron", value: String(jobCount), detail: "Queues/reminders foundation", tone: "red" },
    ],
    operationalJobReadiness: getAdminOperationalJobReadiness(),
    techLogs,
    observability,
    auditLogs: logs,
    auditPersisted: logsPersisted,
  };
}

export function getMockSensitiveAdminValue(targetId, field) {
  const renewalOpsValue = getMockRenewalOpsSensitiveValue(targetId, field);
  if (renewalOpsValue) return renewalOpsValue;

  const renewal = RENEWAL_REQUESTS.find((record) => record.id === targetId);
  if (renewal && PII_FIELD_TYPES[field]) {
    return {
      value: renewal[field],
      type: PII_FIELD_TYPES[field],
      label: `${targetId} ${field}`,
    };
  }

  const examples = {
    "pii-example-ic": { value: "920418-14-5582", type: "ic", label: "PII helper IC example" },
    "pii-example-phone": { value: "+60 12 448 7789", type: "phone", label: "PII helper phone example" },
    "pii-example-email": { value: "aisyah.rahman@example.com", type: "email", label: "PII helper email example" },
    "pii-example-address": {
      value: "No. 18, Jalan SS 2/24, Petaling Jaya, Selangor",
      type: "address",
      label: "PII helper address example",
    },
  };

  return examples[targetId] || null;
}
