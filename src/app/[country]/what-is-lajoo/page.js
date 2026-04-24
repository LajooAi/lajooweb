import "./about.css";
import Link from "next/link";
import InfoFooter from "@/components/InfoFooter";
import EqualWidthTitle from "@/components/EqualWidthTitle";
import ReviewsCarousel from "./ReviewsCarousel";

const trustedInsurerLogos = [
  {
    key: "tokio-marine",
    name: "Tokio Marine",
    src: "/partners/tokio-marine.svg",
    width: "73%",
    height: "81%",
  },
  {
    key: "zurich",
    name: "Zurich",
    src: "/partners/zurich.svg",
    width: "75%",
    height: "79%",
  },
  {
    key: "generali",
    name: "Generali",
    src: "/partners/generali.svg",
    width: "75%",
    height: "84%",
  },
  {
    key: "etiqa",
    name: "Etiqa",
    src: "/partners/etiqa.svg",
    width: "86%",
    height: "57%",
  },
  {
    key: "axa",
    name: "AXA",
    src: "/partners/axa.svg",
    width: "64%",
    height: "86%",
  },
  {
    key: "takaful",
    name: "Takaful Ikhlas",
    src: "/partners/takaful.svg",
    width: "57%",
    height: "95%",
  },
  {
    key: "msig",
    name: "MSIG",
    src: "/partners/msig.svg",
    width: "81%",
    height: "51%",
  },
  {
    key: "allianz",
    name: "Allianz",
    src: "/partners/allianz.svg",
    width: "88%",
    height: "48%",
  },
  {
    key: "bsompo",
    name: "Berjaya Sompo Insurance",
    src: "/partners/bsompo.svg",
    width: "73%",
    height: "81%",
  },
  {
    key: "liberty",
    name: "Liberty Insurance",
    src: "/partners/liberty.svg",
    width: "84%",
    height: "59%",
  },
  {
    key: "amassurance",
    name: "AmAssurance",
    src: "/partners/amassurance.svg",
    width: "75%",
    height: "64%",
  },
  {
    key: "lonpac",
    name: "Lonpac Insurance",
    src: "/partners/lonpac.svg",
    width: "86%",
    height: "46%",
  },
];

const flexiblePaymentRows = [
  {
    key: "cards",
    title: "Credit/Debit Card",
    marks: [
      { key: "visa", type: "image", name: "Visa", src: "/payments/visa.svg", width: "66px", height: "24px" },
      {
        key: "mastercard",
        type: "image",
        name: "Mastercard",
        src: "/payments/mastercard.svg",
        width: "30px",
        height: "18px",
      },
      {
        key: "unionpay",
        type: "image",
        name: "UnionPay",
        src: "/payments/unionpay.svg",
        width: "36px",
        height: "18px",
      },
      {
        key: "amex",
        type: "image",
        name: "American Express",
        src: "/payments/amex.svg",
        width: "28px",
        height: "18px",
      },
    ],
  },
  {
    key: "ewallet",
    title: "E-Wallet",
    marks: [
      {
        key: "tng",
        type: "image",
        name: "Touch 'n Go eWallet",
        src: "/payments/tng.svg",
        width: "34px",
        height: "30px",
      },
      {
        key: "grabpay",
        type: "image",
        name: "GrabPay",
        src: "/payments/grabpay.svg",
        width: "46px",
        height: "24px",
      },
      {
        key: "shopee",
        type: "image",
        name: "ShopeePay",
        src: "/payments/shopee.svg",
        width: "76px",
        height: "28px",
      },
    ],
  },
  {
    key: "banking",
    title: "Online Banking",
    marks: [
      { key: "fpx", type: "image", name: "FPX", src: "/payments/fpx.svg", width: "72px", height: "28px" },
    ],
  },
  {
    key: "bnpl",
    title: "Buy Now Pay Later",
    subtitle: "(3 to 6 months)",
    layout: "bnpl",
    marks: [
      { key: "atome", type: "image", name: "Atome", src: "/payments/atome.svg", width: "86px", height: "24px" },
      { key: "spaylater", type: "custom", customKind: "spaylater" },
      { key: "grab-paylater", type: "custom", customKind: "grab-paylater" },
    ],
  },
  {
    key: "installment",
    title: "Credit Card\nInstallment",
    subtitle: "(6 to 12 months)",
    layout: "bank-grid",
    marks: [
      { key: "affin", type: "image", name: "Affin Bank", src: "/banks/affin.svg", width: "56px", height: "14px" },
      {
        key: "hongleong",
        type: "image",
        name: "Hong Leong Bank",
        src: "/banks/hongleong.svg",
        width: "62px",
        height: "14px",
      },
      {
        key: "public-bank",
        type: "image",
        name: "Public Bank",
        src: "/banks/public-bank.svg",
        width: "58px",
        height: "14px",
      },
      { key: "gap-top", type: "spacer" },
      { key: "rhb", type: "image", name: "RHB", src: "/banks/rhb.svg", width: "52px", height: "18px" },
      { key: "ambank", type: "image", name: "AmBank", src: "/banks/ambank.svg", width: "48px", height: "16px" },
      {
        key: "standard-chartered",
        type: "image",
        name: "Standard Chartered",
        src: "/banks/standard-chartered.svg",
        width: "56px",
        height: "18px",
      },
      { key: "uob", type: "image", name: "UOB", src: "/banks/uob.svg", width: "42px", height: "18px" },
      {
        key: "maybank",
        type: "image",
        name: "Maybank",
        src: "/banks/maybank.svg",
        width: "68px",
        height: "20px",
      },
      { key: "hsbc", type: "image", name: "HSBC", src: "/banks/hsbc.svg", width: "48px", height: "16px" },
      { key: "cimb", type: "image", name: "CIMB", src: "/banks/cimb.svg", width: "52px", height: "16px" },
      { key: "ocbc", type: "image", name: "OCBC Bank", src: "/banks/ocbc.svg", width: "56px", height: "16px" },
    ],
  },
];

