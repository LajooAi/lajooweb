import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PAYMENT_PROVIDER_KEYS = {
  MOCK: "mock",
  DISABLED: "disabled",
  BILLPLZ: "billplz",
  STRIPE: "stripe",
  IPAY88: "ipay88",
  TOYYIBPAY: "toyyibpay",
};

export const PAYMENT_PROVIDER_STATUSES = {
  REQUIRES_PROVIDER: "requires_provider",
  PENDING: "pending",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
};

export const PAYMENT_WEBHOOK_EVENT_TYPES = {
  PAYMENT_SUCCEEDED: "payment.succeeded",
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_PENDING: "payment.pending",
  PAYMENT_UNKNOWN: "payment.unknown",
};

const SUPPORTED_PAYMENT_METHODS = new Set([
  "card",
  "fpx",
  "ewallet",
  "cc-instalment",
  "bnpl",
]);

const KNOWN_EXTERNAL_PROVIDERS = new Set([
  PAYMENT_PROVIDER_KEYS.BILLPLZ,
  PAYMENT_PROVIDER_KEYS.STRIPE,
  PAYMENT_PROVIDER_KEYS.IPAY88,
  PAYMENT_PROVIDER_KEYS.TOYYIBPAY,
]);

export const PAYMENT_PROVIDER_SHELLS = {
  [PAYMENT_PROVIDER_KEYS.BILLPLZ]: {
    provider: PAYMENT_PROVIDER_KEYS.BILLPLZ,
    label: "Billplz",
    country: "MY",
    requiredEnv: ["BILLPLZ_API_KEY", "BILLPLZ_COLLECTION_ID", "BILLPLZ_X_SIGNATURE_KEY"],
    enableEnv: ["LAJOO_LIVE_PAYMENTS_ENABLED", "LAJOO_PAYMENT_PROVIDER_BILLPLZ_ENABLED"],
    supportedPaymentMethods: ["fpx", "card"],
    webhookHeaders: ["x-billplz-signature", "x-signature"],
    note: "Malaysia-friendly provider shell. Real bill creation/webhook verification must be implemented after Billplz account approval.",
  },
  [PAYMENT_PROVIDER_KEYS.STRIPE]: {
    provider: PAYMENT_PROVIDER_KEYS.STRIPE,
    label: "Stripe",
    country: "GLOBAL",
    requiredEnv: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    enableEnv: ["LAJOO_LIVE_PAYMENTS_ENABLED", "LAJOO_PAYMENT_PROVIDER_STRIPE_ENABLED"],
    supportedPaymentMethods: ["card", "fpx", "ewallet"],
    webhookHeaders: ["stripe-signature"],
    note: "Stripe shell. Real Checkout Session creation and Stripe SDK webhook verification must be implemented before enabling.",
  },
  [PAYMENT_PROVIDER_KEYS.IPAY88]: {
    provider: PAYMENT_PROVIDER_KEYS.IPAY88,
    label: "iPay88",
    country: "MY",
    requiredEnv: ["IPAY88_MERCHANT_CODE", "IPAY88_MERCHANT_KEY"],
    enableEnv: ["LAJOO_LIVE_PAYMENTS_ENABLED", "LAJOO_PAYMENT_PROVIDER_IPAY88_ENABLED"],
    supportedPaymentMethods: ["card", "fpx", "ewallet", "bnpl"],
    webhookHeaders: ["x-ipay88-signature", "x-signature"],
    note: "Malaysia payment gateway shell. Real request signing and backend response verification must be implemented after account approval.",
  },
  [PAYMENT_PROVIDER_KEYS.TOYYIBPAY]: {
    provider: PAYMENT_PROVIDER_KEYS.TOYYIBPAY,
    label: "ToyyibPay",
    country: "MY",
    requiredEnv: ["TOYYIBPAY_SECRET_KEY", "TOYYIBPAY_CATEGORY_CODE"],
    enableEnv: ["LAJOO_LIVE_PAYMENTS_ENABLED", "LAJOO_PAYMENT_PROVIDER_TOYYIBPAY_ENABLED"],
    supportedPaymentMethods: ["fpx"],
    webhookHeaders: ["x-toyyibpay-signature", "x-signature"],
    note: "ToyyibPay shell. Real bill creation and callback verification must be implemented after account approval.",
  },
};

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

