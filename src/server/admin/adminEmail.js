import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { maskAdminEmail } from "../../lib/admin/piiMasking.js";

const RESEND_EMAILS_API_URL = "https://api.resend.com/emails";
const RESEND_DOMAINS_API_URL = "https://api.resend.com/domains";
const RESEND_WEBHOOKS_API_URL = "https://api.resend.com/webhooks";
const RESEND_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const RESEND_WEBHOOK_REQUIRED_EVENTS = [
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
  "email.failed",
];

function normalizeText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getInviteEmailConfig(env = process.env) {
  const provider = normalizeText(env.LAJOO_ADMIN_INVITE_EMAIL_PROVIDER || env.LAJOO_EMAIL_PROVIDER || (env.RESEND_API_KEY ? "resend" : "manual")).toLowerCase();
  const resendApiKey = normalizeText(env.RESEND_API_KEY);
  const from = normalizeText(env.LAJOO_ADMIN_INVITE_FROM || env.LAJOO_EMAIL_FROM || env.RESEND_FROM_EMAIL);
  const replyTo = normalizeText(env.LAJOO_ADMIN_INVITE_REPLY_TO || env.LAJOO_EMAIL_REPLY_TO);
  return {
    provider,
    resendApiKey,
    from,
    replyTo,
    configured: provider === "resend" && Boolean(resendApiKey && from),
  };
}

export function getResendWebhookStatus(env = process.env) {
  const configured = Boolean(normalizeText(env.RESEND_WEBHOOK_SECRET));
  const endpointUrl = getAdminResendWebhookEndpointUrl(env);
  return {
    provider: "resend",
    status: configured ? "configured" : "missing_env",
    configured,
    endpoint: endpointUrl || "/api/admin/webhooks/resend",
    endpointUrl,
    endpointPath: "/api/admin/webhooks/resend",
    required: [{ key: "RESEND_WEBHOOK_SECRET", configured }],
    requiredEvents: RESEND_WEBHOOK_REQUIRED_EVENTS,
    safeMessage: configured
      ? "Resend webhook signature verification is configured. Delivery events can be ingested without exposing secrets."
      : "Resend webhook ingestion is disabled until RESEND_WEBHOOK_SECRET is configured.",
  };
}

export function getAdminPublicBaseUrl(env = process.env) {
  const configured = normalizeText(
    env.LAJOO_ADMIN_PUBLIC_BASE_URL ||
    env.LAJOO_PUBLIC_BASE_URL ||
    env.NEXT_PUBLIC_SITE_URL ||
    env.NEXT_PUBLIC_APP_URL,
  );
  if (configured) return configured.replace(/\/+$/g, "");
  const vercelUrl = normalizeText(env.VERCEL_URL);
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//i, "").replace(/\/+$/g, "")}`;
  return null;
}

export function getAdminResendWebhookEndpointUrl(env = process.env) {
  const baseUrl = getAdminPublicBaseUrl(env);
  return baseUrl ? `${baseUrl}/api/admin/webhooks/resend` : null;
}

export function extractDomainFromAdminEmailAddress(value = "") {
  const raw = normalizeText(value);
  const email = raw.match(/<([^<>@\s]+@[^<>@\s]+)>/)?.[1] || raw.match(/([^<>\s]+@[^<>\s]+)/)?.[1] || "";
  const domain = email.split("@")[1] || "";
  return domain.replace(/[>,;]+$/g, "").toLowerCase();
}

export function classifyAdminEmailDeliveryError(errorLike = {}) {
  const status = Number(errorLike.status || errorLike.statusCode || 0);
  const message = normalizeText(errorLike.message || errorLike.error || errorLike).toLowerCase();
  if (status === 401 || status === 403 || /api key|unauthorized|forbidden|permission/.test(message)) return "auth";
  if (/domain|sender|from address|verify|verified/.test(message)) return "domain_not_verified";
  if (status === 429 || /rate|too many/.test(message)) return "rate_limit";
  if (status === 400 || status === 422 || /invalid|validation|required/.test(message)) return "validation";
  if (status >= 500 || /timeout|network|fetch failed|econn|unavailable/.test(message)) return "provider_unavailable";
  return "unknown";
}

