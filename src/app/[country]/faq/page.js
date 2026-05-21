"use client";

import { useState } from "react";
import styles from "./faq.module.css";
import InfoFooter from "@/components/InfoFooter";

const faqItems = [
  {
    question: "What is LAJOO?",
    answer:
      "LAJOO is an AI chat assistant that helps Malaysians renew car and motor insurance in a simple guided flow.",
  },
  {
    question: "How does LAJOO work?",
    answer:
      "Share your vehicle plate and owner ID, check the vehicle details, compare available quotes, choose any add-ons or road tax, then pay securely when you are ready.",
  },
  {
    question: "What can I ask LAJOO in chat?",
    answer:
      "You can ask about quotes, insurers, add-ons, Special Perils, windscreen cover, road tax, claims, policy terms, and which option may suit you best.",
  },
  {
    question: "What details do I need to start?",
    answer:
      "Usually you only need your vehicle plate number and the owner's identification number. LAJOO will ask for other details only when they are needed.",
  },
  {
    question: "Can I compare insurers before paying?",
    answer:
      "Yes. LAJOO shows the available options first, so you can compare price and coverage before making a decision.",
  },
  {
    question: "Can LAJOO recommend an insurer for me?",
    answer:
      "Yes. LAJOO can explain the trade-offs and suggest an option based on price, coverage, and your priorities. You always make the final choice.",
  },
  {
    question: "Can I add road tax during renewal?",
    answer:
      "Yes, where available for your vehicle and ownership type. LAJOO will show the road tax option clearly before you confirm.",
  },
  {
    question: "Can I ask about add-ons like Special Perils?",
    answer:
      "Yes. Ask LAJOO in chat before deciding. It can explain windscreen, Special Perils, e-hailing, and whether you should add or skip them.",
  },
  {
    question: "What if my vehicle details or NCD look wrong?",
    answer:
      "Pause before paying. Tell LAJOO what looks wrong, and it will guide you to check the details before moving forward.",
  },
  {
    question: "What payment methods are supported?",
    answer:
      "You can pay using the methods shown at checkout, including cards, online banking, e-wallets, and selected installment options where available.",
  },
  {
    question: "When will I receive my policy documents?",
    answer:
      "After successful payment and processing, your policy documents will be sent through the available delivery channels such as email or WhatsApp.",
  },
  {
    question: "Is my information safe with LAJOO?",
    answer:
      "LAJOO only asks for details needed to check quotes, process your renewal, complete payment, and support you after purchase.",
  },
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <main className={styles.wrap}>
      <section className={styles.hero}>
        <p className={styles.kicker}>FAQ</p>
        <h1 className={styles.title}>Frequently Asked Questions</h1>
        <p className={styles.description}>
          Find quick answers here, or ask LAJOO directly in chat.
        </p>
      </section>

      <section className={styles.faqList} aria-label="FAQ list">
        {faqItems.map((item, index) => {
          const isOpen = index === openIndex;

          return (
            <article
              key={item.question}
              className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`}
            >
              <button
                type="button"
                className={styles.faqButton}
                aria-expanded={isOpen}
                onClick={() => setOpenIndex(isOpen ? -1 : index)}
              >
                <span className={styles.faqQuestion}>{item.question}</span>
                <span className={styles.faqIconWrap} aria-hidden="true">
                  <svg className={styles.faqIcon} viewBox="0 0 20 20" fill="none">
                    <path
                      d={isOpen ? "M6 12.8L10 7.2L14 12.8" : "M6 7.2L10 12.8L14 7.2"}
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>

              {isOpen ? <p className={styles.faqAnswer}>{item.answer}</p> : null}
            </article>
          );
        })}
      </section>

      <div className={styles.roadStripes} aria-hidden="true">
        <span className={styles.roadStripeMark} />
        <span className={styles.roadStripeMark} />
        <span className={styles.roadStripeMark} />
      </div>

      <InfoFooter />
    </main>
  );
}
