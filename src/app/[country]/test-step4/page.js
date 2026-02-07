"use client";
import { useState } from "react";
import SelectedQuoteCard from "@/components/SelectedQuoteCard";
import PersonalDetailsForm from "@/components/PersonalDetailsForm";
import OTPVerification from "@/components/OTPVerification";
import { extractPersonalInfo } from "@/utils/nlpExtractor";

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

export default function TestStep4() {
  const [step, setStep] = useState("form"); // "form" or "otp"
  const [userDetails, setUserDetails] = useState(null);
  const [extractedPersonalInfo, setExtractedPersonalInfo] = useState({});
  const [chatInput, setChatInput] = useState("");

  const handleDetailsSubmit = (formData) => {
    setUserDetails(formData);
    setStep("otp");
    alert(`Details received:\nEmail: ${formData.email}\nPhone: ${formData.phone}\nAddress: ${formData.address}\n\nOTP sent!`);
  };

  const handleOTPVerify = (otpCode) => {
    alert(`OTP Verified: ${otpCode}\n\nProceeding to payment...`);
  };

  const handleChatSubmit = (e) => {
    e.preventDefault();
    const extracted = extractPersonalInfo(chatInput);
    if (extracted.email || extracted.phone || extracted.address) {
      setExtractedPersonalInfo(prev => ({
        email: extracted.email || prev.email,
        phone: extracted.phone || prev.phone,
        address: extracted.address || prev.address,
      }));
      alert(`Extracted:\nEmail: ${extracted.email || 'N/A'}\nPhone: ${extracted.phone || 'N/A'}\nAddress: ${extracted.address || 'N/A'}`);
    } else {
      alert('No personal information detected in your message.');
    }
    setChatInput("");
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
        Step 4/5: Personal Details & OTP - Test Page
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

      {step === "form" ? (
        <>
          <div style={{
            background: "#fff",
            padding: "20px",
            borderRadius: "12px",
            marginBottom: "20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
          }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px", color: "#111827" }}>
              Test Hybrid Approach: Type your details here
            </h3>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "16px" }}>
              Try typing: "My email is john@example.com, phone 0123456789, and address is 123 Jalan Bukit, Kuala Lumpur"
            </p>
            <form onSubmit={handleChatSubmit} style={{ display: "flex", gap: "12px" }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type your details here..."
                style={{
                  flex: 1,
                  padding: "12px",
                  border: "2px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "14px"
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "12px 24px",
                  background: "#0062ff",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                Send
              </button>
            </form>
          </div>

          <PersonalDetailsForm
            heading="(Step 4/5) Please input your personal details as per below before payment."
            onSubmit={handleDetailsSubmit}
            prefilledData={extractedPersonalInfo}
          />
        </>
      ) : (
        <OTPVerification
          heading="(Step 4/5) Please key in the 4-digit verification codes sent to either your email or phone number."
          onVerify={handleOTPVerify}
        />
      )}
    </main>
  );
}
