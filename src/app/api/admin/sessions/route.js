import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/server/admin/adminRoles.js";
import {
  listPersistedAdminSessions,
  revokePersistedAdminSessionById,
} from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  return noStore(NextResponse.json({
    error: status >= 500 ? "Admin session operation failed." : error.message,
  }, { status }));
}

async function requireSecuritySession(request) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) return { response: noStore(NextResponse.json({ error: "Admin login required." }, { status: 401 })) };
  if (!hasAdminPermission(session.role, ADMIN_PERMISSIONS.SECURITY_ACCESS)) {
    return { response: noStore(NextResponse.json({ error: "Security access permission required." }, { status: 403 })) };
  }
  return { session };
}

export async function GET(request) {
  const { response } = await requireSecuritySession(request);
  if (response) return response;
  return noStore(NextResponse.json(await listPersistedAdminSessions()));
}

export async function PATCH(request) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) return noStore(NextResponse.json({ error: "Admin login required." }, { status: 401 }));

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid admin session operation." }, { status: 400 }));
  }

  if (body?.operation !== "revoke") {
    return noStore(NextResponse.json({ error: "Unsupported admin session operation." }, { status: 400 }));
  }

  try {
    const result = await revokePersistedAdminSessionById({
      session,
      sessionId: body?.sessionId,
      reason: body?.reason,
      request,
    });
    return noStore(NextResponse.json({ ...result, message: "Admin session revoked and logged." }));
  } catch (error) {
    return errorResponse(error);
  }
}
