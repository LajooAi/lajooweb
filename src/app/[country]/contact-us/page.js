import styles from "./contact.module.css";
import InfoFooter from "@/components/InfoFooter";

export default function ContactUsPage() {
  const phoneNumber = "+60162225794";
  const phoneHref = "tel:+60162225794";
  const whatsappHref = "https://wa.me/60162225794";
  const email = "lajoo.ai@gmail.com";

  return (
    <main className={styles.wrap}>
      <section className={styles.hero}>
        <h1 className={styles.title}>
          <span className={styles.titleAccent}>Hello,</span>
          <span className={styles.titleMain}>we&rsquo;re here to help.</span>
        </h1>
        <p className={styles.introCopy}>
          <span>LAJOO AI answers instantly, 24/7.</span>
          <span>Need extra help ? We&apos;re here daily.</span>
        </p>
        <div className={styles.humansBlock}>
          <span className={styles.humansIconTile} aria-hidden="true">
            <img className={styles.humansIcon} src="/icons/contact-human-support.svg" alt="" />
          </span>
          <div className={styles.humansCopy}>
            <p className={styles.humansTitle}>Human Support</p>
            <p className={styles.humansHours}>Monday - Sunday</p>
            <p className={styles.humansHours}>10am - 6pm</p>
          </div>
        </div>
      </section>

      <section className={styles.contactStack} aria-label="Contact details">
        <div className={styles.whatsappGroup}>
          <p className={styles.whatsappNote}>We usually reply fastest on WhatsApp.</p>
          <a
            className={`${styles.contactCard} ${styles.contactCardWhatsapp}`}
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
          >
            <div className={styles.contactText}>
              <div className={styles.contactHeadingRow}>
                <h2 className={styles.contactLabel}>WhatsApp</h2>
                <span className={styles.recommended}>recommended</span>
              </div>
              <p className={styles.contactValue}>{phoneNumber}</p>
            </div>
            <span className={`${styles.iconShell} ${styles.iconShellWhatsapp}`} aria-hidden="true">
              <img className={styles.contactIcon} src="/icons/contact-whatsapp.svg" alt="" />
            </span>
          </a>
        </div>

        <a className={styles.contactCard} href={phoneHref}>
          <div className={styles.contactText}>
            <h2 className={styles.contactLabel}>Call</h2>
            <p className={styles.contactValue}>{phoneNumber}</p>
          </div>
          <span className={`${styles.iconShell} ${styles.iconShellCall}`} aria-hidden="true">
            <img className={styles.contactIcon} src="/icons/contact-call.svg" alt="" />
          </span>
        </a>

        <a className={styles.contactCard} href={`mailto:${email}`}>
          <div className={styles.contactText}>
            <h2 className={styles.contactLabel}>Email</h2>
            <p className={styles.contactValue}>{email}</p>
          </div>
          <span className={`${styles.iconShell} ${styles.iconShellEmail}`} aria-hidden="true">
            <img className={styles.contactIcon} src="/icons/contact-email.svg" alt="" />
          </span>
        </a>
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
