import { randomUUID } from 'node:crypto';
import { ConversationState } from '../../lib/conversationState.js';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGES_PER_SESSION = 120;
const MAX_CONTENT_LENGTH = 12000;
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{8,120}$/;
const DATABASE_STORE_MODES = new Set(['postgres', 'prisma', 'database', 'db']);

function getStore() {
  if (!globalThis.__lajooChatSessionStore) {
    globalThis.__lajooChatSessionStore = new Map();
  }
  return globalThis.__lajooChatSessionStore;
}

function shouldUseDatabaseStore() {
  return DATABASE_STORE_MODES.has(String(process.env.LAJOO_CHAT_SESSION_STORE || '').trim().toLowerCase());
}

async function getPrismaClient() {
  const { default: prisma } = await import('../../lib/prisma.js');
  return prisma;
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function getTtlMs() {
  const configured = Number(process.env.LAJOO_CHAT_SESSION_TTL_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_MS;
}

export function createChatSessionId() {
  return `chat_${randomUUID()}`;
}

export function normalizeChatSessionId(value) {
  const candidate = String(value || '').trim();
  if (SESSION_ID_REGEX.test(candidate) && candidate.toLowerCase() !== 'default') {
    return candidate;
  }
  return createChatSessionId();
}

export function sanitizeChatMessages(messages = [], options = {}) {
  if (!Array.isArray(messages)) return [];
  const allowKnowledgeTrace = Boolean(options.allowKnowledgeTrace);

  return messages
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
    .map((message) => {
      const sanitized = {
        role: message.role,
        content: String(message.content || '').slice(0, MAX_CONTENT_LENGTH),
      };

      if (message.summaryCard) sanitized.summaryCard = cloneJson(message.summaryCard);
      if (message.addOnsCard) sanitized.addOnsCard = cloneJson(message.addOnsCard);
      if (message.roadTaxCard) sanitized.roadTaxCard = cloneJson(message.roadTaxCard);
      if (message.paymentCard) sanitized.paymentCard = cloneJson(message.paymentCard);
      if (message.paymentSuccessCard) sanitized.paymentSuccessCard = cloneJson(message.paymentSuccessCard);
      if (allowKnowledgeTrace && message.knowledgeTrace) sanitized.knowledgeTrace = cloneJson(message.knowledgeTrace);

      return sanitized;
    })
    .slice(-MAX_MESSAGES_PER_SESSION);
}

function getLastUserMessage(messages = []) {
  return [...messages].reverse().find((message) => message?.role === 'user') || null;
}

function sameMessage(a, b) {
  return !!a &&
    !!b &&
    a.role === b.role &&
    String(a.content || '') === String(b.content || '');
}

function toNullableJson(value) {
  return value == null ? null : cloneJson(value);
}

function toEpochMs(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function mapDatabaseMessage(message) {
  return {
    role: message.role,
    content: message.content || '',
    summaryCard: message.summaryCard || null,
    addOnsCard: message.addOnsCard || null,
    roadTaxCard: message.roadTaxCard || null,
    paymentCard: message.paymentCard || null,
    paymentSuccessCard: message.paymentSuccessCard || null,
    knowledgeTrace: message.knowledgeTrace || null,
  };
}

function mapDatabaseSession(session) {
  if (!session) return null;

  return cloneJson({
    sessionId: session.id,
    createdAt: toEpochMs(session.createdAt),
    updatedAt: toEpochMs(session.updatedAt),
    expiresAt: toEpochMs(session.expiresAt),
    state: session.state || null,
    publicState: session.publicState || null,
    messages: sanitizeChatMessages((session.messages || []).map(mapDatabaseMessage), { allowKnowledgeTrace: true }),
    lastIntent: session.lastIntent || null,
    metadata: session.metadata || {},
  });
}

async function loadDatabaseSession(id) {
  const prisma = await getPrismaClient();
  const session = await prisma.chatSession.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { messageOrder: 'asc' },
      },
    },
  });

  if (!session) return null;

  const expiresAt = toEpochMs(session.expiresAt);
  if (expiresAt && expiresAt <= Date.now()) {
    await prisma.chatSession.delete({ where: { id } }).catch(() => null);
    return null;
  }

  return mapDatabaseSession(session);
}

async function saveDatabaseSession(session) {
  const prisma = await getPrismaClient();
  const messages = sanitizeChatMessages(session.messages, { allowKnowledgeTrace: true });

  await prisma.$transaction(async (tx) => {
    await tx.chatSession.upsert({
      where: { id: session.sessionId },
      create: {
        id: session.sessionId,
        state: toNullableJson(session.state),
        publicState: toNullableJson(session.publicState),
        lastIntent: toNullableJson(session.lastIntent),
        metadata: toNullableJson(session.metadata),
        expiresAt: new Date(session.expiresAt),
      },
      update: {
        state: toNullableJson(session.state),
        publicState: toNullableJson(session.publicState),
        lastIntent: toNullableJson(session.lastIntent),
        metadata: toNullableJson(session.metadata),
        expiresAt: new Date(session.expiresAt),
      },
    });

    await tx.chatMessage.deleteMany({
      where: { sessionId: session.sessionId },
    });

    if (messages.length > 0) {
      await tx.chatMessage.createMany({
        data: messages.map((message, index) => ({
          sessionId: session.sessionId,
          role: message.role,
          content: message.content || '',
          messageOrder: index,
          summaryCard: toNullableJson(message.summaryCard),
          addOnsCard: toNullableJson(message.addOnsCard),
          roadTaxCard: toNullableJson(message.roadTaxCard),
          paymentCard: toNullableJson(message.paymentCard),
          paymentSuccessCard: toNullableJson(message.paymentSuccessCard),
          knowledgeTrace: toNullableJson(message.knowledgeTrace),
        })),
      });
    }
  });

  return loadDatabaseSession(session.sessionId);
}

