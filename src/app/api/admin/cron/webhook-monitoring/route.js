import { NextResponse } from "next/server";
import {
  assertAdminCronAuthorized,
  runPersistedAdminWebhookMonitoringCronJob,
} from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  const body = {
    error: status >= 500 ? "Webhook monitoring cron failed." : error.message,
  };
  if (error?.scheduledJobAttempt) body.scheduledJobAttempt = error.scheduledJobAttempt;
  return noStore(NextResponse.json(body, { status }));
}

export async function GET(request) {
  try {
    assertAdminCronAuthorized(request);
    const result = await runPersistedAdminWebhookMonitoringCronJob({ request });
    return noStore(NextResponse.json({ ...result, message: "Webhook monitoring cron route completed." }));
  } catch (error) {
    return errorResponse(error);
  }
}
