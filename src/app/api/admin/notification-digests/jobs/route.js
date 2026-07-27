import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import {
  listPersistedAdminNotificationDigestJobAttempts,
  runPersistedAdminNotificationDigestJob,
} from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  return noStore(NextResponse.json({
    error: status >= 500 ? "Notification digest job operation failed." : error.message,
  }, { status }));
}

async function requireAdminSession(request) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) {
    const error = new Error("Admin login required.");
    error.status = 401;
    throw error;
  }
  return session;
}

export async function GET(request) {
  try {
    const session = await requireAdminSession(request);
    const { searchParams } = new URL(request.url);
    return noStore(NextResponse.json(await listPersistedAdminNotificationDigestJobAttempts({
      session,
      limit: Number(searchParams.get("limit") || 8),
    })));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid notification digest job request." }, { status: 400 }));
  }

  try {
    const session = await requireAdminSession(request);
    const result = await runPersistedAdminNotificationDigestJob({
      session,
      frequency: body?.frequency,
      reason: body?.reason,
      triggerSource: "manual_admin",
      limit: body?.limit,
      request,
    });
    return noStore(NextResponse.json({ ...result, message: "Notification digest job attempt logged." }));
  } catch (error) {
    return errorResponse(error);
  }
}
