import { randomUUID } from "node:crypto";
import { recordAdminPaymentWebhookLog } from "../server/admin/adminTechLogs.js";

const DB_STORE_MODES = new Set(["postgres", "prisma", "database", "db"]);

if (!globalThis.__paymentAuditStore) {
  globalThis.__paymentAuditStore = [];
}

const memoryAuditEvents = globalThis.__paymentAuditStore;

export const PAYMENT_AUDIT_DIRECTION = {
  CLIENT_REQUEST: "client_request",
  PROVIDER_RESPONSE: "provider_response",
  PROVIDER_WEBHOOK: "provider_webhook",
};

export const PAYMENT_AUDIT_STATUS = {
  RECEIVED: "received",
  VERIFIED: "verified",
  APPLIED: "applied",
  IGNORED: "ignored",
  REJECTED: "rejected",
  FAILED: "failed",
};

function getStoreMode() {
  return String(
    process.env.LAJOO_PAYMENT_SNAPSHOT_STORE ||
    process.env.LAJOO_CHAT_SESSION_STORE ||
    ""
  ).trim().toLowerCase();
}

function shouldUseDatabaseStore() {
  return Boolean(process.env.DATABASE_URL && DB_STORE_MODES.has(getStoreMode()));
}

async function getPrismaClient() {
  const { default: prisma } = await import("./prisma.js");
  return prisma;
}

function normalizeAuditEvent(event = {}) {
  const provider = String(event.provider || "unknown").trim().toLowerCase();
  const eventType = String(event.eventType || "payment.event").trim();
  const eventStatus = String(event.eventStatus || PAYMENT_AUDIT_STATUS.RECEIVED).trim();
  const direction = String(event.direction || PAYMENT_AUDIT_DIRECTION.PROVIDER_WEBHOOK).trim();

  return {
    id: event.id || randomUUID(),
    paymentId: event.paymentId || null,
    provider,
    direction,
    eventType,
    eventStatus,
    signatureStatus: event.signatureStatus || null,
    providerEventId: event.providerEventId || null,
    providerPaymentId: event.providerPaymentId || null,
    requestId: event.requestId || null,
    rawBodyHash: event.rawBodyHash || null,
    payload: event.payload || null,
    errorCode: event.errorCode || null,
    errorMessage: event.errorMessage || null,
    createdAt: event.createdAt || new Date(),
  };
}

function normalizeStoredAuditEvent(event) {
  if (!event) return null;
  return {
    ...event,
    createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : event.createdAt,
  };
}

export async function recordPaymentAuditEvent(event) {
  const normalized = normalizeAuditEvent(event);

  if (normalized.direction === PAYMENT_AUDIT_DIRECTION.PROVIDER_WEBHOOK) {
    recordAdminPaymentWebhookLog({
      provider: normalized.provider,
      eventType: normalized.eventType,
      eventStatus: normalized.eventStatus,
      paymentId: normalized.paymentId,
      providerEventId: normalized.providerEventId,
      requestId: normalized.requestId,
      verificationStatus: normalized.signatureStatus || normalized.eventStatus,
      signatureStatus: normalized.signatureStatus,
      retryCount: event.retryCount || 0,
      payloadSummary: normalized.payload,
      errorCode: normalized.errorCode,
      errorMessage: normalized.errorMessage,
      source: normalized.provider === "mock" ? "mock" : "system",
    }).catch(() => null);
  }

  if (!shouldUseDatabaseStore()) {
    memoryAuditEvents.push(normalized);
    return normalizeStoredAuditEvent(normalized);
  }

  const prisma = await getPrismaClient();
  const saved = await prisma.paymentAuditEvent.create({
    data: {
      paymentId: normalized.paymentId,
      provider: normalized.provider,
      direction: normalized.direction,
      eventType: normalized.eventType,
      eventStatus: normalized.eventStatus,
      signatureStatus: normalized.signatureStatus,
      providerEventId: normalized.providerEventId,
      providerPaymentId: normalized.providerPaymentId,
      requestId: normalized.requestId,
      rawBodyHash: normalized.rawBodyHash,
      payload: normalized.payload,
      errorCode: normalized.errorCode,
      errorMessage: normalized.errorMessage,
    },
  });

  return normalizeStoredAuditEvent(saved);
}

export async function listPaymentAuditEvents(filter = {}) {
  const paymentId = String(filter.paymentId || "").trim();
  const provider = String(filter.provider || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(Number(filter.limit || 50), 200));

  if (!shouldUseDatabaseStore()) {
    return memoryAuditEvents
      .filter((event) => !paymentId || event.paymentId === paymentId)
      .filter((event) => !provider || event.provider === provider)
      .slice(-limit)
      .reverse()
      .map(normalizeStoredAuditEvent);
  }

  const prisma = await getPrismaClient();
  const events = await prisma.paymentAuditEvent.findMany({
    where: {
      ...(paymentId ? { paymentId } : {}),
      ...(provider ? { provider } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return events.map(normalizeStoredAuditEvent);
}

export function clearMemoryPaymentAuditEvents() {
  memoryAuditEvents.length = 0;
}

const paymentAuditStore = {
  PAYMENT_AUDIT_DIRECTION,
  PAYMENT_AUDIT_STATUS,
  recordPaymentAuditEvent,
  listPaymentAuditEvents,
  clearMemoryPaymentAuditEvents,
};

export default paymentAuditStore;