function isStagingEwalletMockEnabled(env = process.env) {
  if (envFlag(env, "LAJOO_DISABLE_STAGING_EWALLET_MOCK")) return false;
  if (envFlag(env, "LAJOO_ENABLE_STAGING_EWALLET_MOCK")) return true;

  const vercelEnv = String(env?.VERCEL_ENV || "").trim().toLowerCase();
  if (vercelEnv === "production") return false;
  if (vercelEnv === "preview" || vercelEnv === "development") return true;

  return String(env?.NODE_ENV || "").trim().toLowerCase() !== "production";
}

function canUseStagingEwalletMock(method, env = process.env) {
  return method === "ewallet" && isStagingEwalletMockEnabled(env);
}

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (!provider) return PAYMENT_PROVIDER_KEYS.MOCK;
  if (provider === "none") return PAYMENT_PROVIDER_KEYS.DISABLED;
  return provider;
}

function toEnvProviderKey(provider) {
  return String(provider || "").replace(/[^a-z0-9]+/gi, "_").toUpperCase();
}

function getProviderShell(provider) {
  return PAYMENT_PROVIDER_SHELLS[provider] || null;
}

function getProviderEnableEnv(provider) {
  const envProviderKey = toEnvProviderKey(provider);
  return getProviderShell(provider)?.enableEnv || [
    "LAJOO_LIVE_PAYMENTS_ENABLED",
    `LAJOO_PAYMENT_PROVIDER_${envProviderKey}_ENABLED`,
  ];
}

function getMissingEnv(requiredEnv = [], env = process.env) {
  return requiredEnv.filter((key) => !String(env?.[key] || "").trim());
}

function getExternalProviderEnablement(provider, env = process.env) {
  const [globalKey, providerKey] = getProviderEnableEnv(provider);
  const globalEnabled = envFlag(env, globalKey);
  const providerEnabled = envFlag(env, providerKey);
  return {
    globalKey,
    providerKey,
    globalEnabled,
    providerEnabled,
    enabled: globalEnabled && providerEnabled,
  };
}

function getHeader(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";

  const lowerName = String(name).toLowerCase();
  if (headers instanceof Map) {
    return headers.get(name) || headers.get(lowerName) || "";
  }

  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === lowerName) return String(value || "");
  }
  return "";
}

function parseJsonBody(rawBody) {
  try {
    return JSON.parse(String(rawBody || "{}"));
  } catch {
    throw new PaymentProviderError("Webhook body is not valid JSON.", {
      code: "WEBHOOK_INVALID_JSON",
      status: 400,
    });
  }
}

function makeProviderReference(prefix) {
  return `${prefix}_${Date.now()}_${randomBytes(5).toString("hex")}`;
}

function getWebhookSecret(env = process.env) {
  return String(
    env.LAJOO_PAYMENT_WEBHOOK_SECRET ||
    env.PAYMENT_WEBHOOK_SECRET ||
    env.MOCK_PAYMENT_WEBHOOK_SECRET ||
    ""
  ).trim();
}

function normalizeSignature(value) {
  return String(value || "").trim().replace(/^sha256=/i, "");
}

function safeEqualHex(a, b) {
  const left = Buffer.from(normalizeSignature(a), "hex");
  const right = Buffer.from(normalizeSignature(b), "hex");
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isSuccessStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["paid", "success", "succeeded", "completed", "confirmed"].includes(normalized);
}

function isFailedStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["failed", "cancelled", "canceled", "expired", "void"].includes(normalized);
}

function normalizeWebhookEventType(payload = {}) {
  const type = String(payload.type || payload.eventType || "").trim().toLowerCase();
  const status = String(payload.status || payload.paymentStatus || "").trim().toLowerCase();

  if (type.includes("succeeded") || type.includes("completed") || isSuccessStatus(status)) {
    return PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED;
  }
  if (type.includes("failed") || type.includes("cancel") || isFailedStatus(status)) {
    return PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_FAILED;
  }
  if (type.includes("pending") || type.includes("processing") || ["pending", "processing"].includes(status)) {
    return PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_PENDING;
  }
  return PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_UNKNOWN;
}

