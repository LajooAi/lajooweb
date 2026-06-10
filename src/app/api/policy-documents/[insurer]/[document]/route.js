import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getPolicyDocumentPreviewFile } from "@/server/insurance/policyDocumentPreviewFiles";

export const runtime = "nodejs";

function buildPdfResponse(buffer, fileName) {
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const document = getPolicyDocumentPreviewFile(resolvedParams?.insurer, resolvedParams?.document);

  if (!document) {
    return NextResponse.json(
      { error: "Policy document preview not found." },
      { status: 404 }
    );
  }

  const root = process.cwd();
  const absolutePath = path.resolve(root, document.sourceRelativePath);

  if (!absolutePath.startsWith(root + path.sep)) {
    return NextResponse.json(
      { error: "Policy document path rejected." },
      { status: 400 }
    );
  }

  try {
    const buffer = await fs.readFile(absolutePath);
    return buildPdfResponse(buffer, document.fileName);
  } catch (error) {
    console.error("[policy-documents] Unable to read PDF preview.", {
      insurer: resolvedParams?.insurer,
      document: resolvedParams?.document,
      sourceRelativePath: document.sourceRelativePath,
      error: error?.message || error,
    });

    return NextResponse.json(
      { error: "Policy document preview is unavailable." },
      { status: 404 }
    );
  }
}
