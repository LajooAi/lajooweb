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

export async function POST(request) {
  try {
    const body = await request.json();
    const validation = PaymentRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid payment request", details: validation.error.issues },
        { status: 400 }
      );
    }

    const requestData = validation.data;
    const existingSnapshot = await getPayment(requestData.paymentId);

    if (!existingSnapshot) {
      return NextResponse.json(
        {
          error: "PAYMENT_SNAPSHOT_NOT_FOUND",
          message: "This payment link is no longer valid. Please return to chat and generate a fresh checkout link.",
        },
        { status: 404 }
      );
    }

    if (existingSnapshot.status === PAYMENT_STATUS.EXPIRED) {
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
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "Payment processing failed", message: "Payment processing failed." },
      { status: 500 }
    );
  }
}
