"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { COUNTRIES } from "@/lib/localeConfig";
import CountryLangPicker from "./CountryLangPicker";

export default function AppLayout({ children }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const params = useParams();
  const country = (params?.country || "").toLowerCase() || "my"; // fallback

  const isActive = (href) => (pathname === href ? "active" : "");

  useEffect(() => { setOpen(false); }, [pathname]);        // close drawer on route change
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : prev || "";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const current = COUNTRIES.find(c => c.code === country) || COUNTRIES[0];

  return (
    <div className="app-frame">
      {/* Desktop sidebar */}
      <aside className="sidebar-desktop">
        <div className="sidebar-inner">
          <div className="sidebar-brand">
            <img src="/logo/lajoo-logo.png" alt="LAJOO" className="sidebar-logo" />
          </div>
          <nav className="sidebar-nav">
            <Link href={`/${country}`} className={`sidebar-link ${isActive(`/${country}`)}`}>LAJOO</Link>
            <Link href={`/${country}/what-is-lajoo`} className={`sidebar-link ${isActive(`/${country}/what-is-lajoo`)}`}>
              What is LAJOO ?
            </Link>
            <Link href={`/${country}/terms`} className={`sidebar-link ${isActive(`/${country}/terms`)}`}>
              Terms & Privacy Policy
            </Link>
          </nav>
        </div>
      </aside>

      {/* Main column */}
      <div className="content-col">
        {/* Mobile header */}
        <header className="mobile-header">
          <button className="burger-icon" aria-label="Open menu" onClick={() => setOpen(true)}>
            <svg className="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>

          <div className="lajoo-logo">
            <img src="/logo/lajoo-logo.png" alt="LAJOO logo" />
          </div>

          {/* Country/Language button opens picker */}
          <CountryLangPicker currentCountry={country} />
        </header>

        {children}
      </div>

      {/* Mobile drawer */}
      <div className={`drawer-overlay ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`drawer-panel ${open ? "open" : ""}`} role="dialog" aria-modal="true">
        <div className="drawer-header">
          <span className="brand">LAJOO</span>
          <button className="drawer-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
        </div>
        <nav className="drawer-nav">
          <Link href={`/${country}`} className={`drawer-link ${isActive(`/${country}`)}`}>LAJOO</Link>
          <Link href={`/${country}/what-is-lajoo`} className={`drawer-link ${isActive(`/${country}/what-is-lajoo`)}`}>What is LAJOO ?</Link>
          <Link href={`/${country}/terms`} className={`drawer-link ${isActive(`/${country}/terms`)}`}>Terms & Privacy Policy</Link>
        </nav>
      </aside>
    </div>
  );
}
