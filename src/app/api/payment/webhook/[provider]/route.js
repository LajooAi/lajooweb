import { NextResponse } from "next/server";
import {
  PAYMENT_STATUS,
  confirmPayment,
  failPayment,
  getPayment,
  updatePaymentStatus,
} from "@/lib/paymentStore";
import {
  PAYMENT_AUDIT_DIRECTION,
  PAYMENT_AUDIT_STATUS,
  recordPaymentAuditEvent,
} from "@/lib/paymentAuditStore";
import {
  PAYMENT_WEBHOOK_EVENT_TYPES,
  PaymentProviderError,
  hashWebhookBody,
  verifyProviderWebhook,
} from "@/server/payment/paymentProvider";

function getRequestId(request) {
  return (
    request.headers.get("x-vercel-id") ||
    request.headers.get("x-request-id") ||
    `payment_webhook_${Date.now()}`
  );
}

function sanitizeProvider(value) {
  return String(value || "").trim().toLowerCase() || "unknown";
}

async function safeRecordPaymentAuditEvent(event) {
  try {
    return await recordPaymentAuditEvent(event);
  } catch (error) {
    console.warn("[payment-webhook] Unable to write payment audit event.", error?.message || error);
    return null;
  }
}

async function applyPaymentWebhookEvent(event, payment) {
  if (event.eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED) {
    return confirmPayment(event.paymentId, event.transactionRef || event.providerPaymentIntentId || null);
  }

  if (event.eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_FAILED) {
    return failPayment(event.paymentId, event.failureReason || "Provider reported payment failure.");
  }

  if (event.eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_PENDING) {
    return updatePaymentStatus(event.paymentId, PAYMENT_STATUS.PENDING, {
      providerPaymentIntentId: event.providerPaymentIntentId || payment.providerPaymentIntentId || null,
      transactionRef: event.transactionRef || payment.transactionRef || null,
    });
  }

  return payment;
}

export async function POST(request, { params }) {
  const resolvedParams = await params;
  const provider = sanitizeProvider(resolvedParams?.provider);
  const requestId = getRequestId(request);
  const rawBody = await request.text();
  const rawBodyHash = hashWebhookBody(rawBody);

  await safeRecordPaymentAuditEvent({
    provider,
    direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_WEBHOOK,
    eventType: "payment.webhook.received",
    eventStatus: PAYMENT_AUDIT_STATUS.RECEIVED,
    requestId,
    rawBodyHash,
  });

  let verification;
  try {
    verification = verifyProviderWebhook(provider, rawBody, request.headers);
  } catch (error) {
    const status = error instanceof PaymentProviderError ? error.status : 400;
    const code = error instanceof PaymentProviderError ? error.code : "PAYMENT_WEBHOOK_REJECTED";

    await safeRecordPaymentAuditEvent({
      provider,
      direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_WEBHOOK,
      eventType: "payment.webhook.rejected",
      eventStatus: PAYMENT_AUDIT_STATUS.REJECTED,
      signatureStatus: code === "WEBHOOK_SIGNATURE_INVALID" ? "invalid" : "not_verified",
      requestId,
      rawBodyHash,
      errorCode: code,
      errorMessage: error?.message || "Payment webhook rejected.",
    });

    return NextResponse.json(
      { received: false, error: code, message: error?.message || "Payment webhook rejected." },
      { status }
    );
  }

  const { event } = verification;
  await safeRecordPaymentAuditEvent({
    paymentId: event.paymentId,
    provider,
    direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_WEBHOOK,
    eventType: event.eventType,
    eventStatus: PAYMENT_AUDIT_STATUS.VERIFIED,
    signatureStatus: verification.signatureStatus,
    providerEventId: event.providerEventId,
    providerPaymentId: event.providerPaymentIntentId,
    requestId,
    rawBodyHash: verification.rawBodyHash,
    payload: event.payload,
  });

  const payment = await getPayment(event.paymentId);
  if (!payment) {
    await safeRecordPaymentAuditEvent({
      paymentId: event.paymentId,
      provider,
      direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_WEBHOOK,
      eventType: event.eventType,
      eventStatus: PAYMENT_AUDIT_STATUS.REJECTED,
      signatureStatus: verification.signatureStatus,
      providerEventId: event.providerEventId,
      providerPaymentId: event.providerPaymentIntentId,
      requestId,
      rawBodyHash: verification.rawBodyHash,
      payload: event.payload,
      errorCode: "PAYMENT_SNAPSHOT_NOT_FOUND",
      errorMessage: "Webhook referenced a payment snapshot that does not exist.",
    });

    return NextResponse.json(
      { received: false, error: "PAYMENT_SNAPSHOT_NOT_FOUND" },
      { status: 404 }
    );
  }

  const snapshotProvider = sanitizeProvider(payment.provider || provider);
  if (snapshotProvider !== provider) {
    await safeRecordPaymentAuditEvent({
      paymentId: event.paymentId,
      provider,
      direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_WEBHOOK,
      eventType: event.eventType,
      eventStatus: PAYMENT_AUDIT_STATUS.REJECTED,
      signatureStatus: verification.signatureStatus,
      providerEventId: event.providerEventId,
      providerPaymentId: event.providerPaymentIntentId,
      requestId,
      rawBodyHash: verification.rawBodyHash,
      payload: event.payload,
      errorCode: "PAYMENT_PROVIDER_MISMATCH",
      errorMessage: `Webhook provider ${provider} does not match snapshot provider ${snapshotProvider}.`,
    });

    return NextResponse.json(
      { received: false, error: "PAYMENT_PROVIDER_MISMATCH" },
      { status: 409 }
    );
  }

  if (payment.status === PAYMENT_STATUS.CONFIRMED && event.eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_SUCCEEDED) {
    await safeRecordPaymentAuditEvent({
      paymentId: event.paymentId,
      provider,
      direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_WEBHOOK,
      eventType: event.eventType,
      eventStatus: PAYMENT_AUDIT_STATUS.IGNORED,
      signatureStatus: verification.signatureStatus,
      providerEventId: event.providerEventId,
      providerPaymentId: event.providerPaymentIntentId,
      requestId,
      rawBodyHash: verification.rawBodyHash,
      payload: event.payload,
      errorCode: "PAYMENT_ALREADY_CONFIRMED",
      errorMessage: "Duplicate successful webhook ignored.",
    });

    return NextResponse.json({
      received: true,
      paymentId: event.paymentId,
      status: PAYMENT_STATUS.CONFIRMED,
      duplicate: true,
      canIssuePolicy: false,
    });
  }

  const updatedPayment = await applyPaymentWebhookEvent(event, payment);

  await safeRecordPaymentAuditEvent({
    paymentId: event.paymentId,
    provider,
    direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_WEBHOOK,
    eventType: event.eventType,
    eventStatus: event.eventType === PAYMENT_WEBHOOK_EVENT_TYPES.PAYMENT_UNKNOWN
      ? PAYMENT_AUDIT_STATUS.IGNORED
      : PAYMENT_AUDIT_STATUS.APPLIED,
    signatureStatus: verification.signatureStatus,
    providerEventId: event.providerEventId,
    providerPaymentId: event.providerPaymentIntentId,
    requestId,
    rawBodyHash: verification.rawBodyHash,
    payload: event.payload,
  });

  return NextResponse.json({
    received: true,
    paymentId: event.paymentId,
    provider,
    eventType: event.eventType,
    status: updatedPayment?.status || payment.status,
    canIssuePolicy: false,
  });
}
