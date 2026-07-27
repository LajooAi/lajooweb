import { NextResponse } from "next/server";
import {
  canInspectRenewalOps,
  getPersistedRenewalOpsData,
  updateInsurerPartnerSubmission,
  updateRenewalOpsCaseStatus,
  upsertPolicyDocumentVerification,
} from "@/server/admin/adminRenewalOps.js";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function unauthorized() {
  return noStore(NextResponse.json({ error: "Admin login required." }, { status: 401 }));
}

export async function GET(request) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!canInspectRenewalOps(session)) {
    return noStore(NextResponse.json({ error: "Business or security access permission required." }, { status: 403 }));
  }

  try {
    return noStore(NextResponse.json(await getPersistedRenewalOpsData({ session })));
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "Unable to load renewal ops workflow." : error.message,
    }, { status }));
  }
}

export async function PATCH(request) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) return unauthorized();

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid renewal ops request." }, { status: 400 }));
  }

  try {
    let result;
    if (body?.operation === "update_case_status") {
      result = await updateRenewalOpsCaseStatus({
        session,
        caseId: body.caseId,
        status: body.status,
        reason: body.reason,
        note: body.note,
        request,
      });
    } else if (body?.operation === "update_submission") {
      result = await updateInsurerPartnerSubmission({
        session,
        submissionId: body.submissionId,
        caseId: body.caseId,
        insurer: body.insurer,
        channel: body.channel,
        status: body.status,
        reason: body.reason,
        note: body.note,
        request,
      });
    } else if (body?.operation === "upsert_policy_document") {
      result = await upsertPolicyDocumentVerification({
        session,
        documentId: body.documentId,
        caseId: body.caseId,
        insurer: body.insurer,
        documentType: body.documentType,
        policyNumber: body.policyNumber,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo,
        storageMode: body.storageMode,
        fileReference: body.fileReference,
        verificationStatus: body.verificationStatus,
        reviewerNote: body.reviewerNote || body.note,
        reason: body.reason,
        request,
      });
    } else {
      return noStore(NextResponse.json({ error: "Unsupported renewal ops operation." }, { status: 400 }));
    }
    return noStore(NextResponse.json({
      ...result,
      message: "Renewal ops action saved and audit logged.",
    }));
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "Renewal ops action failed." : error.message,
    }, { status }));
  }
}
