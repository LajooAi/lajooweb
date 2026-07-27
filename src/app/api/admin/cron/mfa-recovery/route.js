import { NextResponse } from "next/server";
import {
  assertAdminCronAuthorized,
  runPersistedAdminMfaRecoverySlaCronJob,
} from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  const body = {
    error: status >= 500 ? "MFA recovery SLA cron failed." : error.message,
  };
  if (error?.scheduledJobAttempt) body.scheduledJobAttempt = error.scheduledJobAttempt;
  return noStore(NextResponse.json(body, { status }));
}

export async function GET(request) {
  try {
    assertAdminCronAuthorized(request);
    const { searchParams } = new URL(request.url);
    const result = await runPersistedAdminMfaRecoverySlaCronJob({
      limit: Number(searchParams.get("limit") || 20),
      request,
    });
    return noStore(NextResponse.json({ ...result, message: "MFA recovery SLA cron route completed." }));
  } catch (error) {
    return errorResponse(error);
  }
}
