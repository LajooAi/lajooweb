"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import { getInsurerByText } from "@/lib/insurerCatalog";

// Payment method configurations
const PAYMENT_METHODS = [
  {
    id: "card",
    name: "Credit / Debit Card",
    subtitle: "Visa, Mastercard, American Express",
    logos: [
      { src: "/payments/visa.svg", alt: "Visa", label: "Visa", width: 54, height: 18 },
      { src: "/payments/mastercard.svg", alt: "Mastercard", label: "Mastercard", width: 28, height: 18 },
      { src: "/payments/amex.svg", alt: "Amex", label: "Amex", width: 25, height: 18 },
    ],
  },
  {
    id: "fpx",
    name: "Online Bnaking",
    subtitle: "Direct bank transfer",
    logos: [
      { src: "/payments/fpx.svg", alt: "FPX", label: "FPX", width: 50, height: 19 },
    ],
  },
  {
    id: "ewallet",
    name: "E-Wallet",
    subtitle: "Touch 'n Go, GrabPay, ShopeePay",
    logos: [
      { src: "/payments/tng.svg", alt: "TnG", label: "TnG", width: 27, height: 24 },
      { src: "/payments/grabpay.svg", alt: "GrabPay", label: "GrabPay", width: 43, height: 18 },
      { src: "/payments/shopee.svg", alt: "ShopeePay", label: "ShopeePay", width: 45, height: 20 },
    ],
  },
  {
    id: "bnpl",
    name: "Buy Now, Pay Later",
    subtitle: "Fee 6%, Period 3-6 months",
    monthlyDivisor: 6,
    logos: [
      { src: "/payments/atome.svg", alt: "Atome", label: "Atome", width: 77, height: 18 },
      { src: "/payments/shopee.svg", alt: "ShopeePay", label: "ShopeePay", width: 45, height: 20 },
    ],
  },
  {
    id: "cc-instalment",
    name: "Credit Card Instalment",
    subtitle: "Fee and period depends on the bank you choose",
    monthlyDivisor: 12,
    logoLayout: "bank-grid",
    logos: [
      { src: "/banks/cimb.svg", alt: "CIMB", label: "CIMB", width: 52, height: 16 },
      { src: "/banks/hongleong.svg", alt: "Hong Leong Bank", label: "Hong Leong Bank", width: 62, height: 14 },
      { src: "/banks/public-bank.svg", alt: "Public Bank", label: "Public Bank", width: 58, height: 14 },
      { src: "/banks/uob.svg", alt: "UOB", label: "UOB", width: 42, height: 18 },
      { src: "/banks/ocbc.svg", alt: "OCBC Bank", label: "OCBC Bank", width: 56, height: 16 },
      { src: "/banks/affin.svg", alt: "Affin Bank", label: "Affin Bank", width: 56, height: 14 },
      { src: "/banks/hsbc.svg", alt: "HSBC", label: "HSBC", width: 48, height: 16 },
      { src: "/banks/standard-chartered.svg", alt: "Standard Chartered", label: "Standard Chartered", width: 56, height: 18 },
      { src: "/banks/rhb.svg", alt: "RHB", label: "RHB", width: 52, height: 18 },
      { src: "/banks/maybank.svg", alt: "Maybank", label: "Maybank", width: 68, height: 20 },
      { src: "/banks/ambank.svg", alt: "AmBank", label: "AmBank", width: 48, height: 16 },
    ],
  },
];

function normalizeRoadTaxDescription(value) {
  const label = String(value || "").trim();
  const normalized = label.toLowerCase();

  if (!label) return "12 months digital road tax";
  if (normalized.includes("no road tax") || normalized === "not included" || normalized === "none") {
    return "Not included";
  }
  if (normalized.includes("physical") || normalized.includes("deliver")) {
    return "12 months physical + delivery";
  }
  if (normalized.includes("digital") || normalized.includes("12month-digital")) {
    return "12 months digital road tax";
  }

  return label;
}

