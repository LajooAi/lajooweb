import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import {
  getPersistedAdminExportArtifactPolicy,
  updatePersistedAdminExportArtifactPolicy,
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
    error: status >= 500 ? "Export artifact policy operation failed." : error.message,
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
    return noStore(NextResponse.json(await getPersistedAdminExportArtifactPolicy({ session })));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid export artifact policy request." }, { status: 400 }));
  }

  try {
    const session = await requireSecuritySession(request);
    const result = await updatePersistedAdminExportArtifactPolicy({
      session,
      environment: body?.environment,
      ttlSeconds: body?.ttlSeconds,
      minTtlSeconds: body?.minTtlSeconds,
      maxTtlSeconds: body?.maxTtlSeconds,
      status: body?.status,
      reason: body?.reason,
      request,
    });
    return noStore(NextResponse.json({ ...result, message: "Export artifact policy updated." }));
  } catch (error) {
    return errorResponse(error);
  }
}
