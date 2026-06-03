import "./terms.css";
import InfoFooter from "@/components/InfoFooter";
import BackToTopLink from "./BackToTopLink";

export default function TermsPrivacyPage() {
  const COMPANY = "LAJOO AI SDN BHD";
  const REGISTRATION = "202501028462 (1629874-U)";
  const EMAIL = "lajoo.ai@gmail.com";
  const EFFECTIVE = "20 May 2026";
  const JURISDICTION = "Malaysia";

  return (
    <main className="legal-wrap" id="top">
      <section className="legal-hero" aria-label="Legal page heading">
        <p className="legal-kicker">Legal</p>
        <h1 className="legal-h1">Terms and Privacy Policy</h1>
        <p className="legal-meta">
          Effective and last updated: {EFFECTIVE}
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
              <li><a href="#terms-insurance">Insurance, takaful, and road tax</a></li>
              <li><a href="#terms-ai">AI assistant and information accuracy</a></li>
              <li><a href="#terms-payments">Payments, renewals, refunds</a></li>
              <li><a href="#terms-use">Acceptable use and IP rights</a></li>
              <li><a href="#terms-liability">Disclaimers, liability, indemnity</a></li>
              <li><a href="#terms-disputes">Disputes and governing law</a></li>
              <li><a href="#terms-changes">Changes and notices</a></li>
            </ol>
          </div>

          <div>
            <p className="legal-toc-group">Privacy Policy</p>
            <ol className="legal-toc-list">
              <li><a href="#privacy-collect">Information we collect</a></li>
              <li><a href="#privacy-sources">Sources and special data</a></li>
              <li><a href="#privacy-use">How and why we use data</a></li>
              <li><a href="#privacy-share">Who we share data with</a></li>
              <li><a href="#privacy-transfers">International transfers</a></li>
              <li><a href="#privacy-retention">Retention and security</a></li>
              <li><a href="#privacy-ai">AI, cookies, and analytics</a></li>
              <li><a href="#privacy-rights">Your rights</a></li>
              <li><a href="#privacy-contact">Contact and complaints</a></li>
            </ol>
          </div>
        </div>
      </nav>

      <article className="legal-card" id="terms">
        <h2 className="legal-h2">Terms and Conditions</h2>
        <p className="legal-intro">
          These Terms govern your access to the LAJOO website, chat assistant,
          quote comparison, insurance or takaful renewal support, road-tax support,
          payment flows, documents, notifications, and customer support features
          (the Services). By using the Services, you agree to these Terms.
        </p>

        <section className="legal-section" id="terms-scope">
          <h3>1. Scope and acceptance</h3>
          <ul>
            <li>If you do not agree with these Terms, you must not use the Services.</li>
            <li>These Terms apply together with any quote, product disclosure sheet, policy wording, certificate, schedule, invoice, payment instruction, consent form, or notice shown to you during the journey.</li>
            <li>If there is any conflict between LAJOO content and the final insurer or takaful operator document, the insurer or takaful operator document controls.</li>
            <li>Unless a separate country-specific notice says otherwise, these Terms are prepared for LAJOO Services offered from Malaysia.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-eligibility">
          <h3>2. Eligibility, authority, and user responsibilities</h3>
          <ul>
            <li>You must be at least 18 years old and legally able to contract.</li>
            <li>You must provide true, complete, current, and non-misleading information, including vehicle registration number, identification details, contact details, address, prior policy details, named-driver details, claims history, No Claim Discount information, and payment details.</li>
            <li>If you provide personal data or insurance information about another person, such as a vehicle owner, named driver, passenger, company officer, or family member, you confirm that you have authority to do so and that they have been informed where required.</li>
            <li>You are responsible for checking quote details, coverage, add-ons, excess, exclusions, sums insured, road-tax details, recipient details, and delivery details before payment.</li>
            <li>You are responsible for keeping your device, email, phone, OTP, login credentials, and payment approvals secure.</li>
            <li>We may decline, pause, cancel, or require extra verification for any request where we suspect inaccurate information, fraud, abuse, security risk, payment risk, regulatory risk, or breach of these Terms.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-insurance">
          <h3>3. Insurance, takaful, and road-tax services</h3>
          <ul>
            <li>LAJOO is a technology and service platform. LAJOO is not an insurer, takaful operator, underwriter, government agency, bank, payment card issuer, or road-transport authority.</li>
            <li>Insurance and takaful products are issued, underwritten, approved, priced, cancelled, endorsed, and serviced by the relevant insurer, takaful operator, licensed intermediary, or authorized partner.</li>
            <li>Quotes are estimates until accepted, paid, verified, and issued by the relevant provider. Premiums, contributions, service fees, taxes, duties, discounts, No Claim Discount, underwriting decisions, road-tax charges, and availability may change before completion.</li>
            <li>We may help explain product information, but we do not guarantee that a product is suitable for every need. You should read the product disclosure sheet, policy wording, certificate wording, schedule, exclusions, benefits, duties, and claim conditions before purchase.</li>
            <li>Road-tax renewal depends on valid insurance or takaful, JPJ and government systems, partner systems, payment confirmation, vehicle status, and eligibility checks. LAJOO is not responsible for delays or rejections caused by government, insurer, payment, courier, or third-party systems outside our control.</li>
            <li>Renewal reminders and expiry information are convenience features only. You remain responsible for maintaining continuous coverage and lawful vehicle use.</li>
            <li>Policy issuance, cover commencement, document delivery, endorsements, cancellations, claims, and refunds are subject to provider rules and applicable law.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-ai">
          <h3>4. AI assistant and information accuracy</h3>
          <ul>
            <li>LAJOO may use AI and automation to understand messages, collect renewal details, compare available options, summarize policy information, answer common questions, and support customer service.</li>
            <li>AI-generated responses, summaries, comparisons, recommendations, and explanations are for convenience and general information. They are not legal, tax, financial, investment, or regulated insurance advice.</li>
            <li>The AI assistant may be incomplete, outdated, or incorrect. You must not rely only on a chat response when deciding whether a product, add-on, coverage limit, exclusion, claims rule, or road-tax option is suitable.</li>
            <li>Provider documents, product disclosure sheets, official schedules, official receipts, insurer confirmations, takaful certificates, and applicable law override anything stated in chat, marketing content, screenshots, FAQs, or summaries.</li>
            <li>You may contact us at {EMAIL} if you want human support or a clarification before completing payment.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-payments">
          <h3>5. Payments, renewals, cancellations, and refunds</h3>
          <ul>
            <li>Amounts shown may include premium or takaful contribution, road tax, add-ons, stamp duty, tax, delivery cost, payment gateway charges, platform or service fees, and other charges shown before checkout.</li>
            <li>Payment processing may be handled by third-party payment providers, banks, e-wallets, FPX providers, card networks, or other financial processors. Their own terms, checks, fees, and processing times may apply.</li>
            <li>Payment approval does not by itself guarantee policy issuance, road-tax renewal, or document delivery. The relevant provider may still require verification, underwriting approval, system confirmation, or additional information.</li>
            <li>If a transaction fails, is reversed, is charged back, is suspected of fraud, or is not settled to us or the provider, we may withhold, cancel, suspend, or reverse the related service where lawful.</li>
            <li>Cancellation, endorsement, cooling-off, refund, and short-period premium outcomes are controlled by applicable law, insurer or takaful operator rules, payment-provider rules, and any service already performed.</li>
            <li>Refunds, where approved, may be reduced by non-refundable charges, government charges, insurer charges, payment charges, delivery charges, or services already completed, unless prohibited by law.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-use">
          <h3>6. Acceptable use and intellectual property rights</h3>
          <ul>
            <li>You must not use the Services for unlawful, misleading, abusive, harmful, fraudulent, spam, impersonation, resale, scraping, data-harvesting, security-testing, or reverse-engineering activity.</li>
            <li>You must not interfere with our systems, bypass security controls, overload the Services, introduce malware, use unauthorized bots, or extract data except through normal personal use of the Services.</li>
            <li>You must not submit false documents, forged records, unauthorized personal data, fake payment evidence, or misleading insurance information.</li>
            <li>All LAJOO software, designs, copy, data structures, workflows, prompts, models, content, logos, trade marks, and brand assets belong to {COMPANY} or our licensors.</li>
            <li>We grant you a limited, personal, non-exclusive, non-transferable, revocable right to use the Services for your own lawful insurance, takaful, road-tax, and support needs.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-liability">
          <h3>7. Third-party services, disclaimers, liability, and indemnity</h3>
          <ul>
            <li>The Services may connect to insurers, takaful operators, agents, road-tax partners, payment providers, banks, messaging platforms, analytics tools, hosting providers, document systems, government systems, and other third-party services that we do not control.</li>
            <li>The Services are provided on an as-is and as-available basis. We do not guarantee uninterrupted access, error-free operation, approval of any quote, availability of any product, or completion within any specific time.</li>
            <li>To the maximum extent permitted by law, {COMPANY} is not liable for indirect, incidental, special, punitive, exemplary, or consequential loss, including loss of profit, loss of opportunity, loss of goodwill, data loss, vehicle-use loss, claim rejection, premium changes, delayed road-tax renewal, or losses caused by third parties.</li>
            <li>Nothing in these Terms excludes liability that cannot be excluded under applicable law.</li>
            <li>You agree to indemnify and hold harmless {COMPANY}, its directors, officers, employees, contractors, and partners from claims, losses, liabilities, penalties, costs, and expenses arising from your inaccurate information, unauthorized data sharing, misuse of the Services, breach of these Terms, unlawful conduct, fraud, chargeback, or third-party claim linked to your actions.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-disputes">
          <h3>8. Suspension, termination, disputes, and governing law</h3>
          <ul>
            <li>We may suspend, restrict, or terminate access to the Services if we believe there is misuse, fraud risk, security risk, regulatory risk, payment risk, legal risk, or breach of these Terms.</li>
            <li>We may preserve records, cooperate with providers or authorities, and take steps reasonably necessary to protect users, providers, LAJOO, and the Services.</li>
            <li>Please contact us first at {EMAIL} so we can try to resolve complaints in good faith.</li>
            <li>These Terms are governed by the laws of {JURISDICTION}.</li>
            <li>You agree to the exclusive jurisdiction of the courts of {JURISDICTION}, unless mandatory consumer or data-protection law requires otherwise.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms-changes">
          <h3>9. Changes, notices, and company contact</h3>
          <ul>
            <li>We may update these Terms when our Services, providers, legal obligations, or operating model change.</li>
            <li>Material updates will be posted on this page with a revised effective date. We may also notify you by email, in-app message, chat, or other reasonable channel.</li>
            <li>Continued use of Services after updates means acceptance of the revised Terms.</li>
            <li>Legal notices may be sent to {COMPANY}, registration number {REGISTRATION}, by email at {EMAIL}.</li>
          </ul>
        </section>

        <p className="legal-backtop"><BackToTopLink /></p>
      </article>

      <article className="legal-card" id="privacy">
        <h2 className="legal-h2">Privacy Policy</h2>
        <p className="legal-intro">
          This Privacy Policy explains how {COMPANY} collects, uses, discloses,
          stores, transfers, and protects personal data when you use LAJOO Services.
          It is intended to support compliance with Malaysia&apos;s Personal Data Protection
          Act 2010 and other applicable privacy requirements.
        </p>

        <section className="legal-section" id="privacy-collect">
          <h3>1. Information we collect</h3>
          <ul>
            <li>Identity and contact data: name, NRIC, passport or company identification where required, date of birth, email, phone number, address, postcode, and customer-support identifiers.</li>
            <li>Vehicle and insurance data: registration number, make, model, year, chassis or engine information where required, use type, market value, No Claim Discount, prior policy details, named drivers, claims history, add-ons, road-tax details, and quote preferences.</li>
            <li>Transaction data: checkout selections, payment method, payment status, receipts, invoice details, refund status, reconciliation references, and masked or reference details provided by payment partners. Full card or e-wallet credentials are normally processed by payment partners, not directly by LAJOO.</li>
            <li>Chat, support, and document data: messages, call or support notes, uploaded files, screenshots, forms, consent records, OTP verification status, marketing preferences, complaints, and service history.</li>
            <li>Technical and usage data: IP address, device and browser details, identifiers, pages viewed, clicks, logs, error events, cookies, analytics events, approximate location derived from technical data, and security signals.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-sources">
          <h3>2. Sources and special data</h3>
          <ul>
            <li>We collect personal data from you, your authorized representatives, insurers, takaful operators, licensed intermediaries, road-tax or government-service partners, payment providers, messaging providers, fraud-prevention partners, analytics providers, and public or lawfully available sources.</li>
            <li>Some information may relate to sensitive matters, such as accident details, claim circumstances, health or injury information, disability information, offence or enforcement records, or biometric information if ever required for verification. We process this only where needed, where you consent, where law permits, or where required by a provider for the requested service.</li>
            <li>If you choose not to provide required information, LAJOO or its partners may be unable to provide quotes, renew insurance or takaful, renew road tax, verify identity, issue documents, process payments, support claims, or handle your request.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-use">
          <h3>3. How and why we use data</h3>
          <ul>
            <li>To operate the Services, create and manage your journey, provide quote comparisons, request provider pricing, process renewals, support road-tax services, issue or retrieve documents, process payment status, manage refunds, and provide customer support.</li>
            <li>To verify identity and authority, authenticate OTPs or approvals, prevent fraud, secure the Services, investigate suspicious activity, and protect users, partners, and LAJOO.</li>
            <li>To communicate with you about quotes, reminders, renewal status, road-tax status, policy documents, support requests, complaints, service changes, security notices, and legal notices.</li>
            <li>To improve product quality, AI response quality, pricing flow, user experience, analytics, debugging, training, internal reporting, and operational performance.</li>
            <li>To comply with law, lawful requests, audit, accounting, tax, anti-fraud, dispute, regulator, insurance, takaful, road-transport, payment, and record-keeping obligations.</li>
            <li>To send marketing or promotional messages where you have consented or where allowed by law. You may opt out of direct marketing at any time.</li>
            <li>Where applicable, we rely on consent, contract necessity, legal obligation, legitimate business interests, protection of rights, fraud prevention, and other grounds permitted by law.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-share">
          <h3>4. Who we share data with</h3>
          <ul>
            <li>Insurers, takaful operators, reinsurers, adjusters, claims handlers, licensed intermediaries, and underwriting or servicing partners where needed to quote, assess, issue, service, cancel, endorse, refund, or support a policy or certificate.</li>
            <li>Road-tax, delivery, government-service, and verification partners where needed for road-tax renewal, vehicle checks, document handling, delivery, or eligibility verification.</li>
            <li>Payment providers, banks, card networks, e-wallet operators, FPX providers, fraud-prevention vendors, and reconciliation partners for transaction handling and payment risk management.</li>
            <li>Technology and operations vendors, including hosting, database, security, analytics, AI, email, SMS, WhatsApp or messaging, customer-support, document-generation, error-monitoring, and audit providers.</li>
            <li>Professional advisers, auditors, insurers, potential investors or acquirers, business-transfer parties, and corporate group members where reasonably needed and subject to appropriate duties.</li>
            <li>Authorities, regulators, courts, law-enforcement bodies, dispute bodies, and other parties where required or permitted by law, court order, regulatory request, public-safety obligation, or to protect legal rights.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-transfers">
          <h3>5. International transfers</h3>
          <p>
            We may store or process personal data in Malaysia or in other countries
            where our service providers, cloud providers, payment partners, AI providers,
            support tools, or analytics providers operate. Where personal data is
            transferred across borders, we apply contractual, technical, organizational,
            and other safeguards required or permitted by applicable law.
          </p>
        </section>

        <section className="legal-section" id="privacy-retention">
          <h3>6. Retention and security</h3>
          <ul>
            <li>We retain personal data only for as long as reasonably necessary for the purposes described in this Policy, including service delivery, provider servicing, audit, accounting, tax, fraud prevention, legal compliance, dispute handling, customer support, product improvement, and business continuity.</li>
            <li>Retention periods may differ depending on the data type, product, provider, transaction status, legal requirement, complaint, claim, investigation, or dispute.</li>
            <li>When personal data is no longer required, we delete, anonymize, aggregate, or securely archive it where lawful and technically practical.</li>
            <li>We use administrative, technical, and organizational security controls designed to protect personal data against unauthorized access, disclosure, misuse, alteration, loss, and destruction.</li>
            <li>No online system can be guaranteed fully secure. You should protect your phone, email, OTP, payment approvals, and login credentials and tell us promptly if you suspect unauthorized access.</li>
            <li>If a personal-data incident occurs, we will investigate and notify affected users, partners, regulators, or authorities where required by law.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-ai">
          <h3>7. AI, cookies, and analytics</h3>
          <ul>
            <li>We may use AI, automation, and analytics to understand user requests, route conversations, summarize chat context, extract renewal details, detect fraud or abuse, improve responses, and support service operations.</li>
            <li>We design AI-assisted features so that insurer or takaful operator decisions, official documents, and applicable law remain controlling.</li>
            <li>You may request human support for an AI-assisted response, quote explanation, complaint, or privacy request by contacting {EMAIL}.</li>
            <li>We use cookies and similar technologies for core functionality, sessions, preferences, security, fraud prevention, analytics, performance, and service improvement.</li>
            <li>Blocking cookies may affect parts of the Services. Where required by law, we will provide choices for non-essential cookies or similar technologies.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-rights">
          <h3>8. Your privacy rights</h3>
          <ul>
            <li>Subject to applicable law, you may request access to personal data we hold about you and ask us to correct inaccurate, incomplete, misleading, or outdated personal data.</li>
            <li>You may withdraw consent for optional processing, object to or restrict certain processing, ask us to stop direct marketing, and request deletion, portability, or human review where those rights apply by law.</li>
            <li>Some requests may be limited where we need data to complete a transaction, comply with law, protect rights, prevent fraud, handle disputes, support provider obligations, or keep legally required records.</li>
            <li>We may verify your identity and authority before acting on a privacy request.</li>
            <li>For privacy requests, email {EMAIL} with enough detail for us to identify you and the request.</li>
          </ul>
        </section>

        <section className="legal-section" id="privacy-contact">
          <h3>9. Children, updates, contact, and complaints</h3>
          <ul>
            <li>The Services are intended for adults. We do not knowingly collect personal data from children under 18 except where lawfully provided by a parent, guardian, vehicle owner, policyholder, insurer, takaful operator, or authorized representative for an insurance, takaful, claim, or road-tax purpose.</li>
            <li>We may update this Privacy Policy when our Services, providers, technology, laws, or operating practices change. Updates will be posted on this page with a revised effective date.</li>
            <li>Contact {COMPANY}, registration number {REGISTRATION}, at {EMAIL} for privacy requests, complaints, data-access requests, correction requests, withdrawal requests, direct-marketing opt-outs, or security concerns.</li>
            <li>If your concern is not resolved, you may contact the Personal Data Protection Commissioner of Malaysia through the official channels published at <a href="https://www.pdp.gov.my/" target="_blank" rel="noopener noreferrer">pdp.gov.my</a>.</li>
          </ul>
        </section>

        <p className="legal-backtop"><BackToTopLink /></p>
      </article>

      <InfoFooter />
    </main>
  );
}
