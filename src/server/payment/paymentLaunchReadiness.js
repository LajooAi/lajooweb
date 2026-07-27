import { randomUUID } from "node:crypto";
import {
  PAYMENT_PROVIDER_KEYS,
  PAYMENT_PROVIDER_SHELLS,
  PAYMENT_WEBHOOK_EVENT_TYPES,
  PaymentProviderError,
  getPaymentProviderConfig,
  listPaymentProviderShells,
  verifyProviderWebhook,
} from "./paymentProvider.js";
import { PAYMENT_STATUS } from "../../lib/paymentStore.js";
import {
  ADMIN_PERMISSIONS,
  hasAdminPermission,
} from "../admin/adminRoles.js";
import {
  recordPersistedAdminAuditEvent,
  validateAdminActionReason,
} from "../admin/adminPersistence.js";

const RECONCILIATION_STATUSES = new Set(["open", "reviewing", "resolved", "dismissed", "blocked"]);
const RECONCILIATION_PRIORITIES = new Set(["low", "normal", "high", "critical"]);
const EXCEPTION_STATUSES = new Set([
  "open",
  "requested",
  "approved",
  "rejected",
  "submitted_provider",
  "completed",
  "failed",
  "investigating",
  "waiting_provider",
  "resolved",
]);
const EXCEPTION_PRIORITIES = RECONCILIATION_PRIORITIES;
const EXCEPTION_TYPES = new Set([
  "refund_request",
  "manual_refund_review",
  "provider_exception",
  "failed_payment_follow_up",
  "duplicate_payment_review",
]);

export const PAYMENT_RECONCILIATION_ISSUE_TYPES = {
  MATCHED_SUCCESS: "matched_success",
  PENDING_PROVIDER_CONFIRMATION: "pending_provider_confirmation",
  WEBHOOK_UNMATCHED: "webhook_unmatched",
  AMOUNT_MISMATCH: "amount_mismatch",
  DUPLICATE_EVENT: "duplicate_event",
  FAILED_PAYMENT: "failed_payment",
  MANUAL_REVIEW_REQUIRED: "manual_review_required",
};

const PAYMENT_WEBHOOK_SECRET_ENV_BY_PROVIDER = {
  [PAYMENT_PROVIDER_KEYS.MOCK]: [
    "LAJOO_PAYMENT_WEBHOOK_SECRET",
    "PAYMENT_WEBHOOK_SECRET",
    "MOCK_PAYMENT_WEBHOOK_SECRET",
  ],
  [PAYMENT_PROVIDER_KEYS.BILLPLZ]: ["BILLPLZ_X_SIGNATURE_KEY"],
  [PAYMENT_PROVIDER_KEYS.STRIPE]: ["STRIPE_WEBHOOK_SECRET"],
  [PAYMENT_PROVIDER_KEYS.IPAY88]: ["IPAY88_MERCHANT_KEY"],
  [PAYMENT_PROVIDER_KEYS.TOYYIBPAY]: ["TOYYIBPAY_SECRET_KEY"],
};

const PAYMENT_API_ENV_BY_PROVIDER = {
  [PAYMENT_PROVIDER_KEYS.BILLPLZ]: ["BILLPLZ_API_KEY", "BILLPLZ_COLLECTION_ID"],
  [PAYMENT_PROVIDER_KEYS.STRIPE]: ["STRIPE_SECRET_KEY"],
  [PAYMENT_PROVIDER_KEYS.IPAY88]: ["IPAY88_MERCHANT_CODE"],
  [PAYMENT_PROVIDER_KEYS.TOYYIBPAY]: ["TOYYIBPAY_SECRET_KEY", "TOYYIBPAY_CATEGORY_CODE"],
};

if (!globalThis.__lajooAdminPaymentLaunchState) {
  globalThis.__lajooAdminPaymentLaunchState = {
    verificationEvents: [],
    reconciliationItems: [],
    reconciliationEvents: [],
    exceptions: [],
    exceptionEvents: [],
  };
}

const memoryState = globalThis.__lajooAdminPaymentLaunchState;

async function getPrisma() {
  return (await import("../../lib/prisma.js")).default;
}

function shouldUseDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function isPaymentAdminDatabaseUnavailable(error) {
  const code = String(error?.code || "");
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
  ].some((needle) => code.includes(needle) || message.includes(needle));
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

function getProviderEnvironment(env = process.env) {
  return String(env.VERCEL_ENV || env.NODE_ENV || "development").trim().toLowerCase() || "development";
}

function envFlag(env, key) {
  return String(env?.[key] || "").trim().toLowerCase() === "true";
}

function isConfigured(env, key) {
  return Boolean(String(env?.[key] || "").trim());
}

function configuredAny(env, keys = []) {
  return keys.some((key) => isConfigured(env, key));
}

function normalizeProvider(value) {
  return String(value || "mock").trim().toLowerCase() || "mock";
}

function normalizeStatus(value, allowed, fallback) {
  const normalized = String(value || fallback).trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizePriority(value, allowed = RECONCILIATION_PRIORITIES) {
  return normalizeStatus(value, allowed, "normal");
}

function dateToIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function decimalToNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(typeof value?.toString === "function" ? value.toString() : value);
  return Number.isFinite(number) ? number : null;
}

function toMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function persistedActorUserId(session) {
  return session?.source === "database" && session?.id ? session.id : undefined;
}

function canInspectPaymentOperations(session) {
  if (!session?.role) return false;
  return (
    hasAdminPermission(session.role, ADMIN_PERMISSIONS.BUSINESS_ADMIN) ||
    hasAdminPermission(session.role, ADMIN_PERMISSIONS.SECURITY_ACCESS) ||
    hasAdminPermission(session.role, ADMIN_PERMISSIONS.TECH_ADMIN)
  );
}

export function canManagePaymentOperations(session) {
  return ["founder", "ops"].includes(session?.role);
}

export function canApprovePaymentRefunds(session) {
  return session?.role === "founder";
}

function assertPaymentInspectSession(session) {
  if (!canInspectPaymentOperations(session)) {
    const error = new Error("Payment admin permission required.");
    error.status = 403;
    throw error;
  }
}

function assertPaymentManageSession(session) {
  if (!canManagePaymentOperations(session)) {
    const error = new Error("Founder or ops role required for payment operations.");
    error.status = 403;
    throw error;
  }
}

