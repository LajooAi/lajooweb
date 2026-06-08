import { randomUUID } from 'node:crypto';
import { hashSensitiveText } from './piiMasking.js';
import { PDPA_CONSENT_VERSION } from './pdpaConsent.js';

const DB_STORE_MODES = new Set(['postgres', 'prisma', 'database', 'db']);

if (!globalThis.__lajooPdpaConsentAuditEvents) {
  globalThis.__lajooPdpaConsentAuditEvents = [];
}

const memoryConsentAuditEvents = globalThis.__lajooPdpaConsentAuditEvents;

function getStoreMode() {
  return String(process.env.LAJOO_CHAT_SESSION_STORE || '').trim().toLowerCase();
}

function shouldUseDatabaseStore() {
  return Boolean(process.env.DATABASE_URL && DB_STORE_MODES.has(getStoreMode()));
}

async function getPrismaClient() {
  const { default: prisma } = await import('./prisma.js');
  return prisma;
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeConsentAuditEvent(event = {}) {
  const acceptedAt = normalizeDate(event.acceptedAt);
  const sessionId = String(event.sessionId || '').trim();

  return {
    id: event.id || randomUUID(),
    sessionId,
    action: String(event.action || 'accepted').trim().toLowerCase(),
    consentVersion: String(event.consentVersion || event.version || PDPA_CONSENT_VERSION).trim(),
    acceptedAt,
    source: String(event.source || 'chat').trim().toLowerCase(),
    reason: event.reason ? String(event.reason).trim().slice(0, 120) : null,
    messageHash: event.messageHash || hashSensitiveText(event.acceptanceMessage || ''),
    createdAt: event.createdAt ? normalizeDate(event.createdAt) : new Date(),
  };
}

function normalizeStoredConsentAuditEvent(event) {
  if (!event) return null;
  return {
    ...event,
    acceptedAt: event.acceptedAt instanceof Date ? event.acceptedAt.toISOString() : event.acceptedAt,
    createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : event.createdAt,
  };
}

export async function recordPdpaConsentAuditEvent(event = {}) {
  const normalized = normalizeConsentAuditEvent(event);
  if (!normalized.sessionId) {
    throw new Error('PDPA consent audit event requires a sessionId.');
  }

  if (!shouldUseDatabaseStore()) {
    memoryConsentAuditEvents.push(normalized);
    return normalizeStoredConsentAuditEvent(normalized);
  }

  const prisma = await getPrismaClient();
  const saved = await prisma.pdpaConsentAuditEvent.create({
    data: {
      sessionId: normalized.sessionId,
      action: normalized.action,
      consentVersion: normalized.consentVersion,
      acceptedAt: normalized.acceptedAt,
      source: normalized.source,
      reason: normalized.reason,
      messageHash: normalized.messageHash,
    },
  });

  return normalizeStoredConsentAuditEvent(saved);
}

export async function listPdpaConsentAuditEvents(filter = {}) {
  const sessionId = String(filter.sessionId || '').trim();
  const limit = Math.max(1, Math.min(Number(filter.limit || 50), 200));

  if (!shouldUseDatabaseStore()) {
    return memoryConsentAuditEvents
      .filter((event) => !sessionId || event.sessionId === sessionId)
      .slice(-limit)
      .reverse()
      .map(normalizeStoredConsentAuditEvent);
  }

  const prisma = await getPrismaClient();
  const events = await prisma.pdpaConsentAuditEvent.findMany({
    where: {
      ...(sessionId ? { sessionId } : {}),
    },
    orderBy: { acceptedAt: 'desc' },
    take: limit,
  });

  return events.map(normalizeStoredConsentAuditEvent);
}

export function clearMemoryPdpaConsentAuditEvents() {
  memoryConsentAuditEvents.length = 0;
}

const pdpaConsentAuditStore = {
  recordPdpaConsentAuditEvent,
  listPdpaConsentAuditEvents,
  clearMemoryPdpaConsentAuditEvents,
};

export default pdpaConsentAuditStore;
