import { NextResponse } from "next/server";
import {
  canInspectCustomerLaunchQa,
  getPersistedCustomerLaunchQaData,
  updateCustomerLaunchQaItem,
  updateCustomerLaunchUatRun,
} from "@/server/admin/adminCustomerLaunchQa.js";
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
  if (!canInspectCustomerLaunchQa(session)) {
    return noStore(NextResponse.json({ error: "Customer launch QA access required." }, { status: 403 }));
  }

  try {
    return noStore(NextResponse.json(await getPersistedCustomerLaunchQaData({ session })));
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "Unable to load customer launch QA." : error.message,
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
    return noStore(NextResponse.json({ error: "Invalid customer launch QA request." }, { status: 400 }));
  }

  try {
    let result;
    if (body?.operation === "update_item") {
      result = await updateCustomerLaunchQaItem({
        session,
        itemId: body.itemId,
        status: body.status,
        blocker: body.blocker,
        evidence: body.evidence,
        note: body.note,
        reason: body.reason,
        request,
      });
    } else if (body?.operation === "update_uat") {
      result = await updateCustomerLaunchUatRun({
        session,
        runId: body.runId,
        status: body.status,
        signoffStatus: body.signoffStatus,
        note: body.note,
        reason: body.reason,
        request,
      });
    } else {
      return noStore(NextResponse.json({ error: "Unsupported customer launch QA operation." }, { status: 400 }));
    }

    return noStore(NextResponse.json({
      ...result,
      message: "Customer launch QA action saved and audit logged.",
    }));
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "Customer launch QA action failed." : error.message,
    }, { status }));
  }
}