function assertPaymentRefundTransitionAllowed({ session, existing = {}, nextStatus, env = process.env } = {}) {
  const status = String(nextStatus || "").trim();
  const refundLike = existing.exceptionType === "refund_request" ||
    ["requested", "approved", "rejected", "submitted_provider", "completed", "failed"].includes(status);

  if (!refundLike) return;

  if (["approved", "rejected", "submitted_provider", "completed"].includes(status) && !canApprovePaymentRefunds(session)) {
    const error = new Error("Founder approval is required for payment refund decisions.");
    error.status = 403;
    throw error;
  }

  if (status === "submitted_provider" && !envFlag(env, "LAJOO_STRIPE_REFUNDS_ENABLED")) {
    const error = new Error("Provider refund submission is disabled until the refund API is explicitly enabled.");
    error.status = 403;
    throw error;
  }
}

function requireActionReason(reason) {
  const { reason: actionReason, error } = validateAdminActionReason(reason);
  if (error) {
    const reasonError = new Error(error);
    reasonError.status = 400;
    throw reasonError;
  }
  return actionReason;
}

function shouldRedactKey(key) {
  return /secret|token|password|authorization|signature|raw|email|phone|mobile|contact|ic|nric|identity|address|prompt|chat/i.test(key);
}

function redactString(value) {
  let output = String(value || "");
  output = output.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted_email]");
  output = output.replace(/\b\d{6}-?\d{2}-?\d{4}\b/g, "[redacted_ic]");
  output = output.replace(/\+?6?0?1\d[\d\s-]{6,}\d/g, "[redacted_phone]");
  return output.length > 180 ? `${output.slice(0, 180)}...` : output;
}

function sanitizePaymentAdminValue(value, key = "", depth = 0) {
  if (shouldRedactKey(key)) return "[redacted]";
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (depth >= 2) return `[array:${value.length}]`;
    return value.slice(0, 10).map((item) => sanitizePaymentAdminValue(item, key, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= 2) return "[object]";
    return sanitizePaymentAdminPayload(value, depth + 1);
  }
  return String(value);
}

export function sanitizePaymentAdminPayload(payload = {}, depth = 0) {
  if (!payload || typeof payload !== "object") return sanitizePaymentAdminValue(payload);
  const summary = {};
  for (const [key, value] of Object.entries(payload)) {
    summary[key] = sanitizePaymentAdminValue(value, key, depth);
  }
  return summary;
}

export function classifyPaymentLaunchError(error = {}) {
  const text = [
    error?.errorClass,
    error?.code,
    error?.errorCode,
    error?.status,
    error?.statusCode,
    error?.message,
    error?.errorMessage,
  ].filter(Boolean).join(" ").toLowerCase();

  if (!text) return null;
  if (/signature|verify|verification/.test(text)) return "verification_failed";
  if (/shell.only|not implemented|verifier|webhook.*shell/.test(text)) return "verifier_not_implemented";
  if (/config|secret|api key|credential|missing/.test(text)) return "configuration";
  if (/not found|unmatched/.test(text)) return "unmatched_payment";
  if (/amount|mismatch/.test(text)) return "payment_mismatch";
  if (/duplicate|already/.test(text)) return "duplicate_event";
  if (/provider|unavailable|5\d\d|timeout|network/.test(text)) return "provider_error";
  return "unknown";
}

function safeStatusFromEventType(eventType, fallback = "unknown") {
  if (eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED) return "succeeded";
  if (eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_FAILED) return "failed";
  if (eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_PENDING) return "pending";
  if (eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_UNKNOWN) return "unknown";
  return fallback;
}

function getPaymentWebhookSecretEnv(provider) {
  return PAYMENT_WEBHOOK_SECRET_ENV_BY_PROVIDER[normalizeProvider(provider)] || ["PAYMENT_WEBHOOK_SECRET"];
}

function getPaymentApiEnv(provider) {
  return PAYMENT_API_ENV_BY_PROVIDER[normalizeProvider(provider)] || [];
}

function getProviderLabel(provider, config = {}) {
  return config.label || PAYMENT_PROVIDER_SHELLS[provider]?.label || (provider === "mock" ? "Mock/manual" : provider);
}

export function getPaymentProviderReadiness({ env = process.env, origin = "" } = {}) {
  const config = getPaymentProviderConfig(env);
  const provider = normalizeProvider(config.provider || env.LAJOO_PAYMENT_PROVIDER || env.PAYMENT_PROVIDER);
  const shell = PAYMENT_PROVIDER_SHELLS[provider] || null;
  const apiEnv = getPaymentApiEnv(provider);
  const webhookSecretEnv = getPaymentWebhookSecretEnv(provider);
  const requiredEnv = provider === PAYMENT_PROVIDER_KEYS.MOCK
    ? webhookSecretEnv
    : Array.from(new Set([...(shell?.requiredEnv || []), ...webhookSecretEnv]));
  const required = requiredEnv.map((key) => ({
    key,
    configured: isConfigured(env, key),
    category: webhookSecretEnv.includes(key) ? "webhook_secret" : "provider_config",
  }));
  const apiKeyConfigured = provider === PAYMENT_PROVIDER_KEYS.MOCK ? false : configuredAny(env, apiEnv);
  const webhookSecretConfigured = configuredAny(env, webhookSecretEnv);
  const livePaymentsEnabled = Boolean(config.livePaymentsEnabled || (provider === PAYMENT_PROVIDER_KEYS.MOCK && config.paymentAvailable));
  const externalProvider = Boolean(shell);
  const verifierImplemented = [PAYMENT_PROVIDER_KEYS.MOCK, PAYMENT_PROVIDER_KEYS.STRIPE].includes(provider);
  const endpointOrigin = origin || env.NEXT_PUBLIC_APP_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "http://localhost:3000");
  const endpointUrl = `${String(endpointOrigin).replace(/\/$/, "")}/api/payment/webhook/${provider}`;

  let status = "mock_manual";
  if (provider === PAYMENT_PROVIDER_KEYS.DISABLED) status = "disabled";
  else if (provider === PAYMENT_PROVIDER_KEYS.MOCK) status = config.paymentAvailable && webhookSecretConfigured ? "mock_ready" : "mock_manual";
  else if (!config.hasRequiredConfig || !webhookSecretConfigured || !apiKeyConfigured) status = "missing_env";
  else if (!config.livePaymentsEnabled) status = "manual_fallback";
  else if (!verifierImplemented) status = "verifier_not_implemented";
  else status = "configured";

  return {
    provider,
    label: getProviderLabel(provider, config),
    mode: config.mode || "unknown",
    status,
    environment: getProviderEnvironment(env),
    endpointUrl,
    apiKeyConfigured,
    webhookSecretConfigured,
    livePaymentsEnabled,
    paymentAvailable: Boolean(config.paymentAvailable),
    canIssuePolicy: false,
    verifierImplemented,
    externalProvider,
    providerShellOnly: externalProvider && !verifierImplemented,
    checkoutImplemented: provider === PAYMENT_PROVIDER_KEYS.STRIPE || provider === PAYMENT_PROVIDER_KEYS.MOCK,
    reconciliationAutomation: provider === PAYMENT_PROVIDER_KEYS.STRIPE ? "matched_success_auto_resolve" : "manual_review",
    refundApprovalStatus: envFlag(env, "LAJOO_STRIPE_REFUNDS_ENABLED")
      ? "approval_required_provider_enabled"
      : "approval_required_provider_disabled",
    sandbox: config.sandbox ?? provider !== PAYMENT_PROVIDER_KEYS.MOCK,
    required,
    missing: required.filter((item) => !item.configured).map((item) => item.key),
    supportedPaymentMethods: config.supportedPaymentMethods || [],
    webhookHeaders: config.webhookHeaders || shell?.webhookHeaders || [],
    message: config.message || "Payment provider is not live yet.",
    note: config.note || shell?.note || "No real payment or policy issuance is live unless provider verification is implemented and enabled.",
  };
}

