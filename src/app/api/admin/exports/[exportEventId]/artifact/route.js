import { NextResponse } from "next/server";
import { getPersistedAdminExportArtifact } from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(request, { params }) {
  const { exportEventId } = await params;
  const token = new URL(request.url).searchParams.get("token");

  try {
    const { fileName, artifact } = await getPersistedAdminExportArtifact({ exportEventId, token, request });
    const response = NextResponse.json(artifact);
    response.headers.set("content-disposition", `attachment; filename="${fileName}"`);
    return noStore(response);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "Export artifact unavailable." : error.message,
    }, { status }));
  }
}
