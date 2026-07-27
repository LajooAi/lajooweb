import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "@/server/admin/adminRoles.js";
import { listPersistedAdminTechLogs } from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(request) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) {
    return noStore(NextResponse.json({ error: "Admin login required." }, { status: 401 }));
  }
  if (!hasAdminPermission(session.role, ADMIN_PERMISSIONS.TECH_ADMIN)) {
    return noStore(NextResponse.json({ error: "Tech admin permission required." }, { status: 403 }));
  }
  return noStore(NextResponse.json(await listPersistedAdminTechLogs()));
}