export function verifySignedPaymentWebhookForLaunch({ provider, rawBody, headers, env = process.env } = {}) {
  try {
    const verification = verifyProviderWebhook(provider, rawBody, headers, { env });
    return { ok: true, verification };
  } catch (error) {
    return {
      ok: false,
      error,
      status: error instanceof PaymentProviderError ? error.status : 400,
      code: error instanceof PaymentProviderError ? error.code : "PAYMENT_WEBHOOK_REJECTED",
      errorClass: classifyPaymentLaunchError(error),
    };
  }
}

function normalizePaymentVerificationInput({
  session,
  provider,
  verification,
  event,
  verificationStatus,
  safeStatus,
  requestId,
  rawBodyHash,
  error,
  errorCode,
  errorMessage,
  request,
  source,
}) {
  const webhookEvent = event || verification?.event || {};
  const status = verificationStatus || verification?.signatureStatus || (error ? "rejected" : "not_verified");
  const eventType = webhookEvent.eventType || (error ? "payment.webhook.rejected" : "payment.webhook.received");
  const normalizedProvider = normalizeProvider(provider || verification?.provider || webhookEvent.provider);
  return {
    id: randomUUID(),
    actorUserId: persistedActorUserId(session),
    provider: normalizedProvider,
    eventType,
    verificationStatus: status,
    safeStatus: safeStatus || safeStatusFromEventType(eventType, error ? "rejected" : "received"),
    paymentReference: webhookEvent.paymentId || webhookEvent.reference || null,
    paymentId: webhookEvent.paymentId || null,
    providerEventId: webhookEvent.providerEventId || null,
    providerPaymentId: webhookEvent.providerPaymentIntentId || null,
    requestId: requestId || null,
    rawBodyHash: rawBodyHash || verification?.rawBodyHash || webhookEvent.rawBodyHash || null,
    providerEnvironment: getProviderEnvironment(),
    errorClass: error ? classifyPaymentLaunchError(error) : null,
    errorCode: errorCode || error?.code || null,
    errorMessage: errorMessage || error?.message || null,
    payloadSummary: sanitizePaymentAdminPayload(webhookEvent.payload || {}),
    source: source || (normalizedProvider === "mock" ? "mock" : "system"),
    ipAddress: getRequestIpAddress(request),
    userAgent: getRequestUserAgent(request),
    createdAt: new Date(),
  };
}

function mapPaymentVerificationEventForClient(event = {}) {
  return {
    id: event.id,
    provider: event.provider,
    eventType: event.eventType,
    verificationStatus: event.verificationStatus,
    safeStatus: event.safeStatus,
    paymentReference: event.paymentReference,
    paymentId: event.paymentId,
    providerEventId: event.providerEventId,
    providerPaymentId: event.providerPaymentId,
    requestId: event.requestId,
    rawBodyHash: event.rawBodyHash,
    providerEnvironment: event.providerEnvironment,
    errorClass: event.errorClass,
    errorCode: event.errorCode,
    errorMessage: event.errorMessage,
    payloadSummary: event.payloadSummary || null,
    source: event.source || "system",
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    createdAt: dateToIso(event.createdAt),
  };
}

function mapPaymentReconciliationItemForClient(item = {}) {
  return {
    id: item.id,
    verificationEventId: item.verificationEventId,
    paymentId: item.paymentId,
    paymentReference: item.paymentReference,
    provider: item.provider,
    issueType: item.issueType,
    status: item.status,
    priority: item.priority,
    amountExpected: decimalToNumber(item.amountExpected),
    amountReceived: decimalToNumber(item.amountReceived),
    currency: item.currency || "MYR",
    providerEventId: item.providerEventId,
    assignedToUserId: item.assignedToUserId,
    assignedToName: item.assignedTo?.name || null,
    reviewedByUserId: item.reviewedByUserId,
    reviewedByName: item.reviewedBy?.name || null,
    reviewReason: item.reviewReason,
    resolutionReason: item.resolutionReason,
    safeSummary: item.safeSummary || null,
    ipAddress: item.ipAddress,
    userAgent: item.userAgent,
    reviewedAt: dateToIso(item.reviewedAt),
    resolvedAt: dateToIso(item.resolvedAt),
    createdAt: dateToIso(item.createdAt),
    updatedAt: dateToIso(item.updatedAt),
  };
}

function mapPaymentExceptionForClient(exception = {}) {
  return {
    id: exception.id,
    paymentId: exception.paymentId,
    paymentReference: exception.paymentReference,
    provider: exception.provider,
    exceptionType: exception.exceptionType,
    status: exception.status,
    priority: exception.priority,
    amount: decimalToNumber(exception.amount),
    currency: exception.currency || "MYR",
    refundMode: exception.refundMode,
    providerRefundId: exception.providerRefundId,
    createdByUserId: exception.createdByUserId,
    createdByName: exception.createdBy?.name || null,
    assignedToUserId: exception.assignedToUserId,
    assignedToName: exception.assignedTo?.name || null,
    resolvedByUserId: exception.resolvedByUserId,
    resolvedByName: exception.resolvedBy?.name || null,
    reason: exception.reason,
    resolutionReason: exception.resolutionReason,
    noRealRefund: exception.noRealRefund !== false,
    source: exception.source || "manual_admin",
    ipAddress: exception.ipAddress,
    userAgent: exception.userAgent,
    metadata: exception.metadata || null,
    resolvedAt: dateToIso(exception.resolvedAt),
    createdAt: dateToIso(exception.createdAt),
    updatedAt: dateToIso(exception.updatedAt),
  };
}

