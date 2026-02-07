"use client";
import { useState, useRef, useEffect } from "react";

export default function OTPVerification({ heading, onVerify, stepIndicator }) {
  const [otp, setOtp] = useState(["", "", "", ""]);
  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // Auto-focus the first input when component mounts
  useEffect(() => {
    // Small delay to ensure the component is fully rendered
    const timer = setTimeout(() => {
      inputRefs[0].current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleChange = (index, value) => {
    // Only allow numbers
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  // Handle paste - allow pasting full 4-digit OTP
  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();

    // Check if pasted content is exactly 4 digits
    if (/^\d{4}$/.test(pastedData)) {
      const digits = pastedData.split("");
      setOtp(digits);
      // Focus last input after paste
      inputRefs[3].current?.focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const otpCode = otp.join("");
    if (onVerify && otpCode.length === 4) {
      onVerify(otpCode);
    }
  };

  return (
    <div className="otp-section">
      {stepIndicator && <p className="step-indicator">{stepIndicator}</p>}
      {heading && <p className="otp-heading">{heading}</p>}

      <form className="otp-form" onSubmit={handleSubmit}>
        <div className="otp-inputs">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={inputRefs[index]}
              type="text"
              inputMode="numeric"
              maxLength={1}
              className="otp-input"
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              autoComplete="one-time-code"
            />
          ))}
        </div>

        <button type="submit" className="otp-submit-button">
          Verify
        </button>
      </form>
    </div>
  );
}
