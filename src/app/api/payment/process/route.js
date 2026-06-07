/**
 * Payment Processing API
 *
 * This endpoint handles payment initiation and stores pending payments.
 * In production, this would integrate with a real payment gateway (Stripe, etc.)
 *
 * Security: Payments are verified server-side, not via localStorage
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PAYMENT_AUDIT_DIRECTION,
  PAYMENT_AUDIT_STATUS,
  recordPaymentAuditEvent,
} from "@/lib/paymentAuditStore";
import { getPayment, updatePaymentStatus, PAYMENT_STATUS } from "@/lib/paymentStore";
import {
  PaymentProviderError,
  createProviderPaymentIntent,
} from "@/server/payment/paymentProvider";

// Payment request validation
const PaymentRequestSchema = z.object({
  paymentId: z.string().min(1),
  paymentMethod: z.enum(["card", "fpx", "ewallet", "cc-instalment", "bnpl"]),
  sessionId: z.string().optional(),
  // Legacy clients may still send these fields, but server snapshots are the source of truth.
  total: z.number().optional(),
  insurer: z.string().optional(),
  plate: z.string().optional(),
  insurance: z.number().optional(),
  addons: z.number().optional(),
  tax: z.number().optional(),
  roadtax: z.number().optional(),
});

async function safeRecordPaymentAuditEvent(event) {
  try {
    return await recordPaymentAuditEvent(event);
  } catch (error) {
    console.warn("[payment-process] Unable to write payment audit event.", error?.message || error);
    return null;
  }
}

export async function POST(request) {
  let requestData = null;
  try {
    const body = await request.json();
    const validation = PaymentRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid payment request", details: validation.error.issues },
        { status: 400 }
      );
    }

    requestData = validation.data;
    await safeRecordPaymentAuditEvent({
      paymentId: requestData.paymentId,
      provider: process.env.LAJOO_PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER || "mock",
      direction: PAYMENT_AUDIT_DIRECTION.CLIENT_REQUEST,
      eventType: "payment.process.requested",
      eventStatus: PAYMENT_AUDIT_STATUS.RECEIVED,
      payload: {
        paymentId: requestData.paymentId,
        paymentMethod: requestData.paymentMethod,
        sessionId: requestData.sessionId || null,
      },
    });

    const existingSnapshot = await getPayment(requestData.paymentId);

    if (!existingSnapshot) {
      await safeRecordPaymentAuditEvent({
        paymentId: requestData.paymentId,
        provider: process.env.LAJOO_PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER || "mock",
        direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_RESPONSE,
        eventType: "payment.process.rejected",
        eventStatus: PAYMENT_AUDIT_STATUS.REJECTED,
        errorCode: "PAYMENT_SNAPSHOT_NOT_FOUND",
        errorMessage: "Payment snapshot was not found.",
      });

      return NextResponse.json(
        {
          error: "PAYMENT_SNAPSHOT_NOT_FOUND",
          message: "This payment link is no longer valid. Please return to chat and generate a fresh checkout link.",
        },
        { status: 404 }
      );
    }

    if (existingSnapshot.status === PAYMENT_STATUS.EXPIRED) {
      await safeRecordPaymentAuditEvent({
        paymentId: requestData.paymentId,
        provider: existingSnapshot.provider || "mock",
        direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_RESPONSE,
        eventType: "payment.process.rejected",
        eventStatus: PAYMENT_AUDIT_STATUS.REJECTED,
        errorCode: "PAYMENT_SNAPSHOT_EXPIRED",
        errorMessage: "Payment snapshot was expired.",
      });

      return NextResponse.json(
        {
          error: "PAYMENT_SNAPSHOT_EXPIRED",
          message: "This payment link has expired. Please return to chat and generate a fresh checkout link.",
        },
        { status: 410 }
      );
    }

    const paymentData = {
      paymentId: existingSnapshot.paymentId,
      provider: existingSnapshot.provider,
      total: existingSnapshot.total,
      insurer: existingSnapshot.insurer,
      plate: existingSnapshot.plate,
      insurance: existingSnapshot.insurance,
      addons: existingSnapshot.addons,
      tax: existingSnapshot.tax,
      roadtax: existingSnapshot.roadtax,
      paymentMethod: requestData.paymentMethod,
      sessionId: requestData.sessionId || existingSnapshot.sessionId || null,
    };
    const providerIntent = createProviderPaymentIntent(paymentData);

    const payment = await updatePaymentStatus(requestData.paymentId, providerIntent.paymentAvailable
      ? PAYMENT_STATUS.PENDING
      : PAYMENT_STATUS.REQUIRES_PROVIDER, {
      status: providerIntent.paymentAvailable
        ? PAYMENT_STATUS.PENDING
        : PAYMENT_STATUS.REQUIRES_PROVIDER,
      transactionRef: providerIntent.providerPaymentIntentId,
      provider: providerIntent.provider,
      providerMode: providerIntent.mode,
      providerPaymentIntentId: providerIntent.providerPaymentIntentId,
      clientConfirmationToken: providerIntent.clientConfirmationToken,
      paymentAvailable: providerIntent.paymentAvailable,
      canIssuePolicy: providerIntent.canIssuePolicy,
      paymentMethod: providerIntent.paymentMethod,
      breakdown: providerIntent.breakdown,
    });

    if (!payment) {
      return NextResponse.json(
        {
          error: "PAYMENT_SNAPSHOT_UPDATE_FAILED",
          message: "Payment could not be prepared. Please try again from chat.",
        },
        { status: 500 }
      );
    }

    await safeRecordPaymentAuditEvent({
      paymentId: requestData.paymentId,
      provider: payment.provider,
      direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_RESPONSE,
      eventType: "payment.process.prepared",
      eventStatus: providerIntent.paymentAvailable
        ? PAYMENT_AUDIT_STATUS.APPLIED
        : PAYMENT_AUDIT_STATUS.IGNORED,
      providerPaymentId: providerIntent.providerPaymentIntentId,
      payload: {
        status: payment.status,
        paymentMethod: providerIntent.paymentMethod,
        amount: providerIntent.amount,
        providerMode: providerIntent.mode,
        paymentAvailable: providerIntent.paymentAvailable,
        canIssuePolicy: false,
      },
    });

    return NextResponse.json({
      success: true,
      paymentId: requestData.paymentId,
      transactionRef: payment.transactionRef,
      provider: payment.provider,
      providerMode: payment.providerMode,
      paymentAvailable: payment.paymentAvailable,
      clientConfirmationToken: payment.clientConfirmationToken || undefined,
      status: payment.status,
      canIssuePolicy: false,
      message: providerIntent.message,
    });

  } catch (error) {
    console.error("Payment processing error:", error);
    if (error instanceof PaymentProviderError) {
      await safeRecordPaymentAuditEvent({
        paymentId: requestData?.paymentId || null,
        provider: process.env.LAJOO_PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER || "mock",
        direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_RESPONSE,
        eventType: "payment.process.failed",
        eventStatus: PAYMENT_AUDIT_STATUS.FAILED,
        errorCode: error.code,
        errorMessage: error.message,
      });

      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status }
      );
    }
    await safeRecordPaymentAuditEvent({
      paymentId: requestData?.paymentId || null,
      provider: process.env.LAJOO_PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER || "mock",
      direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_RESPONSE,
      eventType: "payment.process.failed",
      eventStatus: PAYMENT_AUDIT_STATUS.FAILED,
      errorCode: "PAYMENT_PROCESSING_FAILED",
      errorMessage: "Payment processing failed.",
    });

    return NextResponse.json(
      { error: "Payment processing failed", message: "Payment processing failed." },
      { status: 500 }
    );
  }
}