function mapPaymentSnapshotForClient(payment = {}) {
  return {
    id: payment.id || payment.paymentId,
    paymentId: payment.id || payment.paymentId,
    sessionId: payment.sessionId || null,
    provider: payment.provider || "mock",
    providerMode: payment.providerMode || null,
    status: payment.status,
    amount: decimalToNumber(payment.amount ?? payment.total),
    currency: payment.currency || "MYR",
    insurer: payment.insurer,
    plate: payment.plate,
    paymentMethod: payment.paymentMethod || null,
    paymentAvailable: Boolean(payment.paymentAvailable),
    canIssuePolicy: false,
    providerPaymentIntentId: payment.providerPaymentIntentId || null,
    transactionRef: payment.transactionRef || null,
    confirmedAt: dateToIso(payment.confirmedAt),
    expiresAt: dateToIso(payment.expiresAt),
    createdAt: dateToIso(payment.createdAt),
    updatedAt: dateToIso(payment.updatedAt),
  };
}

export async function recordAdminPaymentWebhookVerificationEvent(input = {}) {
  const normalized = normalizePaymentVerificationInput(input);
  if (shouldUseDatabase()) {
    try {
      const prisma = await getPrisma();
      if (prisma.adminPaymentWebhookVerificationEvent) {
        const saved = await prisma.adminPaymentWebhookVerificationEvent.create({
          data: {
            actorUserId: normalized.actorUserId,
            provider: normalized.provider,
            eventType: normalized.eventType,
            verificationStatus: normalized.verificationStatus,
            safeStatus: normalized.safeStatus,
            paymentReference: normalized.paymentReference,
            paymentId: normalized.paymentId,
            providerEventId: normalized.providerEventId,
            providerPaymentId: normalized.providerPaymentId,
            requestId: normalized.requestId,
            rawBodyHash: normalized.rawBodyHash,
            providerEnvironment: normalized.providerEnvironment,
            errorClass: normalized.errorClass,
            errorCode: normalized.errorCode,
            errorMessage: normalized.errorMessage,
            payloadSummary: normalized.payloadSummary,
            source: normalized.source,
            ipAddress: normalized.ipAddress,
            userAgent: normalized.userAgent,
          },
        });
        return mapPaymentVerificationEventForClient(saved);
      }
    } catch (error) {
      if (!isPaymentAdminDatabaseUnavailable(error)) throw error;
    }
  }

  memoryState.verificationEvents.unshift(normalized);
  memoryState.verificationEvents = memoryState.verificationEvents.slice(0, 100);
  return mapPaymentVerificationEventForClient(normalized);
}

function classifyAmountMismatch(event = {}, payment = {}) {
  const expected = toMoney(payment.total ?? payment.amount);
  const received = toMoney(event.amount);
  if (expected === null || received === null) return false;
  return Math.abs(expected - received) >= 0.01;
}

export function classifyPaymentReconciliationIssue({ event = {}, payment = null, outcome = "" } = {}) {
  const eventType = event.eventType || "";
  const amountExpected = payment ? toMoney(payment.total ?? payment.amount) : null;
  const amountReceived = toMoney(event.amount);

  if (!payment) {
    return {
      issueType: PAYMENT_RECONCILIATION_ISSUE_TYPES.WEBHOOK_UNMATCHED,
      status: "open",
      priority: "high",
      amountExpected,
      amountReceived,
    };
  }

  if (outcome === "amount_mismatch") {
    return {
      issueType: PAYMENT_RECONCILIATION_ISSUE_TYPES.AMOUNT_MISMATCH,
      status: "open",
      priority: "critical",
      amountExpected,
      amountReceived,
    };
  }

  if (outcome === "duplicate" || (payment.status === PAYMENT_STATUS.CONFIRMED && eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED)) {
    return {
      issueType: PAYMENT_RECONCILIATION_ISSUE_TYPES.DUPLICATE_EVENT,
      status: "reviewing",
      priority: "low",
      amountExpected,
      amountReceived,
    };
  }

  if (classifyAmountMismatch(event, payment)) {
    return {
      issueType: PAYMENT_RECONCILIATION_ISSUE_TYPES.AMOUNT_MISMATCH,
      status: "open",
      priority: "critical",
      amountExpected,
      amountReceived,
    };
  }

  if (eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_FAILED) {
    return {
      issueType: PAYMENT_RECONCILIATION_ISSUE_TYPES.FAILED_PAYMENT,
      status: "open",
      priority: "high",
      amountExpected,
      amountReceived,
    };
  }

  if (outcome === "applied" && eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED) {
    return {
      issueType: PAYMENT_RECONCILIATION_ISSUE_TYPES.MATCHED_SUCCESS,
      status: "resolved",
      priority: "low",
      amountExpected,
      amountReceived,
    };
  }

  if (eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_PENDING || payment.status === PAYMENT_STATUS.PENDING) {
    return {
      issueType: PAYMENT_RECONCILIATION_ISSUE_TYPES.PENDING_PROVIDER_CONFIRMATION,
      status: "open",
      priority: "normal",
      amountExpected,
      amountReceived,
    };
  }

  if (outcome === "rejected" || outcome === "provider_mismatch" || eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_UNKNOWN) {
    return {
      issueType: PAYMENT_RECONCILIATION_ISSUE_TYPES.MANUAL_REVIEW_REQUIRED,
      status: "open",
      priority: "high",
      amountExpected,
      amountReceived,
    };
  }

  return null;
}

