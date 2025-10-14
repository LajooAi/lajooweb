import "./about.css";

export default function WhatIsLajooPage() {
  return (
    <main className="about-wrap">
      {/* top title */}
      <div className="about-title">
        <span className="muted">What is</span>{" "}
        <img
          src="/logo/lajoo-logo.png"      // or /logo/lajoo-logo.svg if you have SVG
          alt="LAJOO"
          className="inline-logo"
        />{" "}
        <span className="muted">?</span>
      </div>


      {/* hero */}
      <section className="about-hero">
        <h1 className="about-h1">
          Malaysia’s Smartest Way
          <br /> To Renew Car Insurance
          <br /> &amp; Road Tax
        </h1>
        <p className="about-sub">
          Get insured in 2 minutes with LAJOO, fully
          <br /> AI-powered, available 24 hours.
        </p>

        <div className="stats">
          <div className="stat-card">
            <div className="stat-badge">12,000+</div>
            <div className="stat-cap">
              <span>Renewals</span>
              <span>Completed</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-badge">RM 2.4 mil</div>
            <div className="stat-cap">
              <span>Saved For</span>
              <span>Malaysians</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-badge">4.9/5★</div>
            <div className="stat-cap">
              <span>Customer</span>
              <span>Satisfaction</span>
            </div>
          </div>
        </div>
      </section>

      {/* partners blocks */}
      <Section title="Trusted Insurer Partners">
        <LogoStrip
          images={[
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
          ]}
        />
      </Section>

      <Section title="Supported Payment Methods">
        <LogoStrip
          images={[
            "/payments/mastercard.svg",
            "/payments/visa.svg",
            "/payments/amex.svg",
            "/payments/unionpay.svg",
            "/payments/fpx.svg",
            "/payments/tng.svg",
            "/payments/shopee.svg",
            "/payments/atome.svg",
          ]}
        />
      </Section>

      <Section title="Bank Partners">
        <LogoStrip
          images={[
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
          ]}
        />
      </Section>

      {/* social proof */}
      <section className="reviews-block">
        <div className="brand-word">LAJOO</div>
        <h3 className="reviews-h">
          Recommended by 11,000+ Users
        </h3>
        <div className="rating-line">
          <strong>4.9</strong>&nbsp;★★★★★
        </div>
        <a className="reviews-link" href="#" target="_blank" rel="noopener noreferrer">
          11,000+ Google Reviews
        </a>

        <div className="cards">
          <ReviewCard
            text="The best part is how incredibly fast the service is. The staff handled everything efficiently and completed…"
            author="Param v"
          />
          <ReviewCard
            text="Seriously blown away by the exceptional service I consistently receive from this insurance agent for years, renewing…"
            author="Roey"
          />
          <ReviewCard
            text="I used the service for the first time this year—smooth experience and great price. Highly recommend!"
            author="Ain"
          />
        </div>
      </section>

      {/* video gallery (static previews) */}
      <section className="video-block">
        <h3 className="video-h">What LAJOO Customers Are Saying</h3>
        <div className="videos">
          <VideoTile />
          <VideoTile />
          <VideoTile />
        </div>
      </section>
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

function LogoStrip({ images = [] }) {
  return (
    <div className="logos">
      {images.map((src, i) => (
        <div key={i} className="logo-cell">
          <img src={src} alt="" loading="lazy" />
        </div>
      ))}
    </div>
  );
}

function ReviewCard({ text, author }) {
  return (
    <article className="review-card">
      <div className="stars">★★★★★</div>
      <p className="review-text">{text}</p>
      <div className="reviewer">
        <div className="avatar" aria-hidden="true">•</div>
        <div className="name">{author}</div>
      </div>
    </article>
  );
}

function VideoTile() {
  return (
    <div className="video-tile">
      <img src="/placeholders/video-thumb.jpg" alt="" />
      <button className="play" aria-label="Play video">▶</button>
      <div className="video-badge">LAJOO</div>
    </div>
  );
}