export function getAdminInviteEmailStatus(env = process.env) {
  const config = getInviteEmailConfig(env);
  const provider = config.provider === "resend" ? "resend" : "manual";
  const configured = provider === "resend" && Boolean(config.resendApiKey && config.from);
  const domain = extractDomainFromAdminEmailAddress(config.from);
  const required = [
    { key: "RESEND_API_KEY", configured: Boolean(normalizeText(env.RESEND_API_KEY)) },
    {
      key: "LAJOO_ADMIN_INVITE_FROM",
      configured: Boolean(normalizeText(env.LAJOO_ADMIN_INVITE_FROM || env.LAJOO_EMAIL_FROM || env.RESEND_FROM_EMAIL)),
    },
  ];
  const optional = [
    {
      key: "LAJOO_ADMIN_INVITE_REPLY_TO",
      configured: Boolean(normalizeText(env.LAJOO_ADMIN_INVITE_REPLY_TO || env.LAJOO_EMAIL_REPLY_TO)),
    },
  ];

  return {
    provider,
    status: provider === "resend" ? (configured ? "configured" : "missing_env") : "manual_fallback",
    configured,
    deliveryMode: configured ? "resend" : "manual_fallback",
    domain: domain || null,
    domainStatus: configured ? "unchecked" : null,
    domainConfigured: Boolean(domain),
    required,
    optional,
    webhook: getResendWebhookStatus(env),
    safeMessage: provider === "resend"
      ? "Resend invite delivery is available only when required env vars are configured and the sender domain is verified in Resend."
      : "Manual invite links are used until an email provider is configured.",
  };
}

function getHeaderValue(headers, key) {
  if (!headers) return "";
  if (typeof headers.get === "function") return normalizeText(headers.get(key));
  return normalizeText(headers[key] || headers[key.toLowerCase()]);
}

function constantTimeBase64Equal(left, right) {
  try {
    const leftBuffer = Buffer.from(String(left || ""), "base64");
    const rightBuffer = Buffer.from(String(right || ""), "base64");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

export function verifyResendWebhookSignature({
  rawBody,
  headers,
  secret = process.env.RESEND_WEBHOOK_SECRET,
  now = new Date(),
  toleranceSeconds = RESEND_WEBHOOK_TOLERANCE_SECONDS,
} = {}) {
  const webhookSecret = normalizeText(secret);
  const svixId = getHeaderValue(headers, "svix-id");
  const svixTimestamp = getHeaderValue(headers, "svix-timestamp");
  const svixSignature = getHeaderValue(headers, "svix-signature");

  if (!webhookSecret) return { ok: false, status: "missing_secret", svixId };
  if (!svixId || !svixTimestamp || !svixSignature) return { ok: false, status: "missing_headers", svixId };

  const timestampSeconds = Number(svixTimestamp);
  const nowSeconds = Math.floor((now instanceof Date ? now : new Date(now)).getTime() / 1000);
  if (!Number.isFinite(timestampSeconds)) return { ok: false, status: "invalid_timestamp", svixId };
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) return { ok: false, status: "stale_timestamp", svixId };

  const secretPayload = webhookSecret.includes("_") ? webhookSecret.split("_").slice(1).join("_") : webhookSecret;
  const secretBytes = Buffer.from(secretPayload, "base64");
  if (!secretBytes.length) return { ok: false, status: "invalid_secret", svixId };

  const signedContent = `${svixId}.${svixTimestamp}.${String(rawBody || "")}`;
  const expectedSignature = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const signatures = svixSignature
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.includes(",") ? item.split(",").slice(1).join(",") : item);

  const matched = signatures.some((signature) => constantTimeBase64Equal(signature, expectedSignature));
  return {
    ok: matched,
    status: matched ? "verified" : "invalid_signature",
    svixId,
  };
}

export function classifyResendWebhookStatus(eventType = "") {
  const type = normalizeText(eventType).toLowerCase();
  if (type === "email.delivered") return "delivered";
  if (type === "email.bounced") return "bounced";
  if (type === "email.complained") return "complained";
  if (type === "email.opened") return "opened";
  if (type === "email.clicked") return "clicked";
  if (["email.failed", "email.delivery_delayed", "email.suppressed"].includes(type)) return "failed";
  return "unknown";
}