function normalizeWebhookEvent(provider, payload = {}, rawBody = "") {
  const paymentId = String(payload.paymentId || payload.reference || payload.referenceId || "").trim();
  if (!paymentId) {
    throw new PaymentProviderError("Webhook event does not include a LAJOO paymentId/reference.", {
      code: "WEBHOOK_PAYMENT_ID_MISSING",
      status: 400,
    });
  }

  return {
    provider,
    eventType: normalizeWebhookEventType(payload),
    providerEventId: payload.eventId || payload.id || null,
    providerPaymentIntentId: payload.providerPaymentIntentId || payload.providerPaymentId || payload.transactionId || null,
    paymentId,
    paymentMethod: payload.paymentMethod || null,
    transactionRef: payload.transactionRef || payload.transactionId || payload.providerPaymentIntentId || null,
    failureReason: payload.failureReason || payload.reason || null,
    amount: payload.amount ?? payload.total ?? null,
    currency: payload.currency || "MYR",
    rawBodyHash: hashWebhookBody(rawBody),
    payload,
    canIssuePolicy: false,
  };
}

function buildConfigForProvider(provider, env = process.env) {
  const mockConfirmationEnabled =
    provider === PAYMENT_PROVIDER_KEYS.MOCK &&
    envFlag(env, "LAJOO_ALLOW_MOCK_PAYMENT_CONFIRM");
  const shell = getProviderShell(provider);

  if (provider === PAYMENT_PROVIDER_KEYS.DISABLED) {
    return {
      provider,
      mode: "disabled",
      implemented: false,
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
      implemented: true,
      paymentAvailable: mockConfirmationEnabled,
      mockConfirmationEnabled,
      canIssuePolicy: false,
      message: mockConfirmationEnabled
        ? "Mock payment is enabled for internal testing only."
        : "Payment is not live yet because LAJOO has not connected a payment provider.",
    };
  }

  if (shell) {
    const enablement = getExternalProviderEnablement(provider, env);
    const missingEnv = getMissingEnv(shell.requiredEnv, env);
    const hasRequiredConfig = missingEnv.length === 0;

    return {
      provider,
      label: shell.label,
      mode: "integration_shell",
      implemented: false,
      paymentAvailable: false,
      livePaymentsEnabled: enablement.enabled,
      livePaymentGlobalEnabled: enablement.globalEnabled,
      livePaymentProviderEnabled: enablement.providerEnabled,
      enableEnv: shell.enableEnv,
      requiredEnv: shell.requiredEnv,
      missingEnv,
      hasRequiredConfig,
      supportedPaymentMethods: shell.supportedPaymentMethods,
      webhookHeaders: shell.webhookHeaders,
      mockConfirmationEnabled: false,
      canIssuePolicy: false,
      message: enablement.enabled && hasRequiredConfig
        ? `${shell.label} payment shell is configured, but the live integration is still disabled until provider approval and final implementation.`
        : `${shell.label} payment shell is ready, but live payments are disabled until provider approval.`,
      note: shell.note,
    };
  }

  return {
    provider,
    mode: KNOWN_EXTERNAL_PROVIDERS.has(provider) ? "external" : "unknown",
    implemented: false,
    paymentAvailable: false,
    mockConfirmationEnabled: false,
    canIssuePolicy: false,
    message: `Payment provider "${provider}" is not implemented yet.`,
  };
}

