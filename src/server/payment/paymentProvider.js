import { randomBytes } from "node:crypto";

export const PAYMENT_PROVIDER_KEYS = {
  MOCK: "mock",
  DISABLED: "disabled",
};

export const PAYMENT_PROVIDER_STATUSES = {
  REQUIRES_PROVIDER: "requires_provider",
  PENDING: "pending",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
};

const SUPPORTED_PAYMENT_METHODS = new Set([
  "card",
  "fpx",
  "ewallet",
  "cc-instalment",
  "bnpl",
]);

export class PaymentProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "PaymentProviderError";
    this.code = options.code || "PAYMENT_PROVIDER_ERROR";
    this.status = options.status || 400;
    this.retryable = Boolean(options.retryable);
  }
}

function envFlag(env, key) {
  return String(env?.[key] || "").trim().toLowerCase() === "true";
}

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (!provider) return PAYMENT_PROVIDER_KEYS.MOCK;
  if (provider === "none") return PAYMENT_PROVIDER_KEYS.DISABLED;
  if (provider === PAYMENT_PROVIDER_KEYS.MOCK || provider === PAYMENT_PROVIDER_KEYS.DISABLED) return provider;
  return provider;
}

export function getPaymentProviderConfig(env = process.env) {
  const provider = normalizeProvider(env.LAJOO_PAYMENT_PROVIDER || env.PAYMENT_PROVIDER);
  const mockConfirmationEnabled =
    provider === PAYMENT_PROVIDER_KEYS.MOCK &&
    envFlag(env, "LAJOO_ALLOW_MOCK_PAYMENT_CONFIRM");

  if (provider === PAYMENT_PROVIDER_KEYS.DISABLED) {
    return {
      provider,
      mode: "disabled",
      paymentAvailable: false,
      mockConfirmationEnabled: false,
      canIssuePolicy: false,
      message: "Payment provider is not connected yet.",
    };
  }

  if (provider === PAYMENT_PROVIDER_KEYS.MOCK) {
    return {
      provider,
      mode: "sandbox",
      paymentAvailable: mockConfirmationEnabled,
      mockConfirmationEnabled,
      canIssuePolicy: false,
      message: mockConfirmationEnabled
        ? "Mock payment is enabled for internal testing only."
        : "Payment is not live yet because LAJOO has not connected a payment provider.",
    };
  }

  return {
    provider,
    mode: "external",
    paymentAvailable: false,
    mockConfirmationEnabled: false,
    canIssuePolicy: false,
    message: `Payment provider "${provider}" is not implemented yet.`,
  };
}

export function normalizePaymentMethod(method) {
  const normalized = String(method || "").trim().toLowerCase();
  if (!SUPPORTED_PAYMENT_METHODS.has(normalized)) {
    throw new PaymentProviderError("Unsupported payment method.", {
      code: "UNSUPPORTED_PAYMENT_METHOD",
      status: 400,
    });
  }
  return normalized;
}

export function normalizePaymentAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new PaymentProviderError("Invalid payment amount.", {
      code: "INVALID_PAYMENT_AMOUNT",
      status: 400,
    });
  }
  return Math.round(numeric * 100) / 100;
}

export function validatePaymentBreakdown(payload = {}) {
  const insurance = normalizePaymentAmount(payload.insurance || 0);
  const addons = normalizePaymentAmount(payload.addons || 0);
  const tax = normalizePaymentAmount(payload.tax || 0);
  const roadtax = normalizePaymentAmount(payload.roadtax || 0);
  const total = normalizePaymentAmount(payload.total || 0);
  const expectedTotal = Math.round((insurance + addons + tax + roadtax) * 100) / 100;
  const delta = Math.abs(total - expectedTotal);

  return {
    ok: delta < 0.01,
    total,
    expectedTotal,
    insurance,
    addons,
    tax,
    roadtax,
    delta,
  };
}

function makeProviderReference(prefix) {
  return `${prefix}_${Date.now()}_${randomBytes(5).toString("hex")}`;
}

export function createProviderPaymentIntent(payload = {}, options = {}) {
  const env = options.env || process.env;
  const config = getPaymentProviderConfig(env);
  const method = normalizePaymentMethod(payload.paymentMethod);
  const breakdown = validatePaymentBreakdown(payload);

  if (!breakdown.ok) {
    throw new PaymentProviderError("Payment total does not match the itemized breakdown.", {
      code: "PAYMENT_TOTAL_MISMATCH",
      status: 400,
    });
  }

  const providerPaymentIntentId =
    config.provider === PAYMENT_PROVIDER_KEYS.MOCK
      ? makeProviderReference("mock_pi")
      : makeProviderReference("pending_pi");

  const clientConfirmationToken =
    config.mockConfirmationEnabled && config.provider === PAYMENT_PROVIDER_KEYS.MOCK
      ? randomBytes(16).toString("hex")
      : null;

  return {
    provider: config.provider,
    mode: config.mode,
    paymentAvailable: config.paymentAvailable,
    canIssuePolicy: config.canIssuePolicy,
    providerPaymentIntentId,
    clientConfirmationToken,
    status: config.paymentAvailable
      ? PAYMENT_PROVIDER_STATUSES.PENDING
      : PAYMENT_PROVIDER_STATUSES.REQUIRES_PROVIDER,
    paymentMethod: method,
    amount: breakdown.total,
    breakdown,
    message: config.message,
  };
}

export function confirmProviderPaymentIntent(payment = {}, payload = {}, options = {}) {
  const env = options.env || process.env;
  const config = getPaymentProviderConfig(env);
  const method = normalizePaymentMethod(payload.paymentMethod || payment.paymentMethod);

  if (config.provider !== PAYMENT_PROVIDER_KEYS.MOCK) {
    throw new PaymentProviderError("Payment provider confirmation is not implemented yet.", {
      code: "PAYMENT_PROVIDER_NOT_IMPLEMENTED",
      status: 501,
    });
  }

  if (!config.mockConfirmationEnabled) {
    throw new PaymentProviderError("Mock payment confirmation is disabled.", {
      code: "MOCK_PAYMENT_DISABLED",
      status: 403,
    });
  }

  const expectedToken = payment.clientConfirmationToken || "";
  const providedToken = String(payload.clientConfirmationToken || "").trim();
  const webhookSecret = String(env.PAYMENT_WEBHOOK_SECRET || "").trim();
  const providedSecret = String(payload.secret || "").trim();
  const hasValidClientToken = Boolean(expectedToken && providedToken && providedToken === expectedToken);
  const hasValidWebhookSecret = Boolean(webhookSecret && providedSecret && providedSecret === webhookSecret);

  if (!hasValidClientToken && !hasValidWebhookSecret) {
    throw new PaymentProviderError("Payment confirmation is not authorized.", {
      code: "PAYMENT_CONFIRMATION_UNAUTHORIZED",
      status: 401,
    });
  }

  return {
    provider: config.provider,
    providerPaymentIntentId: payment.providerPaymentIntentId || payment.paymentId,
    status: PAYMENT_PROVIDER_STATUSES.SUCCEEDED,
    paymentMethod: method,
    transactionRef: payload.transactionRef || makeProviderReference("mock_txn"),
    isMock: true,
    canIssuePolicy: false,
    message: "Mock payment confirmed for internal testing only.",
  };
}