function normalizeReconciliationItem({
  verificationEvent,
  event,
  payment,
  issue,
  request,
}) {
  const provider = normalizeProvider(event?.provider || verificationEvent?.provider || payment?.provider);
  return {
    id: randomUUID(),
    verificationEventId: verificationEvent?.id || null,
    paymentId: payment?.paymentId || payment?.id || event?.paymentId || verificationEvent?.paymentId || null,
    paymentReference: event?.paymentId || verificationEvent?.paymentReference || payment?.paymentId || payment?.id || null,
    provider,
    issueType: issue.issueType,
    status: issue.status,
    priority: issue.priority,
    amountExpected: issue.amountExpected,
    amountReceived: issue.amountReceived,
    currency: event?.currency || payment?.currency || "MYR",
    providerEventId: event?.providerEventId || verificationEvent?.providerEventId || null,
    safeSummary: sanitizePaymentAdminPayload({
      eventType: event?.eventType || verificationEvent?.eventType,
      paymentStatus: payment?.status || null,
      providerPaymentId: event?.providerPaymentIntentId || payment?.providerPaymentIntentId || null,
      source: verificationEvent?.source || "system",
    }),
    ipAddress: getRequestIpAddress(request),
    userAgent: getRequestUserAgent(request),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function ensureAdminPaymentReconciliationForWebhook({ verificationEvent, event, payment, outcome, request } = {}) {
  const issue = classifyPaymentReconciliationIssue({ event, payment, outcome });
  if (!issue) return null;

  const normalized = normalizeReconciliationItem({ verificationEvent, event, payment, issue, request });
  if (shouldUseDatabase()) {
    try {
      const prisma = await getPrisma();
      if (prisma.adminPaymentReconciliationItem) {
        const existing = normalized.providerEventId
          ? await prisma.adminPaymentReconciliationItem.findFirst({
              where: {
                provider: normalized.provider,
                providerEventId: normalized.providerEventId,
                issueType: normalized.issueType,
              },
              include: { assignedTo: true, reviewedBy: true },
            })
          : null;
        if (existing) return mapPaymentReconciliationItemForClient(existing);
        const saved = await prisma.adminPaymentReconciliationItem.create({
          data: {
            verificationEventId: normalized.verificationEventId,
            paymentId: normalized.paymentId,
            paymentReference: normalized.paymentReference,
            provider: normalized.provider,
            issueType: normalized.issueType,
            status: normalized.status,
            priority: normalized.priority,
            amountExpected: normalized.amountExpected,
            amountReceived: normalized.amountReceived,
            currency: normalized.currency,
            providerEventId: normalized.providerEventId,
            safeSummary: normalized.safeSummary,
            ipAddress: normalized.ipAddress,
            userAgent: normalized.userAgent,
          },
          include: { assignedTo: true, reviewedBy: true },
        });
        return mapPaymentReconciliationItemForClient(saved);
      }
    } catch (error) {
      if (!isPaymentAdminDatabaseUnavailable(error)) throw error;
    }
  }

  const existing = normalized.providerEventId
    ? memoryState.reconciliationItems.find((item) => (
        item.provider === normalized.provider &&
        item.providerEventId === normalized.providerEventId &&
        item.issueType === normalized.issueType
      ))
    : null;
  if (existing) return mapPaymentReconciliationItemForClient(existing);
  memoryState.reconciliationItems.unshift(normalized);
  memoryState.reconciliationItems = memoryState.reconciliationItems.slice(0, 100);
  return mapPaymentReconciliationItemForClient(normalized);
}

export async function recordAdminPaymentWebhookVerificationAndReconciliation({
  verification,
  event,
  payment,
  provider,
  outcome,
  requestId,
  rawBodyHash,
  request,
  error,
  errorCode,
  errorMessage,
} = {}) {
  const verificationEvent = await recordAdminPaymentWebhookVerificationEvent({
    provider,
    verification,
    event,
    verificationStatus: error ? "rejected" : verification?.signatureStatus || "verified",
    safeStatus: error ? "rejected" : safeStatusFromEventType(event?.eventType || verification?.event?.eventType, outcome || "received"),
    requestId,
    rawBodyHash,
    request,
    error,
    errorCode,
    errorMessage,
  });
  const reconciliationItem = await ensureAdminPaymentReconciliationForWebhook({
    verificationEvent,
    event: event || verification?.event,
    payment,
    outcome,
    request,
  });
  return { verificationEvent, reconciliationItem };
}

export function getPolicyIssuancePaymentGuard(payment = {}, { env = process.env } = {}) {
  const paymentStatus = String(payment.paymentStatus || payment.status || "").trim().toLowerCase();
  const paymentVerified = [
    PAYMENT_STATUS.CONFIRMED,
    "paid",
    "succeeded",
    "success",
    "completed",
  ].includes(paymentStatus);
  const hasReference = Boolean(
    payment.paymentIntentId ||
    payment.providerPaymentIntentId ||
    payment.transactionRef ||
    payment.providerPaymentId
  );
  const expectedProvider = normalizeProvider(payment.expectedProvider || payment.snapshotProvider || payment.provider);
  const verifiedProvider = normalizeProvider(payment.verifiedProvider || payment.provider);
  const providerMatches = !expectedProvider || !verifiedProvider || expectedProvider === verifiedProvider;
  const expectedAmount = toMoney(payment.expectedAmount ?? payment.total ?? payment.amount);
  const verifiedAmount = toMoney(payment.verifiedAmount ?? payment.amountReceived ?? payment.total ?? payment.amount);
  const amountMatches = expectedAmount === null || verifiedAmount === null || Math.abs(expectedAmount - verifiedAmount) < 0.01;
  const policyIssuanceEnabled = envFlag(env, "LAJOO_POLICY_ISSUANCE_ENABLED");
  const insurerHandoffEnabled = envFlag(env, "LAJOO_INSURER_POLICY_HANDOFF_ENABLED");
  const canIssuePolicy = paymentVerified && hasReference && providerMatches && amountMatches && policyIssuanceEnabled && insurerHandoffEnabled;

  let reasonCode = null;
  if (!paymentVerified) reasonCode = "payment_not_verified";
  else if (!hasReference) reasonCode = "payment_reference_missing";
  else if (!providerMatches) reasonCode = "payment_provider_mismatch";
  else if (!amountMatches) reasonCode = "payment_amount_mismatch";
  else if (!policyIssuanceEnabled) reasonCode = "policy_issuance_not_enabled";
  else if (!insurerHandoffEnabled) reasonCode = "insurer_handoff_not_enabled";

  return {
    canIssuePolicy,
    paymentVerified,
    hasReference,
    providerMatches,
    amountMatches,
    policyIssuanceEnabled,
    insurerHandoffEnabled,
    reasonCode,
    message: canIssuePolicy
      ? "Payment is verified and policy issuance is enabled."
      : "Policy issuance is blocked until payment is verified, matched, and insurer handoff is explicitly enabled.",
  };
}

export function assertPolicyIssuanceAllowed(payment = {}, options = {}) {
  const guard = getPolicyIssuancePaymentGuard(payment, options);
  if (!guard.canIssuePolicy) {
    const error = new Error(guard.message);
    error.code = guard.reasonCode || "policy_issuance_blocked";
    error.status = 409;
    error.guard = guard;
    throw error;
  }
  return guard;
}

function buildPaymentIncidentSummary({ verificationEvents = [], reconciliationQueue = [], exceptions = [], pendingConfirmations = [] } = {}) {
  const activeReconciliation = reconciliationQueue.filter((item) => !["resolved", "dismissed", "blocked"].includes(item.status));
  const openExceptions = exceptions.filter((item) => !["resolved", "rejected"].includes(item.status));
  return {
    verificationFailures: verificationEvents.filter((event) => ["invalid", "rejected", "not_verified"].includes(event.verificationStatus) || event.errorClass).length,
    providerApiErrors: verificationEvents.filter((event) => ["provider_error", "configuration", "verifier_not_implemented"].includes(event.errorClass)).length,
    webhookFailures: verificationEvents.filter((event) => ["rejected", "failed"].includes(event.safeStatus)).length,
    repeatedMismatchEvents: activeReconciliation.filter((item) => item.issueType === PAYMENT_RECONCILIATION_ISSUE_TYPES.AMOUNT_MISMATCH).length,
    stalePendingConfirmations: pendingConfirmations.filter((item) => item.status === PAYMENT_STATUS.PENDING).length,
    manualReviewOpen: activeReconciliation.length,
    openExceptions: openExceptions.length,
  };
}

function getFallbackPaymentLaunchData({ readiness } = {}) {
  const verificationEvents = memoryState.verificationEvents.map(mapPaymentVerificationEventForClient);
  const reconciliationQueue = memoryState.reconciliationItems.map(mapPaymentReconciliationItemForClient);
  const exceptions = memoryState.exceptions.map(mapPaymentExceptionForClient);
  const pendingConfirmations = [
    {
      id: "PAY-8831",
      paymentId: "PAY-8831",
      provider: readiness?.provider || "mock",
      providerMode: "mock",
      status: "requires_provider",
      amount: 1248.4,
      currency: "MYR",
      insurer: "Etiqa",
      plate: "VBP 8124",
      paymentMethod: "fpx",
      paymentAvailable: false,
      canIssuePolicy: false,
      source: "mock",
    },
  ];
  const fallbackReconciliation = reconciliationQueue.length ? reconciliationQueue : [
    {
      id: "payment-recon-mock-1",
      verificationEventId: null,
      paymentId: "PAY-8831",
      paymentReference: "PAY-8831",
      provider: readiness?.provider || "mock",
      issueType: PAYMENT_RECONCILIATION_ISSUE_TYPES.PENDING_PROVIDER_CONFIRMATION,
      status: "open",
      priority: "normal",
      amountExpected: 1248.4,
      amountReceived: null,
      currency: "MYR",
      providerEventId: null,
      safeSummary: { source: "mock", note: "Provider confirmation is not live yet." },
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
    },
  ];
  const fallbackExceptions = exceptions.length ? exceptions : [
    {
      id: "payment-exception-mock-1",
      paymentId: "PAY-8829",
      paymentReference: "PAY-8829",
      provider: readiness?.provider || "mock",
      exceptionType: "manual_refund_review",
      status: "open",
      priority: "high",
      amount: 1036.8,
      currency: "MYR",
      refundMode: "manual_placeholder",
      reason: "Mock failed payment requires ops review. No real refund is executed.",
      noRealRefund: true,
      source: "mock",
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
    },
  ];

  return {
    persisted: false,
    readiness,
    providerShells: listPaymentProviderShells(),
    verificationEvents,
    reconciliationQueue: fallbackReconciliation,
    exceptions: fallbackExceptions,
    pendingConfirmations,
    incidentSummary: buildPaymentIncidentSummary({
      verificationEvents,
      reconciliationQueue: fallbackReconciliation,
      exceptions: fallbackExceptions,
      pendingConfirmations,
    }),
    metrics: {
      pendingConfirmations: pendingConfirmations.length,
      failedPayments: fallbackReconciliation.filter((item) => item.issueType === PAYMENT_RECONCILIATION_ISSUE_TYPES.FAILED_PAYMENT).length,
      mismatches: fallbackReconciliation.filter((item) => item.issueType === PAYMENT_RECONCILIATION_ISSUE_TYPES.AMOUNT_MISMATCH).length,
      duplicates: fallbackReconciliation.filter((item) => item.issueType === PAYMENT_RECONCILIATION_ISSUE_TYPES.DUPLICATE_EVENT).length,
      manualReview: fallbackReconciliation.filter((item) => !["resolved", "dismissed", "blocked"].includes(item.status)).length,
      openExceptions: fallbackExceptions.filter((item) => !["resolved", "rejected"].includes(item.status)).length,
    },
  };
}

export async function getPersistedAdminPaymentLaunchData({ session, request } = {}) {
  if (session) assertPaymentInspectSession(session);
  const readiness = getPaymentProviderReadiness({
    origin: request ? getRequestOrigin(request) : "",
  });

  if (!shouldUseDatabase()) {
    return getFallbackPaymentLaunchData({ readiness });
  }

  try {
    const prisma = await getPrisma();
    if (!prisma.adminPaymentWebhookVerificationEvent || !prisma.adminPaymentReconciliationItem) {
      return getFallbackPaymentLaunchData({ readiness });
    }
    const [
      verificationRows,
      reconciliationRows,
      exceptionRows,
      pendingRows,
    ] = await Promise.all([
      prisma.adminPaymentWebhookVerificationEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.adminPaymentReconciliationItem.findMany({
        include: { assignedTo: true, reviewedBy: true },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.adminPaymentException.findMany({
        include: { createdBy: true, assignedTo: true, resolvedBy: true },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.paymentIntentSnapshot.findMany({
        where: {
          status: { in: [PAYMENT_STATUS.REQUIRES_PROVIDER, PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.FAILED] },
        },
        orderBy: { updatedAt: "desc" },
        take: 12,
      }),
    ]);

    const verificationEvents = verificationRows.map(mapPaymentVerificationEventForClient);
    const reconciliationQueue = reconciliationRows.map(mapPaymentReconciliationItemForClient);
    const exceptions = exceptionRows.map(mapPaymentExceptionForClient);
    const pendingConfirmations = pendingRows.map(mapPaymentSnapshotForClient);
    const lastVerification = verificationEvents[0] || null;

    return {
      persisted: true,
      readiness: {
        ...readiness,
        lastWebhookVerificationStatus: lastVerification?.verificationStatus || "not_tracked",
        lastWebhookVerificationAt: lastVerification?.createdAt || null,
      },
      providerShells: listPaymentProviderShells(),
      verificationEvents,
      reconciliationQueue,
      exceptions,
      pendingConfirmations,
      incidentSummary: buildPaymentIncidentSummary({
        verificationEvents,
        reconciliationQueue,
        exceptions,
        pendingConfirmations,
      }),
      metrics: {
        pendingConfirmations: pendingConfirmations.filter((item) => item.status !== PAYMENT_STATUS.FAILED).length,
        failedPayments: pendingConfirmations.filter((item) => item.status === PAYMENT_STATUS.FAILED).length,
        mismatches: reconciliationQueue.filter((item) => item.issueType === PAYMENT_RECONCILIATION_ISSUE_TYPES.AMOUNT_MISMATCH).length,
        duplicates: reconciliationQueue.filter((item) => item.issueType === PAYMENT_RECONCILIATION_ISSUE_TYPES.DUPLICATE_EVENT).length,
        manualReview: reconciliationQueue.filter((item) => !["resolved", "dismissed", "blocked"].includes(item.status)).length,
        openExceptions: exceptions.filter((item) => !["resolved", "rejected"].includes(item.status)).length,
      },
    };
  } catch (error) {
    if (!isPaymentAdminDatabaseUnavailable(error)) throw error;
    return getFallbackPaymentLaunchData({ readiness });
  }
}

export async function updateAdminPaymentReconciliationItem({
  session,
  itemId,
  status,
  priority,
  reason,
  note,
  request,
} = {}) {
  assertPaymentManageSession(session);
  const actionReason = requireActionReason(reason);
  const normalizedStatus = normalizeStatus(status, RECONCILIATION_STATUSES, "reviewing");
  const normalizedPriority = priority ? normalizePriority(priority) : null;

  if (shouldUseDatabase()) {
    try {
      const prisma = await getPrisma();
      const existing = await prisma.adminPaymentReconciliationItem.findUnique({
        where: { id: String(itemId || "") },
      });
      if (!existing) {
        const notFound = new Error("Payment reconciliation item was not found.");
        notFound.status = 404;
        throw notFound;
      }
      const resolved = ["resolved", "dismissed", "blocked"].includes(normalizedStatus);
      const updated = await prisma.adminPaymentReconciliationItem.update({
        where: { id: existing.id },
        data: {
          status: normalizedStatus,
          ...(normalizedPriority ? { priority: normalizedPriority } : {}),
          reviewedByUserId: persistedActorUserId(session),
          reviewReason: actionReason,
          resolutionReason: resolved ? actionReason : existing.resolutionReason,
          reviewedAt: new Date(),
          resolvedAt: resolved ? new Date() : existing.resolvedAt,
        },
        include: { assignedTo: true, reviewedBy: true },
      });
      await prisma.adminPaymentReconciliationEvent.create({
        data: {
          itemId: existing.id,
          actorUserId: persistedActorUserId(session),
          action: "payment_reconciliation_update",
          previousStatus: existing.status,
          status: normalizedStatus,
          previousPriority: existing.priority,
          priority: normalizedPriority || existing.priority,
          reason: actionReason,
          note: String(note || "").trim() || null,
          ipAddress: getRequestIpAddress(request),
          userAgent: getRequestUserAgent(request),
          metadata: { noPolicyIssuance: true },
        },
      });
      const event = await recordPersistedAdminAuditEvent({
        session,
        action: "payment_reconciliation_update",
        targetType: "admin_payment_reconciliation",
        targetId: existing.id,
        field: "status",
        reason: actionReason,
        status: "logged",
        metadata: {
          previousStatus: existing.status,
          status: normalizedStatus,
          issueType: existing.issueType,
          provider: existing.provider,
          noPolicyIssuance: true,
        },
        request,
      });
      return { item: mapPaymentReconciliationItemForClient(updated), event };
    } catch (error) {
      if (!isPaymentAdminDatabaseUnavailable(error)) throw error;
    }
  }

  const existing = memoryState.reconciliationItems.find((item) => item.id === itemId);
  if (!existing) {
    const notFound = new Error("Payment reconciliation item was not found.");
    notFound.status = 404;
    throw notFound;
  }
  const updated = {
    ...existing,
    status: normalizedStatus,
    priority: normalizedPriority || existing.priority,
    reviewedByUserId: session?.id || null,
    reviewReason: actionReason,
    resolutionReason: ["resolved", "dismissed", "blocked"].includes(normalizedStatus) ? actionReason : existing.resolutionReason,
    reviewedAt: new Date(),
    resolvedAt: ["resolved", "dismissed", "blocked"].includes(normalizedStatus) ? new Date() : existing.resolvedAt,
    updatedAt: new Date(),
  };
  memoryState.reconciliationItems = memoryState.reconciliationItems.map((item) => item.id === itemId ? updated : item);
  const auditEvent = await recordPersistedAdminAuditEvent({
    session,
    action: "payment_reconciliation_update",
    targetType: "admin_payment_reconciliation",
    targetId: itemId,
    field: "status",
    reason: actionReason,
    status: "logged",
    metadata: { status: normalizedStatus, noPolicyIssuance: true },
    request,
  });
  return { item: mapPaymentReconciliationItemForClient(updated), event: auditEvent };
}

export async function createAdminPaymentException({
  session,
  paymentId,
  provider,
  exceptionType,
  amount,
  currency,
  priority,
  reason,
  request,
} = {}) {
  assertPaymentManageSession(session);
  const actionReason = requireActionReason(reason);
  const normalizedExceptionType = EXCEPTION_TYPES.has(String(exceptionType || "").trim())
    ? String(exceptionType).trim()
    : "manual_refund_review";
  const normalized = {
    id: randomUUID(),
    paymentId: String(paymentId || "").trim() || null,
    paymentReference: String(paymentId || "").trim() || null,
    provider: normalizeProvider(provider || getPaymentProviderConfig().provider),
    exceptionType: normalizedExceptionType,
    status: normalizedExceptionType === "refund_request" ? "requested" : "open",
    priority: normalizePriority(priority, EXCEPTION_PRIORITIES),
    amount: toMoney(amount),
    currency: String(currency || "MYR").trim().toUpperCase() || "MYR",
    refundMode: "manual_placeholder",
    createdByUserId: persistedActorUserId(session),
    reason: actionReason,
    noRealRefund: true,
    source: "manual_admin",
    ipAddress: getRequestIpAddress(request),
    userAgent: getRequestUserAgent(request),
    metadata: { noRealRefund: true },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (shouldUseDatabase()) {
    try {
      const prisma = await getPrisma();
      if (prisma.adminPaymentException) {
        const saved = await prisma.adminPaymentException.create({
          data: {
            paymentId: normalized.paymentId,
            paymentReference: normalized.paymentReference,
            provider: normalized.provider,
            exceptionType: normalized.exceptionType,
            status: normalized.status,
            priority: normalized.priority,
            amount: normalized.amount,
            currency: normalized.currency,
            refundMode: normalized.refundMode,
            createdByUserId: normalized.createdByUserId,
            reason: normalized.reason,
            noRealRefund: true,
            source: normalized.source,
            ipAddress: normalized.ipAddress,
            userAgent: normalized.userAgent,
            metadata: normalized.metadata,
          },
          include: { createdBy: true, assignedTo: true, resolvedBy: true },
        });
        await prisma.adminPaymentExceptionEvent.create({
          data: {
            exceptionId: saved.id,
            actorUserId: persistedActorUserId(session),
            action: "payment_exception_create",
            status: saved.status,
            priority: saved.priority,
            reason: actionReason,
            ipAddress: getRequestIpAddress(request),
            userAgent: getRequestUserAgent(request),
            metadata: { noRealRefund: true },
          },
        });
        const event = await recordPersistedAdminAuditEvent({
          session,
          action: "payment_exception_create",
          targetType: "admin_payment_exception",
          targetId: saved.id,
          field: "refund_placeholder",
          reason: actionReason,
          status: "logged",
          metadata: { exceptionType: saved.exceptionType, noRealRefund: true },
          request,
        });
        return { exception: mapPaymentExceptionForClient(saved), event };
      }
    } catch (error) {
      if (!isPaymentAdminDatabaseUnavailable(error)) throw error;
    }
  }

  memoryState.exceptions.unshift(normalized);
  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "payment_exception_create",
    targetType: "admin_payment_exception",
    targetId: normalized.id,
    field: "refund_placeholder",
    reason: actionReason,
    status: "logged",
    metadata: { exceptionType: normalized.exceptionType, noRealRefund: true },
    request,
  });
  return { exception: mapPaymentExceptionForClient(normalized), event };
}

export async function updateAdminPaymentException({
  session,
  exceptionId,
  status,
  priority,
  reason,
  note,
  request,
} = {}) {
  assertPaymentManageSession(session);
  const actionReason = requireActionReason(reason);
  const normalizedStatus = normalizeStatus(status, EXCEPTION_STATUSES, "investigating");
  const normalizedPriority = priority ? normalizePriority(priority, EXCEPTION_PRIORITIES) : null;

  if (shouldUseDatabase()) {
    try {
      const prisma = await getPrisma();
      const existing = await prisma.adminPaymentException.findUnique({
        where: { id: String(exceptionId || "") },
      });
      if (!existing) {
        const notFound = new Error("Payment exception was not found.");
        notFound.status = 404;
        throw notFound;
      }
      assertPaymentRefundTransitionAllowed({
        session,
        existing,
        nextStatus: normalizedStatus,
      });
      const resolved = ["resolved", "rejected", "completed", "failed"].includes(normalizedStatus);
      const updated = await prisma.adminPaymentException.update({
        where: { id: existing.id },
        data: {
          status: normalizedStatus,
          ...(normalizedPriority ? { priority: normalizedPriority } : {}),
          resolvedByUserId: resolved ? persistedActorUserId(session) : existing.resolvedByUserId,
          resolutionReason: resolved ? actionReason : existing.resolutionReason,
          resolvedAt: resolved ? new Date() : existing.resolvedAt,
        },
        include: { createdBy: true, assignedTo: true, resolvedBy: true },
      });
      await prisma.adminPaymentExceptionEvent.create({
        data: {
          exceptionId: existing.id,
          actorUserId: persistedActorUserId(session),
          action: "payment_exception_update",
          previousStatus: existing.status,
          status: normalizedStatus,
          previousPriority: existing.priority,
          priority: normalizedPriority || existing.priority,
          reason: actionReason,
          note: String(note || "").trim() || null,
          ipAddress: getRequestIpAddress(request),
          userAgent: getRequestUserAgent(request),
          metadata: { noRealRefund: normalizedStatus !== "submitted_provider" },
        },
      });
      const event = await recordPersistedAdminAuditEvent({
        session,
        action: "payment_exception_update",
        targetType: "admin_payment_exception",
        targetId: existing.id,
        field: "status",
        reason: actionReason,
        status: "logged",
        metadata: {
          previousStatus: existing.status,
          status: normalizedStatus,
          exceptionType: existing.exceptionType,
          noRealRefund: normalizedStatus !== "submitted_provider",
        },
        request,
      });
      return { exception: mapPaymentExceptionForClient(updated), event };
    } catch (error) {
      if (!isPaymentAdminDatabaseUnavailable(error)) throw error;
    }
  }

  const existing = memoryState.exceptions.find((item) => item.id === exceptionId);
  if (!existing) {
    const notFound = new Error("Payment exception was not found.");
    notFound.status = 404;
    throw notFound;
  }
  assertPaymentRefundTransitionAllowed({
    session,
    existing,
    nextStatus: normalizedStatus,
  });
  const memoryResolved = ["resolved", "rejected", "completed", "failed"].includes(normalizedStatus);
  const updated = {
    ...existing,
    status: normalizedStatus,
    priority: normalizedPriority || existing.priority,
    resolvedByUserId: memoryResolved ? session?.id || null : existing.resolvedByUserId,
    resolutionReason: memoryResolved ? actionReason : existing.resolutionReason,
    resolvedAt: memoryResolved ? new Date() : existing.resolvedAt,
    updatedAt: new Date(),
  };
  memoryState.exceptions = memoryState.exceptions.map((item) => item.id === exceptionId ? updated : item);
  const event = await recordPersistedAdminAuditEvent({
    session,
    action: "payment_exception_update",
    targetType: "admin_payment_exception",
    targetId: exceptionId,
    field: "status",
    reason: actionReason,
    status: "logged",
    metadata: { status: normalizedStatus, noRealRefund: normalizedStatus !== "submitted_provider" },
    request,
  });
  return { exception: mapPaymentExceptionForClient(updated), event };
}

export function clearAdminPaymentLaunchMemoryForTest() {
  memoryState.verificationEvents = [];
  memoryState.reconciliationItems = [];
  memoryState.reconciliationEvents = [];
  memoryState.exceptions = [];
  memoryState.exceptionEvents = [];
}
