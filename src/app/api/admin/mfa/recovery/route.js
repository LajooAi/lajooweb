import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import {
  completePersistedAdminMfaRecoveryRequest,
  createPersistedAdminMfaRecoveryRequest,
  decidePersistedAdminMfaRecoveryRequest,
  emergencyDisablePersistedAdminMfa,
  listPersistedAdminMfaRecoveryRequests,
  notifyPersistedAdminMfaRecoveryRequest,
  triggerPersistedAdminMfaRecoverySlaReminders,
} from "@/server/admin/adminPersistence.js";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/server/admin/adminRoles.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  return noStore(NextResponse.json({
    error: status >= 500 ? "MFA recovery operation failed." : error.message,
  }, { status }));
}

async function requireSecuritySession(request) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) {
    const error = new Error("Admin login required.");
    error.status = 401;
    throw error;
  }
  if (!hasAdminPermission(session.role, ADMIN_PERMISSIONS.SECURITY_ACCESS)) {
    const error = new Error("Security access permission required.");
    error.status = 403;
    throw error;
  }
  return session;
}

export async function GET(request) {
  try {
    await requireSecuritySession(request);
    const { searchParams } = new URL(request.url);
    return noStore(NextResponse.json(await listPersistedAdminMfaRecoveryRequests({
      limit: Number(searchParams.get("limit") || 30),
      status: searchParams.get("status"),
      priority: searchParams.get("priority"),
      overdue: searchParams.get("overdue"),
    })));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid MFA recovery request." }, { status: 400 }));
  }

  try {
    const session = await requireSecuritySession(request);
    const result = await createPersistedAdminMfaRecoveryRequest({
      session,
      targetUserId: body?.targetUserId,
      reason: body?.reason,
      priority: body?.priority,
      request,
    });
    return noStore(NextResponse.json({ ...result, message: "MFA recovery request created." }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid MFA recovery decision." }, { status: 400 }));
  }

  try {
    const session = await requireSecuritySession(request);
    if (body?.operation === "approve" || body?.operation === "reject") {
      const result = await decidePersistedAdminMfaRecoveryRequest({
        session,
        recoveryRequestId: body?.recoveryRequestId,
        status: body.operation === "approve" ? "approved" : "rejected",
        reason: body?.reason,
        request,
      });
      return noStore(NextResponse.json({ ...result, message: "MFA recovery decision saved." }));
    }

    if (body?.operation === "complete") {
      const result = await completePersistedAdminMfaRecoveryRequest({
        session,
        recoveryRequestId: body?.recoveryRequestId,
        reason: body?.reason,
        request,
      });
      return noStore(NextResponse.json({ ...result, message: "MFA recovery completed and logged." }));
    }

    if (body?.operation === "notify" || body?.operation === "remind") {
      const result = await notifyPersistedAdminMfaRecoveryRequest({
        session,
        recoveryRequestId: body?.recoveryRequestId,
        reason: body?.reason,
        request,
        isReminder: body.operation === "remind",
      });
      return noStore(NextResponse.json({ ...result, message: "MFA recovery notification attempt logged." }));
    }

    if (body?.operation === "remind_overdue") {
      const result = await triggerPersistedAdminMfaRecoverySlaReminders({
        session,
        reason: body?.reason,
        request,
        limit: body?.limit,
      });
      return noStore(NextResponse.json({ ...result, message: "Overdue MFA recovery reminders logged." }));
    }

    if (body?.operation === "emergency_disable") {
      const result = await emergencyDisablePersistedAdminMfa({
        session,
        targetUserId: body?.targetUserId,
        reason: body?.reason,
        request,
      });
      return noStore(NextResponse.json({ ...result, message: "Emergency MFA override completed and logged." }));
    }

    return noStore(NextResponse.json({ error: "Unsupported MFA recovery operation." }, { status: 400 }));
  } catch (error) {
    return errorResponse(error);
  }
}
