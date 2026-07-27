import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import {
  listPersistedAdminCronExecutionAlerts,
  updatePersistedAdminCronExecutionAlert,
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
    error: status >= 500 ? "Cron execution alert operation failed." : error.message,
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
    const session = await requireSecuritySession(request);
    const { searchParams } = new URL(request.url);
    const result = await listPersistedAdminCronExecutionAlerts({
      session,
      limit: Number(searchParams.get("limit") || 20),
      status: searchParams.get("status") || "all",
      priority: searchParams.get("priority") || "all",
      assignedToUserId: searchParams.get("assignedToUserId") || "all",
      jobKind: searchParams.get("jobKind") || "all",
      refreshStale: searchParams.get("refreshStale") !== "false",
      request,
    });
    return noStore(NextResponse.json(result));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid cron execution alert request." }, { status: 400 }));
  }

  try {
    const session = await requireSecuritySession(request);
    const result = await updatePersistedAdminCronExecutionAlert({
      session,
      alertId: body?.alertId,
      operation: body?.operation,
      reason: body?.reason,
      assignedToUserId: body?.assignedToUserId,
      priority: body?.priority,
      note: body?.note,
      snoozedUntil: body?.snoozedUntil,
      request,
    });
    return noStore(NextResponse.json({ ...result, message: "Cron execution alert workflow updated." }));
  } catch (error) {
    return errorResponse(error);
  }
}
