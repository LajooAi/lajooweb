import { NextResponse } from "next/server";
import {
  canInspectComplianceGate,
  getPersistedComplianceLaunchGateData,
  recordComplianceLaunchDecision,
  updateComplianceChecklistItem,
  updateComplianceLegalDocument,
  updateComplianceOperatingModel,
  updateInsurerApprovedScriptFact,
} from "@/server/admin/adminComplianceGate.js";
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
  if (!canInspectComplianceGate(session)) {
    return noStore(NextResponse.json({ error: "Compliance launch gate access required." }, { status: 403 }));
  }

  try {
    return noStore(NextResponse.json(await getPersistedComplianceLaunchGateData({ session })));
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "Unable to load compliance launch gate." : error.message,
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
    return noStore(NextResponse.json({ error: "Invalid compliance launch gate request." }, { status: 400 }));
  }

  try {
    let result;
    if (body?.operation === "update_operating_model") {
      result = await updateComplianceOperatingModel({
        session,
        modelId: body.modelId,
        status: body.status,
        launchReady: body.launchReady,
        reason: body.reason,
        note: body.note,
        request,
      });
    } else if (body?.operation === "update_legal_document") {
      result = await updateComplianceLegalDocument({
        session,
        documentId: body.documentId,
        status: body.status,
        version: body.version,
        reason: body.reason,
        note: body.note,
        request,
      });
    } else if (body?.operation === "update_checklist_item") {
      result = await updateComplianceChecklistItem({
        session,
        itemId: body.itemId,
        status: body.status,
        evidence: body.evidence,
        reason: body.reason,
        note: body.note,
        request,
      });
    } else if (body?.operation === "update_script_fact") {
      result = await updateInsurerApprovedScriptFact({
        session,
        recordId: body.recordId,
        status: body.status,
        reason: body.reason,
        note: body.note,
        request,
      });
    } else if (body?.operation === "record_launch_decision") {
      result = await recordComplianceLaunchDecision({
        session,
        status: body.status,
        reason: body.reason,
        request,
      });
    } else {
      return noStore(NextResponse.json({ error: "Unsupported compliance launch gate operation." }, { status: 400 }));
    }

    return noStore(NextResponse.json({
      ...result,
      message: "Compliance launch gate action saved and audit logged.",
    }));
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "Compliance launch gate action failed." : error.message,
    }, { status }));
  }
}
