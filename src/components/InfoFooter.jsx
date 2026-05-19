"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import styles from "./InfoFooter.module.css";

function FacebookIcon() {
  return (
    <svg className={styles.iconSvg} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14.2 6.1h1.9V3h-2.7c-2.9 0-4.7 1.8-4.7 4.8v2H6v3h2.7v8.2h3.4v-8.2h2.8l.4-3h-3.2V8.3c0-1.2.5-2.2 2.1-2.2z"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.4" cy="6.8" r="1.2" fill="currentColor" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg className={styles.iconSvg} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14.4 4h2.9c.2 1.3 1 2.4 2.2 3v2.9c-1.2-.1-2.3-.4-3.3-1.1v6.2a5.2 5.2 0 1 1-4.1-5.1v3a2.3 2.3 0 1 0 2.3 2.3V4z"
      />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.6 7.8c-.2-1-.9-1.8-1.9-2-1.8-.4-9.4-.4-9.4-.4s-1.8 0-3.6.2c-1 .2-1.7 1-1.9 2-.3 1.7-.3 3.4-.3 3.4s0 1.7.3 3.4c.2 1 .9 1.8 1.9 2 1.8.4 9.4.4 9.4.4s1.8 0 3.6-.2c1-.2 1.7-1 1.9-2 .3-1.7.3-3.4.3-3.4s0-1.7-.3-3.4z"
        fill="currentColor"
      />
      <path d="M10.2 9.1v5.8l5-2.9-5-2.9z" fill="#000D59" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className={styles.iconSvg} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.8 10.7 20.7 3h-1.6l-6 6.6L8.3 3H2.8l7.2 10-7.2 8h1.6l6.3-7 5 7h5.5l-7.4-10.3Zm-2.2 2.4-.7-1-5.8-7.8h2.4l4.7 6.4.7 1 6.1 8.2h-2.4l-5-6.8Z"
      />
    </svg>
  );
}

const socialLinks = [
  { label: "Facebook", href: "https://www.facebook.com/", icon: <FacebookIcon /> },
  { label: "Instagram", href: "https://www.instagram.com/", icon: <InstagramIcon /> },
  { label: "TikTok", href: "https://www.tiktok.com/", icon: <TikTokIcon /> },
  { label: "Rednote", href: "https://www.xiaohongshu.com/", icon: <span className={styles.rednoteGlyph}>R</span> },
  { label: "YouTube", href: "https://www.youtube.com/", icon: <YoutubeIcon /> },
  { label: "X", href: "https://x.com/", icon: <XIcon /> },
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
                  {social.icon}
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
