import { NextResponse } from "next/server";
import {
  clearChatSession,
  loadChatSession,
  normalizeChatSessionId,
} from "@/server/chat/sessionStore";

function getSessionIdFromRequest(request) {
  const url = new URL(request.url);
  return normalizeChatSessionId(url.searchParams.get("sessionId"));
}

export async function GET(request) {
  const sessionId = getSessionIdFromRequest(request);
  const session = await loadChatSession(sessionId);

  if (!session) {
    return NextResponse.json({
      sessionId,
      found: false,
      messages: [],
      state: null,
    });
  }

  return NextResponse.json({
    sessionId,
    found: true,
    messages: session.messages || [],
    state: session.publicState || null,
    updatedAt: session.updatedAt || null,
  });
}

export async function DELETE(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const urlSessionId = getSessionIdFromRequest(request);
  const sessionId = normalizeChatSessionId(body?.sessionId || urlSessionId);
  await clearChatSession(sessionId);

  return NextResponse.json({
    sessionId,
    cleared: true,
  });
}
