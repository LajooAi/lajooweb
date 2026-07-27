import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import {
  checkPersistedAdminResendWebhookRegistration,
  listPersistedAdminResendWebhookStatusChecks,
  listPersistedAdminWebhookMonitoringAlerts,
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
    error: status >= 500 ? "Resend webhook status operation failed." : error.message,
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
    const limit = Number(searchParams.get("limit") || 8);
    const [statusChecks, monitoringAlerts] = await Promise.all([
      listPersistedAdminResendWebhookStatusChecks({ limit }),
      listPersistedAdminWebhookMonitoringAlerts({ limit, status: searchParams.get("status") || "open" }),
    ]);
    return noStore(NextResponse.json({ ...statusChecks, ...monitoringAlerts }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const session = await requireSecuritySession(request);
    const result = await checkPersistedAdminResendWebhookRegistration({ session, request });
    return noStore(NextResponse.json({ ...result, message: "Resend webhook registration status checked." }));
  } catch (error) {
    return errorResponse(error);
  }
}
