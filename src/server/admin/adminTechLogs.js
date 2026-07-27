function shouldWriteAdminTechLogs() {
  return Boolean(process.env.DATABASE_URL);
}

async function getPrisma() {
  return (await import("../../lib/prisma.js")).default;
}

function asString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function optionalInt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : null;
}

function getProviderEnvironment(event = {}) {
  return asString(
    event.providerEnvironment ||
    event.environment ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "unknown",
    "unknown",
  ).toLowerCase();
}

function shouldRedactKey(key) {
  return /secret|token|password|authorization|signature|raw|email|phone|mobile|contact|ic|nric|identity|address/i.test(key);
}

function redactString(value) {
  let output = String(value);
  output = output.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted_email]");
  output = output.replace(/\b\d{6}-?\d{2}-?\d{4}\b/g, "[redacted_ic]");
  output = output.replace(/\+?6?0?1\d[\d\s-]{6,}\d/g, "[redacted_phone]");
  return output.length > 180 ? `${output.slice(0, 180)}...` : output;
}

function summarizeValue(value, key = "", depth = 0) {
  if (shouldRedactKey(key)) return "[redacted]";
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (depth >= 3) return `[array:${value.length}]`;
    return value.slice(0, 10).map((item) => summarizeValue(item, key, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= 3) return "[object]";
    return summarizePayload(value, depth + 1);
  }
  return String(value);
}

function summarizePayload(payload, depth = 0) {
  if (!payload || typeof payload !== "object") return summarizeValue(payload);
  const summary = {};
  for (const [key, value] of Object.entries(payload)) {
    summary[key] = summarizeValue(value, key, depth);
  }
  return summary;
}

export function classifyAdminOperationalError(error = {}) {
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
  if (/timeout|timed out|abort|etimedout|gateway timeout/.test(text)) return "timeout";
  if (/auth|unauthori[sz]ed|forbidden|credential|api key|permission/.test(text)) return "auth";
  if (/rate.?limit|too many|quota/.test(text)) return "rate_limit";
  if (/validation|invalid|schema|bad request|400/.test(text)) return "validation";
  if (/unavailable|econn|network|fetch failed|5\d\d|provider/.test(text)) return "provider_unavailable";
  return "unknown";
}

function errorClassFromEvent(event = {}) {
  return asString(event.errorClass || classifyAdminOperationalError(event), "");
}

function providerMetadata(event = {}) {
  return {
    providerEnvironment: getProviderEnvironment(event),
    retryCount: optionalInt(event.retryCount ?? event.retries) ?? 0,
    latencyMs: optionalInt(event.latencyMs),
    errorClass: errorClassFromEvent(event) || null,
  };
}

async function safeCreate(modelName, data) {
  if (!shouldWriteAdminTechLogs()) return null;
  try {
    const prisma = await getPrisma();
    if (!prisma[modelName]) return null;
    return await prisma[modelName].create({ data });
  } catch (error) {
    console.warn(`[admin-tech-logs] Unable to write ${modelName}.`, error?.message || error);
    return null;
  }
}

export async function recordAdminPaymentWebhookLog(event = {}) {
  const metadata = providerMetadata(event);
  return safeCreate("adminPaymentWebhookLog", {
    provider: asString(event.provider, "unknown").toLowerCase(),
    eventType: asString(event.eventType, "payment.event"),
    eventStatus: asString(event.eventStatus, "received"),
    paymentId: event.paymentId || null,
    providerEventId: event.providerEventId || null,
    requestId: event.requestId || null,
    providerEnvironment: metadata.providerEnvironment,
    verificationStatus: asString(event.verificationStatus || event.signatureStatus, "") || null,
    retryCount: metadata.retryCount,
    latencyMs: metadata.latencyMs,
    errorClass: metadata.errorClass,
    payloadSummary: summarizePayload(event.payloadSummary || event.payload),
    errorCode: event.errorCode || null,
    errorMessage: event.errorMessage || null,
    source: asString(event.source, "system"),
  });
}

export async function recordAdminInsurerAdapterLog(event = {}) {
  const metadata = providerMetadata(event);
  return safeCreate("adminInsurerAdapterLog", {
    insurerCode: asString(event.insurerCode || event.adapterKey, "unknown").toUpperCase(),
    adapterName: asString(event.adapterName, "UnknownAdapter"),
    operation: asString(event.operation, "unknown_operation"),
    status: asString(event.status, "unknown"),
    latencyMs: metadata.latencyMs,
    requestId: event.requestId || null,
    providerEnvironment: metadata.providerEnvironment,
    adapterVersion: asString(event.adapterVersion, "") || null,
    retryCount: metadata.retryCount,
    errorClass: metadata.errorClass,
    errorCode: event.errorCode || null,
    errorMessage: event.errorMessage || null,
    metadata: summarizePayload(event.metadata),
    source: asString(event.source, "system"),
  });
}

