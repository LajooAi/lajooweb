import prisma from '../../lib/prisma.js';

export const CONVERSATION_AUDIT_STATUSES = ['good', 'needs_review', 'wrong'];

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{8,120}$/;

function cleanString(value, maxLength = 5000) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? clean.slice(0, maxLength) : clean;
}

function cleanNullableString(value, maxLength = 2000) {
  const clean = cleanString(value, maxLength);
  return clean || null;
}

function safeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function maskSensitiveConversationText(value = '') {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{6}-?\d{2}-?\d{4}\b/g, '[owner-id]')
    .replace(/\b01\d[\s-]?\d{3,4}[\s-]?\d{4}\b/g, '[phone]')
    .replace(/\b\d{8,}\b/g, '[number]');
}

function preview(value, maxLength = 180) {
  const clean = maskSensitiveConversationText(cleanString(value, maxLength + 80));
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}...` : clean;
}

function parsePositiveInteger(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function buildConversationWhere(searchParams = {}) {
  const where = {};
  const query = cleanString(searchParams.query, 120);
  const reviewStatus = cleanString(searchParams.reviewStatus, 40).toLowerCase();

  if (query) {
    where.OR = [
      { id: { contains: query, mode: 'insensitive' } },
      { messages: { some: { content: { contains: query, mode: 'insensitive' } } } },
    ];
  }

  if (reviewStatus && reviewStatus !== 'all') {
    if (CONVERSATION_AUDIT_STATUSES.includes(reviewStatus)) {
      where.messages = {
        some: {
          role: 'assistant',
          auditStatus: reviewStatus,
        },
      };
    } else if (reviewStatus === 'unreviewed') {
      where.messages = {
        some: {
          role: 'assistant',
          auditStatus: null,
        },
      };
    } else {
      throw new Error('Invalid conversation review filter.');
    }
  }

  return where;
}

function compactSource(source = {}) {
  return {
    id: source.id || null,
    sourceType: source.sourceType || null,
    usedFor: Array.isArray(source.usedFor) ? source.usedFor.slice(0, 6) : [],
    insurerName: source.insurerName || null,
    insurerSlug: source.insurerSlug || null,
    category: source.category || null,
    factType: source.factType || null,
    title: source.title || null,
    sourceRelativePath: source.sourceRelativePath || null,
    sourcePage: source.sourcePage || null,
    sourceLabel: source.sourceLabel || null,
    validityStatus: source.validityStatus || null,
    validFrom: source.validFrom || null,
    validTo: source.validTo || null,
    confidence: source.confidence || null,
    statementPreview: source.statementPreview || null,
    sourceExcerptPreview: source.sourceExcerptPreview || null,
  };
}

function compactKnowledgeTrace(trace = null) {
  if (!trace?.traceId) return null;
  const sources = Array.isArray(trace.sources) ? trace.sources.map(compactSource) : [];
  return {
    traceId: trace.traceId,
    createdAt: trace.createdAt || null,
    step: trace.step || null,
    intent: trace.intent || null,
    conversationMode: trace.conversationMode || null,
    responsePattern: trace.responsePattern || null,
    strictDatedFactsRequired: Boolean(trace.strictDatedFactsRequired),
    questionPreview: trace.questionPreview || '',
    sourceCount: Number(trace.sourceCount || sources.length || 0),
    sources,
    recommendation: trace.recommendation || null,
  };
}

export function mapConversationMessageForAdmin(message = {}) {
  const maskedContent = maskSensitiveConversationText(message.content || '');
  const knowledgeTrace = compactKnowledgeTrace(message.knowledgeTrace);
  return {
    id: message.id,
    role: message.role,
    content: maskedContent,
    contentPreview: preview(message.content || '', 220),
    messageOrder: message.messageOrder,
    createdAt: safeDate(message.createdAt),
    hasSourceTrace: Boolean(knowledgeTrace?.traceId),
    knowledgeTrace,
    auditStatus: message.auditStatus || null,
    auditNote: message.auditNote || '',
    auditedAt: safeDate(message.auditedAt),
    piiMasked: maskedContent !== String(message.content || ''),
  };
}

export function mapConversationSessionForAdmin(session = {}) {
  const messages = (session.messages || []).map(mapConversationMessageForAdmin);
  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  const userMessages = messages.filter((message) => message.role === 'user');
  const sourcedMessages = assistantMessages.filter((message) => message.hasSourceTrace);
  const sourceLabels = [...new Set(sourcedMessages.flatMap((message) => (
    message.knowledgeTrace?.sources || []
  ).map((source) => source.sourceLabel).filter(Boolean)))].slice(0, 8);
  const auditCounts = assistantMessages.reduce((counts, message) => {
    const status = message.auditStatus || 'unreviewed';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});

  const lastUser = [...userMessages].reverse()[0] || null;
  const lastAssistant = [...assistantMessages].reverse()[0] || null;

  return {
    id: session.id,
    createdAt: safeDate(session.createdAt),
    updatedAt: safeDate(session.updatedAt),
    expiresAt: safeDate(session.expiresAt),
    step: session.metadata?.step || session.publicState?.step || session.state?.step || null,
    conversationMode: session.metadata?.conversationMode || null,
    turnPlan: session.metadata?.turnPlan || null,
    messageCount: messages.length,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    sourcedAnswerCount: sourcedMessages.length,
    auditCounts,
    sourceLabels,
    lastUserPreview: lastUser?.contentPreview || '',
    lastAssistantPreview: lastAssistant?.contentPreview || '',
    messages,
  };
}

export function sanitizeConversationAuditUpdateInput(input = {}) {
  const statusRaw = cleanString(input.auditStatus, 40).toLowerCase();
  const auditStatus = statusRaw && statusRaw !== 'clear' && statusRaw !== 'none'
    ? statusRaw
    : null;
  if (auditStatus && !CONVERSATION_AUDIT_STATUSES.includes(auditStatus)) {
    throw new Error('Invalid message audit status.');
  }

  return {
    auditStatus,
    auditNote: cleanNullableString(input.auditNote, 2000),
  };
}

export async function listConversationAuditSessions(searchParams = {}) {
  const page = parsePositiveInteger(searchParams.page, 1, 100000);
  const pageSize = parsePositiveInteger(searchParams.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const where = buildConversationWhere(searchParams);

  const [sessions, total] = await Promise.all([
    prisma.chatSession.findMany({
      where,
      include: {
        messages: {
          select: {
            id: true,
            role: true,
            content: true,
            messageOrder: true,
            knowledgeTrace: true,
            auditStatus: true,
            auditNote: true,
            auditedAt: true,
            createdAt: true,
          },
          orderBy: { messageOrder: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.chatSession.count({ where }),
  ]);

  return {
    sessions: sessions.map((session) => {
      const mapped = mapConversationSessionForAdmin(session);
      return {
        ...mapped,
        messages: undefined,
      };
    }),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getConversationAuditSession(sessionId) {
  const id = cleanString(sessionId, 140);
  if (!SESSION_ID_REGEX.test(id)) {
    throw new Error('Invalid conversation session id.');
  }

  const session = await prisma.chatSession.findUnique({
    where: { id },
    include: {
      messages: {
        select: {
          id: true,
          role: true,
          content: true,
          messageOrder: true,
          knowledgeTrace: true,
          auditStatus: true,
          auditNote: true,
          auditedAt: true,
          createdAt: true,
        },
        orderBy: { messageOrder: 'asc' },
      },
    },
  });

  if (!session) throw new Error('Conversation session not found.');
  return {
    session: mapConversationSessionForAdmin(session),
  };
}

export async function updateConversationMessageAudit(messageId, input = {}) {
  const id = cleanString(messageId, 140);
  if (!id) throw new Error('Message id is required.');
  const updates = sanitizeConversationAuditUpdateInput(input);
  const existing = await prisma.chatMessage.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!existing) throw new Error('Conversation message not found.');
  if (existing.role !== 'assistant') {
    throw new Error('Only assistant answers can be reviewed.');
  }

  const updated = await prisma.chatMessage.update({
    where: { id },
    data: {
      auditStatus: updates.auditStatus,
      auditNote: updates.auditNote,
      auditedAt: updates.auditStatus ? new Date() : null,
    },
    select: {
      id: true,
      role: true,
      content: true,
      messageOrder: true,
      knowledgeTrace: true,
      auditStatus: true,
      auditNote: true,
      auditedAt: true,
      createdAt: true,
    },
  });

  return {
    message: mapConversationMessageForAdmin(updated),
  };
}
