import styles from "../info-page.module.css";
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
];

export default function FAQPage() {
  return (
    <main className={styles.wrap}>
      <section className={styles.hero}>
        <p className={styles.kicker}>FAQ</p>
        <h1 className={styles.title}>Frequently Asked Questions</h1>
        <p className={styles.meta}>
          Quick answers to common questions about comparing, renewing, and paying with LAJOO.
        </p>
      </section>

      <section className={styles.grid} aria-label="FAQ list">
        {faqItems.map((item) => (
          <article key={item.question} className={styles.card}>
            <h2>{item.question}</h2>
            <p>{item.answer}</p>
          </article>
        ))}
      </section>

      <InfoFooter />
    </main>
  );
}
