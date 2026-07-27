import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import { retryPersistedAdminScheduledJobAttempt } from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  const body = {
    error: status >= 500 ? "Scheduled job retry failed." : error.message,
  };
  if (error?.scheduledJobAttempt) body.scheduledJobAttempt = error.scheduledJobAttempt;
  return noStore(NextResponse.json(body, { status }));
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid scheduled job retry request." }, { status: 400 }));
  }

  try {
    const session = await getAdminSessionFromRequest(request);
    if (!session) {
      return noStore(NextResponse.json({ error: "Admin login required." }, { status: 401 }));
    }
    const result = await retryPersistedAdminScheduledJobAttempt({
      session,
      attemptId: body?.attemptId,
      reason: body?.reason,
      request,
    });
    return noStore(NextResponse.json({ ...result, message: "Scheduled job retry logged and started." }));
  } catch (error) {
    return errorResponse(error);
  }
}
