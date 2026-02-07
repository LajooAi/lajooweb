import "./about.css";

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
      subtitle: "Ask anything.",
      copy: "Tell LAJOO what you need. Anything related to your car and insurance.",
    },
    {
      icon: "/icons/quote-icon.png",
      title: "Quote",
      subtitle: "Compare instantly.",
      copy: "Compare insurer prices instantly. AI explains & recommends the best match.",
    },
    {
      icon: "/icons/renew-icon.png",
      title: "Renew",
      subtitle: "Pay securely.",
      copy: "Pick your favourite plan, settle payment, and receive policy & road tax docs instantly.",
    },
  ];

  const stats = [
    {
      badge: "12,000+",
      title: "Renewals completed",
      copy: "Malaysian motorists renewed since 2022.",
    },
    {
      badge: "RM 2.4 mil",
      title: "Savings delivered",
      copy: "Cumulative premium savings negotiated by LAJOO AI.",
    },
    {
      badge: "4.9 / 5★",
      title: "Customer happiness",
      copy: "Real reviews averaged across Google & Meta.",
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

  const videos = [
    {
      title: "Road-tax renewed over lunch break",
      duration: "01:12",
      thumbnail: "/placeholders/video-thumb.jpg",
    },
    {
      title: "How LAJOO compares insurers for me",
      duration: "00:52",
      thumbnail: "/placeholders/video-thumb.jpg",
    },
    {
      title: "Saving RM480 with AI prompts",
      duration: "01:34",
      thumbnail: "/placeholders/video-thumb.jpg",
    },
  ];

  return (
    <main className="about-wrap">
      <section className="about-hero">
        <div className="hero-copy">
          <p className="about-eyebrow">WHAT IS LAJOO ?</p>
          <h1 className="about-h1">
            Malaysia’s Smartest AI-Powered Car
            <br />Insurance & Road Tax Renewal Platform.
          </h1>
          <p className="about-meta">
            Chat with LAJOO & renew instantly in minutes.
            <br />No agents, no forms, 24/7 AI-powered.
          </p>
          <div className="cta-row">
          <a className="cta-primary" href="/" rel="noreferrer">
            Chat with LAJOO
          </a>
          </div>

<section className="steps-panel" id="steps">
  <div className="steps-panel__inner">
    <div className="steps-panel__header">
      <p className="steps-panel__eyebrow">How it works</p>
      <h3 className="steps-panel__title">3 simple steps</h3>
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
            <p className="step-copy">{step.copy}</p>
          </article>

      ))}
    </div>
  </div>
</section>

      <Section title="Trusted Insurer Partners">
        <LogoStrip images={insurerLogos} cols={4} colsMd={4} imgH={36} />
      </Section>



          <div className="hero-metrics">
            <div className="hero-metric">
              <span className="metric-eyebrow">Time to renew</span>
              <strong className="metric-value">6 mins</strong>
              <p>Average completion from chat to payment.</p>
            </div>
            <div className="hero-metric">
              <span className="metric-eyebrow">Live agents</span>
              <strong className="metric-value">24 / 7</strong>
              <p>Humans + AI co-pilot whenever you need help.</p>
            </div>
            <div className="hero-metric">
              <span className="metric-eyebrow">Coverage score</span>
              <strong className="metric-value">98%</strong>
              <p>Customers who upgraded to better protection.</p>
            </div>
          </div>

        </div>


      </section>

      <StatsSection eyebrow="WHY LAJOO" title="Faster, smarter renewals" items={stats} />

      <Section title="Supported Payment Methods">
        <LogoStrip images={paymentLogos} cols={4} colsMd={4} imgH={28} />
      </Section>

      <Section title="Bank Partners">
        <LogoStrip images={bankLogos} cols={4} colsMd={4} imgH={26} />
      </Section>

      <section className="reviews-block" id="reviews">
        <div className="reviews-head">
          <img src="/logo/lajoo-logo.png" alt="LAJOO logo" className="brand-logo" />
          <div>
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

      <section className="video-block" id="videos">
        <h3 className="video-h">What LAJOO customers are saying</h3>
        <div className="video-list">
          {videos.map((video) => (
            <VideoTile key={video.title} {...video} />
          ))}
        </div>
      </section>
    </main>
  );
}

/* ---------- tiny, page-local components ---------- */

function StatsSection({ eyebrow, title, items = [] }) {
  return (
    <section className="stats-block">
      <p className="stats-eyebrow">{eyebrow}</p>
      <h4 className="stats-title">{title}</h4>
      <div className="stats-grid">
        {items.map((item) => (
          <article key={item.title} className="stat-card">
            <span className="stat-badge">{item.badge}</span>
            <p className="stat-title">{item.title}</p>
            <p className="stat-copy">{item.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

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

function VideoTile({ title, duration, thumbnail }) {
  return (
    <article className="video-tile">
      <img src={thumbnail} alt={title} loading="lazy" />
      <button className="play" type="button" aria-label={`Play ${title}`}>
        ▶
      </button>
      <div className="video-meta">
        <p className="video-title">{title}</p>
        <span className="video-duration">{duration}</span>
      </div>
    </article>
  );
}
