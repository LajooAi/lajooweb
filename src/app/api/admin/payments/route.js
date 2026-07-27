import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/server/admin/adminSession.js";
import {
  createAdminPaymentException,
  getPersistedAdminPaymentLaunchData,
  updateAdminPaymentException,
  updateAdminPaymentReconciliationItem,
} from "@/server/payment/paymentLaunchReadiness.js";

export const dynamic = "force-dynamic";

function noStore(response) {
  response.headers.set("cache-control", "no-store");
  return response;
}

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  return noStore(NextResponse.json({
    error: status >= 500 ? "Payment admin operation failed." : error.message,
  }, { status }));
}

async function requirePaymentAdminSession(request) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) {
    return { response: noStore(NextResponse.json({ error: "Admin login required." }, { status: 401 })) };
  }
  return { session };
}

export async function GET(request) {
  const { session, response } = await requirePaymentAdminSession(request);
  if (response) return response;
  try {
    return noStore(NextResponse.json(await getPersistedAdminPaymentLaunchData({ session, request })));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  const { session, response } = await requirePaymentAdminSession(request);
  if (response) return response;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid payment exception request." }, { status: 400 }));
  }

  try {
    if (body?.operation === "create_exception") {
      const result = await createAdminPaymentException({
        session,
        paymentId: body?.paymentId,
        provider: body?.provider,
        exceptionType: body?.exceptionType,
        amount: body?.amount,
        currency: body?.currency,
        priority: body?.priority,
        reason: body?.reason,
        request,
      });
      return noStore(NextResponse.json({
        ...result,
        message: "Payment exception created. No real refund was executed.",
      }));
    }

    return noStore(NextResponse.json({ error: "Unsupported payment admin operation." }, { status: 400 }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  const { session, response } = await requirePaymentAdminSession(request);
  if (response) return response;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid payment admin operation." }, { status: 400 }));
  }

  try {
    if (body?.operation === "update_reconciliation") {
      const result = await updateAdminPaymentReconciliationItem({
        session,
        itemId: body?.itemId,
        status: body?.status,
        priority: body?.priority,
        reason: body?.reason,
        note: body?.note,
        request,
      });
      return noStore(NextResponse.json({
        ...result,
        message: "Payment reconciliation update logged.",
      }));
    }

    if (body?.operation === "update_exception") {
      const result = await updateAdminPaymentException({
        session,
        exceptionId: body?.exceptionId,
        status: body?.status,
        priority: body?.priority,
        reason: body?.reason,
        note: body?.note,
        request,
      });
      return noStore(NextResponse.json({
        ...result,
        message: "Payment exception update logged. No real refund was executed.",
      }));
    }

    return noStore(NextResponse.json({ error: "Unsupported payment admin operation." }, { status: 400 }));
  } catch (error) {
    return errorResponse(error);
  }
}
