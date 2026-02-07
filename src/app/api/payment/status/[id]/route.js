/**
 * Payment Status API
 *
 * This endpoint allows the chat UI to poll for payment status.
 * Returns the verified payment status from server-side storage.
 *
 * Security: Only returns minimal info needed for display
 */

import { NextResponse } from "next/server";
import { getPayment, PAYMENT_STATUS } from "@/lib/paymentStore";

export async function GET(request, { params }) {
  try {
    const { id: paymentId } = await params;

    if (!paymentId) {
      return NextResponse.json(
        { error: "Payment ID required" },
        { status: 400 }
      );
    }

    // Get payment from server-side store
    const payment = getPayment(paymentId);

    if (!payment) {
      return NextResponse.json({
        paymentId,
        status: "not_found",
        found: false,
      });
    }

    // Return status with relevant info for confirmed payments
    const response = {
      paymentId,
      status: payment.status,
      found: true,
    };

    // Include payment details only if confirmed (for success message)
    if (payment.status === PAYMENT_STATUS.CONFIRMED) {
      response.payment = {
        total: payment.total,
        insurer: payment.insurer,
        plate: payment.plate,
        insurance: payment.insurance,
        addons: payment.addons,
        roadtax: payment.roadtax,
        confirmedAt: payment.confirmedAt,
        transactionRef: payment.transactionRef,
      };
    }

    // Include expiry info for pending payments
    if (payment.status === PAYMENT_STATUS.PENDING) {
      response.expiresAt = payment.expiresAt;
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error("Payment status check error:", error);
    return NextResponse.json(
      { error: "Failed to check payment status" },
      { status: 500 }
    );
  }
}
