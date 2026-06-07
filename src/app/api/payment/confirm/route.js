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

    const { paymentId } = validation.data;

    // Get existing payment
    const existingPayment = await getPayment(paymentId);
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

    const providerConfirmation = confirmProviderPaymentIntent(existingPayment, validation.data);

    const confirmedPayment = await confirmPayment(paymentId, providerConfirmation.transactionRef);

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
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "Payment confirmation failed" },
      { status: 500 }
    );
  }
}
