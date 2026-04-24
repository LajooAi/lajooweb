import "./terms.css";
import InfoFooter from "@/components/InfoFooter";

export default function TermsPrivacyPage() {
  const COMPANY = "LAJOO AI SDN BHD";
  const REGISTRATION = "202501028462 (1629874-U)";
  const EMAIL = "lajoo.ai@gmail.com";
  const EFFECTIVE = "13th March 2026";
  const JURISDICTION = "Malaysia";

  return (
    <main className="legal-wrap" id="top">
      <section className="legal-hero" aria-label="Legal page heading">
        <p className="legal-kicker">LEGAL</p>
        <h1 className="legal-h1">Terms and Privacy Policy</h1>
        <p className="legal-meta">
          Effective and last updated : {EFFECTIVE}
        </p>
        <p className="legal-meta legal-meta-company">{COMPANY}</p>
        <p className="legal-meta legal-meta-registration">{REGISTRATION}</p>
      </section>

      <nav className="legal-toc" aria-label="Table of contents">
        <h2 className="legal-toc-title">Quick Navigation</h2>
        <div className="legal-toc-grid">
          <div>
            <p className="legal-toc-group">Terms and Conditions</p>
            <ol className="legal-toc-list">
              <li><a href="#terms-scope">Scope and acceptance</a></li>
              <li><a href="#terms-eligibility">Eligibility and accounts</a></li>
              <li><a href="#terms-insurance">Insurance quotes and policies</a></li>
              <li><a href="#terms-payments">Payments, renewals, and refunds</a></li>
              <li><a href="#terms-use">Acceptable use and IP</a></li>
              <li><a href="#terms-liability">Disclaimers and liability</a></li>
              <li><a href="#terms-disputes">Disputes and governing law</a></li>
              <li><a href="#terms-changes">Changes and notices</a></li>
            </ol>
          </div>

          <div>
            <p className="legal-toc-group">Privacy Policy</p>
            <ol className="legal-toc-list">
              <li><a href="#privacy-collect">Information we collect</a></li>
              <li><a href="#privacy-use">How we use data</a></li>
              <li><a href="#privacy-share">Data sharing</a></li>
              <li><a href="#privacy-transfers">International transfers</a></li>
              <li><a href="#privacy-retention">Retention and security</a></li>
              <li><a href="#privacy-cookies">Cookies and analytics</a></li>
              <li><a href="#privacy-rights">Your rights</a></li>
              <li><a href="#privacy-contact">Contact and complaints</a></li>
            </ol>
          </div>
        </div>
      </nav>

      <article className="legal-card" id="terms">
        <h2 className="legal-h2">Terms and Conditions</h2>
        <p className="legal-intro">
          By using the LAJOO website, products, and services (the Services), you agree
          to these Terms. If you do not agree, you must stop using the Services.
        </p>

        <section className="legal-section" id="terms-scope">
          <h3>1. Scope and acceptance</h3>
          <p>
            These Terms apply to all users of LAJOO Services, including insurance quote,
            policy renewal, payment, support, and communication features.
          </p>
        </section>

        <section className="legal-section" id="terms-eligibility">
          <h3>2. Eligibility and accounts</h3>
          <ul>
            <li>You must be at least 18 years old and legally able to contract.</li>
            <li>You are responsible for account security and all activity under your account.</li>
            <li>You must provide accurate, complete, and up-to-date information.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-insurance">
          <h3>3. Insurance quotes and policies</h3>
          <ul>
            <li>LAJOO is a facilitator and technology platform, not an insurer.</li>
            <li>Final premium, approval, coverage, terms, and exclusions are set by the insurer.</li>
            <li>You must review the insurer policy wording and schedule before purchase.</li>
            <li>Incomplete or inaccurate details may cause repricing, rejection, or policy issues.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-payments">
          <h3>4. Payments, renewals, and refunds</h3>
          <ul>
            <li>Charges may include premium, tax, duties, processing costs, and service fees.</li>
            <li>Payment processing is handled by approved payment partners and banks.</li>
            <li>Refund or cancellation outcomes follow insurer and payment-partner rules unless law says otherwise.</li>
            <li>Renewal reminders are informational only; policy continuity is your responsibility.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-use">
          <h3>5. Acceptable use and intellectual property</h3>
          <ul>
            <li>No unlawful, misleading, abusive, harmful, or fraudulent conduct.</li>
            <li>No scraping, automated extraction, reverse engineering, or interference with platform security.</li>
            <li>All platform content, software, brand assets, and materials belong to {COMPANY} or licensors.</li>
            <li>We grant a limited, non-exclusive, non-transferable, revocable right to use the Services.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-liability">
          <h3>6. Third-party services, disclaimers, liability, and indemnity</h3>
          <ul>
            <li>Third-party websites, insurer portals, and payment systems are outside our direct control.</li>
            <li>Services are provided on an as-is and as-available basis.</li>
            <li>We do not provide legal, tax, or financial advice.</li>
            <li>To the maximum extent allowed by law, we are not liable for indirect, incidental, or consequential loss.</li>
            <li>You agree to indemnify {COMPANY} for losses arising from your misuse, breach, or unlawful conduct.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-disputes">
          <h3>7. Suspension, termination, disputes, and governing law</h3>
          <ul>
            <li>We may suspend or terminate access if there is misuse, fraud risk, legal risk, or breach of Terms.</li>
            <li>We may attempt good-faith resolution before formal legal action.</li>
            <li>These Terms are governed by the laws of {JURISDICTION}.</li>
            <li>You agree to the jurisdiction of courts in {JURISDICTION}, unless mandatory law requires otherwise.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-changes">
          <h3>8. Changes and notices</h3>
          <ul>
            <li>We may update these Terms from time to time.</li>
            <li>Material updates will be posted on this page with a revised effective date.</li>
            <li>Continued use of Services after updates means acceptance of the revised Terms.</li>
            <li>For legal notices, contact us at <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</li>
          </ul>
        </section>

        <p className="legal-backtop"><a href="#top">Back to top</a></p>
      </article>

      <article className="legal-card" id="privacy">
        <h2 className="legal-h2">Privacy Policy</h2>
        <p className="legal-intro">
          This Privacy Policy explains how we collect, use, share, store, and protect
          personal data when you use our Services.
        </p>

        <section className="legal-section" id="privacy-collect">
          <h3>1. Information we collect</h3>
          <ul>
            <li>Identity and contact data: name, email, phone number, address, and IDs if required.</li>
            <li>Vehicle and insurance data: plate number, vehicle details, policy history, and claims details.</li>
            <li>Technical data: device/browser details, IP address, logs, and usage analytics.</li>
            <li>Transaction data: payment status and reference details from payment providers.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-use">
          <h3>2. How we use data and legal basis</h3>
          <ul>
            <li>To provide quotes, policy servicing, renewals, and customer support.</li>
            <li>To verify identity, detect fraud, maintain security, and prevent abuse.</li>
            <li>To comply with legal, audit, and regulatory requirements.</li>
            <li>To improve products and user experience under legitimate business interests.</li>
            <li>To send marketing where consent exists or where legally permitted, with opt-out options.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-share">
          <h3>3. How we share data</h3>
          <ul>
            <li>Insurers and underwriting partners, where needed to quote or issue policies.</li>
            <li>Payment providers, banks, and financial processors for transaction handling.</li>
            <li>Technology vendors (hosting, analytics, messaging, support) under confidentiality duties.</li>
            <li>Authorities and regulators when required by law, court order, or public safety obligations.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-transfers">
          <h3>4. International transfers</h3>
          <p>
            If personal data is transferred outside your country, we apply appropriate
            contractual, technical, and organizational safeguards.
          </p>
        </section>

        <section className="legal-section" id="privacy-retention">
          <h3>5. Retention and security</h3>
          <ul>
            <li>We retain data only as long as necessary for service delivery, legal obligations, and dispute handling.</li>
            <li>After retention periods, data is deleted, anonymized, or securely archived where lawful.</li>
            <li>We use layered administrative, technical, and operational security controls.</li>
            <li>No internet system is fully secure; users should also protect account credentials.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-cookies">
          <h3>6. Cookies and analytics</h3>
          <ul>
            <li>Cookies are used for login sessions, user preferences, security, and measurement.</li>
            <li>Blocking cookies may reduce functionality in parts of the Services.</li>
            <li>Where required by law, consent tools will be provided for non-essential cookies.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-rights">
          <h3>7. Your privacy rights</h3>
          <ul>
            <li>Subject to applicable law, you may request access, correction, deletion, or restriction of data processing.</li>
            <li>You may withdraw consent for optional processing at any time.</li>
            <li>You may opt out of direct marketing communication via unsubscribe links or by contacting us.</li>
            <li>For requests, email <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. We may verify your identity first.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-contact">
          <h3>8. Children, updates, contact, and complaints</h3>
          <ul>
            <li>Services are not directed at children under 18, and we do not knowingly collect child data.</li>
            <li>We may update this Privacy Policy and publish updates with a revised effective date.</li>
            <li>Contact {COMPANY} at <a href={`mailto:${EMAIL}`}>{EMAIL}</a> for privacy requests or complaints.</li>
          </ul>
        </section>

        <p className="legal-backtop"><a href="#top">Back to top</a></p>
      </article>

      <InfoFooter />
    </main>
  );
}
