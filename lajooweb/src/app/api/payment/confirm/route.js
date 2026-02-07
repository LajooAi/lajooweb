/**
 * Payment Confirmation API
 *
 * This endpoint confirms a payment after successful processing.
 * In production, this would be called by a payment gateway webhook.
 *
 * For demo purposes, we also allow direct confirmation.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmPayment, getPayment, PAYMENT_STATUS } from "@/lib/paymentStore";

// For demo: simple shared secret (in production, use proper webhook signatures)
const DEMO_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || "lajoo-demo-secret-2024";

const ConfirmRequestSchema = z.object({
  paymentId: z.string().min(1),
  // In production, this would be a cryptographic signature from the payment provider
  secret: z.string().optional(),
  // Transaction reference from payment provider
  transactionRef: z.string().optional(),
});

export async function POST(request) {
  try {
    const body = await request.json();
    const validation = ConfirmRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid confirmation request" },
        { status: 400 }
      );
    }

    const { paymentId, secret, transactionRef } = validation.data;

    // In production, verify webhook signature from payment provider
    // For demo, we accept requests with either:
    // 1. Valid secret
    // 2. From same origin (trusted internal call)
    const origin = request.headers.get("origin") || "";
    const isInternalCall = origin.includes("localhost") || origin.includes("lajoo");
    const hasValidSecret = secret === DEMO_SECRET;

    if (!isInternalCall && !hasValidSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get existing payment
    const existingPayment = getPayment(paymentId);
    if (!existingPayment) {
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
        payment: {
          paymentId: existingPayment.paymentId,
          total: existingPayment.total,
          insurer: existingPayment.insurer,
          plate: existingPayment.plate,
          confirmedAt: existingPayment.confirmedAt,
        },
      });
    }

    // Confirm the payment
    const confirmedPayment = confirmPayment(paymentId, transactionRef);

    if (!confirmedPayment) {
      return NextResponse.json(
        { error: "Failed to confirm payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      paymentId,
      status: PAYMENT_STATUS.CONFIRMED,
      message: "Payment confirmed successfully",
      payment: {
        paymentId: confirmedPayment.paymentId,
        total: confirmedPayment.total,
        insurer: confirmedPayment.insurer,
        plate: confirmedPayment.plate,
        insurance: confirmedPayment.insurance,
        addons: confirmedPayment.addons,
        roadtax: confirmedPayment.roadtax,
        confirmedAt: confirmedPayment.confirmedAt,
      },
    });

  } catch (error) {
    console.error("Payment confirmation error:", error);
    return NextResponse.json(
      { error: "Payment confirmation failed" },
      { status: 500 }
    );
  }
}