async function clearDatabaseSession(id) {
  const prisma = await getPrismaClient();
  const result = await prisma.chatSession.deleteMany({
    where: { id },
  });
  return result.count > 0;
}

export function resolveMessagesForTurn({ serverMessages = [], requestMessages = [] } = {}) {
  const safeServerMessages = sanitizeChatMessages(serverMessages, { allowKnowledgeTrace: true });
  const safeRequestMessages = sanitizeChatMessages(requestMessages);

  if (safeServerMessages.length === 0) return safeRequestMessages;
  if (safeRequestMessages.length === 0) return safeServerMessages;

  // Current browser sends the whole visible history. Prefer it when it is at
  // least as complete as the server history, because it includes the latest user turn.
  if (safeRequestMessages.length >= safeServerMessages.length) {
    return safeRequestMessages;
  }

  // Future-safe path: if the browser sends only the newest user message, append
  // it to server history without duplicating the previous turn.
  const latestRequestUser = getLastUserMessage(safeRequestMessages);
  const latestServerMessage = safeServerMessages[safeServerMessages.length - 1];
  if (latestRequestUser && !sameMessage(latestRequestUser, latestServerMessage)) {
    return sanitizeChatMessages([...safeServerMessages, latestRequestUser], { allowKnowledgeTrace: true });
  }

  return safeServerMessages;
}

export function serializeStateForStorage(state) {
  if (!state) return null;
  const base = typeof state.toStorageJSON === 'function'
    ? state.toStorageJSON()
    : (typeof state.toJSON === 'function' ? state.toJSON() : state);
  return cloneJson(base);
}

export function serializeStateForClient(state) {
  if (!state) return null;
  const publicJson = typeof state.toJSON === 'function' ? state.toJSON() : state;
  return cloneJson(publicJson);
}

export async function loadChatSession(sessionId) {
  const id = normalizeChatSessionId(sessionId);

  if (shouldUseDatabaseStore()) {
    return loadDatabaseSession(id);
  }

  const store = getStore();
  const session = store.get(id);
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt && session.expiresAt <= now) {
    store.delete(id);
    return null;
  }

  return cloneJson({
    ...session,
    sessionId: id,
  });
}

export async function saveChatSession({
  sessionId,
  state,
  messages = [],
  lastIntent = null,
  metadata = {},
} = {}) {
  const id = normalizeChatSessionId(sessionId);
  const now = Date.now();
  const existing = getStore().get(id);
  const session = {
    sessionId: id,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    expiresAt: now + getTtlMs(),
    state: serializeStateForStorage(state),
    publicState: serializeStateForClient(state),
    messages: sanitizeChatMessages(messages, { allowKnowledgeTrace: true }),
    lastIntent: lastIntent ? cloneJson(lastIntent) : null,
    metadata: cloneJson(metadata || {}),
  };

  if (shouldUseDatabaseStore()) {
    return saveDatabaseSession(session);
  }

  getStore().set(id, session);
  return cloneJson(session);
}

export async function clearChatSession(sessionId) {
  const id = normalizeChatSessionId(sessionId);

  if (shouldUseDatabaseStore()) {
    return clearDatabaseSession(id);
  }

  return getStore().delete(id);
}

export async function getStateFromSession(session) {
  if (!session?.state) return null;
  return ConversationState.fromJSON(session.state);
}

export function appendAssistantMessageForStorage(messages = [], assistantMessage = {}) {
  return sanitizeChatMessages([
    ...sanitizeChatMessages(messages),
    {
      role: 'assistant',
      content: assistantMessage.content || '',
      summaryCard: assistantMessage.summaryCard || null,
      addOnsCard: assistantMessage.addOnsCard || null,
      roadTaxCard: assistantMessage.roadTaxCard || null,
      paymentCard: assistantMessage.paymentCard || null,
      paymentSuccessCard: assistantMessage.paymentSuccessCard || null,
      knowledgeTrace: assistantMessage.knowledgeTrace || null,
    },
  ], { allowKnowledgeTrace: true });
}

export function cleanupExpiredChatSessions() {
  const store = getStore();
  const now = Date.now();
  let cleaned = 0;
  for (const [id, session] of store.entries()) {
    if (session.expiresAt && session.expiresAt <= now) {
      store.delete(id);
      cleaned += 1;
    }
  }
  return cleaned;
}

const chatSessionStore = {
  createChatSessionId,
  normalizeChatSessionId,
  sanitizeChatMessages,
  resolveMessagesForTurn,
  serializeStateForStorage,
  serializeStateForClient,
  loadChatSession,
  saveChatSession,
  clearChatSession,
  getStateFromSession,
  appendAssistantMessageForStorage,
  cleanupExpiredChatSessions,
};

export default chatSessionStore;
