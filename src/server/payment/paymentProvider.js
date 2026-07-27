import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";

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

const STRIPE_MIN_FPX_AMOUNT_MYR = 2;
const STRIPE_MAX_FPX_AMOUNT_MYR = 30000;
const STRIPE_API_VERSION = "2025-10-29.clover";
const stripeClientCache = new Map();

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
    supportedPaymentMethods: ["card", "fpx"],
    webhookHeaders: ["stripe-signature"],
    note: "Stripe Checkout is implemented for card and FPX behind explicit launch flags. Policy issuance remains blocked until verified payment and insurer handoff are enabled.",
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

function isDemoBnplMockEnabled(env = process.env) {
  if (envFlag(env, "LAJOO_DISABLE_DEMO_BNPL_MOCK")) return false;
  if (envFlag(env, "LAJOO_ENABLE_DEMO_BNPL_MOCK")) return true;

  const vercelEnv = String(env?.VERCEL_ENV || "").trim().toLowerCase();
  if (vercelEnv === "production") return false;
  if (vercelEnv === "preview" || vercelEnv === "development") return true;

  return String(env?.NODE_ENV || "").trim().toLowerCase() !== "production";
}

function canUseDemoBnplMock(method, env = process.env) {
  return method === "bnpl" && isDemoBnplMockEnabled(env);
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

function inferStripeMode(env = process.env) {
  const explicit = String(env.STRIPE_MODE || env.STRIPE_ENVIRONMENT || "").trim().toLowerCase();
  if (["test", "sandbox", "development"].includes(explicit)) return "test";
  if (["live", "production"].includes(explicit)) return "live";

  const secretKey = String(env.STRIPE_SECRET_KEY || "").trim();
  if (secretKey.startsWith("sk_live_")) return "live";
  if (secretKey.startsWith("sk_test_")) return "test";
  return String(env.VERCEL_ENV || env.NODE_ENV || "development").toLowerCase() === "production"
    ? "live"
    : "test";
}

function getStripeClient(env = process.env, overrideClient = null) {
  if (overrideClient) return overrideClient;
  const secretKey = String(env.STRIPE_SECRET_KEY || "").trim();
  if (!secretKey) {
    throw new PaymentProviderError("Stripe API key is not configured.", {
      code: "STRIPE_SECRET_KEY_MISSING",
      status: 503,
    });
  }

  const cacheKey = createHash("sha256").update(secretKey).digest("hex");
  if (!stripeClientCache.has(cacheKey)) {
    stripeClientCache.set(cacheKey, new Stripe(secretKey, {
      apiVersion: env.STRIPE_API_VERSION || STRIPE_API_VERSION,
      appInfo: {
        name: "LAJOO Admin Operating System",
        version: "phase15",
      },
    }));
  }
  return stripeClientCache.get(cacheKey);
}

function buildStripeConfig(env = process.env) {
  const shell = getProviderShell(PAYMENT_PROVIDER_KEYS.STRIPE);
  const enablement = getExternalProviderEnablement(PAYMENT_PROVIDER_KEYS.STRIPE, env);
  const missingEnv = getMissingEnv(shell.requiredEnv, env);
  const hasRequiredConfig = missingEnv.length === 0;
  const stripeMode = inferStripeMode(env);
  const paymentAvailable = enablement.enabled && hasRequiredConfig;

  return {
    provider: PAYMENT_PROVIDER_KEYS.STRIPE,
    label: shell.label,
    mode: stripeMode === "live" ? "stripe_checkout_live" : "stripe_checkout_sandbox",
    implemented: true,
    paymentAvailable,
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
    stripeMode,
    sandbox: stripeMode !== "live",
    checkoutMode: "hosted_checkout",
    refundsEnabled: envFlag(env, "LAJOO_STRIPE_REFUNDS_ENABLED"),
    message: paymentAvailable
      ? `Stripe Checkout is ready in ${stripeMode === "live" ? "live" : "sandbox"} mode. Policy issuance remains blocked until insurer handoff is enabled.`
      : hasRequiredConfig
        ? "Stripe Checkout is implemented, but live payment flags are disabled."
        : "Stripe Checkout is implemented, but Stripe API key or webhook secret is missing.",
    note: shell.note,
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

  if (provider === PAYMENT_PROVIDER_KEYS.STRIPE) {
    return buildStripeConfig(env);
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

function buildStripeReturnUrls(payload = {}, options = {}) {
  const env = options.env || process.env;
  const configuredOrigin = String(options.origin || env.NEXT_PUBLIC_APP_URL || "").trim();
  const fallbackOrigin = env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "http://localhost:3000";
  const origin = (configuredOrigin || fallbackOrigin).replace(/\/$/, "");
  const country = String(payload.country || env.LAJOO_PAYMENT_COUNTRY || "my").trim().toLowerCase() || "my";
  const paymentPath = `/${encodeURIComponent(country)}/payment/${encodeURIComponent(payload.paymentId)}`;
  const successUrl = String(env.STRIPE_SUCCESS_URL || "")
    .replace("{PAYMENT_ID}", encodeURIComponent(payload.paymentId))
    .replace("{CHECKOUT_SESSION_ID}", "{CHECKOUT_SESSION_ID}");
  const cancelUrl = String(env.STRIPE_CANCEL_URL || "")
    .replace("{PAYMENT_ID}", encodeURIComponent(payload.paymentId))
    .replace("{CHECKOUT_SESSION_ID}", "{CHECKOUT_SESSION_ID}");

  return {
    successUrl: successUrl || `${origin}${paymentPath}?payment_status=stripe_success&stripe_session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: cancelUrl || `${origin}${paymentPath}?payment_status=stripe_cancelled`,
  };
}

function getStripePaymentMethodTypes(method) {
  if (method === "card") return ["card"];
  if (method === "fpx") return ["fpx"];
  throw new PaymentProviderError("Stripe Checkout is currently enabled only for card and FPX.", {
    code: "PAYMENT_METHOD_NOT_SUPPORTED_BY_PROVIDER",
    status: 400,
  });
}

function assertStripeAmount(method, breakdown = {}) {
  const amount = Number(breakdown.total);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PaymentProviderError("Stripe payment amount must be greater than zero.", {
      code: "INVALID_PAYMENT_AMOUNT",
      status: 400,
    });
  }
  if (method === "fpx" && (amount < STRIPE_MIN_FPX_AMOUNT_MYR || amount > STRIPE_MAX_FPX_AMOUNT_MYR)) {
    throw new PaymentProviderError("Stripe FPX payments must be between RM2 and RM30,000.", {
      code: "STRIPE_FPX_AMOUNT_OUT_OF_RANGE",
      status: 400,
    });
  }
  return Math.round(amount * 100);
}

function safeStripeProductName(payload = {}) {
  const suffix = String(payload.insurer || "").trim();
  return suffix
    ? `LAJOO motor insurance renewal - ${suffix}`.slice(0, 120)
    : "LAJOO motor insurance renewal";
}

function buildStripeCheckoutParams(payload = {}, breakdown = {}, method, options = {}) {
  const { successUrl, cancelUrl } = buildStripeReturnUrls(payload, options);
  const unitAmount = assertStripeAmount(method, breakdown);
  const metadata = {
    lajooPaymentId: String(payload.paymentId || ""),
    lajooProvider: PAYMENT_PROVIDER_KEYS.STRIPE,
    lajooSource: "payment_process",
  };

  return {
    mode: "payment",
    client_reference_id: String(payload.paymentId || ""),
    payment_method_types: getStripePaymentMethodTypes(method),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: String(payload.currency || "MYR").trim().toLowerCase() || "myr",
          unit_amount: unitAmount,
          product_data: {
            name: safeStripeProductName(payload),
            metadata,
          },
        },
      },
    ],
    payment_intent_data: {
      metadata,
    },
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
}

function normalizeStripePaymentIntentId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id || null;
}

function stripeAmountToMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round((numeric / 100) * 100) / 100;
}

function mapStripeWebhookEventType(stripeEvent = {}, stripeObject = {}) {
  const type = String(stripeEvent.type || "").trim();
  const status = String(stripeObject.payment_status || stripeObject.status || "").trim().toLowerCase();

  if (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded" ||
    type === "payment_intent.succeeded" ||
    status === "paid" ||
    status === "succeeded"
  ) {
    return PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED;
  }

  if (
    type === "checkout.session.async_payment_failed" ||
    type === "payment_intent.payment_failed" ||
    ["failed", "canceled", "cancelled", "requires_payment_method"].includes(status)
  ) {
    return PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_FAILED;
  }

  if (["processing", "requires_action", "requires_confirmation", "requires_capture", "open", "unpaid"].includes(status)) {
    return PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_PENDING;
  }

  return PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_UNKNOWN;
}

function normalizeStripeWebhookEvent(stripeEvent = {}, rawBody = "") {
  const stripeObject = stripeEvent.data?.object || {};
  const metadata = stripeObject.metadata || {};
  const paymentId = String(
    stripeObject.client_reference_id ||
    metadata.lajooPaymentId ||
    metadata.paymentId ||
    ""
  ).trim();

  if (!paymentId) {
    throw new PaymentProviderError("Stripe webhook event does not include a LAJOO payment reference.", {
      code: "WEBHOOK_PAYMENT_ID_MISSING",
      status: 400,
    });
  }

  const providerPaymentIntentId = normalizeStripePaymentIntentId(stripeObject.payment_intent) ||
    (stripeObject.object === "payment_intent" ? stripeObject.id : null);
  const amount = stripeAmountToMoney(stripeObject.amount_total ?? stripeObject.amount_received ?? stripeObject.amount);
  const currency = String(stripeObject.currency || "myr").trim().toUpperCase();
  const safePayload = {
    provider: PAYMENT_PROVIDER_KEYS.STRIPE,
    stripeEventType: stripeEvent.type || null,
    stripeObject: stripeObject.object || null,
    checkoutSessionId: stripeObject.object === "checkout.session" ? stripeObject.id : null,
    paymentIntentId: providerPaymentIntentId,
    paymentStatus: stripeObject.payment_status || stripeObject.status || null,
    livemode: Boolean(stripeEvent.livemode),
    amount,
    currency,
  };

  return {
    provider: PAYMENT_PROVIDER_KEYS.STRIPE,
    eventType: mapStripeWebhookEventType(stripeEvent, stripeObject),
    providerEventId: stripeEvent.id || null,
    providerPaymentIntentId,
    paymentId,
    paymentMethod: stripeObject.payment_method_types?.[0] || stripeObject.payment_method || null,
    transactionRef: providerPaymentIntentId || stripeObject.id || stripeEvent.id || null,
    failureReason: stripeObject.last_payment_error?.code || stripeObject.status || null,
    amount,
    currency,
    rawBodyHash: hashWebhookBody(rawBody),
    payload: safePayload,
    canIssuePolicy: false,
  };
}

const stripePaymentAdapter = {
  key: PAYMENT_PROVIDER_KEYS.STRIPE,
  getConfig(env) {
    return buildConfigForProvider(PAYMENT_PROVIDER_KEYS.STRIPE, env);
  },
  createPaymentIntent(payload, options = {}) {
    return createProviderIntentFromConfig(payload, this.getConfig(options.env || process.env));
  },
  async createPaymentIntentAsync(payload, options = {}) {
    const env = options.env || process.env;
    const config = this.getConfig(env);
    if (!config.paymentAvailable) {
      return createProviderIntentFromConfig(payload, config);
    }

    const method = normalizePaymentMethod(payload.paymentMethod);
    if (!config.supportedPaymentMethods.includes(method)) {
      throw new PaymentProviderError("Stripe Checkout is currently enabled only for card and FPX.", {
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

    const stripe = getStripeClient(env, options.stripeClient);
    let session;
    try {
      session = await stripe.checkout.sessions.create(buildStripeCheckoutParams(payload, breakdown, method, { ...options, env }));
    } catch (error) {
      throw new PaymentProviderError("Stripe Checkout Session could not be created.", {
        code: "STRIPE_CHECKOUT_CREATE_FAILED",
        status: 502,
        retryable: true,
        cause: error,
      });
    }

    return {
      provider: PAYMENT_PROVIDER_KEYS.STRIPE,
      mode: config.mode,
      paymentAvailable: true,
      canIssuePolicy: false,
      providerPaymentIntentId: normalizeStripePaymentIntentId(session.payment_intent) || session.id,
      providerCheckoutSessionId: session.id,
      checkoutUrl: session.url || null,
      clientConfirmationToken: null,
      status: PAYMENT_PROVIDER_STATUSES.PENDING,
      paymentMethod: method,
      amount: breakdown.total,
      breakdown,
      checkoutData: {
        provider: PAYMENT_PROVIDER_KEYS.STRIPE,
        checkoutSessionId: session.id,
        checkoutUrl: session.url || null,
        stripeMode: config.stripeMode,
      },
      message: "Redirecting to Stripe Checkout. LAJOO will wait for a verified Stripe webhook before marking payment confirmed.",
    };
  },
  confirmPaymentIntent() {
    throw new PaymentProviderError("Stripe payments must be confirmed by signed Stripe webhooks, not client confirmation.", {
      code: "STRIPE_CLIENT_CONFIRMATION_DISABLED",
      status: 403,
    });
  },
  verifyWebhook(rawBody, headers, options = {}) {
    const env = options.env || process.env;
    const config = this.getConfig(env);
    if (!config.livePaymentsEnabled) {
      throw new PaymentProviderError("Stripe webhook is disabled until live payment flags are enabled.", {
        code: "PAYMENT_PROVIDER_DISABLED",
        status: 403,
      });
    }
    if (!config.hasRequiredConfig) {
      throw new PaymentProviderError("Stripe webhook configuration is incomplete.", {
        code: "PAYMENT_PROVIDER_CONFIG_INCOMPLETE",
        status: 503,
      });
    }

    const signature = getHeader(headers, "stripe-signature");
    if (!signature) {
      throw new PaymentProviderError("Stripe webhook signature is missing.", {
        code: "WEBHOOK_SIGNATURE_MISSING",
        status: 401,
      });
    }

    const stripe = getStripeClient(env, options.stripeClient);
    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        String(rawBody || ""),
        signature,
        String(env.STRIPE_WEBHOOK_SECRET || "").trim()
      );
    } catch {
      throw new PaymentProviderError("Stripe webhook signature is invalid.", {
        code: "WEBHOOK_SIGNATURE_INVALID",
        status: 401,
      });
    }

    return normalizeStripeWebhookEvent(stripeEvent, rawBody);
  },
};

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
    const demoBnplEnabled = !baseConfig.mockConfirmationEnabled && canUseDemoBnplMock(method, env);
    const methodMockEnabled = stagingEwalletEnabled || demoBnplEnabled;
    const config = methodMockEnabled
      ? {
          ...baseConfig,
          paymentAvailable: true,
          mockConfirmationEnabled: true,
          message: demoBnplEnabled
            ? "Buy Now, Pay Later demo payment is enabled for testing only."
            : "E-wallet mock payment is enabled for staging testing only.",
        }
      : baseConfig;

    return createProviderIntentFromConfig(payload, config);
  },
  confirmPaymentIntent(payment = {}, payload = {}, options = {}) {
    const env = options.env || process.env;
    const config = this.getConfig(env);
    const method = normalizePaymentMethod(payload.paymentMethod || payment.paymentMethod);
    const stagingEwalletEnabled = !config.mockConfirmationEnabled && canUseStagingEwalletMock(method, env);
    const demoBnplEnabled = !config.mockConfirmationEnabled && canUseDemoBnplMock(method, env);

    if (!config.mockConfirmationEnabled && !stagingEwalletEnabled && !demoBnplEnabled) {
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
  if (provider === PAYMENT_PROVIDER_KEYS.STRIPE) return stripePaymentAdapter;
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

export async function createProviderPaymentIntentAsync(payload = {}, options = {}) {
  const env = options.env || process.env;
  const provider = getPaymentProvider(payload.provider || env.LAJOO_PAYMENT_PROVIDER || env.PAYMENT_PROVIDER, { env });
  if (typeof provider.createPaymentIntentAsync === "function") {
    return provider.createPaymentIntentAsync(payload, { ...options, env });
  }
  return provider.createPaymentIntent(payload, { ...options, env });
}

export function confirmProviderPaymentIntent(payment = {}, payload = {}, options = {}) {
  const env = options.env || process.env;
  const provider = getPaymentProvider(payment.provider || env.LAJOO_PAYMENT_PROVIDER || env.PAYMENT_PROVIDER, { env });
  return provider.confirmPaymentIntent(payment, payload, { ...options, env });
}

export function verifyProviderWebhook(providerKey, rawBody, headers, options = {}) {
  const env = options.env || process.env;
  const provider = getPaymentProvider(providerKey, { env });
  const event = provider.verifyWebhook(rawBody, headers, { ...options, env });
  return {
    ok: true,
    provider: provider.key,
    signatureStatus: "verified",
    rawBodyHash: event.rawBodyHash || hashWebhookBody(rawBody),
    event,
  };
}