export async function recordAdminOpenAiUsageLog(event = {}) {
  const metadata = providerMetadata(event);
  return safeCreate("adminOpenAiUsageLog", {
    model: asString(event.model, "unknown"),
    operation: asString(event.operation, "unknown_operation"),
    status: asString(event.status, "unknown"),
    promptTokens: Number.isFinite(Number(event.promptTokens)) ? Number(event.promptTokens) : null,
    completionTokens: Number.isFinite(Number(event.completionTokens)) ? Number(event.completionTokens) : null,
    totalTokens: Number.isFinite(Number(event.totalTokens)) ? Number(event.totalTokens) : null,
    costEstimateUsd: Number.isFinite(Number(event.costEstimateUsd)) ? Number(event.costEstimateUsd) : null,
    requestId: event.requestId || null,
    providerEnvironment: metadata.providerEnvironment,
    retryCount: metadata.retryCount,
    latencyMs: metadata.latencyMs,
    errorClass: metadata.errorClass,
    errorCode: event.errorCode || null,
    errorMessage: event.errorMessage || null,
    metadata: summarizePayload(event.metadata),
    source: asString(event.source, "system"),
  });
}

export async function recordAdminJobQueueLog(event = {}) {
  const metadata = providerMetadata(event);
  return safeCreate("adminJobQueueLog", {
    queueName: asString(event.queueName, "default"),
    jobName: asString(event.jobName, "unknown_job"),
    status: asString(event.status, "unknown"),
    attempts: Number.isFinite(Number(event.attempts)) ? Number(event.attempts) : 0,
    retryCount: metadata.retryCount,
    workerName: asString(event.workerName, "") || null,
    errorClass: metadata.errorClass,
    scheduledFor: event.scheduledFor ? new Date(event.scheduledFor) : null,
    startedAt: event.startedAt ? new Date(event.startedAt) : null,
    finishedAt: event.finishedAt ? new Date(event.finishedAt) : null,
    errorMessage: event.errorMessage || null,
    metadata: summarizePayload(event.metadata),
    source: asString(event.source, "system"),
  });
}

export async function recordAdminCronReminderLog(event = {}) {
  const metadata = providerMetadata(event);
  return safeCreate("adminCronReminderLog", {
    cronName: asString(event.cronName, "unknown_cron"),
    status: asString(event.status, "unknown"),
    scheduledFor: event.scheduledFor ? new Date(event.scheduledFor) : null,
    startedAt: event.startedAt ? new Date(event.startedAt) : null,
    finishedAt: event.finishedAt ? new Date(event.finishedAt) : null,
    affectedCount: Number.isFinite(Number(event.affectedCount)) ? Number(event.affectedCount) : null,
    retryCount: metadata.retryCount,
    workerName: asString(event.workerName, "") || null,
    errorClass: metadata.errorClass,
    errorMessage: event.errorMessage || null,
    metadata: summarizePayload(event.metadata),
    source: asString(event.source, "system"),
  });
}

export async function withAdminJobQueueLog(jobConfig = {}, handler) {
  const startedAt = new Date();
  await recordAdminJobQueueLog({
    ...jobConfig,
    status: "started",
    startedAt,
    source: jobConfig.source || "system",
  });
  try {
    const result = await handler();
    await recordAdminJobQueueLog({
      ...jobConfig,
      status: "completed",
      startedAt,
      finishedAt: new Date(),
      source: jobConfig.source || "system",
    });
    return result;
  } catch (error) {
    await recordAdminJobQueueLog({
      ...jobConfig,
      status: "failed",
      startedAt,
      finishedAt: new Date(),
      errorCode: error?.code || null,
      errorMessage: error?.message || "Job failed.",
      errorClass: classifyAdminOperationalError(error),
      source: jobConfig.source || "system",
    });
    throw error;
  }
}

export async function withAdminCronReminderLog(cronConfig = {}, handler) {
  const startedAt = new Date();
  await recordAdminCronReminderLog({
    ...cronConfig,
    status: "started",
    startedAt,
    source: cronConfig.source || "system",
  });
  try {
    const result = await handler();
    await recordAdminCronReminderLog({
      ...cronConfig,
      status: "completed",
      startedAt,
      finishedAt: new Date(),
      affectedCount: Number.isFinite(Number(result?.affectedCount)) ? Number(result.affectedCount) : cronConfig.affectedCount,
      source: cronConfig.source || "system",
    });
    return result;
  } catch (error) {
    await recordAdminCronReminderLog({
      ...cronConfig,
      status: "failed",
      startedAt,
      finishedAt: new Date(),
      errorMessage: error?.message || "Cron handler failed.",
      errorClass: classifyAdminOperationalError(error),
      source: cronConfig.source || "system",
    });
    throw error;
  }
}

export function normalizeAdminTechLogPayloadForTest(payload) {
  return summarizePayload(payload);
}

export function normalizeAdminProviderObservabilityForTest(event = {}) {
  return {
    ...providerMetadata(event),
    verificationStatus: asString(event.verificationStatus || event.signatureStatus, "") || null,
    adapterVersion: asString(event.adapterVersion, "") || null,
    payloadSummary: summarizePayload(event.payloadSummary || event.payload || {}),
  };
}
