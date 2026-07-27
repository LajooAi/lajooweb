import { NextResponse } from "next/server";
import { acceptPersistedAdminInvite } from "@/server/admin/adminPersistence.js";

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
    return noStore(NextResponse.json({ error: "Invalid invite setup request." }, { status: 400 }));
  }

  try {
    const result = await acceptPersistedAdminInvite({
      token: body?.token,
      password: body?.password,
      request,
    });
    return noStore(NextResponse.json({
      ...result,
      message: "Admin password set. Sign in with your email and new password.",
    }));
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "Invite setup failed." : error.message,
    }, { status }));
  }
}
