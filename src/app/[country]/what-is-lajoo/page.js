import "./about.css";
import Link from "next/link";
import InfoFooter from "@/components/InfoFooter";
import EqualWidthTitle from "@/components/EqualWidthTitle";

const insurerLogos = [
  "/partners/etiqa.svg",
  "/partners/takaful.svg",
  "/partners/allianz.svg",
  "/partners/tokio-marine.svg",
  "/partners/zurich.svg",
  "/partners/liberty.svg",
  "/partners/bsompo.svg",
  "/partners/generali.svg",
  "/partners/amassurance.svg",
  "/partners/axa.svg",
  "/partners/msig.svg",
  "/partners/lonpac.svg",
];

const paymentLogos = [
  "/payments/mastercard.svg",
  "/payments/visa.svg",
  "/payments/amex.svg",
  "/payments/unionpay.svg",
  "/payments/fpx.svg",
  "/payments/tng.svg",
  "/payments/shopee.svg",
  "/payments/atome.svg",
];

const bankLogos = [
  "/banks/rhb.svg",
  "/banks/hsbc.svg",
  "/banks/standard-chartered.svg",
  "/banks/ambank.svg",
  "/banks/uob.svg",
  "/banks/ocbc.svg",
  "/banks/public-bank.svg",
  "/banks/cimb.svg",
  "/banks/affin.svg",
  "/banks/hongleong.svg",
];

export default function WhatIsLajooPage() {
  const steps = [
    {
      icon: "/icons/chat-icon.png",
      title: "Chat",
      subtitle: "Ask anything about insurance.",
    },
    {
      icon: "/icons/quote-icon.png",
      title: "Compare",
      subtitle: "Compare prices with AI.",
    },
    {
      icon: "/icons/renew-icon.png",
      title: "Renew",
      subtitle: "Pay and get covered instantly.",
    },
  ];

  const reviews = [
    {
      text: "The best part is how incredibly fast the service is. Everything handled and completed before I even brewed coffee.",
      author: "Param V",
      time: "Renewed Mar 2024",
    },
    {
      text: "Seriously blown away by the exceptional service I consistently receive. Quotes are transparent and the team is proactive.",
      author: "Roey",
      time: "Customer since 2021",
    },
    {
      text: "First time using the service — smooth experience, great price, and I love that support is up 24/7.",
      author: "Ain",
      time: "Renewed Jan 2024",
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
          </div>

<section className="steps-panel" id="steps">
  <div className="steps-panel__inner">
    <div className="steps-panel__header">
      <p className="steps-panel__eyebrow">Renew in 3 simple steps.</p>
    </div>

    <div className="steps-panel__grid">
      {steps.map((step) => (
          <article key={step.title} className="step-card">
            <div className="step-icon">
              <img src={step.icon} alt={step.title} loading="lazy" />
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
          <LogoStrip images={insurerLogos} cols={4} colsMd={4} imgH={42} />
        </div>
      </section>

      <Section title="Supported Payment Methods">
        <LogoStrip images={paymentLogos} cols={4} colsMd={4} imgH={28} />
      </Section>

      <Section title="Bank Partners">
        <LogoStrip images={bankLogos} cols={4} colsMd={4} imgH={26} />
      </Section>

      <section className="reviews-block" id="reviews">
        <div className="reviews-head">
          <img src="/logo/lajoo-logo.png" alt="LAJOO logo" className="brand-logo" />
          <div className="reviews-head-meta">
            <p className="brand-word">Recommended by Malaysians</p>
            <div className="rating-line">
              <strong>4.9</strong>
              <span aria-hidden="true">★★★★★</span>
            </div>
            <a className="reviews-link" href="#" target="_blank" rel="noreferrer">
              11,000+ Google reviews
            </a>
          </div>
        </div>
        <ul className="review-cards">
          {reviews.map((review) => (
            <ReviewCard key={review.author} {...review} />
          ))}
        </ul>
      </section>

      <section className="renew-cta-band" aria-labelledby="renew-cta-title">
        <div className="renew-cta-inner">
          <h3 id="renew-cta-title" className="renew-cta-title">
            Ready to renew in one simple chat?
          </h3>
          <p className="renew-cta-copy">
            Get your quote, compare options, and renew in minutes with LAJOO.
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

function Section({ title, children }) {
  return (
    <section className="section">
      <h3 className="section-h">{title}</h3>
      <div className="section-card">{children}</div>
    </section>
  );
}

function LogoStrip({ images = [], cols = 6, colsMd = 4, imgH = 28 }) {
  return (
    <div
      className="logos"
      style={{ "--cols": cols, "--cols-md": colsMd, "--logo-h": `${imgH}px` }}
    >
      {images.map((src) => (
        <div key={src} className="logo-cell">
          <img src={src} alt="" loading="lazy" />
        </div>
      ))}
    </div>
  );
}

function ReviewCard({ text, author, time }) {
  const initial = author?.[0]?.toUpperCase() ?? "•";
  return (
    <li className="review-card">
      <div className="stars" role="img" aria-label="Rating 5 out of 5">
        ★★★★★
      </div>
      <p className="review-text">{text}</p>
      <div className="reviewer">
        <div className="avatar" aria-hidden="true">
          {initial}
        </div>
        <div>
          <p className="name">{author}</p>
          {time && <p className="review-time">{time}</p>}
        </div>
      </div>
    </li>
  );
}
