"use client";

import { useState } from "react";
import styles from "./faq.module.css";
import InfoFooter from "@/components/InfoFooter";

const faqItems = [
  {
    question: "How does LAJOO work?",
    answer:
      "Just share your plate number and renewal details in chat. LAJOO compares insurers, explains options, and helps you renew in one flow.",
  },
  {
    question: "How long does renewal usually take?",
    answer:
      "Most users complete renewal in a few minutes, depending on data verification, insurer response, and payment confirmation.",
  },
  {
    question: "Can I compare multiple insurers before paying?",
    answer:
      "Yes. LAJOO shows multiple options and helps you compare coverage and price before you confirm payment.",
  },
  {
    question: "Can I renew outside office hours?",
    answer:
      "Yes. The platform is available 24/7 so you can check options and proceed anytime.",
  },
  {
    question: "What payment methods are supported?",
    answer:
      "You can pay using cards, e-wallets, online banking, and selected installment options shown during checkout.",
  },
  {
    question: "Do I need to prepare any documents?",
    answer:
      "Usually just your plate number and renewal details are enough to get started. LAJOO will ask for anything else only if needed.",
  },
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <main className={styles.wrap}>
      <section className={styles.hero}>
        <p className={styles.kicker}>FAQ</p>
        <h1 className={styles.title}>Frequently Asked Questions</h1>
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
                      d={isOpen ? "M5 12.5L10 7.5L15 12.5" : "M5 7.5L10 12.5L15 7.5"}
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

      <InfoFooter />
    </main>
  );
}
