"use client";
import { useState } from "react";
import SelectedQuoteCard from "@/components/SelectedQuoteCard";
import PaymentSelection from "@/components/PaymentSelection";
import PaymentSuccess from "@/components/PaymentSuccess";

const SELECTED_QUOTE = {
  id: "ikhlas-1",
  insurer: "Takaful Ikhlas Insurance",
  sumInsured: 34000,
  cover: "Full Cover",
  priceBefore: 995,
  ncdPercent: 20,
  priceAfter: 796,
  logoUrl: "/partners/takaful.svg",
};

export default function TestStep5() {
  const [paymentState, setPaymentState] = useState("selection"); // "selection" or "success"

  const handlePaymentSelect = (paymentMethod) => {
    alert(`Payment method selected: ${paymentMethod}\n\nProcessing payment...`);
    // Simulate payment processing
    setTimeout(() => {
      setPaymentState("success");
    }, 1500);
  };

  return (
    <main
      style={{
        padding: "40px 20px",
        maxWidth: "600px",
        margin: "0 auto",
        minHeight: "100vh",
        background: "#f9fafb",
      }}
    >
      <h1
        style={{
          fontSize: "28px",
          fontWeight: "700",
          marginBottom: "24px",
          color: "#111827",
        }}
      >
        Step 5/5: Payment & Success - Test Page
      </h1>

      <SelectedQuoteCard
        quote={SELECTED_QUOTE}
        selectedAddOns={[
          { id: "windscreen", name: "Windscreen Protection", price: 100 }
        ]}
        selectedRoadTax={{
          id: "deliver",
          name: "Yes, deliver it to me",
          price: 100
        }}
      />

      {paymentState === "selection" ? (
        <PaymentSelection
          heading="(Step 5/5) Please select your payment method:"
          grandTotal={996}
          onPaymentSelect={handlePaymentSelect}
        />
      ) : (
        <PaymentSuccess
          heading="Payment Successful!"
          plateNumber="JRT 9289"
          policyPdfUrl="#download-policy"
          googleReviewUrl="https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review"
        />
      )}
    </main>
  );
}
