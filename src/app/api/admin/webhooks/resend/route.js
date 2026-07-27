import { NextResponse } from "next/server";
import { recordPersistedAdminResendWebhookEvent } from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function POST(request) {
  const rawBody = await request.text();
  try {
    const result = await recordPersistedAdminResendWebhookEvent({
      rawBody,
      headers: request.headers,
      request,
    });
    if (!result.verification?.ok) {
      const status = result.verification?.status === "missing_secret" ? 503 : 400;
      return noStore(NextResponse.json({
        error: "Invalid Resend webhook.",
        verificationStatus: result.verification?.status || "invalid",
      }, { status }));
    }
    return noStore(NextResponse.json({
      received: true,
      duplicate: Boolean(result.duplicate),
      linkedInviteEmailEventId: result.linkedInviteEmailEventId || null,
    }));
  } catch {
    return noStore(NextResponse.json({ error: "Resend webhook could not be processed." }, { status: 400 }));
  }
}