function normalizeEmailAddress(value) {
  const raw = normalizeText(Array.isArray(value) ? value[0] : value);
  return raw.match(/<([^<>@\s]+@[^<>@\s]+)>/)?.[1] || raw.match(/([^<>\s]+@[^<>\s]+)/)?.[1] || "";
}

function digestEmail(value) {
  const email = normalizeEmailAddress(value).toLowerCase();
  if (!email) return null;
  return createHash("sha256").update(email).digest("hex");
}

function safeUrlHost(value) {
  try {
    return new URL(String(value || "")).host || null;
  } catch {
    return null;
  }
}

export function sanitizeResendWebhookPayload(payload = {}, verification = {}) {
  const data = payload && typeof payload === "object" ? payload.data || {} : {};
  const eventType = normalizeText(payload?.type || payload?.event_type || "unknown");
  const recipient = normalizeEmailAddress(data.to);
  const status = classifyResendWebhookStatus(eventType);
  const providerMessageId = normalizeText(data.email_id || data.emailId || data.message_id || data.messageId || payload?.email_id);
  const providerEventId = normalizeText(payload?.id || payload?.event_id || verification.svixId);
  const linkHost = safeUrlHost(data.link?.url || data.url || data.click?.url);

  return {
    provider: "resend",
    svixId: verification.svixId || null,
    eventType,
    status,
    providerEventId: providerEventId || null,
    providerMessageId: providerMessageId || null,
    recipientMasked: recipient ? maskAdminEmail(recipient) : null,
    emailDigest: digestEmail(recipient),
    verificationStatus: verification.status || "verified",
    errorClass: status === "failed" ? normalizeText(data?.error?.name || data?.error || data?.bounce?.type || data?.reason || "provider_event") : null,
    payloadSummary: {
      type: eventType,
      status,
      createdAt: normalizeText(payload?.created_at || payload?.createdAt) || null,
      dataCreatedAt: normalizeText(data.created_at || data.createdAt) || null,
      hasSubject: Boolean(data.subject),
      recipientCount: Array.isArray(data.to) ? data.to.length : (recipient ? 1 : 0),
      hasMessageId: Boolean(data.message_id || data.messageId),
      bounceType: normalizeText(data?.bounce?.type) || null,
      bounceSubType: normalizeText(data?.bounce?.subType) || null,
      linkHost,
      tagKeys: data.tags && typeof data.tags === "object" ? Object.keys(data.tags).slice(0, 12) : [],
    },
  };
}

function normalizeWebhookEndpoint(value) {
  return normalizeText(value).replace(/\/+$/g, "").toLowerCase();
}

function normalizeResendWebhookEvents(value) {
  return Array.isArray(value)
    ? value.map((event) => normalizeText(event).toLowerCase()).filter(Boolean).sort()
    : [];
}

function sanitizeResendWebhookRecord(record = {}) {
  return {
    id: normalizeText(record.id) || null,
    status: normalizeText(record.status || record.enabled || "unknown") || "unknown",
    endpoint: normalizeText(record.endpoint || record.url) || null,
    events: normalizeResendWebhookEvents(record.events),
    createdAt: normalizeText(record.created_at || record.createdAt) || null,
  };
}

