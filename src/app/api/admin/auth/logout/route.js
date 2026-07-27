import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, revokeAdminSessionToken } from "@/server/admin/adminSession.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value || "";
  await revokeAdminSessionToken(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("cache-control", "no-store");
  return response;
}
