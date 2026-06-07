/**
 * Payment Store - server-owned payment intent snapshots
 *
 * Payment amounts are locked on the server before checkout. The payment page
 * and payment APIs load the snapshot by paymentId instead of trusting URL
 * query parameters.
 */

const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const DB_STORE_MODES = new Set(["postgres", "prisma", "database", "db"]);

if (!globalThis.__paymentStore) {
  globalThis.__paymentStore = new Map();
}

const memoryStore = globalThis.__paymentStore;

export const PAYMENT_STATUS = {
  REQUIRES_PROVIDER: "requires_provider",
  PENDING: "pending",
  PROCESSING: "processing",
  CONFIRMED: "confirmed",
  FAILED: "failed",
  EXPIRED: "expired",
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
  const { default: prisma } = await import("@/lib/prisma");
  return prisma;
}

function toMoney(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric * 100) / 100;
}

function toDate(value, fallback = null) {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function toIsoOrNumber(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function createDefaultExpiry() {
  return new Date(Date.now() + SNAPSHOT_TTL_MS);
}

function normalizePaymentInput(paymentData = {}) {
  const paymentId = String(paymentData.paymentId || paymentData.id || "").trim();
  if (!paymentId) {
    throw new Error("paymentId is required");
  }

  const expiresAt = toDate(paymentData.expiresAt, createDefaultExpiry());
  const insurance = toMoney(paymentData.insurance);
  const addons = toMoney(paymentData.addons);
  const tax = toMoney(paymentData.tax);
  const roadtax = toMoney(paymentData.roadtax);
  const total = toMoney(paymentData.total ?? paymentData.amount ?? (insurance + addons + tax + roadtax));

  return {
    paymentId,
    id: paymentId,
    sessionId: paymentData.sessionId || null,
    provider: paymentData.provider || "mock",
    providerMode: paymentData.providerMode || paymentData.mode || null,
    providerPaymentIntentId: paymentData.providerPaymentIntentId || null,
    status: paymentData.status || PAYMENT_STATUS.REQUIRES_PROVIDER,
    paymentMethod: paymentData.paymentMethod || null,
    total,
    amount: total,
    currency: paymentData.currency || "MYR",
    insurer: paymentData.insurer || "",
    plate: paymentData.plate || "",
    insurance,
    addons,
    tax,
    roadtax,
    breakdown: paymentData.breakdown || null,
    checkoutData: paymentData.checkoutData || null,
    clientConfirmationToken: paymentData.clientConfirmationToken || null,
    transactionRef: paymentData.transactionRef || null,
    paymentAvailable: Boolean(paymentData.paymentAvailable),
    canIssuePolicy: Boolean(paymentData.canIssuePolicy),
    failureReason: paymentData.failureReason || null,
    confirmedAt: toDate(paymentData.confirmedAt, null),
    expiresAt,
  };
}

function normalizeStoredPayment(payment) {
  if (!payment) return null;

  const isPrismaRecord = Object.prototype.hasOwnProperty.call(payment, "amount");
  const total = toMoney(isPrismaRecord ? payment.amount : payment.total);

  return {
    paymentId: payment.paymentId || payment.id,
    id: payment.paymentId || payment.id,
    sessionId: payment.sessionId || null,
    provider: payment.provider || "mock",
    providerMode: payment.providerMode || null,
    providerPaymentIntentId: payment.providerPaymentIntentId || null,
    status: payment.status || PAYMENT_STATUS.REQUIRES_PROVIDER,
    paymentMethod: payment.paymentMethod || null,
    total,
    amount: total,
    currency: payment.currency || "MYR",
    insurer: payment.insurer || "",
    plate: payment.plate || "",
    insurance: toMoney(payment.insurance),
    addons: toMoney(payment.addons),
    tax: toMoney(payment.tax),
    roadtax: toMoney(payment.roadtax),
    breakdown: payment.breakdown || null,
    checkoutData: payment.checkoutData || null,
    clientConfirmationToken: payment.clientConfirmationToken || null,
    transactionRef: payment.transactionRef || null,
    paymentAvailable: Boolean(payment.paymentAvailable),
    canIssuePolicy: Boolean(payment.canIssuePolicy),
    failureReason: payment.failureReason || null,
    confirmedAt: toIsoOrNumber(payment.confirmedAt),
    expiresAt: toIsoOrNumber(payment.expiresAt),
    createdAt: toIsoOrNumber(payment.createdAt),
    updatedAt: toIsoOrNumber(payment.updatedAt),
  };
}

function toPrismaData(payment) {
  return {
    sessionId: payment.sessionId,
    provider: payment.provider,
    providerMode: payment.providerMode,
    providerPaymentIntentId: payment.providerPaymentIntentId,
    status: payment.status,
    paymentMethod: payment.paymentMethod,
    amount: payment.total,
    currency: payment.currency,
    insurer: payment.insurer,
    plate: payment.plate,
    insurance: payment.insurance,
    addons: payment.addons,
    tax: payment.tax,
    roadtax: payment.roadtax,
    breakdown: payment.breakdown,
    checkoutData: payment.checkoutData,
    clientConfirmationToken: payment.clientConfirmationToken,
    transactionRef: payment.transactionRef,
    paymentAvailable: payment.paymentAvailable,
    canIssuePolicy: payment.canIssuePolicy,
    failureReason: payment.failureReason,
    confirmedAt: payment.confirmedAt,
    expiresAt: payment.expiresAt,
  };
}

function createMemoryPayment(paymentData) {
  const payment = normalizePaymentInput(paymentData);
  const now = Date.now();
  const memoryPayment = {
    ...payment,
    createdAt: paymentData.createdAt || now,
    updatedAt: paymentData.updatedAt || now,
    expiresAt: payment.expiresAt.getTime(),
    confirmedAt: payment.confirmedAt ? payment.confirmedAt.getTime() : null,
  };
  memoryStore.set(payment.paymentId, memoryPayment);
  return normalizeStoredPayment(memoryPayment);
}

function getMemoryPayment(paymentId) {
  const payment = memoryStore.get(paymentId);
  if (!payment) return null;

  if (payment.expiresAt && Date.now() > Number(payment.expiresAt) && payment.status !== PAYMENT_STATUS.CONFIRMED) {
    payment.status = PAYMENT_STATUS.EXPIRED;
    payment.updatedAt = Date.now();
    memoryStore.set(paymentId, payment);
  }

  return normalizeStoredPayment(payment);
}

function updateMemoryPayment(paymentId, status, additionalData = {}) {
  const existing = memoryStore.get(paymentId);
  if (!existing) return null;

  const normalizedAdditional = normalizePaymentInput({
    ...existing,
    ...additionalData,
    paymentId,
    status,
  });
  const updated = {
    ...existing,
    ...normalizedAdditional,
    ...additionalData,
    status,
    updatedAt: Date.now(),
    expiresAt: normalizedAdditional.expiresAt.getTime(),
    confirmedAt: status === PAYMENT_STATUS.CONFIRMED
      ? Date.now()
      : normalizedAdditional.confirmedAt
        ? normalizedAdditional.confirmedAt.getTime()
        : existing.confirmedAt || null,
  };

  memoryStore.set(paymentId, updated);
  return normalizeStoredPayment(updated);
}

export function sanitizePaymentForClient(payment) {
  const normalized = normalizeStoredPayment(payment);
  if (!normalized) return null;

  return {
    paymentId: normalized.paymentId,
    status: normalized.status,
    provider: normalized.provider,
    providerMode: normalized.providerMode,
    paymentAvailable: normalized.paymentAvailable,
    canIssuePolicy: false,
    total: normalized.total,
    currency: normalized.currency,
    insurer: normalized.insurer,
    plate: normalized.plate,
    insurance: normalized.insurance,
    addons: normalized.addons,
    tax: normalized.tax,
    roadtax: normalized.roadtax,
    paymentMethod: normalized.paymentMethod,
    checkoutData: normalized.checkoutData,
    breakdown: normalized.breakdown,
    transactionRef: normalized.transactionRef,
    confirmedAt: normalized.confirmedAt,
    expiresAt: normalized.expiresAt,
  };
}

export async function createPayment(paymentData) {
  const payment = normalizePaymentInput(paymentData);

  if (!shouldUseDatabaseStore()) {
    return createMemoryPayment(payment);
  }

  const prisma = await getPrismaClient();
  const saved = await prisma.paymentIntentSnapshot.upsert({
    where: { id: payment.paymentId },
    create: {
      id: payment.paymentId,
      ...toPrismaData(payment),
    },
    update: toPrismaData(payment),
  });

  return normalizeStoredPayment(saved);
}

export async function getPayment(paymentId) {
  const id = String(paymentId || "").trim();
  if (!id) return null;

  if (!shouldUseDatabaseStore()) {
    return getMemoryPayment(id);
  }

  const prisma = await getPrismaClient();
  const payment = await prisma.paymentIntentSnapshot.findUnique({
    where: { id },
  });
  if (!payment) return null;

  if (payment.expiresAt && payment.expiresAt.getTime() < Date.now() && payment.status !== PAYMENT_STATUS.CONFIRMED) {
    const expired = await prisma.paymentIntentSnapshot.update({
      where: { id },
      data: { status: PAYMENT_STATUS.EXPIRED },
    });
    return normalizeStoredPayment(expired);
  }

  return normalizeStoredPayment(payment);
}

export async function updatePaymentStatus(paymentId, status, additionalData = {}) {
  const id = String(paymentId || "").trim();
  if (!id) return null;

  if (!shouldUseDatabaseStore()) {
    return updateMemoryPayment(id, status, additionalData);
  }

  const existing = await getPayment(id);
  if (!existing) return null;

  const merged = normalizePaymentInput({
    ...existing,
    ...additionalData,
    paymentId: id,
    status,
    confirmedAt: status === PAYMENT_STATUS.CONFIRMED ? new Date() : additionalData.confirmedAt || existing.confirmedAt,
  });
  const prisma = await getPrismaClient();
  const updated = await prisma.paymentIntentSnapshot.update({
    where: { id },
    data: toPrismaData(merged),
  });

  return normalizeStoredPayment(updated);
}

export async function confirmPayment(paymentId, transactionRef = null) {
  return updatePaymentStatus(paymentId, PAYMENT_STATUS.CONFIRMED, {
    transactionRef,
  });
}

export async function failPayment(paymentId, reason = null) {
  return updatePaymentStatus(paymentId, PAYMENT_STATUS.FAILED, {
    failureReason: reason,
  });
}

export async function getPaymentsBySession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return [];

  if (!shouldUseDatabaseStore()) {
    const payments = [];
    for (const payment of memoryStore.values()) {
      if (payment.sessionId === id) payments.push(normalizeStoredPayment(payment));
    }
    return payments.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  const prisma = await getPrismaClient();
  const payments = await prisma.paymentIntentSnapshot.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "desc" },
  });
  return payments.map(normalizeStoredPayment);
}

export async function cleanupExpiredPayments() {
  const now = Date.now();

  if (!shouldUseDatabaseStore()) {
    let cleaned = 0;
    for (const [id, payment] of memoryStore) {
      if (now - Number(payment.createdAt || now) > 24 * 60 * 60 * 1000) {
        memoryStore.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  const prisma = await getPrismaClient();
  const result = await prisma.paymentIntentSnapshot.deleteMany({
    where: {
      createdAt: {
        lt: new Date(now - 24 * 60 * 60 * 1000),
      },
      status: {
        in: [PAYMENT_STATUS.EXPIRED, PAYMENT_STATUS.FAILED],
      },
    },
  });
  return result.count;
}

const paymentStore = {
  createPayment,
  getPayment,
  updatePaymentStatus,
  confirmPayment,
  failPayment,
  getPaymentsBySession,
  cleanupExpiredPayments,
  sanitizePaymentForClient,
  PAYMENT_STATUS,
};

export default paymentStore;
