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
import { createPayment, PAYMENT_STATUS } from "@/lib/paymentStore";
import {
  PaymentProviderError,
  createProviderPaymentIntent,
} from "@/server/payment/paymentProvider";

// Payment request validation
const PaymentRequestSchema = z.object({
  paymentId: z.string().min(1),
  total: z.number().positive(),
  insurer: z.string().min(1),
  plate: z.string().min(1),
  insurance: z.number().nonnegative(),
  addons: z.number().nonnegative(),
  roadtax: z.number().nonnegative(),
  paymentMethod: z.enum(["card", "fpx", "ewallet", "cc-instalment", "bnpl"]),
  // Session ID to link payment to chat session
  sessionId: z.string().optional(),
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

    const paymentData = validation.data;
    const providerIntent = createProviderPaymentIntent(paymentData);

    const payment = createPayment({
      ...paymentData,
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

    return NextResponse.json({
      success: true,
      paymentId: paymentData.paymentId,
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
