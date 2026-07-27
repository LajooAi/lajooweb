import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import {
  createPersistedAdminExportArtifactAccess,
  listPersistedAdminExportArtifactAccesses,
  revokePersistedAdminExportArtifactAccess,
  rotatePersistedAdminExportArtifactAccess,
} from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(request, { params }) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) {
    return noStore(NextResponse.json({ error: "Admin login required." }, { status: 401 }));
  }

  const { exportEventId } = await params;
  try {
    return noStore(NextResponse.json(await listPersistedAdminExportArtifactAccesses({
      session,
      exportEventId,
    })));
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "Artifact access list could not be loaded." : error.message,
    }, { status }));
  }
}

export async function POST(request, { params }) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) {
    return noStore(NextResponse.json({ error: "Admin login required." }, { status: 401 }));
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid artifact access request." }, { status: 400 }));
  }

  const { exportEventId } = await params;
  try {
    const result = await createPersistedAdminExportArtifactAccess({
      session,
      exportEventId,
      reason: body?.reason,
      request,
    });
    return noStore(NextResponse.json({ ...result, message: "Signed artifact access created." }));
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "Artifact access could not be created." : error.message,
    }, { status }));
  }
}

export async function PATCH(request, { params }) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) {
    return noStore(NextResponse.json({ error: "Admin login required." }, { status: 401 }));
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid artifact access revocation request." }, { status: 400 }));
  }

  const { exportEventId } = await params;
  try {
    if (body?.operation === "rotate") {
      const result = await rotatePersistedAdminExportArtifactAccess({
        session,
        exportEventId,
        accessId: body?.accessId,
        reason: body?.reason,
        request,
      });
      return noStore(NextResponse.json({ ...result, message: "Signed artifact access rotated." }));
    }

    const result = await revokePersistedAdminExportArtifactAccess({
      session,
      exportEventId,
      accessId: body?.accessId,
      reason: body?.reason,
      request,
    });
    return noStore(NextResponse.json({ ...result, message: "Signed artifact access revoked." }));
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "Artifact access could not be revoked." : error.message,
    }, { status }));
  }
}
