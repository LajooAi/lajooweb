"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import styles from "./InfoFooter.module.css";

const socialLinks = [
  { label: "Facebook", href: "https://www.facebook.com/", iconSrc: "/icons/social-facebook.svg" },
  { label: "Instagram", href: "https://www.instagram.com/", iconSrc: "/icons/social-instagram.svg" },
  { label: "TikTok", href: "https://www.tiktok.com/", iconSrc: "/icons/social-tiktok.svg" },
  { label: "Rednote", href: "https://www.xiaohongshu.com/", iconSrc: "/icons/social-rednote.svg" },
  { label: "YouTube", href: "https://www.youtube.com/", iconSrc: "/icons/social-youtube.svg" },
  { label: "Threads", href: "https://www.threads.net/", iconSrc: "/icons/social-threads.svg" },
];

export default function InfoFooter() {
  const params = useParams();
  const country = String(params?.country || "my").toLowerCase();

  const pageLinks = [
    { label: "Homepage", href: `/${country}` },
    { label: "What is LAJOO ?", href: `/${country}/what-is-lajoo` },
    { label: "FAQ", href: `/${country}/faq` },
    { label: "Contact Us", href: `/${country}/contact-us` },
    { label: "Terms & Privacy Policy", href: `/${country}/terms` },
  ];

  return (
    <footer className={styles.footer} aria-label="LAJOO footer links and contact">
      <div className={styles.container}>
        <div className={styles.sections}>
          <section className={`${styles.section} ${styles.brandSection}`}>
            <img src="/logo/lajoo-logo.png" alt="LAJOO" className={styles.brandLogo} />
            <p className={styles.company}>LAJOO AI SDN. BHD.</p>
            <p className={styles.registration}>202501028462 (1629874-U)</p>
            <p className={styles.tagline}>Helping Malaysians renew insurance with AI.</p>
          </section>

          <section className={`${styles.section} ${styles.navSection}`}>
            <nav className={styles.menu} aria-label="Footer navigation">
              {pageLinks.map((item) => (
                <Link key={item.href} href={item.href} className={styles.menuLink}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </section>

          <section className={`${styles.section} ${styles.followSection}`}>
            <h3 className={styles.followTitle}>Follow Us</h3>
            <div className={styles.socialRow}>
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={social.label}
                  className={styles.socialLink}
                >
                  <img src={social.iconSrc} alt="" className={styles.socialIcon} />
                </a>
              ))}
            </div>
          </section>

          <p className={styles.copyright}>© 2026 LAJOO AI Sdn. Bhd. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
