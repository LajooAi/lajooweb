import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import {
  listPersistedAdminNotificationPreferences,
  updatePersistedAdminNotificationPreference,
} from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  return noStore(NextResponse.json({
    error: status >= 500 ? "Notification preference operation failed." : error.message,
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
    return noStore(NextResponse.json(await listPersistedAdminNotificationPreferences({
      session,
      userId: searchParams.get("userId"),
    })));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid notification preference request." }, { status: 400 }));
  }

  try {
    const session = await requireAdminSession(request);
    const result = await updatePersistedAdminNotificationPreference({
      session,
      userId: body?.userId,
      category: body?.category,
      emailEnabled: body?.emailEnabled,
      frequency: body?.frequency,
      manualFallbackEnabled: body?.manualFallbackEnabled,
      reason: body?.reason,
      request,
    });
    return noStore(NextResponse.json({ ...result, message: "Notification preference updated." }));
  } catch (error) {
    return errorResponse(error);
  }
}
