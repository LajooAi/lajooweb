"use client";
import { useState } from "react";

const PAYMENT_METHODS = [
  {
    id: "card",
    name: "Credit & Debit Card",
    subtitle: "Mastercard, Visa, American Express, UnionPay",
    icon: "💳",
  },
  {
    id: "fpx",
    name: "FPX",
    subtitle: "Online Banking",
    icon: "🏦",
  },
  {
    id: "ewallet",
    name: "E-Wallet",
    subtitle: "Touch 'n Go, Boost, GrabPay",
    icon: "💰",
  },
  {
    id: "instalment",
    name: "Credit Card Instalment",
    subtitle: "0% Interest Available",
    icon: "📊",
  },
  {
    id: "bnpl",
    name: "Buy Now Pay Later",
    subtitle: "Atome",
    icon: "⏰",
  },
];

export default function PaymentSelection({ heading, grandTotal, onPaymentSelect, stepIndicator, disabled = false, confirmedMethod = null }) {
  const [selectedMethod, setSelectedMethod] = useState(confirmedMethod);

  const handleMethodClick = (methodId) => {
    if (disabled) return;
    setSelectedMethod(methodId);
  };

  const handleConfirm = () => {
    if (selectedMethod && onPaymentSelect) {
      onPaymentSelect(selectedMethod);
    }
  };

  // Use confirmedMethod if disabled (already paid)
  const displayMethod = disabled ? confirmedMethod : selectedMethod;

  return (
    <div className="payment-section">
      {stepIndicator && <p className="step-indicator">{stepIndicator}</p>}
      {heading && <p className="payment-heading">{heading}</p>}

      {grandTotal && (
        <div className="payment-total">
          <span className="payment-total-label">Total Amount:</span>
          <span className="payment-total-value">RM {grandTotal.toLocaleString()}</span>
        </div>
      )}

      <div className="payment-methods">
        {PAYMENT_METHODS.map((method) => (
          <div
            key={method.id}
            className={`payment-method-item ${displayMethod === method.id ? "payment-selected" : ""} ${disabled ? "payment-method-disabled" : ""}`}
            onClick={() => handleMethodClick(method.id)}
          >
            <div className="payment-method-icon">{method.icon}</div>
            <div className="payment-method-content">
              <span className="payment-method-name">{method.name}</span>
              {method.subtitle && <span className="payment-method-subtitle">{method.subtitle}</span>}
            </div>
            <div className={`payment-method-checkbox ${displayMethod === method.id ? "checked" : ""}`}>
              {displayMethod === method.id && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13.3334 4L6.00002 11.3333L2.66669 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        className="payment-confirm-button"
        onClick={handleConfirm}
        disabled={!displayMethod || disabled}
      >
        {disabled ? "Payment Complete ✓" : "Proceed to Payment"}
      </button>
    </div>
  );
}
