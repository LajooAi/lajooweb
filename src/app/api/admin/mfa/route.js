import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import {
  disablePersistedAdminMfa,
  startPersistedAdminMfaEnrollment,
  verifyPersistedAdminMfaEnrollment,
} from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  return noStore(NextResponse.json({
    error: status >= 500 ? "MFA operation failed." : error.message,
  }, { status }));
}

export async function POST(request) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) {
    return noStore(NextResponse.json({ error: "Admin login required." }, { status: 401 }));
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid MFA request." }, { status: 400 }));
  }

  try {
    if (body?.operation === "start") {
      const result = await startPersistedAdminMfaEnrollment({ session, request });
      return noStore(NextResponse.json({
        ...result,
        message: "MFA setup started. Add the secret to your authenticator app, then verify a 6-digit code.",
      }));
    }

    if (body?.operation === "verify") {
      const result = await verifyPersistedAdminMfaEnrollment({
        session,
        code: body?.code,
        request,
      });
      return noStore(NextResponse.json({ ...result, message: "MFA enabled and logged." }));
    }

    if (body?.operation === "disable") {
      const result = await disablePersistedAdminMfa({
        session,
        targetUserId: body?.targetUserId,
        reason: body?.reason,
        request,
      });
      return noStore(NextResponse.json({ ...result, message: "MFA disabled and logged." }));
    }

    return noStore(NextResponse.json({ error: "Unsupported MFA operation." }, { status: 400 }));
  } catch (error) {
    return errorResponse(error);
  }
}
