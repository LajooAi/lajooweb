import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminMfaChallenge,
  createAdminSessionToken,
  getAdminCookieOptions,
  getAdminCredentialConfig,
  verifyAdminCredentials,
} from "@/server/admin/adminSession.js";
import { getRoleDefinition, getPermissionsForRole } from "@/server/admin/adminRoles.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function POST(request) {
  const config = getAdminCredentialConfig();
  if (!config.configured) {
    return noStore(NextResponse.json({
      error: "Admin login is not configured. Set LAJOO_ADMIN_EMAIL and LAJOO_ADMIN_PASSWORD for bootstrap, or configure DATABASE_URL with admin users.",
    }, { status: 503 }));
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid login request." }, { status: 400 }));
  }

  const admin = await verifyAdminCredentials(body?.email, body?.password);
  if (!admin) {
    return noStore(NextResponse.json({ error: "Invalid admin email or password." }, { status: 401 }));
  }

  if (admin.mfaStatus === "enabled") {
    const challenge = await createAdminMfaChallenge(admin, request);
    return noStore(NextResponse.json({
      mfaRequired: true,
      challenge,
      message: "MFA code required.",
    }));
  }

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
}