const aiRenewalStats = [
  {
    key: "policies",
    kind: "policies",
    value: "11,000+",
    label: "Policies renewed",
  },
  {
    key: "time",
    kind: "time",
    value: "3 mins",
    label: "Average renewal time",
  },
  {
    key: "replies",
    kind: "replies",
    value: "24/7",
    label: "Instant replies",
  },
];

function StepIcon({ kind }) {
  if (kind === "chat") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path
          d="M16 18h32a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H28l-12 9V22a4 4 0 0 1 4-4Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="27" cy="32" r="2.8" fill="currentColor" />
        <circle cx="36" cy="32" r="2.8" fill="currentColor" />
        <circle cx="45" cy="32" r="2.8" fill="currentColor" />
      </svg>
    );
  }

  if (kind === "compare") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <rect x="15" y="16" width="20" height="32" rx="3" fill="currentColor" />
        <path
          d="M41 10v44M41 18h10a2 2 0 0 1 2 2v24a2 2 0 0 1-2 2H41"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        d="M32 12a20 20 0 1 1-14.2 5.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M18 10h13L23 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 24l9 4v7c0 6.3-4 11.9-9 13-5-1.1-9-6.7-9-13v-7l9-4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m28.5 35 2.8 2.8 4.7-5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function WhatIsLajooPage() {
  const steps = [
    {
      kind: "chat",
      title: "Chat",
      subtitle: "Ask anything about insurance.",
    },
    {
      kind: "compare",
      title: "Compare",
      subtitle: "Compare prices with AI.",
    },
    {
      kind: "renew",
      title: "Renew",
      subtitle: "Pay and get covered instantly.",
    },
  ];

  const reviews = [
    {
      text: "Amazing platform for me to renew all my car insurance road tax, super fast and convenient. Done anytime even at 2am instantly.",
      author: "Ananda Vandram",
      time: "August 2025",
    },
    {
      text: "The best part is how incredibly fast the service is. Everything handled and completed before I even brewed coffee.",
      author: "Param V",
      time: "March 2024",
    },
    {
      text: "First time using the service, smooth experience, clear pricing, and I could compare options without waiting around for an agent.",
      author: "Ain",
      time: "January 2024",
    },
  ];

  return (
    <main className="about-wrap">
      <section className="about-hero">
        <div className="hero-copy">
          <div className="hero-top">
            <EqualWidthTitle
              className="about-h1"
              lineClassName="about-h1-line"
              secondaryLineClassName="about-h1-line-second"
              primaryText="Renew insurance"
              secondaryText="in one simple chat with AI."
            />
            <img
              className="about-hero-photo"
              src="/images/what-is-lajoo-step2.png"
              alt="LAJOO insurer comparison preview"
              loading="lazy"
            />
          </div>

          <div className="hero-bottom">
            <p className="about-meta about-meta--inline-benefits" aria-label="Just chat, no forms, instant">
              <span className="about-benefit">Just chat</span>
              <span className="about-benefit-divider" aria-hidden="true">·</span>
              <span className="about-benefit">No forms</span>
              <span className="about-benefit-divider" aria-hidden="true">·</span>
              <span className="about-benefit">Instant</span>
            </p>
            <div className="cta-row">
              <Link className="cta-primary" href="/">
                Renew Now
              </Link>
            </div>

            <section className="services-offer" aria-labelledby="services-offer-title">
              <h3 id="services-offer-title" className="services-offer__title">
                Services we offer.
              </h3>

              <div className="services-offer__grid">
                <article className="service-card" aria-label="Car Insurance">
                  <img
                    className="service-card__image service-card__image--car"
                    src="/icons/car-insurance.png"
                    alt="Car insurance"
                    loading="lazy"
                  />
                  <p className="service-card__label">Car Insurance</p>
                </article>

                <article className="service-card" aria-label="Motor Insurance">
                  <img
                    className="service-card__image service-card__image--motor"
                    src="/icons/motor-insurance.png"
                    alt="Motor insurance"
                    loading="lazy"
                  />
                  <p className="service-card__label">Motor Insurance</p>
                </article>
              </div>
            </section>
          </div>

          <section className="steps-panel" id="steps" aria-labelledby="steps-title">
            <div className="steps-panel__inner">
              <h3 id="steps-title" className="steps-panel__title">
                Renew in 3 simple steps.
              </h3>

              <div className="steps-panel__grid">
                {steps.map((step) => (
                  <article key={step.title} className="step-card">
                    <div className="step-icon" aria-hidden="true">
                      <StepIcon kind={step.kind} />
                    </div>
                    <div className="step-text">
                      <p className="step-title">{step.title}</p>
                      <p className="step-subtitle">{step.subtitle}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

      <section className="trusted-insurers-section" aria-labelledby="trusted-insurers-title">
        <div className="trusted-insurers-inner">
          <h3 id="trusted-insurers-title" className="trusted-insurers-title">
            Trusted by top insurers.
          </h3>
          <TrustedInsurerGrid logos={trustedInsurerLogos} />
        </div>
      </section>

      <section className="payment-options-section" aria-labelledby="payment-options-title">
        <div className="payment-options-inner">
          <h3 id="payment-options-title" className="payment-options-title">
            Flexible payment options.
          </h3>

          <div className="payment-options-panel">
            {flexiblePaymentRows.map((row) => (
              <article
                key={row.key}
                className={`payment-option-row payment-option-row--${row.key}${row.layout ? ` payment-option-row--${row.layout}` : ""}`}
              >
                <div className="payment-option-copy">
                  <p className="payment-option-label">
                    {row.title.split("\n").map((line) => (
                      <span key={line} className="payment-option-label__line">
                        {line}
                      </span>
                    ))}
                  </p>
                  {row.subtitle && <p className="payment-option-subtitle">{row.subtitle}</p>}
                </div>

                <div className={`payment-option-marks payment-option-marks--${row.key}${row.layout ? ` payment-option-marks--${row.layout}` : ""}`}>
                  {row.marks.map((mark) => (
                    <PaymentOptionMark key={mark.key} mark={mark} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="reviews-block" id="reviews">
        <div className="reviews-block__inner">
          <div className="reviews-summary">
            <h3 className="reviews-title">
              Why users love{" "}
              <span className="reviews-title__accent" aria-label="LAJOO">
                <span className="reviews-title__accent-text">LAJOO</span>
                <img
                  className="reviews-title__accent-logo"
                  src="/logo/lajoo-logo-black.png"
                  alt=""
                  loading="lazy"
                />
              </span>{" "}
              ?
            </h3>
            <div className="reviews-rating-line">
              <strong>4.9</strong>
              <span aria-hidden="true">★★★★★</span>
            </div>
            <a className="reviews-link" href="#" target="_blank" rel="noreferrer">
              11,000+ Google reviews
            </a>
            <p className="reviews-benefits">
              <span>Fast</span>
              <span aria-hidden="true">·</span>
              <span>Smart</span>
              <span aria-hidden="true">·</span>
              <span>Reliable</span>
            </p>
          </div>

          <ReviewsCarousel reviews={reviews} />
        </div>
      </section>

      <section className="ai-simple-section" aria-labelledby="ai-simple-title">
        <div className="ai-simple-inner">
          <h3 id="ai-simple-title" className="ai-simple-title">
            <span className="ai-simple-title__accent">AI</span> makes renewal simple.
          </h3>

          <div className="ai-simple-grid">
            {aiRenewalStats.map((item) => (
              <article key={item.key} className="ai-simple-card">
                <div className="ai-simple-card__icon" aria-hidden="true">
                  <AiSimpleIcon kind={item.kind} />
                </div>
                <div className="ai-simple-card__copy">
                  <p className="ai-simple-card__value">{item.value}</p>
                  <p className="ai-simple-card__label">{item.label}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="renew-cta-band" aria-labelledby="renew-cta-title">
        <div className="renew-cta-inner">
          <h3 id="renew-cta-title" className="renew-cta-title">
            Ready to renew ?
          </h3>
          <p className="renew-cta-copy">
            <span className="renew-cta-copy__line">Get your quote, compare and</span>
            <span className="renew-cta-copy__line">
              renew in minutes with{" "}
              <span className="renew-cta-copy__accent" aria-label="LAJOO">
                <span className="renew-cta-copy__accent-text">LAJOO</span>
                <img
                  className="renew-cta-copy__accent-logo"
                  src="/logo/lajoo-logo-white.png"
                  alt=""
                  loading="lazy"
                />
              </span>
            </span>
          </p>
          <Link className="renew-cta-button" href="/">
            Renew Now
          </Link>
        </div>
      </section>

      </div>
      </section>

      <InfoFooter />
    </main>
  );
}

/* ---------- tiny, page-local components ---------- */

function PaymentOptionMark({ mark }) {
  if (mark.type === "spacer") {
    return <span className="payment-option-mark payment-option-mark--spacer" aria-hidden="true" />;
  }

  if (mark.type === "custom" && mark.customKind === "spaylater") {
    return (
      <div className="payment-option-mark payment-option-mark--custom payment-option-mark--spaylater">
        <span className="payment-option-mark__badge">S</span>
        <span className="payment-option-mark__text">PayLater</span>
      </div>
    );
  }

  if (mark.type === "custom" && mark.customKind === "grab-paylater") {
    return (
      <div className="payment-option-mark payment-option-mark--custom payment-option-mark--grab-paylater">
        <span className="payment-option-mark__line">PayLater</span>
        <span className="payment-option-mark__line">
          <span className="payment-option-mark__by">by </span>
          <span className="payment-option-mark__grab">Grab</span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={`payment-option-mark payment-option-mark--image payment-option-mark--${mark.key}`}
      style={{
        "--payment-mark-width": mark.width,
        "--payment-mark-height": mark.height,
      }}
    >
      <img src={mark.src} alt={mark.name} loading="lazy" />
    </div>
  );
}

function TrustedInsurerGrid({ logos = [] }) {
  return (
    <div className="trusted-insurers-grid" role="list" aria-label="Insurance partners">
      {logos.map((logo) => (
        <div key={logo.key} className="trusted-insurer-cell" role="listitem">
          <div
            className={`trusted-insurer-logo-frame trusted-insurer-logo-frame--${logo.key}`}
            style={{
              "--trusted-logo-width": logo.width,
              "--trusted-logo-height": logo.height,
            }}
          >
            <img
              className={`trusted-insurer-logo trusted-insurer-logo--${logo.key}`}
              src={logo.src}
              alt={logo.name}
              loading="lazy"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AiSimpleIcon({ kind }) {
  if (kind === "policies") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path
          d="M20 12h20l8 8v28a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path
          d="M40 12v10h10M24 26h16M24 34h12"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="43" cy="43" r="9" fill="none" stroke="currentColor" strokeWidth="4" />
        <path
          d="m39.5 43 2.6 2.6 5.1-5.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === "time") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path
          d="M20 18h-6M20 32h-8M20 46h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="38" cy="32" r="18" fill="none" stroke="currentColor" strokeWidth="4" />
        <path
          d="M38 22v11l8 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        d="M11 24h18l-7 12h12l-5 12 20-24H33l5-12-27 34"
        fill="currentColor"
      />
    </svg>
  );
}
