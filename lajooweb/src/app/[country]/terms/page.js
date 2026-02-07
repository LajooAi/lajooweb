"use client";
import "./terms.css";

export default function TermsPrivacyPage() {
  const COMPANY = "LAJOO AI SDN BHD";
  const EMAIL = "lajoo.ai@gmail.com";
  const EFFECTIVE = "25 October 2025";

  return (
    <main className="legal-wrap">
      <h1 className="legal-h1">Terms & Conditions</h1>
      <p className="legal-meta">Effective: {EFFECTIVE} · {COMPANY} · <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>

      <section>
        <h2>1. Use of Service</h2>
        <p>By using our website and services (“Services”), you agree to these Terms. If you do not agree, please do not use the Services.</p>
      </section>

      <section>
        <h2>2. Accounts & Eligibility</h2>
        <ul>
          <li>You must be 18+ and able to form a binding contract.</li>
          <li>You’re responsible for your account and keeping details accurate.</li>
        </ul>
      </section>

      <section>
        <h2>3. Insurance & Quotes</h2>
        <ul>
          <li>LAJOO facilitates quotes/renewals with partners; we are not the insurer.</li>
          <li>Final premiums, coverage, exclusions are determined by the insurer’s policy.</li>
          <li>Review policy wording before purchase/renewal.</li>
        </ul>
      </section>

      <section>
        <h2>4. Payments & Refunds</h2>
        <ul>
          <li>Charges may include premiums, taxes, duties, and service fees.</li>
          <li>Refunds follow insurer/payment‑provider policies unless required by law.</li>
        </ul>
      </section>

      <section>
        <h2>5. Acceptable Use</h2>
        <ul>
          <li>No unlawful, misleading, or harmful activity; no scraping or reverse engineering.</li>
          <li>Respect intellectual property and privacy rights.</li>
        </ul>
      </section>

      <section>
        <h2>6. Third‑Party Links & Services</h2>
        <p>We’re not responsible for third‑party sites, content, pricing, or policies.</p>
      </section>

      <section>
        <h2>7. Intellectual Property</h2>
        <p>All content and software are owned by {COMPANY} or licensors. You receive a limited, non‑transferable license to use the Services.</p>
      </section>

      <section>
        <h2>8. Disclaimers & Limitation of Liability</h2>
        <ul>
          <li>Services are provided “as is” and “as available”.</li>
          <li>To the extent permitted by law, we disclaim warranties and are not liable for indirect or consequential losses.</li>
        </ul>
      </section>

      <section>
        <h2>9. Governing Law</h2>
        <p>These Terms are governed by the laws of Malaysia. You submit to the jurisdiction of Malaysian courts.</p>
      </section>

      <section>
        <h2>10. Changes</h2>
        <p>We may update these Terms. Continued use after updates means you accept the changes.</p>
      </section>

      <hr className="legal-divider" />

      <h1 className="legal-h1">Privacy Policy</h1>
      <p className="legal-meta">Effective: {EFFECTIVE} · {COMPANY} · <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>

      <section>
        <h2>1. Information We Collect</h2>
        <ul>
          <li>Identity & contact (e.g., name, email, phone, address, IDs as required).</li>
          <li>Vehicle & policy data (e.g., plate, make/model, prior insurer, claims).</li>
          <li>Usage/device data (cookies, IP, analytics, logs).</li>
          <li>Payment info processed by payment providers; we don’t store full card data.</li>
        </ul>
      </section>

      <section>
        <h2>2. How We Use It</h2>
        <ul>
          <li>Provide quotes, renewals, and support.</li>
          <li>Improve Services, security, and fraud prevention.</li>
          <li>Comply with legal/regulatory obligations.</li>
          <li>Marketing where permitted/consented.</li>
        </ul>
      </section>

      <section>
        <h2>3. Cookies & Analytics</h2>
        <p>We use cookies for sessions, preferences, fraud prevention, and analytics. Blocking cookies may limit features.</p>
      </section>

      <section>
        <h2>4. Sharing</h2>
        <ul>
          <li>Insurers/partners to obtain quotes and issue/renew policies.</li>
          <li>Payment providers/banks to process transactions.</li>
          <li>Vendors (hosting, analytics, communications) under contracts.</li>
          <li>Authorities where required by law or to protect rights/safety.</li>
        </ul>
      </section>

      <section>
        <h2>5. Retention</h2>
        <p>We keep personal data as needed for Services and legal obligations, then delete or anonymize it.</p>
      </section>

      <section>
        <h2>6. Security</h2>
        <p>We use administrative, technical, and organizational measures. No method is 100% secure.</p>
      </section>

      <section>
        <h2>7. Your Rights</h2>
        <p>Subject to law, request access/correction/deletion or marketing preference changes at <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>
      </section>

      <section>
        <h2>8. International Transfers</h2>
        <p>Where data is transferred abroad, we apply appropriate safeguards.</p>
      </section>

      <section>
        <h2>9. Children</h2>
        <p>Services are not for under‑18s. We do not knowingly collect data from children.</p>
      </section>

      <section>
        <h2>10. Changes</h2>
        <p>We may update this Privacy Policy. Continued use after updates means you accept the changes.</p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p>Contact {COMPANY} at <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>
      </section>
    </main>
  );
}