function createProviderIntentFromConfig(payload = {}, config) {
  const method = normalizePaymentMethod(payload.paymentMethod);
  if (Array.isArray(config.supportedPaymentMethods) && !config.supportedPaymentMethods.includes(method)) {
    throw new PaymentProviderError(`${config.label || config.provider} does not support this payment method yet.`, {
      code: "PAYMENT_METHOD_NOT_SUPPORTED_BY_PROVIDER",
      status: 400,
    });
  }

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
      : makeProviderReference(`${config.provider || "pending"}_pi`);

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

const mockPaymentAdapter = {
  key: PAYMENT_PROVIDER_KEYS.MOCK,
  getConfig(env) {
    return buildConfigForProvider(PAYMENT_PROVIDER_KEYS.MOCK, env);
  },
  createPaymentIntent(payload, options = {}) {
    const env = options.env || process.env;
    const method = normalizePaymentMethod(payload.paymentMethod);
    const baseConfig = this.getConfig(env);
    const stagingEwalletEnabled = !baseConfig.mockConfirmationEnabled && canUseStagingEwalletMock(method, env);
    const config = stagingEwalletEnabled
      ? {
          ...baseConfig,
          paymentAvailable: true,
          mockConfirmationEnabled: true,
          message: "E-wallet mock payment is enabled for staging testing only.",
        }
      : baseConfig;

    return createProviderIntentFromConfig(payload, config);
  },
  confirmPaymentIntent(payment = {}, payload = {}, options = {}) {
    const env = options.env || process.env;
    const config = this.getConfig(env);
    const method = normalizePaymentMethod(payload.paymentMethod || payment.paymentMethod);
    const stagingEwalletEnabled = !config.mockConfirmationEnabled && canUseStagingEwalletMock(method, env);

    if (!config.mockConfirmationEnabled && !stagingEwalletEnabled) {
      throw new PaymentProviderError("Mock payment confirmation is disabled.", {
        code: "MOCK_PAYMENT_DISABLED",
        status: 403,
      });
    }

    const expectedToken = payment.clientConfirmationToken || "";
    const providedToken = String(payload.clientConfirmationToken || "").trim();
    const webhookSecret = getWebhookSecret(env);
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
  },
  verifyWebhook(rawBody, headers, options = {}) {
    const env = options.env || process.env;
    const config = this.getConfig(env);
    if (!config.mockConfirmationEnabled) {
      throw new PaymentProviderError("Mock payment webhook confirmation is disabled.", {
        code: "MOCK_PAYMENT_DISABLED",
        status: 403,
      });
    }

    const secret = getWebhookSecret(env);
    if (!secret) {
      throw new PaymentProviderError("Payment webhook secret is not configured.", {
        code: "PAYMENT_WEBHOOK_SECRET_MISSING",
        status: 500,
      });
    }

    const signature = getHeader(headers, "x-lajoo-mock-signature") || getHeader(headers, "x-payment-signature");
    if (!signature || !verifyWebhookSignature(rawBody, signature, secret)) {
      throw new PaymentProviderError("Payment webhook signature is invalid.", {
        code: "WEBHOOK_SIGNATURE_INVALID",
        status: 401,
      });
    }

    const payload = parseJsonBody(rawBody);
    return normalizeWebhookEvent(PAYMENT_PROVIDER_KEYS.MOCK, payload, rawBody);
  },
};

function createExternalProviderShellAdapter(provider) {
  return {
    key: provider,
    getConfig(env) {
      return buildConfigForProvider(provider, env);
    },
    createPaymentIntent(payload, options = {}) {
      return createProviderIntentFromConfig(payload, this.getConfig(options.env || process.env));
    },
    confirmPaymentIntent(payment = {}, payload = {}, options = {}) {
      const env = options.env || process.env;
      const config = this.getConfig(env);
      if (!config.livePaymentsEnabled) {
        throw new PaymentProviderError(`${config.label || provider} payments are disabled until provider approval.`, {
          code: "PAYMENT_PROVIDER_DISABLED",
          status: 403,
        });
      }

      if (!config.hasRequiredConfig) {
        throw new PaymentProviderError(`${config.label || provider} payment configuration is incomplete.`, {
          code: "PAYMENT_PROVIDER_CONFIG_INCOMPLETE",
          status: 503,
        });
      }

      throw new PaymentProviderError(`${config.label || provider} integration shell is not live yet.`, {
        code: "PAYMENT_PROVIDER_SHELL_ONLY",
        status: 501,
      });
    },
    verifyWebhook(rawBody, headers, options = {}) {
      const env = options.env || process.env;
      const config = this.getConfig(env);
      if (!config.livePaymentsEnabled) {
        throw new PaymentProviderError(`${config.label || provider} webhook is disabled until provider approval.`, {
          code: "PAYMENT_PROVIDER_DISABLED",
          status: 403,
        });
      }

      if (!config.hasRequiredConfig) {
        throw new PaymentProviderError(`${config.label || provider} webhook configuration is incomplete.`, {
          code: "PAYMENT_PROVIDER_CONFIG_INCOMPLETE",
          status: 503,
        });
      }

      throw new PaymentProviderError(`${config.label || provider} webhook verification is not implemented yet.`, {
        code: "PAYMENT_WEBHOOK_SHELL_ONLY",
        status: 501,
      });
    },
  };
}

function createUnavailableAdapter(provider) {
  return {
    key: provider,
    getConfig(env) {
      return buildConfigForProvider(provider, env);
    },
    createPaymentIntent(payload, options = {}) {
      return createProviderIntentFromConfig(payload, this.getConfig(options.env || process.env));
    },
    confirmPaymentIntent() {
      throw new PaymentProviderError("Payment provider confirmation is not implemented yet.", {
        code: "PAYMENT_PROVIDER_NOT_IMPLEMENTED",
        status: 501,
      });
    },
    verifyWebhook() {
      throw new PaymentProviderError("Payment provider webhook is not implemented yet.", {
        code: "PAYMENT_WEBHOOK_NOT_IMPLEMENTED",
        status: 501,
      });
    },
  };
}

export function getPaymentProvider(providerKey, options = {}) {
  const provider = normalizeProvider(providerKey || options.env?.LAJOO_PAYMENT_PROVIDER || options.env?.PAYMENT_PROVIDER);
  if (provider === PAYMENT_PROVIDER_KEYS.MOCK) return mockPaymentAdapter;
  if (getProviderShell(provider)) return createExternalProviderShellAdapter(provider);
  return createUnavailableAdapter(provider);
}

export function getPaymentProviderConfig(env = process.env) {
  return getPaymentProvider(null, { env }).getConfig(env);
}

export function listPaymentProviderShells(env = process.env) {
  return Object.values(PAYMENT_PROVIDER_SHELLS).map((shell) => {
    const config = buildConfigForProvider(shell.provider, env);
    return {
      provider: shell.provider,
      label: shell.label,
      country: shell.country,
      mode: config.mode,
      implemented: config.implemented,
      paymentAvailable: config.paymentAvailable,
      livePaymentsEnabled: config.livePaymentsEnabled,
      hasRequiredConfig: config.hasRequiredConfig,
      requiredEnv: config.requiredEnv,
      missingEnv: config.missingEnv,
      supportedPaymentMethods: config.supportedPaymentMethods,
      webhookHeaders: config.webhookHeaders,
      note: config.note,
    };
  });
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

export function createWebhookSignature(rawBody, secret) {
  return createHmac("sha256", String(secret || "")).update(String(rawBody || "")).digest("hex");
}

export function verifyWebhookSignature(rawBody, signature, secret) {
  const expected = createWebhookSignature(rawBody, secret);
  return safeEqualHex(signature, expected);
}

export function hashWebhookBody(rawBody) {
  return createHash("sha256").update(String(rawBody || "")).digest("hex");
}

export function createProviderPaymentIntent(payload = {}, options = {}) {
  const env = options.env || process.env;
  const provider = getPaymentProvider(payload.provider || env.LAJOO_PAYMENT_PROVIDER || env.PAYMENT_PROVIDER, { env });
  return provider.createPaymentIntent(payload, { env });
}

export function confirmProviderPaymentIntent(payment = {}, payload = {}, options = {}) {
  const env = options.env || process.env;
  const provider = getPaymentProvider(payment.provider || env.LAJOO_PAYMENT_PROVIDER || env.PAYMENT_PROVIDER, { env });
  return provider.confirmPaymentIntent(payment, payload, { env });
}

export function verifyProviderWebhook(providerKey, rawBody, headers, options = {}) {
  const env = options.env || process.env;
  const provider = getPaymentProvider(providerKey, { env });
  const event = provider.verifyWebhook(rawBody, headers, { env });
  return {
    ok: true,
    provider: provider.key,
    signatureStatus: "verified",
    rawBodyHash: event.rawBodyHash || hashWebhookBody(rawBody),
    event,
  };
}
