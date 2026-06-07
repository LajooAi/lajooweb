/**
 * Payment Confirmation API
 *
 * This endpoint confirms a payment after successful processing.
 * In production, this would be called by a payment gateway webhook.
 *
 * For mock/demo purposes, confirmation requires the server-created
 * clientConfirmationToken returned by /api/payment/process.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PAYMENT_AUDIT_DIRECTION,
  PAYMENT_AUDIT_STATUS,
  recordPaymentAuditEvent,
} from "@/lib/paymentAuditStore";
import { confirmPayment, getPayment, PAYMENT_STATUS } from "@/lib/paymentStore";
import {
  PaymentProviderError,
  confirmProviderPaymentIntent,
} from "@/server/payment/paymentProvider";

const ConfirmRequestSchema = z.object({
  paymentId: z.string().min(1),
  paymentMethod: z.enum(["card", "fpx", "ewallet", "cc-instalment", "bnpl"]).optional(),
  secret: z.string().optional(),
  clientConfirmationToken: z.string().optional(),
  transactionRef: z.string().optional(),
});

async function safeRecordPaymentAuditEvent(event) {
  try {
    return await recordPaymentAuditEvent(event);
  } catch (error) {
    console.warn("[payment-confirm] Unable to write payment audit event.", error?.message || error);
    return null;
  }
}

export async function POST(request) {
  let validatedBody = null;
  try {
    const body = await request.json();
    const validation = ConfirmRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid confirmation request" },
        { status: 400 }
      );
    }

    validatedBody = validation.data;
    const { paymentId } = validatedBody;

    await safeRecordPaymentAuditEvent({
      paymentId,
      provider: process.env.LAJOO_PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER || "mock",
      direction: PAYMENT_AUDIT_DIRECTION.CLIENT_REQUEST,
      eventType: "payment.confirm.requested",
      eventStatus: PAYMENT_AUDIT_STATUS.RECEIVED,
      payload: {
        paymentId,
        paymentMethod: validatedBody.paymentMethod || null,
        hasClientConfirmationToken: Boolean(validatedBody.clientConfirmationToken),
        hasSecret: Boolean(validatedBody.secret),
      },
    });

    // Get existing payment
    const existingPayment = await getPayment(paymentId);
    if (!existingPayment) {
      await safeRecordPaymentAuditEvent({
        paymentId,
        provider: process.env.LAJOO_PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER || "mock",
        direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_RESPONSE,
        eventType: "payment.confirm.rejected",
        eventStatus: PAYMENT_AUDIT_STATUS.REJECTED,
        errorCode: "PAYMENT_NOT_FOUND",
        errorMessage: "Payment was not found.",
      });

      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    if (existingPayment.status === PAYMENT_STATUS.CONFIRMED) {
      return NextResponse.json({
        success: true,
        paymentId,
        status: PAYMENT_STATUS.CONFIRMED,
        message: "Payment already confirmed",
        canIssuePolicy: false,
        payment: {
          paymentId: existingPayment.paymentId,
          total: existingPayment.total,
          insurer: existingPayment.insurer,
          plate: existingPayment.plate,
          confirmedAt: existingPayment.confirmedAt,
        },
      });
    }

    const providerConfirmation = confirmProviderPaymentIntent(existingPayment, validatedBody);

    const confirmedPayment = await confirmPayment(paymentId, providerConfirmation.transactionRef);

    if (!confirmedPayment) {
      return NextResponse.json(
        { error: "Failed to confirm payment" },
        { status: 500 }
      );
    }

    await safeRecordPaymentAuditEvent({
      paymentId,
      provider: providerConfirmation.provider,
      direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_RESPONSE,
      eventType: "payment.confirm.confirmed",
      eventStatus: PAYMENT_AUDIT_STATUS.APPLIED,
      providerPaymentId: providerConfirmation.providerPaymentIntentId,
      payload: {
        status: PAYMENT_STATUS.CONFIRMED,
        transactionRef: providerConfirmation.transactionRef,
        isMock: providerConfirmation.isMock,
        canIssuePolicy: false,
      },
    });

    return NextResponse.json({
      success: true,
      paymentId,
      status: PAYMENT_STATUS.CONFIRMED,
      provider: providerConfirmation.provider,
      isMock: providerConfirmation.isMock,
      canIssuePolicy: false,
      message: providerConfirmation.message,
      payment: {
        paymentId: confirmedPayment.paymentId,
        total: confirmedPayment.total,
        insurer: confirmedPayment.insurer,
        plate: confirmedPayment.plate,
        insurance: confirmedPayment.insurance,
        addons: confirmedPayment.addons,
        roadtax: confirmedPayment.roadtax,
        confirmedAt: confirmedPayment.confirmedAt,
        transactionRef: confirmedPayment.transactionRef,
      },
    });

  } catch (error) {
    console.error("Payment confirmation error:", error);
    if (error instanceof PaymentProviderError) {
      await safeRecordPaymentAuditEvent({
        paymentId: validatedBody?.paymentId || null,
        provider: process.env.LAJOO_PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER || "mock",
        direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_RESPONSE,
        eventType: "payment.confirm.failed",
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
      paymentId: validatedBody?.paymentId || null,
      provider: process.env.LAJOO_PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER || "mock",
      direction: PAYMENT_AUDIT_DIRECTION.PROVIDER_RESPONSE,
      eventType: "payment.confirm.failed",
      eventStatus: PAYMENT_AUDIT_STATUS.FAILED,
      errorCode: "PAYMENT_CONFIRMATION_FAILED",
      errorMessage: "Payment confirmation failed.",
    });

    return NextResponse.json(
      { error: "Payment confirmation failed" },
      { status: 500 }
    );
  }
}
