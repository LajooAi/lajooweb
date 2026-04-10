import styles from "../info-page.module.css";
import InfoFooter from "@/components/InfoFooter";

export default function ContactUsPage() {
  return (
    <main className={styles.wrap}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Contact Us</p>
        <h1 className={styles.title}>Get in Touch</h1>
        <p className={styles.meta}>
          Need help with renewal or policy questions? Reach out and our team will assist you.
        </p>
      </section>

      <section className={styles.grid} aria-label="Contact details">
        <article className={styles.card}>
          <h2>Support</h2>
          <ul className={styles.contactList}>
            <li className={styles.contactItem}>
              <span className={styles.label}>Email</span>
              <span>lajoo.ai@gmail.com</span>
            </li>
            <li className={styles.contactItem}>
              <span className={styles.label}>Hours</span>
              <span>24/7 digital support</span>
            </li>
            <li className={styles.contactItem}>
              <span className={styles.label}>Country</span>
              <span>Malaysia</span>
            </li>
          </ul>
        </article>

        <article className={styles.card}>
          <h2>Company</h2>
          <ul className={styles.contactList}>
            <li className={styles.contactItem}>
              <span className={styles.label}>Name</span>
              <span>LAJOO AI SDN BHD</span>
            </li>
            <li className={styles.contactItem}>
              <span className={styles.label}>Reg No.</span>
              <span>202501028462 (1629874-U)</span>
            </li>
          </ul>
        </article>
      </section>

      <InfoFooter />
    </main>
  );
}