export function sanitizeResendWebhookListPayload(payload = {}, endpointUrl = getAdminResendWebhookEndpointUrl()) {
  const data = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
  const endpointTarget = normalizeWebhookEndpoint(endpointUrl);
  const webhooks = data.map(sanitizeResendWebhookRecord);
  const matchedWebhook = endpointTarget
    ? webhooks.find((webhook) => normalizeWebhookEndpoint(webhook.endpoint) === endpointTarget) || null
    : null;
  const matchedEvents = matchedWebhook?.events || [];
  const requiredEventsMissing = RESEND_WEBHOOK_REQUIRED_EVENTS.filter((event) => !matchedEvents.includes(event));
  const statusText = normalizeText(matchedWebhook?.status).toLowerCase();
  const enabled = ["active", "enabled", "true"].includes(statusText);

  return {
    provider: "resend",
    status: !endpointTarget
      ? "missing_endpoint"
      : (!matchedWebhook ? "not_registered" : (!enabled ? "registered_disabled" : (requiredEventsMissing.length ? "configured_partial" : "registered"))),
    endpointUrl: endpointUrl || null,
    endpointMatched: Boolean(matchedWebhook),
    matchedWebhookId: matchedWebhook?.id || null,
    matchedWebhookStatus: matchedWebhook?.status || null,
    matchedWebhookEvents: matchedEvents,
    webhookCount: webhooks.length,
    requiredEventsMissing,
    webhooks: webhooks.map((webhook) => ({
      id: webhook.id,
      status: webhook.status,
      endpointMatched: endpointTarget ? normalizeWebhookEndpoint(webhook.endpoint) === endpointTarget : false,
      events: webhook.events,
      createdAt: webhook.createdAt,
    })),
  };
}

