import { NextResponse } from 'next/server';
import {
  listKnowledgeFacts,
  updateKnowledgeDocumentValidity,
  updateKnowledgeFact,
} from '../../../../../server/admin/knowledgeFactsAdmin.js';

export const dynamic = 'force-dynamic';

function isAdminAuthorized(request) {
  const expectedToken = process.env.LAJOO_ADMIN_TOKEN;
  if (!expectedToken && process.env.NODE_ENV !== 'production') return true;
  if (!expectedToken) return false;

  const headerToken = request.headers.get('x-lajoo-admin-token') || '';
  const bearer = request.headers.get('authorization') || '';
  const bearerToken = bearer.toLowerCase().startsWith('bearer ')
    ? bearer.slice(7)
    : '';
  return headerToken === expectedToken || bearerToken === expectedToken;
}

function unauthorizedResponse() {
  return NextResponse.json({
    error: 'Admin token required.',
    help: 'Set LAJOO_ADMIN_TOKEN and pass it in the x-lajoo-admin-token header.',
  }, { status: 401 });
}

function dbUnavailableResponse() {
  return NextResponse.json({
    error: 'DATABASE_URL is not configured, so knowledge facts cannot be reviewed.',
  }, { status: 503 });
}

export async function GET(request) {
  if (!isAdminAuthorized(request)) return unauthorizedResponse();
  if (!process.env.DATABASE_URL) return dbUnavailableResponse();

  const { searchParams } = new URL(request.url);
  const payload = Object.fromEntries(searchParams.entries());

  try {
    const result = await listKnowledgeFacts(payload);
    return NextResponse.json(result);
  } catch (error) {
    const message = error?.message || 'Unable to load knowledge facts.';
    const status = /invalid|missing|short|valid|cannot/i.test(message) ? 400 : 500;
    if (status >= 500) console.error('[admin-knowledge-facts] list failed', error);
    return NextResponse.json({ error: status >= 500 ? 'Unable to load knowledge facts.' : message }, { status });
  }
}

export async function PATCH(request) {
  if (!isAdminAuthorized(request)) return unauthorizedResponse();
  if (!process.env.DATABASE_URL) return dbUnavailableResponse();

  try {
    const body = await request.json();
    if (body?.action === 'updateDocumentValidity') {
      const result = await updateKnowledgeDocumentValidity(
        body?.documentId,
        body?.updates || {},
        { applyToFacts: Boolean(body?.applyToFacts) }
      );
      return NextResponse.json(result);
    }
    const fact = await updateKnowledgeFact(body?.id, body?.updates || {});
    return NextResponse.json({ fact });
  } catch (error) {
    const message = error?.message || 'Unable to update knowledge fact.';
    const status = /not found/i.test(message) ? 404 : /invalid|missing|short|valid|cannot/i.test(message) ? 400 : 500;
    if (status >= 500) console.error('[admin-knowledge-facts] update failed', error);
    return NextResponse.json({ error: message }, { status });
  }
}
