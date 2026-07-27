import { NextResponse } from "next/server";
import { listAdminAuditLogs, recordAdminAuditEvent } from "@/server/admin/adminAuditLog.js";
import { getMockSensitiveAdminValue } from "@/server/admin/adminMockData.js";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import {
  updatePersistedAdminAuditReview,
  validateAdminActionReason,
} from "@/server/admin/adminPersistence.js";
import {
  ADMIN_PERMISSIONS,
  canExportAdminData,
  hasAdminPermission,
} from "@/server/admin/adminRoles.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function requireSession(request) {
  return getAdminSessionFromRequest(request);
}

function unauthorized() {
  return noStore(NextResponse.json({ error: "Admin login required." }, { status: 401 }));
}

export async function GET(request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  if (!hasAdminPermission(session.role, ADMIN_PERMISSIONS.SECURITY_ACCESS)) {
    return noStore(NextResponse.json({ error: "Security access permission required." }, { status: 403 }));
  }
  const { searchParams } = new URL(request.url);
  const { logs, persisted } = await listAdminAuditLogs({
    limit: Number(searchParams.get("limit") || 30),
    actor: searchParams.get("actor"),
    role: searchParams.get("role"),
    action: searchParams.get("action"),
    targetType: searchParams.get("targetType"),
    target: searchParams.get("target"),
    status: searchParams.get("status"),
    reviewStatus: searchParams.get("reviewStatus"),
    assignedToUserId: searchParams.get("assignedToUserId"),
    ownerRole: searchParams.get("ownerRole"),
    priority: searchParams.get("priority"),
    escalationStatus: searchParams.get("escalationStatus"),
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
  });
  return noStore(NextResponse.json({ logs, persisted }));
}

export async function PATCH(request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  if (!hasAdminPermission(session.role, ADMIN_PERMISSIONS.SECURITY_ACCESS)) {
    return noStore(NextResponse.json({ error: "Security access permission required." }, { status: 403 }));
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid audit review request." }, { status: 400 }));
  }

  try {
    const result = await updatePersistedAdminAuditReview({
      session,
      auditLogId: body?.auditLogId,
      reviewStatus: body?.reviewStatus,
      reviewNote: body?.reviewNote,
      assignedToUserId: body?.assignedToUserId,
      priority: body?.priority,
      escalationStatus: body?.escalationStatus,
      assignmentDueAt: body?.assignmentDueAt,
      escalationReason: body?.escalationReason,
      request,
    });
    return noStore(NextResponse.json({ ...result, message: "Audit review saved." }));
  } catch (error) {
    const status = Number(error?.status) || 500;
    return noStore(NextResponse.json({
      error: status >= 500 ? "Audit review failed." : error.message,
    }, { status }));
  }
}

export async function POST(request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid audit request." }, { status: 400 }));
  }

  const { reason, error } = validateAdminActionReason(body?.reason);
  if (error) return noStore(NextResponse.json({ error }, { status: 400 }));

  if (body?.actionType === "export") {
    if (!canExportAdminData(session.role)) {
      const event = await recordAdminAuditEvent({
        session,
        action: "export_blocked",
        targetType: body?.targetType || "export",
        targetId: body?.targetId || "unknown",
        field: body?.field || "bulk_export",
        reason,
        status: "blocked",
        metadata: { mock: true },
        request,
      });
      return noStore(NextResponse.json({
        error: "Bulk export is restricted to founder role.",
        event,
      }, { status: 403 }));
    }

    const event = await recordAdminAuditEvent({
      session,
      action: "export_data",
      targetType: body?.targetType || "export",
      targetId: body?.targetId || "unknown",
      field: body?.field || "bulk_export",
      reason,
      status: "requested",
      metadata: { mock: true },
      request,
    });
    return noStore(NextResponse.json({
      event,
      message: "Mock export request created. No real customer export was generated.",
    }));
  }

  if (body?.actionType !== "reveal") {
    return noStore(NextResponse.json({ error: "Unsupported audit action." }, { status: 400 }));
  }

  if (!hasAdminPermission(session.role, ADMIN_PERMISSIONS.REVEAL_PII)) {
    return noStore(NextResponse.json({ error: "Reveal permission required." }, { status: 403 }));
  }

  const sensitiveValue = getMockSensitiveAdminValue(body?.targetId, body?.field);
  if (!sensitiveValue) {
    return noStore(NextResponse.json({ error: "Sensitive field was not found." }, { status: 404 }));
  }

  const event = await recordAdminAuditEvent({
    session,
    action: "reveal_pii",
    targetType: body?.targetType || "customer",
    targetId: body?.targetId || "unknown",
    field: body?.field || "record",
    reason,
    status: "logged",
    metadata: { valueType: sensitiveValue.type },
    request,
  });

  return noStore(NextResponse.json({
    event,
    value: sensitiveValue.value,
    type: sensitiveValue.type,
    label: sensitiveValue.label,
  }));
}
