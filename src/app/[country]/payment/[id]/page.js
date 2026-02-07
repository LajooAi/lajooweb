"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

// Payment method configurations
const PAYMENT_METHODS = [
  {
    id: "card",
    name: "Credit / Debit Card",
    subtitle: "Visa, Mastercard, American Express",
    logos: [
      { src: "https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg", alt: "Visa" },
      { src: "https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg", alt: "Mastercard" },
      { src: "https://upload.wikimedia.org/wikipedia/commons/f/fa/American_Express_logo_%282018%29.svg", alt: "Amex" },
    ],
  },
  {
    id: "fpx",
    name: "FPX Online Banking",
    subtitle: "Direct bank transfer",
    logos: [
      { src: "https://upload.wikimedia.org/wikipedia/commons/a/ad/FPX_logo.svg", alt: "FPX" },
      { src: "https://upload.wikimedia.org/wikipedia/commons/a/a0/Maybank_logo.svg", alt: "Maybank" },
      { src: "https://upload.wikimedia.org/wikipedia/commons/c/cf/CIMB_logo.svg", alt: "CIMB" },
    ],
  },
  {
    id: "ewallet",
    name: "E-Wallet",
    subtitle: "Touch 'n Go, GrabPay, Boost",
    logos: [
      { src: "https://upload.wikimedia.org/wikipedia/en/f/f7/Touch_%27n_Go_eWallet_logo.png", alt: "TnG" },
      { src: "https://upload.wikimedia.org/wikipedia/commons/1/12/Grab_%28application%29_logo.svg", alt: "GrabPay" },
      { src: "https://upload.wikimedia.org/wikipedia/commons/8/88/Boost_Malaysia_logo.svg", alt: "Boost" },
    ],
  },
  {
    id: "cc-instalment",
    name: "Credit Card Instalment",
    subtitle: "0% interest for 6/12 months",
    logos: [
      { src: "https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg", alt: "Visa" },
      { src: "https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg", alt: "Mastercard" },
    ],
    badge: "0% Interest",
  },
  {
    id: "bnpl",
    name: "Buy Now, Pay Later",
    subtitle: "Split into 3 payments",
    logos: [
      { src: "https://cdn.worldvectorlogo.com/logos/atome.svg", alt: "Atome" },
      { src: "https://upload.wikimedia.org/wikipedia/commons/3/37/ShopBack_PayLater_Logo.png", alt: "ShopBack" },
    ],
    badge: "Split Payment",
  },
];

