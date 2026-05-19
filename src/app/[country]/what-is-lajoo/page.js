import "./about.css";
import Link from "next/link";
import Image from "next/image";
import InfoFooter from "@/components/InfoFooter";
import EqualWidthTitle from "@/components/EqualWidthTitle";
import ReviewsCarousel from "./ReviewsCarousel";

export const metadata = {
  formatDetection: {
    telephone: false,
  },
};

const trustedInsurerLogos = [
  {
    key: "tokio-marine",
    name: "Tokio Marine",
    src: "/partners/tokio-marine.svg",
    width: "73%",
    height: "81%",
  },
  {
    key: "allianz",
    name: "Allianz",
    src: "/partners/allianz.svg",
    width: "88%",
    height: "48%",
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
    key: "takaful",
    name: "Takaful Ikhlas",
    src: "/partners/takaful.svg",
    width: "57%",
    height: "95%",
  },
  {
    key: "lonpac",
    name: "Lonpac Insurance",
    src: "/partners/lonpac.svg",
    width: "86%",
    height: "46%",
  },
  {
    key: "msig",
    name: "MSIG",
    src: "/partners/msig.svg",
    width: "81%",
    height: "51%",
  },
  {
    key: "zurich",
    name: "Zurich",
    src: "/partners/zurich.svg",
    width: "75%",
    height: "79%",
  },
  {
    key: "axa",
    name: "AXA",
    src: "/partners/axa.svg",
    width: "64%",
    height: "86%",
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
    key: "banking",
    title: "Online Banking",
    marks: [
      { key: "fpx", type: "image", name: "FPX", src: "/payments/fpx.svg", width: "72px", height: "28px" },
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
  {
    key: "chat",
    kind: "chat",
    value: "1 chat",
    label: "To renew",
  },
];

export default function WhatIsLajooPage() {
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
              secondaryText="in one simple AI chat."
            />
            <div className="about-chat-demo" aria-label="LAJOO chat example">
              <div className="about-chat-bubble about-chat-bubble--lajoo about-chat-bubble--input">
                <span>Enter your <strong>Plate Number &amp; IC.</strong></span>
              </div>

              <div className="about-chat-bubble about-chat-bubble--user about-chat-bubble--plate">
                <span>LAJ 1470</span>
                <span className="about-chat-id-number" aria-label="701470-14-7070">
                  {"701470\u200c-\u200c14\u200c-\u200c7070"}
                </span>
              </div>

              <div className="about-chat-bubble about-chat-bubble--lajoo about-chat-bubble--vehicle">
                <span>Found your vehicle ! 🚙</span>
                <strong>2017 Perodua Myvi</strong>
                <span>NCD 20% - Comprehensive</span>
              </div>

              <div className="about-chat-bubble about-chat-bubble--lajoo about-chat-bubble--quote about-chat-bubble--takaful">
                <Image src="/partners/takaful.svg" alt="" width={52} height={43} aria-hidden="true" />
                <span>
                  <strong>Takaful Ikhlas - RM 670</strong>
                  <span>Sum Insured : RM 33,000</span>
                </span>
              </div>

              <div className="about-chat-bubble about-chat-bubble--lajoo about-chat-bubble--quote about-chat-bubble--etiqa">
                <Image src="/partners/etiqa.svg" alt="" width={52} height={29} aria-hidden="true" />
                <span>
                  <strong>Etiqa Insurance - RM 710</strong>
                  <span>Sum Insured : RM 34,000</span>
                </span>
              </div>

              <div className="about-chat-bubble about-chat-bubble--lajoo about-chat-bubble--quote about-chat-bubble--allianz">
                <Image src="/partners/allianz.svg" alt="" width={52} height={24} aria-hidden="true" />
                <span>
                  <strong>Allianz Insurance - RM 770</strong>
                  <span>Sum Insured : RM 37,000</span>
                </span>
              </div>

              <div className="about-chat-bubble about-chat-bubble--user about-chat-bubble--question">
                Which is the best ?
              </div>

              <div className="about-chat-analyzing" aria-label="Analyzing">
                <span aria-hidden="true" />
                <span>Analyzing...</span>
              </div>
            </div>

            <div className="about-hero-promises" aria-label="LAJOO benefits">
              <p>Ask any question.</p>
              <p>Instant reply 24/7.</p>
              <p>Done in minutes.</p>
            </div>

            <div className="cta-row about-hero-cta">
              <Link className="cta-primary" href="/">
                <span>Renew Now</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          <div className="hero-bottom">
            <section className="services-offer" aria-labelledby="services-offer-title">
              <h3 id="services-offer-title" className="services-offer__title">
                Services we offer.
              </h3>

              <div className="services-offer__grid">
                <article className="service-card service-card--car" aria-label="Car Insurance">
                  <div className="service-card__content">
                    <p className="service-card__label">
                      <span className="service-card__product">Car</span>
                      <span className="service-card__insurance">Insurance &amp; Road Tax</span>
                    </p>
                    <img
                      className="service-card__image service-card__image--car"
                      src="/icons/car-insurance.png"
                      alt="Car insurance"
                      loading="lazy"
                    />
                  </div>
                  <span className="service-card__line" aria-hidden="true" />
                </article>

                <article className="service-card service-card--motor" aria-label="Motor Insurance">
                  <div className="service-card__content">
                    <p className="service-card__label">
                      <span className="service-card__product">Motor</span>
                      <span className="service-card__insurance">Insurance &amp; Road Tax</span>
                    </p>
                    <img
                      className="service-card__image service-card__image--motor"
                      src="/icons/motor-insurance.png"
                      alt="Motor insurance"
                      loading="lazy"
                    />
                  </div>
                  <span className="service-card__line" aria-hidden="true" />
                </article>
              </div>
              <div className="about-road-stripes" aria-hidden="true">
                <span className="about-road-stripes__mark" />
                <span className="about-road-stripes__mark" />
                <span className="about-road-stripes__mark" />
              </div>
            </section>
          </div>

      <section className="trusted-insurers-section" aria-labelledby="trusted-insurers-title">
        <div className="trusted-insurers-inner">
          <h3 id="trusted-insurers-title" className="trusted-insurers-title">
            Trusted insurers.
          </h3>
          <TrustedInsurerGrid logos={trustedInsurerLogos} />
          <div className="about-road-stripes" aria-hidden="true">
            <span className="about-road-stripes__mark" />
            <span className="about-road-stripes__mark" />
            <span className="about-road-stripes__mark" />
          </div>
        </div>
      </section>

      <section className="understand-section" aria-labelledby="understand-title">
        <div className="understand-inner">
          <h3 id="understand-title" className="understand-title">
            <span className="understand-title__line">
              <span className="understand-title__accent understand-title__accent--understand">Understand</span> first, then
            </span>
            <span className="understand-title__line">
              <span className="understand-title__accent understand-title__accent--renew">Renew</span> with confidence.
            </span>
          </h3>

          <div className="understand-road-scene" aria-label="Road usage illustration" />

          <p className="understand-copy understand-copy--first">
            <span>LAJOO helps you understand what you&apos;re paying for and</span>
            <span>how you are covered.</span>
          </p>

          <div className="understand-example">
            <ul className="understand-points" aria-label="Examples of what LAJOO understands">
              <li className="understand-point">
                <span className="understand-point__icon" aria-hidden="true">
                  <UnderstandingPointIcon kind="vehicle" />
                </span>
                <span className="understand-point__copy">
                  <strong>Your vehicle</strong>
                  <span>Car or motor details.</span>
                </span>
              </li>
              <li className="understand-point">
                <span className="understand-point__icon" aria-hidden="true">
                  <UnderstandingPointIcon kind="coverage" />
                </span>
                <span className="understand-point__copy">
                  <strong>Your coverage needs</strong>
                  <span>What protection add-ons matter.</span>
                </span>
              </li>
              <li className="understand-point">
                <span className="understand-point__icon" aria-hidden="true">
                  <UnderstandingPointIcon kind="usage" />
                </span>
                <span className="understand-point__copy">
                  <strong>Your usage</strong>
                  <span>How you normally drive or ride.</span>
                </span>
              </li>
              <li className="understand-point">
                <span className="understand-point__icon" aria-hidden="true">
                  <UnderstandingPointIcon kind="budget" />
                </span>
                <span className="understand-point__copy">
                  <strong>Your budget</strong>
                  <span>Which package fits you best.</span>
                </span>
              </li>
            </ul>
          </div>

          <div className="understand-compare-card">
            <p>Lajoo then compares and recommends the best for you.</p>
          </div>

          <div className="about-road-stripes understand-road-stripes" aria-hidden="true">
            <span className="about-road-stripes__mark" />
            <span className="about-road-stripes__mark" />
            <span className="about-road-stripes__mark" />
          </div>
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

          <div className="understand-unsure-card payment-options-ask-card">
            <span className="understand-unsure-card__icon" aria-hidden="true">
              <Image
                src="/icons/understand-chat.svg"
                alt=""
                width={56}
                height={56}
                aria-hidden="true"
                unoptimized
              />
            </span>
            <span className="understand-unsure-card__copy">
              <strong>Ask LAJOO anything before you pay.</strong>
            </span>
          </div>
        </div>
      </section>

      <section className="reviews-block" id="reviews">
        <div className="reviews-block__inner">
          <div className="reviews-summary">
            <h3 className="reviews-title">
              Loved by Malaysians.
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
            Simple renewal, proven.
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
            Renew in minutes.
          </h3>
          <p className="renew-cta-copy">
            <span className="renew-cta-copy__line">No forms. No waiting.</span>
            <span className="renew-cta-copy__line">{"Just chat and you're done."}</span>
          </p>
          <Link className="renew-cta-button" href="/">
            <span>Renew Now</span>
            <span aria-hidden="true">→</span>
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

function UnderstandingPointIcon({ kind }) {
  const iconSrc = `/icons/understand-${kind}.svg`;
  return (
    <Image src={iconSrc} alt="" width={56} height={56} aria-hidden="true" unoptimized />
  );
}

function AiSimpleIcon({ kind }) {
  return (
    <span
      className={`ai-simple-card__icon-glyph ai-simple-card__icon-glyph--${kind}`}
      aria-hidden="true"
    />
  );
}
