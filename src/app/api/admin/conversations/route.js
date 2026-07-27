import { NextResponse } from 'next/server';
import {
  getConversationAuditSession,
  listConversationAuditSessions,
  updateConversationMessageAudit,
} from '../../../../server/admin/conversationAuditAdmin.js';
import {
  buildAdminUnauthorizedPayload,
  isAdminAuthorized,
} from '../../../../server/admin/adminAuth.js';

export const dynamic = 'force-dynamic';

function unauthorizedResponse() {
  return NextResponse.json(buildAdminUnauthorizedPayload(), { status: 401 });
}

function dbUnavailableResponse() {
  return NextResponse.json({
    error: 'DATABASE_URL is not configured, so conversations cannot be reviewed.',
  }, { status: 503 });
}

function errorResponse(error, fallback = 'Unable to load conversations.') {
  const message = error?.message || fallback;
  const status = /not found/i.test(message) ? 404 : /invalid|required|only assistant/i.test(message) ? 400 : 500;
  if (status >= 500) console.error('[admin-conversations] request failed', error);
  return NextResponse.json({ error: status >= 500 ? fallback : message }, { status });
}

export async function GET(request) {
  if (!(await isAdminAuthorized(request))) return unauthorizedResponse();
  if (!process.env.DATABASE_URL) return dbUnavailableResponse();

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  try {
    if (sessionId) {
      return NextResponse.json(await getConversationAuditSession(sessionId));
    }
    return NextResponse.json(await listConversationAuditSessions(Object.fromEntries(searchParams.entries())));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  if (!(await isAdminAuthorized(request))) return unauthorizedResponse();
  if (!process.env.DATABASE_URL) return dbUnavailableResponse();

  try {
    const body = await request.json();
    return NextResponse.json(await updateConversationMessageAudit(body?.messageId, {
      auditStatus: body?.auditStatus,
      auditNote: body?.auditNote,
    }));
  } catch (error) {
    return errorResponse(error, 'Unable to update conversation review.');
  }
}
