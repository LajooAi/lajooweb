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

    // Generate a unique transaction reference
    const transactionRef = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Store payment as pending using shared store
    const payment = createPayment({
      ...paymentData,
      transactionRef,
    });

    // In production, this is where you'd:
    // 1. Call the payment gateway API (Stripe, etc.)
    // 2. Get a redirect URL or payment intent
    // 3. Return that to the client

    return NextResponse.json({
      success: true,
      paymentId: paymentData.paymentId,
      transactionRef,
      status: PAYMENT_STATUS.PENDING,
      message: "Payment initiated",
    });

  } catch (error) {
    console.error("Payment processing error:", error);
    return NextResponse.json(
      { error: "Payment processing failed", message: error.message },
      { status: 500 }
    );
  }
}