export async function checkAdminResendWebhookRegistrationStatus({
  env = process.env,
  endpointUrl = getAdminResendWebhookEndpointUrl(env),
  fetchImpl = globalThis.fetch,
  timeoutMs = 2500,
} = {}) {
  const webhookStatus = getResendWebhookStatus(env);
  const config = getInviteEmailConfig(env);
  const apiKeyConfigured = Boolean(config.resendApiKey);
  const base = {
    provider: "resend",
    providerEnvironment: "resend",
    apiKeyConfigured,
    endpointUrl,
    secretConfigured: Boolean(webhookStatus.configured),
    requiredEvents: RESEND_WEBHOOK_REQUIRED_EVENTS,
    checkedAt: new Date().toISOString(),
  };

  if (!apiKeyConfigured) {
    return {
      ...base,
      status: "missing_env",
      errorClass: "missing_env",
      errorMessage: "RESEND_API_KEY is not configured. Manual webhook setup status remains available.",
    };
  }
  if (!endpointUrl) {
    return {
      ...base,
      status: "missing_endpoint",
      errorClass: "missing_env",
      errorMessage: "Set LAJOO_ADMIN_PUBLIC_BASE_URL or NEXT_PUBLIC_SITE_URL to check the registered webhook endpoint.",
    };
  }
  if (typeof fetchImpl !== "function") {
    return {
      ...base,
      status: "provider_error",
      errorClass: "provider_unavailable",
      errorMessage: "Fetch API is unavailable for Resend webhook status checks.",
    };
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(RESEND_WEBHOOKS_API_URL, {
      method: "GET",
      headers: {
        authorization: `Bearer ${config.resendApiKey}`,
        "user-agent": "lajoo-admin/phase9",
      },
      ...(controller ? { signal: controller.signal } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = normalizeText(payload?.message || payload?.error || `Resend returned HTTP ${response.status}`);
      return {
        ...base,
        status: "provider_error",
        errorClass: classifyAdminEmailDeliveryError({ status: response.status, message }),
        errorMessage: message.replace(config.resendApiKey, "[redacted]").slice(0, 240),
      };
    }
    return {
      ...base,
      ...sanitizeResendWebhookListPayload(payload, endpointUrl),
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...base,
      status: "provider_error",
      errorClass: classifyAdminEmailDeliveryError(error),
      errorMessage: normalizeText(error?.message || "Resend webhook registration check failed.").replace(config.resendApiKey, "[redacted]").slice(0, 240),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkAdminInviteEmailProviderStatus({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 2500,
} = {}) {
  const baseStatus = getAdminInviteEmailStatus(env);
  if (baseStatus.provider !== "resend" || !baseStatus.configured) return baseStatus;
  if (typeof fetchImpl !== "function") {
    return {
      ...baseStatus,
      status: "provider_error",
      providerErrorClass: "provider_unavailable",
      providerError: "Fetch API is unavailable for provider status checks.",
      checkedAt: new Date().toISOString(),
    };
  }

  const config = getInviteEmailConfig(env);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(RESEND_DOMAINS_API_URL, {
      method: "GET",
      headers: { authorization: `Bearer ${config.resendApiKey}` },
      ...(controller ? { signal: controller.signal } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = normalizeText(payload?.message || payload?.error || `Resend returned HTTP ${response.status}`);
      return {
        ...baseStatus,
        status: "provider_error",
        providerErrorClass: classifyAdminEmailDeliveryError({ status: response.status, message }),
        providerError: message.replace(config.resendApiKey, "[redacted]").slice(0, 240),
        checkedAt: new Date().toISOString(),
      };
    }

    const domains = Array.isArray(payload?.data) ? payload.data : [];
    const domainRecord = domains.find((item) => String(item?.name || "").toLowerCase() === baseStatus.domain);
    return {
      ...baseStatus,
      status: "configured",
      domainStatus: domainRecord?.status || "not_found",
      domainRegion: domainRecord?.region || null,
      domainIdPresent: Boolean(domainRecord?.id),
      checkedAt: new Date().toISOString(),
      safeMessage: domainRecord
        ? "Resend is configured. Domain status is read from Resend without exposing provider secrets."
        : "Resend is configured, but the sender domain was not found in the provider domain list.",
    };
  } catch (error) {
    return {
      ...baseStatus,
      status: "provider_error",
      providerErrorClass: classifyAdminEmailDeliveryError(error),
      providerError: normalizeText(error?.message || "Resend provider status check failed.").replace(config.resendApiKey, "[redacted]").slice(0, 240),
      checkedAt: new Date().toISOString(),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildInviteEmail({ inviteUrl, name, role, expiresAt }) {
  const safeName = escapeHtml(name || "there");
  const safeRole = escapeHtml(role || "admin");
  const safeUrl = escapeHtml(inviteUrl);
  const safeExpiry = escapeHtml(expiresAt ? new Date(expiresAt).toLocaleString("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  }) : "the expiry time shown in LAJOO Admin");

  return {
    subject: "Set up your LAJOO Admin access",
    text: [
      `Hi ${name || "there"},`,
      "",
      `You have been invited to LAJOO Admin with the ${role || "admin"} role.`,
      `Set up your password here: ${inviteUrl}`,
      `This one-time invite expires at ${safeExpiry}.`,
      "",
      "If you were not expecting this invite, ignore this email and contact the LAJOO founder.",
    ].join("\n"),
    html: `<!doctype html>
<html>
  <body style="margin:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:28px;">
        <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#0062ff;margin:0 0 12px;">LAJOO Admin</p>
        <h1 style="font-size:22px;line-height:1.25;margin:0 0 14px;">Set up your admin access</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Hi ${safeName}, you have been invited to LAJOO Admin with the <strong>${safeRole}</strong> role.</p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">This one-time invite expires at ${safeExpiry}.</p>
        <p style="margin:0 0 24px;"><a href="${safeUrl}" style="display:inline-block;background:#0062ff;color:#fff;text-decoration:none;border-radius:8px;padding:12px 16px;font-weight:600;">Set up admin access</a></p>
        <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0;">If the button does not work, copy this link into your browser:<br><a href="${safeUrl}" style="color:#0062ff;word-break:break-all;">${safeUrl}</a></p>
      </div>
    </div>
  </body>
</html>`,
  };
}

function buildOperationalEmail({ subject, heading, body, actionUrl, actionLabel }) {
  const safeHeading = escapeHtml(heading || subject || "LAJOO Admin notification");
  const safeBody = escapeHtml(body || "");
  const safeActionUrl = actionUrl ? escapeHtml(actionUrl) : "";
  const safeActionLabel = escapeHtml(actionLabel || "Open LAJOO Admin");
  const paragraphs = normalizeText(body)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${escapeHtml(paragraph)}</p>`)
    .join("");

  return {
    subject: normalizeText(subject || "LAJOO Admin notification"),
    text: [
      heading || subject || "LAJOO Admin notification",
      "",
      body || "",
      actionUrl ? `Open: ${actionUrl}` : "",
    ].filter(Boolean).join("\n"),
    html: `<!doctype html>
<html>
  <body style="margin:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:28px;">
        <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#0062ff;margin:0 0 12px;">LAJOO Admin</p>
        <h1 style="font-size:22px;line-height:1.25;margin:0 0 14px;">${safeHeading}</h1>
        ${paragraphs || `<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${safeBody}</p>`}
        ${safeActionUrl ? `<p style="margin:0 0 24px;"><a href="${safeActionUrl}" style="display:inline-block;background:#0062ff;color:#fff;text-decoration:none;border-radius:8px;padding:12px 16px;font-weight:600;">${safeActionLabel}</a></p>` : ""}
      </div>
    </div>
  </body>
</html>`,
  };
}

async function sendResendEmail({
  to,
  subject,
  html,
  text,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = getInviteEmailConfig(env);
  const domain = extractDomainFromAdminEmailAddress(config.from);
  if (!normalizeText(to)) {
    return {
      deliveryStatus: "manual_required",
      deliveryProvider: config.provider === "resend" ? "resend" : "manual",
      deliveryMessageId: null,
      deliveryError: "No recipient email was available. Manual notification required.",
      deliveryErrorClass: "validation",
      deliverySentAt: null,
      deliveryDomain: domain || null,
      providerEnvironment: config.provider === "resend" ? "resend" : "manual",
    };
  }
  if (!config.configured) {
    return {
      deliveryStatus: "manual_required",
      deliveryProvider: config.provider === "resend" ? "resend" : "manual",
      deliveryMessageId: null,
      deliveryError: config.provider === "resend"
        ? "Resend invite email is not fully configured. Manual invite link fallback used."
        : null,
      deliveryErrorClass: config.provider === "resend" ? "missing_env" : null,
      deliverySentAt: null,
      deliveryDomain: domain || null,
      providerEnvironment: config.provider === "resend" ? "resend" : "manual",
    };
  }

  try {
    const response = await fetchImpl(RESEND_EMAILS_API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [to],
        subject,
        html,
        text,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const deliveryError = normalizeText(payload?.message || payload?.error || `Resend returned HTTP ${response.status}`).replace(config.resendApiKey, "[redacted]").slice(0, 500);
      return {
        deliveryStatus: "failed",
        deliveryProvider: "resend",
        deliveryMessageId: null,
        deliveryError,
        deliveryErrorClass: classifyAdminEmailDeliveryError({ status: response.status, message: deliveryError }),
        deliverySentAt: null,
        deliveryDomain: domain || null,
        providerEnvironment: "resend",
      };
    }
    return {
      deliveryStatus: "sent",
      deliveryProvider: "resend",
      deliveryMessageId: payload?.id || null,
      deliveryError: null,
      deliveryErrorClass: null,
      deliverySentAt: new Date(),
      deliveryDomain: domain || null,
      providerEnvironment: "resend",
    };
  } catch (error) {
    const deliveryError = normalizeText(error?.message || "Invite email send failed.").replace(config.resendApiKey, "[redacted]").slice(0, 500);
    return {
      deliveryStatus: "failed",
      deliveryProvider: "resend",
      deliveryMessageId: null,
      deliveryError,
      deliveryErrorClass: classifyAdminEmailDeliveryError(error),
      deliverySentAt: null,
      deliveryDomain: domain || null,
      providerEnvironment: "resend",
    };
  }
}

export function getAdminInviteEmailDeliveryMode(env = process.env) {
  const status = getAdminInviteEmailStatus(env);
  if (status.configured) return { provider: status.provider, configured: true };
  return {
    provider: status.provider === "resend" ? "resend" : "manual",
    configured: false,
    missing: status.provider === "resend"
      ? status.required.filter((item) => !item.configured).map((item) => item.key)
      : [],
  };
}

export async function sendAdminInviteEmail({ email, name, role, inviteUrl, expiresAt, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const message = buildInviteEmail({ inviteUrl, name, role, expiresAt });
  return sendResendEmail({
    to: email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    env,
    fetchImpl,
  });
}

export async function sendAdminOperationalEmail({
  email,
  subject,
  heading,
  body,
  actionUrl,
  actionLabel,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const message = buildOperationalEmail({ subject, heading, body, actionUrl, actionLabel });
  return sendResendEmail({
    to: email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    env,
    fetchImpl,
  });
}