function formatPlateNumberForDisplay(plate) {
  if (!plate) return "-";
  const compact = String(plate).replace(/\s+/g, "").toUpperCase();
  const match = compact.match(/^([A-Z]{1,3})(\d{1,4})([A-Z]{0,3})$/);
  if (!match) return compact;
  const [, prefix, number, suffix] = match;
  return suffix ? `${prefix} ${number} ${suffix}` : `${prefix} ${number}`;
}

function getPolicyEffectiveRangeDisplay() {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  const fmt = (date) => date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${fmt(start)} - ${fmt(end)}`;
}

export default function PaymentPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const parseAmount = (value, fallback = 0) => {
    const cleaned = String(value ?? "").replace(/[^\d.]/g, "");
    if (!cleaned) return fallback;
    const amount = Number(cleaned);
    return Number.isFinite(amount) ? amount : fallback;
  };

  const formatMoney = (value) => Number(value || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Parse payment details from URL params
  const paymentId = params.id;
  const session = searchParams.get("session") || "default";
  const insurer = searchParams.get("insurer") || "Allianz";
  const plate = searchParams.get("plate") || "JRT 9289";
  const insurance = parseAmount(searchParams.get("insurance"), 920);
  const addons = parseAmount(searchParams.get("addons"), 152);
  const tax = parseAmount(searchParams.get("tax"), 0);
  const roadtax = parseAmount(searchParams.get("roadtax"), 110);
  const insurerProfile = getInsurerByText(insurer);
  const isTakaful = insurerProfile?.type === "takaful" || /takaful/i.test(insurer);
  const insurerDisplayName =
    searchParams.get("insurerDisplay") ||
    (insurerProfile?.key === "takaful"
      ? "Takaful Insurance Berhad"
      : insurerProfile?.summaryName || insurer);
  const logoUrl = searchParams.get("logo") || insurerProfile?.logoUrl || "/partners/allianz.svg";
  const plateDisplay = formatPlateNumberForDisplay(plate);
  const vehicleLine = searchParams.get("vehicleLine") || `${plateDisplay} · ${searchParams.get("vehicle") || "2019 Perodua Myvi 1.5L"}`;
  const coverType = searchParams.get("coverType") || "Comprehensive";
  const sumInsured = parseAmount(searchParams.get("sumInsured"), insurerProfile?.sumInsured || 0);
  const priceBefore = parseAmount(searchParams.get("priceBefore"), insurerProfile?.priceBefore || insurance);
  const ncdPercent = parseAmount(searchParams.get("ncd"), insurerProfile?.ncdPercent ?? 20);
  const policyPeriod = searchParams.get("policyPeriod") || getPolicyEffectiveRangeDisplay();
  const insuranceSectionTitle = searchParams.get("insuranceTitle") || (isTakaful ? "Insurance/Takaful" : "Insurance");
  const totalFromParams = parseAmount(searchParams.get("total"), insurance + addons + tax + roadtax);
  const computedTotal = insurance + addons + tax + roadtax;
  const total = searchParams.has("total") ? totalFromParams : computedTotal;
  const inferredAddOnGap = Math.max(0, total - insurance - addons - tax - roadtax);
  const roadTaxDescription = normalizeRoadTaxDescription(searchParams.get("roadtaxName"));

  const parseAddOnRows = () => {
    const raw = searchParams.get("addonsDetail");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => ({
              name: String(item?.name || "").trim(),
              price: Number(item?.price || 0),
            }))
            .filter((item) => item.name && Number.isFinite(item.price) && item.price > 0);
        }
      } catch {
        // Fall through to URL-total based fallback below.
      }
    }

    if (inferredAddOnGap > 0 && addons > 0) {
      return [
        { name: "Inclusion of Special Perils", price: inferredAddOnGap },
        { name: "Windscreen Coverage RM 1,000.00", price: addons },
      ];
    }

    return addons > 0 ? [{ name: "Add-ons", price: addons }] : [];
  };

  const addOnRows = parseAddOnRows();

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
        tax,
        roadtax,
        paymentMethod: selectedMethod,
      },
    };
    localStorage.setItem('lajoo_payment_success', JSON.stringify(paymentData));

    // Close this tab - the chat page will detect the localStorage change
    window.close();

    // Fallback: if window.close() doesn't work (some browsers block it),
    // redirect after a short delay
    setTimeout(() => {
      window.location.href = `/${params.country}?session=${encodeURIComponent(session)}&payment=success&ref=${paymentId}`;
    }, 500);
  };

  return (
    <div className="payment-page">
      <div className="payment-container">
        {/* Order Summary */}
        <div className="order-summary">
          <div className="order-badge">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <circle cx="15" cy="15" r="12" stroke="currentColor" strokeWidth="2" />
              <path d="M9.5 15.5L13 19L20.5 11.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Secure Checkout</span>
          </div>

          <div className="order-insurer">
            <div className="order-logo-card">
              <Image
                src={logoUrl}
                alt={`${insurerDisplayName} logo`}
                width={66}
                height={66}
                className="order-logo-image"
              />
            </div>
            <div className="order-insurer-copy">
              <h2 className="order-title">{insurerDisplayName}</h2>
              <p className="order-vehicle">{vehicleLine}</p>
            </div>
          </div>

          <div className="order-meta">
            {sumInsured > 0 && <p>Sum insured : RM {sumInsured.toLocaleString("en-MY")}</p>}
            <p>Policy Period : {policyPeriod}</p>
            <p>Cover Type : {coverType}</p>
          </div>

          <div className="order-breakdown">
            <div className="breakdown-section">
              <h3>{insuranceSectionTitle}</h3>
              <div className="breakdown-row">
                <span>Premium RM {formatMoney(priceBefore)} - NCD {ncdPercent}%</span>
                <strong>RM {formatMoney(insurance)}</strong>
              </div>
            </div>

            {addOnRows.length > 0 && (
              <div className="breakdown-section">
                <h3>Add-ons</h3>
                {addOnRows.map((addOn) => (
                  <div className="breakdown-row" key={`${addOn.name}-${addOn.price}`}>
                    <span>{addOn.name}</span>
                    <strong>RM {formatMoney(addOn.price)}</strong>
                  </div>
                ))}
              </div>
            )}

            {tax > 0 && (
              <div className="breakdown-section">
                <h3>Tax</h3>
                <div className="breakdown-row">
                  <span>SST (8%) + Stamp Duty (RM 10.00)</span>
                  <strong>RM {formatMoney(tax)}</strong>
                </div>
              </div>
            )}

            {roadtax > 0 && (
              <div className="breakdown-section">
                <h3>Road Tax</h3>
                <div className="breakdown-row">
                  <span>{roadTaxDescription}</span>
                  <strong>RM {formatMoney(roadtax)}</strong>
                </div>
              </div>
            )}

            <div className="breakdown-row total">
              <span>Grand Total</span>
              <strong>RM {formatMoney(total)}</strong>
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
                  {method.monthlyDivisor ? (
                    <span className="method-monthly">
                      From <strong>RM {formatMoney(total / method.monthlyDivisor)}</strong> /month
                    </span>
                  ) : null}

                  <div className={`method-logos ${method.logoLayout || "logo-row"}`}>
                    {method.logos.map((logo, idx) => (
                      <span
                        key={idx}
                        className="payment-logo-item"
                        style={{
                          "--payment-logo-width": `${logo.width || 52}px`,
                          "--payment-logo-height": `${logo.height || 20}px`,
                        }}
                      >
                        {logo.src ? (
                          <Image
                            src={logo.src}
                            alt={logo.alt}
                            className="payment-logo"
                            width={logo.width || 52}
                            height={logo.height || 20}
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              const chip = e.currentTarget.nextElementSibling;
                              if (chip) chip.style.display = "inline-flex";
                            }}
                          />
                        ) : null}
                        <span
                          className="payment-logo-chip"
                          style={{ display: logo.src ? "none" : "inline-flex" }}
                        >
                          {logo.label || logo.alt}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="payment-next-note">
            <span>What happens next ?</span>
            <p>
              After successful payment, your policy documents and payment receipt will be sent to your WhatsApp and email. You&apos;ll be redirected back to our chat once payment is completed.
            </p>
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
              <>
                <Image
                  src="/icons/payment-lock.svg"
                  alt=""
                  width={48}
                  height={48}
                  aria-hidden="true"
                  className="pay-button-lock"
                />
                <span>Pay securely - RM {formatMoney(total)}</span>
              </>
            )}
          </button>

          <div className="security-note">
            <span>
              <Image src="/icons/payment-lock-grey.svg" alt="" width={24} height={24} aria-hidden="true" />
              256-bit SSL encrypted
            </span>
            <span>
              <Image src="/icons/payment-shield.svg" alt="" width={24} height={24} aria-hidden="true" />
              Trusted payment partner
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="payment-footer">
          <p>
            <span>Powered by</span>
            <Image
              src="/logo/lajoo-logo.png"
              alt="LAJOO"
              width={86}
              height={24}
              className="payment-footer-logo"
            />
          </p>
        </div>
      </div>

      <style jsx>{`
        .payment-page {
          --pay-space-1: var(--space-1, 4px);
          --pay-space-2: var(--space-2, 8px);
          --pay-space-3: var(--space-3, 12px);
          --pay-space-4: var(--space-4, 16px);
          --pay-space-5: var(--space-5, 20px);
          --pay-space-6: var(--space-6, 24px);
          --pay-radius-sm: var(--radius-sm, 8px);
          --pay-radius-md: var(--radius-md, 12px);
          --pay-radius-lg: var(--radius-lg, 16px);
          --pay-radius-xl: var(--radius-xl, 24px);
          --pay-radius-pill: var(--radius-pill, 999px);

          min-height: 100vh;
          background: #ffffff;
          padding: 0;
        }

        .payment-container {
          max-width: 573px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 0;
          box-shadow: none;
          overflow: hidden;
        }

        .payment-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--pay-space-5) var(--pay-space-6);
          border-bottom: 1px solid #f1f5f9;
        }

        .back-link {
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--pay-radius-md);
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
          padding: 21px 24px 29px;
          background: #0062ff;
          color: #ffffff;
        }

        .order-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: #80b1ff;
          color: #ffffff;
          padding: 5px 11px 5px 8px;
          border-radius: var(--pay-radius-pill);
          font-size: 13px;
          font-weight: 700;
          line-height: 18px;
          margin-bottom: 18px;
        }

        .order-badge svg {
          width: 24px;
          height: 24px;
          flex: 0 0 auto;
        }

        .order-insurer {
          display: grid;
          grid-template-columns: 78px minmax(0, 1fr);
          align-items: center;
          gap: 17px;
          margin-bottom: 17px;
        }

        .order-logo-card {
          width: 78px;
          height: 78px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          background: #ffffff;
          overflow: hidden;
        }

        .order-logo-card :global(.order-logo-image) {
          width: 66px;
          height: 66px;
          object-fit: contain;
        }

        .order-title {
          color: #ffffff;
          font-size: 20px;
          font-weight: 700;
          line-height: 25px;
          margin: 0 0 6px;
          letter-spacing: 0;
        }

        .order-vehicle {
          color: #ffffff;
          font-size: 20px;
          font-weight: 600;
          line-height: 25px;
          margin: 0;
          letter-spacing: 0;
        }

        .order-meta {
          margin-bottom: 16px;
        }

        .order-meta p {
          color: #ffffff;
          font-size: 16px;
          font-weight: 500;
          line-height: 21px;
          letter-spacing: 0;
          margin: 0;
        }

        .order-breakdown {
          background: #ffffff;
          border: 1px solid #d8d8d8;
          border-radius: 16px;
          padding: 16px 14px 17px;
          color: #505050;
          font-size: 14px;
          font-weight: 400;
          line-height: 18px;
          letter-spacing: 0;
        }

        .breakdown-section {
          margin: 0 0 11px;
        }

        .breakdown-section h3 {
          color: #000000;
          font-size: 14px;
          font-weight: 700;
          line-height: 18px;
          letter-spacing: 0;
          margin: 0 0 5px;
        }

        .breakdown-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) max-content;
          align-items: start;
          gap: 10px;
          color: #505050;
          font-size: 14px;
          font-weight: 400;
          line-height: 18px;
          letter-spacing: 0;
          min-height: 18px;
          margin: 0;
          padding: 0;
        }

        .breakdown-row span {
          min-width: 0;
          color: #505050;
          font-weight: 400;
        }

        .breakdown-row strong {
          color: #000000;
          font-size: 14px;
          font-weight: 600;
          line-height: 18px;
          text-align: right;
          white-space: nowrap;
        }

        .breakdown-row.total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          border-top: 1px solid #d8d8d8;
          margin-top: 11px;
          padding-top: 10px;
          color: #000000;
          font-size: 16px;
          font-weight: 700;
          line-height: 18px;
        }

        .breakdown-row.total span {
          color: #000000;
          font-weight: 700;
        }

        .breakdown-row.total strong {
          color: #000000;
          font-size: 16px;
          font-weight: 700;
          line-height: 18px;
        }

        .payment-methods-section {
          padding: 32px 32px 22px;
        }

        .payment-methods-section h3 {
          font-size: 16px;
          font-weight: 600;
          color: #0f172a;
          margin: 0 0 var(--pay-space-4) 0;
        }

        .payment-methods-list {
          display: flex;
          flex-direction: column;
          gap: var(--pay-space-3);
        }

        .payment-next-note {
          margin: 28px 0 0;
        }

        .payment-next-note span {
          display: inline-flex;
          align-items: center;
          min-height: 34px;
          padding: 5px 12px;
          border-radius: 8px;
          background: #e6efff;
          color: #000000;
          font-size: 16px;
          font-weight: 600;
          line-height: 22px;
          letter-spacing: 0;
        }

        .payment-next-note p {
          margin: 14px 0 0;
          color: #000000;
          font-size: 16px;
          font-weight: 400;
          line-height: 21px;
          letter-spacing: 0;
        }

        .payment-method-card {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: var(--pay-space-4);
          border: 1.8px solid #e2e8f0;
          border-radius: var(--pay-radius-lg);
          background: #fff;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          width: 100%;
        }

        @media (hover: hover) and (pointer: fine) {
          .payment-method-card:hover {
            border-color: #0062ff;
            background: #f8faff;
          }
        }

        .payment-method-card.selected {
          border-color: #0062ff;
          background: #eff6ff;
        }

        .method-radio {
          width: 22px;
          height: 22px;
          border: 1.8px solid #cbd5e1;
          border-radius: var(--pay-radius-pill);
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
          border-radius: var(--pay-radius-pill);
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
          gap: var(--pay-space-1);
        }

        .method-header {
          display: flex;
          align-items: center;
          gap: var(--pay-space-2);
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
          padding: 3px var(--pay-space-2);
          border-radius: var(--pay-space-3);
        }

        .method-subtitle {
          font-size: 13px;
          color: #64748b;
        }

        .method-monthly {
          color: #000000;
          font-size: 15px;
          font-weight: 400;
          line-height: 19px;
          letter-spacing: 0;
        }

        .method-monthly strong {
          color: #0062ff;
          font-weight: 600;
        }

        .method-logos {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: 10px;
          flex-wrap: wrap;
        }

        .method-logos.logo-row {
          min-height: 24px;
        }

        .method-logos.bank-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          align-items: center;
          gap: 9px 11px;
          width: 100%;
          max-width: 292px;
          margin-top: 12px;
        }

        :global(.payment-logo) {
          width: var(--payment-logo-width);
          height: var(--payment-logo-height);
          max-width: 100%;
          object-fit: contain;
        }

        .payment-logo-item {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
          min-height: 24px;
        }

        .method-logos.bank-grid .payment-logo-item {
          width: 100%;
          min-height: 28px;
        }

        .payment-logo-chip {
          align-items: center;
          justify-content: center;
          height: 22px;
          padding: 0 10px;
          border-radius: var(--pay-radius-pill);
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #334155;
          font-size: 11px;
          font-weight: 600;
          line-height: 1;
          white-space: nowrap;
        }

        .payment-action {
          margin: 0 25px;
          padding: 29px 23px 28px;
          border-top: 1px solid #d8d8d8;
        }

        .pay-button {
          width: 100%;
          min-height: 65px;
          padding: 12px 18px;
          border: none;
          border-radius: 14px;
          font-size: 19px;
          font-weight: 700;
          line-height: 24px;
          cursor: pointer;
          transition: all 0.2s;
          background: #b1b1b1;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 13px;
          letter-spacing: 0;
        }

        .pay-button.active {
          background: #0062ff;
          color: #ffffff;
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
          background: #b1b1b1;
        }

        .pay-button :global(.pay-button-lock) {
          width: 36px;
          height: 36px;
          flex: 0 0 auto;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: var(--pay-radius-pill);
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .security-note {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex-wrap: nowrap;
          margin: 17px 0 0;
        }

        .security-note span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #818181;
          font-size: 13px;
          font-weight: 400;
          line-height: 17px;
          letter-spacing: 0;
          white-space: nowrap;
        }

        .security-note img {
          width: 18px;
          height: 18px;
          flex: 0 0 auto;
        }

        .payment-footer {
          padding: 20px 24px 33px;
          background: #ffffff;
          text-align: center;
        }

        .payment-footer p {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: #818181;
          font-size: 17px;
          font-weight: 500;
          line-height: 22px;
          margin: 0;
        }

        .payment-footer :global(.payment-footer-logo) {
          width: 72px;
          height: auto;
          display: block;
        }

        @media (max-width: 520px) {
          .payment-page {
            padding: 0;
          }

          .payment-container {
            border-radius: 0;
            min-height: 100vh;
          }

          .order-summary {
            padding: 21px 23px 29px;
          }

          .order-badge {
            margin-bottom: 18px;
          }

          .order-insurer {
            grid-template-columns: 70px minmax(0, 1fr);
            gap: 14px;
          }

          .order-logo-card {
            width: 70px;
            height: 70px;
            border-radius: 13px;
          }

          .order-logo-card :global(.order-logo-image) {
            width: 59px;
            height: 59px;
          }

          .order-title {
            font-size: 17px;
            line-height: 22px;
          }

          .order-vehicle {
            font-size: 15px;
            line-height: 20px;
          }

          .order-meta p {
            font-size: 16px;
            line-height: 21px;
          }

          .order-breakdown {
            padding: 16px 14px 17px;
          }

          .breakdown-section h3 {
            font-size: 14px;
            line-height: 18px;
          }

          .breakdown-row,
          .breakdown-row strong {
            font-size: 14px;
            line-height: 18px;
          }

          .breakdown-row.total,
          .breakdown-row.total strong {
            font-size: 16px;
            line-height: 18px;
          }

          .payment-methods-section {
            padding: 26px 24px 20px;
          }

          .payment-next-note {
            margin: 26px 0 0;
          }

          .payment-next-note span {
            min-height: 34px;
            padding: 5px 12px;
            font-size: 16px;
            line-height: 22px;
          }

          .payment-next-note p {
            margin: 14px 0 0;
            font-size: 16px;
            line-height: 21px;
          }

          .payment-action {
            margin: 0 24px;
            padding: 29px 0 27px;
          }

          .pay-button {
            min-height: 65px;
            padding: 12px 18px;
            gap: 13px;
            font-size: 19px;
            line-height: 24px;
          }

          .pay-button :global(.pay-button-lock) {
            width: 36px;
            height: 36px;
          }

          .security-note {
            gap: 10px;
            justify-content: center;
            margin-top: 17px;
          }

          .security-note span {
            gap: 5px;
            font-size: 13px;
            line-height: 17px;
          }

          .security-note img {
            width: 18px;
            height: 18px;
          }

          .payment-footer {
            padding: 18px 24px 30px;
          }

          .payment-footer p {
            font-size: 14px;
            font-weight: 500;
            line-height: 18px;
          }

          .payment-footer :global(.payment-footer-logo) {
            width: 61px;
          }
        }
      `}</style>
    </div>
  );
}