export default function PaymentPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Parse payment details from URL params
  const paymentId = params.id;
  const total = searchParams.get("total") || "1182";
  const insurer = searchParams.get("insurer") || "Allianz";
  const plate = searchParams.get("plate") || "JRT 9289";
  const insurance = searchParams.get("insurance") || "920";
  const addons = searchParams.get("addons") || "152";
  const roadtax = searchParams.get("roadtax") || "110";

  const handlePayment = async () => {
    if (!selectedMethod) return;

    setIsProcessing(true);

    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Store payment success in localStorage for the chat page to detect
    const paymentData = {
      type: 'PAYMENT_SUCCESS',
      timestamp: Date.now(),
      data: {
        paymentId,
        total,
        insurer,
        plate,
        insurance,
        addons,
        roadtax,
        paymentMethod: selectedMethod,
      }
    };
    localStorage.setItem('lajoo_payment_success', JSON.stringify(paymentData));

    // Close this tab - the chat page will detect the localStorage change
    window.close();

    // Fallback: if window.close() doesn't work (some browsers block it),
    // redirect after a short delay
    setTimeout(() => {
      window.location.href = `/${params.country}?payment=success&ref=${paymentId}`;
    }, 500);
  };

  return (
    <div className="payment-page">
      <div className="payment-container">
        {/* Header */}
        <div className="payment-header">
          <button onClick={() => router.back()} className="back-link">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1>Complete Payment</h1>
          <div className="header-spacer" />
        </div>

        {/* Order Summary */}
        <div className="order-summary">
          <div className="order-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span>Secure Checkout</span>
          </div>

          <h2 className="order-title">
            {insurer} Car Insurance Renewal
          </h2>
          <p className="order-plate">{plate}</p>

          <div className="order-breakdown">
            <div className="breakdown-row">
              <span>Insurance Premium</span>
              <span>RM {Number(insurance).toLocaleString()}</span>
            </div>
            {Number(addons) > 0 && (
              <div className="breakdown-row">
                <span>Add-ons</span>
                <span>RM {Number(addons).toLocaleString()}</span>
              </div>
            )}
            {Number(roadtax) > 0 && (
              <div className="breakdown-row">
                <span>Road Tax</span>
                <span>RM {Number(roadtax).toLocaleString()}</span>
              </div>
            )}
            <div className="breakdown-row total">
              <span>Total</span>
              <span>RM {Number(total).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="payment-methods-section">
          <h3>Select Payment Method</h3>

          <div className="payment-methods-list">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.id}
                className={`payment-method-card ${selectedMethod === method.id ? "selected" : ""}`}
                onClick={() => setSelectedMethod(method.id)}
              >
                <div className="method-radio">
                  <div className={`radio-dot ${selectedMethod === method.id ? "checked" : ""}`} />
                </div>

                <div className="method-info">
                  <div className="method-header">
                    <span className="method-name">{method.name}</span>
                    {method.badge && (
                      <span className="method-badge">{method.badge}</span>
                    )}
                  </div>
                  <span className="method-subtitle">{method.subtitle}</span>

                  <div className="method-logos">
                    {method.logos.map((logo, idx) => (
                      <img
                        key={idx}
                        src={logo.src}
                        alt={logo.alt}
                        className="payment-logo"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Pay Button */}
        <div className="payment-action">
          <button
            className={`pay-button ${selectedMethod ? "active" : ""} ${isProcessing ? "processing" : ""}`}
            onClick={handlePayment}
            disabled={!selectedMethod || isProcessing}
          >
            {isProcessing ? (
              <>
                <span className="spinner" />
                Processing...
              </>
            ) : (
              <>Pay RM {Number(total).toLocaleString()}</>
            )}
          </button>

          <p className="security-note">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            256-bit SSL encrypted. Your payment details are secure.
          </p>
        </div>

        {/* Footer */}
        <div className="payment-footer">
          <p>Powered by <strong>LAJOO</strong></p>
          <div className="footer-links">
            <Link href={`/${params.country}/terms`}>Terms</Link>
            <span>•</span>
            <Link href={`/${params.country}/terms`}>Privacy</Link>
          </div>
        </div>
      </div>

      <style jsx>{`
        .payment-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          padding: 20px;
        }

        .payment-container {
          max-width: 480px;
          margin: 0 auto;
          background: #fff;
          border-radius: 24px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          overflow: hidden;
        }

        .payment-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid #f1f5f9;
        }

        .back-link {
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          transition: all 0.2s;
          background: none;
          border: none;
          cursor: pointer;
        }

        .back-link:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .payment-header h1 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: #0f172a;
        }

        .header-spacer {
          width: 40px;
        }

        .order-summary {
          padding: 24px;
          background: linear-gradient(135deg, #0062ff 0%, #0047b3 100%);
          color: #fff;
        }

        .order-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.2);
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 16px;
        }

        .order-title {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 4px 0;
        }

        .order-plate {
          font-size: 16px;
          opacity: 0.9;
          margin: 0 0 20px 0;
        }

        .order-breakdown {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 16px;
        }

        .breakdown-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 15px;
        }

        .breakdown-row.total {
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          margin-top: 8px;
          padding-top: 16px;
          font-size: 20px;
          font-weight: 700;
        }

        .payment-methods-section {
          padding: 24px;
        }

        .payment-methods-section h3 {
          font-size: 16px;
          font-weight: 600;
          color: #0f172a;
          margin: 0 0 16px 0;
        }

        .payment-methods-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .payment-method-card {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 16px;
          border: 2px solid #e2e8f0;
          border-radius: 16px;
          background: #fff;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          width: 100%;
        }

        .payment-method-card:hover {
          border-color: #0062ff;
          background: #f8faff;
        }

        .payment-method-card.selected {
          border-color: #0062ff;
          background: #eff6ff;
        }

        .method-radio {
          width: 22px;
          height: 22px;
          border: 2px solid #cbd5e1;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 2px;
          transition: all 0.2s;
        }

        .payment-method-card.selected .method-radio {
          border-color: #0062ff;
        }

        .radio-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: transparent;
          transition: all 0.2s;
        }

        .radio-dot.checked {
          background: #0062ff;
        }

        .method-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .method-header {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .method-name {
          font-size: 16px;
          font-weight: 600;
          color: #0f172a;
        }

        .method-badge {
          background: #dcfce7;
          color: #166534;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 12px;
        }

        .method-subtitle {
          font-size: 13px;
          color: #64748b;
        }

        .method-logos {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
          flex-wrap: wrap;
        }

        .payment-logo {
          height: 22px;
          width: auto;
          max-width: 50px;
          object-fit: contain;
          filter: grayscale(20%);
        }

        .payment-action {
          padding: 24px;
          border-top: 1px solid #f1f5f9;
        }

        .pay-button {
          width: 100%;
          padding: 16px 24px;
          border: none;
          border-radius: 14px;
          font-size: 18px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          background: #cbd5e1;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .pay-button.active {
          background: #0062ff;
          color: #fff;
        }

        .pay-button.active:hover {
          background: #0052cc;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 98, 255, 0.3);
        }

        .pay-button:disabled {
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .pay-button.processing {
          background: #64748b;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .security-note {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 13px;
          color: #64748b;
          margin: 16px 0 0 0;
        }

        .payment-footer {
          padding: 20px 24px;
          background: #f8fafc;
          text-align: center;
        }

        .payment-footer p {
          font-size: 14px;
          color: #64748b;
          margin: 0 0 8px 0;
        }

        .payment-footer strong {
          color: #0062ff;
        }

        .footer-links {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-size: 13px;
        }

        .footer-links a {
          color: #64748b;
          text-decoration: none;
        }

        .footer-links a:hover {
          color: #0062ff;
        }

        .footer-links span {
          color: #cbd5e1;
        }

        @media (max-width: 520px) {
          .payment-page {
            padding: 0;
          }

          .payment-container {
            border-radius: 0;
            min-height: 100vh;
          }

          .order-title {
            font-size: 20px;
          }
        }
      `}</style>
    </div>
  );
}
