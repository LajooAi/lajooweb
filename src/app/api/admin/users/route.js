import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/server/admin/adminRoles.js";
import {
  assignPersistedAdminRole,
  createPersistedAdminInvite,
  listPersistedAdminUsers,
  revokePersistedAdminRole,
  updatePersistedAdminUserStatus,
} from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function unauthorized() {
  return noStore(NextResponse.json({ error: "Admin login required." }, { status: 401 }));
}

function forbidden() {
  return noStore(NextResponse.json({ error: "Security access permission required." }, { status: 403 }));
}

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  return noStore(NextResponse.json({
    error: status >= 500 ? "Admin user operation failed." : error.message,
  }, { status }));
}

async function requireSecuritySession(request) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) return { response: unauthorized() };
  if (!hasAdminPermission(session.role, ADMIN_PERMISSIONS.SECURITY_ACCESS)) {
    return { response: forbidden() };
  }
  return { session };
}

export async function GET(request) {
  const { session, response } = await requireSecuritySession(request);
  if (response) return response;
  const users = await listPersistedAdminUsers();
  return noStore(NextResponse.json({ ...users, actorRole: session.role }));
}

export async function POST(request) {
  const { session, response } = await requireSecuritySession(request);
  if (response) return response;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid admin user request." }, { status: 400 }));
  }

  try {
    const result = await createPersistedAdminInvite({
      session,
      email: body?.email,
      name: body?.name,
      role: body?.role,
      reason: body?.reason,
      request,
    });
    const deliveryStatus = result?.invite?.deliveryStatus;
    const message = deliveryStatus === "sent"
      ? "Invite email sent and manual setup link created."
      : deliveryStatus === "failed"
        ? "Invite email failed. Use the manual setup link."
        : "Manual invite link created. No email provider is configured.";
    return noStore(NextResponse.json({ ...result, message }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  const { session, response } = await requireSecuritySession(request);
  if (response) return response;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid admin user operation." }, { status: 400 }));
  }

  try {
    if (body?.operation === "assign_role") {
      const result = await assignPersistedAdminRole({
        session,
        userId: body?.userId,
        role: body?.role,
        reason: body?.reason,
        request,
      });
      return noStore(NextResponse.json({ ...result, message: "Role assignment logged." }));
    }

    if (body?.operation === "revoke_role") {
      const result = await revokePersistedAdminRole({
        session,
        userId: body?.userId,
        role: body?.role,
        reason: body?.reason,
        request,
      });
      return noStore(NextResponse.json({ ...result, message: "Role revocation logged." }));
    }

    if (body?.operation === "set_status") {
      const result = await updatePersistedAdminUserStatus({
        session,
        userId: body?.userId,
        status: body?.status,
        reason: body?.reason,
        request,
      });
      return noStore(NextResponse.json({ ...result, message: "Admin user status update logged." }));
    }

    return noStore(NextResponse.json({ error: "Unsupported admin user operation." }, { status: 400 }));
  } catch (error) {
    return errorResponse(error);
  }
}
