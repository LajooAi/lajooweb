import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminCookieOptions,
  verifyAdminMfaChallenge,
} from "@/server/admin/adminSession.js";
import { getPermissionsForRole, getRoleDefinition } from "@/server/admin/adminRoles.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid MFA request." }, { status: 400 }));
  }

  try {
    const admin = await verifyAdminMfaChallenge({
      challengeToken: body?.challengeToken,
      code: body?.code,
      request,
    });
    const token = await createAdminSessionToken(admin, request);
    if (!token) {
      return noStore(NextResponse.json({ error: "Admin session could not be created." }, { status: 500 }));
    }

    const role = getRoleDefinition(admin.role);
    const response = NextResponse.json({
      session: {
        email: admin.email,
        name: admin.name,
        role: admin.role,
        roleLabel: role.label,
        permissions: getPermissionsForRole(admin.role),
      },
    });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, getAdminCookieOptions());
    return noStore(response);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "MFA verification failed." : error.message,
    }, { status }));
  }
}
