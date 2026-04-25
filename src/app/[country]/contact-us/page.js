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
          <span className={styles.titleMain}>feel free to contact us.</span>
        </h1>
        <p className={styles.meta}>
          <span className={styles.metaLine}>LAJOO AI should be able to answer all your</span>
          <span className={styles.metaLine}>questions instantly 24/7, but if you need to</span>
          <span className={styles.metaLine}>talk to humans we&rsquo;re always here for you.</span>
        </p>

        <div className={styles.humansBlock}>
          <p className={styles.humansTitle}>LAJOO Human Live Agents</p>
          <p className={styles.humansHours}>10am - 6pm</p>
        </div>
      </section>

      <section className={styles.contactStack} aria-label="Contact details">
        <a
          className={`${styles.contactCard} ${styles.contactCardWhatsapp}`}
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
        >
          <div className={styles.contactText}>
            <div className={styles.contactHeadingRow}>
              <h2 className={styles.contactLabel}>WhatsApp</h2>
              <span className={styles.recommended}>best</span>
            </div>
            <p className={styles.contactValue}>{phoneNumber}</p>
          </div>
          <span className={`${styles.iconShell} ${styles.iconShellWhatsapp}`} aria-hidden="true">
            <WhatsappIcon />
          </span>
        </a>

        <a className={styles.contactCard} href={phoneHref}>
          <div className={styles.contactText}>
            <h2 className={styles.contactLabel}>Call</h2>
            <p className={styles.contactValue}>{phoneNumber}</p>
          </div>
          <span className={`${styles.iconShell} ${styles.iconShellCall}`} aria-hidden="true">
            <PhoneIcon />
          </span>
        </a>

        <a className={styles.contactCard} href={`mailto:${email}`}>
          <div className={styles.contactText}>
            <h2 className={styles.contactLabel}>Email</h2>
            <p className={styles.contactValue}>{email}</p>
          </div>
          <span className={`${styles.iconShell} ${styles.iconShellEmail}`} aria-hidden="true">
            <MailIcon />
          </span>
        </a>
      </section>

      <InfoFooter />
    </main>
  );
}

function WhatsappIcon() {
  return (
    <svg className={styles.contactIcon} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="15" fill="#67D66A" />
      <path
        d="M16.01 4.27C9.61 4.27 4.43 9.42 4.43 15.77c0 2.03.53 4 1.54 5.74L4 27.73l6.42-1.9a11.72 11.72 0 0 0 5.59 1.42h.01c6.39 0 11.57-5.15 11.57-11.49S22.4 4.27 16.01 4.27Zm0 20.91h-.01a9.74 9.74 0 0 1-4.97-1.36l-.36-.21-3.81 1.13 1.18-3.68-.24-.38a9.6 9.6 0 0 1-1.49-5.12c0-5.34 4.38-9.69 9.77-9.69 5.38 0 9.75 4.35 9.75 9.69 0 5.35-4.38 9.7-9.82 9.7Z"
        fill="#FFFFFF"
      />
      <path
        d="M21.71 18.71c-.31-.15-1.82-.89-2.1-.99-.28-.1-.49-.15-.69.15-.2.29-.79.98-.97 1.18-.18.2-.36.23-.67.08-.31-.15-1.31-.48-2.5-1.54-.92-.82-1.54-1.83-1.72-2.14-.18-.31-.02-.47.13-.62.14-.14.31-.36.46-.54.15-.18.2-.31.31-.51.1-.2.05-.38-.03-.54-.08-.15-.69-1.65-.95-2.26-.25-.6-.5-.52-.69-.53h-.59c-.2 0-.51.08-.79.38-.28.31-1.03 1-1.03 2.43 0 1.44 1.05 2.83 1.2 3.03.15.2 2.04 3.24 5.03 4.42 2.99 1.18 2.99.79 3.53.74.54-.05 1.82-.74 2.08-1.45.26-.72.26-1.33.18-1.46-.08-.13-.28-.21-.59-.36Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className={styles.contactIcon} viewBox="0 0 32 32" fill="none">
      <path
        d="M11.24 7.29c.52-.64 1.4-.98 2.24-.83l2.27.39c.72.12 1.28.69 1.39 1.41l.34 2.2c.08.54-.07 1.09-.41 1.52l-1.81 2.26a18.39 18.39 0 0 0 2.65 3.82 18.2 18.2 0 0 0 3.85 2.65l2.25-1.8c.43-.35.99-.5 1.53-.42l2.2.34c.72.11 1.29.67 1.41 1.39l.39 2.27c.14.84-.19 1.72-.84 2.24l-1.81 1.45c-.72.58-1.66.85-2.58.71-4.13-.61-8-2.75-11.18-5.93-3.18-3.17-5.32-7.05-5.93-11.18-.14-.92.12-1.86.7-2.58l1.46-1.81Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className={styles.contactIcon} viewBox="0 0 32 32" fill="none">
      <rect
        x="5.2"
        y="8.2"
        width="21.6"
        height="15.6"
        rx="1.8"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M6.47 10.08 15 16.42c.63.47 1.48.47 2.11 0l8.42-6.34"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
