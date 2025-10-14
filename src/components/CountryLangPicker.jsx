"use client";
import { useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { COUNTRIES, DEFAULT_LANGUAGE_BY_COUNTRY } from "@/lib/localeConfig";

export default function CountryLangPicker({ currentCountry }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const params = useParams();
  const country = (currentCountry || params?.country || "my").toLowerCase();

  // language cookie (per your original logic)
  const [lang, setLang] = useState(() => {
    if (typeof document === "undefined") return DEFAULT_LANGUAGE_BY_COUNTRY[country] || "en";
    const m = document.cookie.match(/lajoo_lang=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : (DEFAULT_LANGUAGE_BY_COUNTRY[country] || "en");
  });

  const langs = useMemo(
    () => (COUNTRIES.find(c => c.code === country)?.languages || []),
    [country]
  );

  function setCookieLang(val) {
    setLang(val);
    const expires = new Date(Date.now() + 365*24*3600*1000).toUTCString();
    document.cookie = `lajoo_lang=${encodeURIComponent(val)}; path=/; expires=${expires}; SameSite=Lax`;
  }

  function setCountryCookie(code) {
    const expires = new Date(Date.now() + 365*24*3600*1000).toUTCString();
    document.cookie = `lajoo_country=${encodeURIComponent(code)}; path=/; expires=${expires}; SameSite=Lax`;
  }

  return (
    <>
      {/* Header button */}
      <button className="country-language-button" onClick={() => setOpen(true)}>
        <img src={COUNTRIES.find(c=>c.code===country)?.flag || "/icons/malaysia-flag.svg"} alt="" />
        <span>{country.toUpperCase()}|{lang.toUpperCase()}</span>
      </button>

      {/* Right-side sheet */}
      {open && (
        <div className="picker-overlay" onClick={() => setOpen(false)}>
          <aside
            className={`picker-panel ${open ? "open" : ""}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="picker-head">
              <span className="picker-title">Country</span>
              <button className="picker-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            </div>

            <div className="picker-section">
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  className={`picker-row ${c.code === country ? "active" : ""}`}
                  onClick={() => {
                    setCountryCookie(c.code);
                    setCookieLang(DEFAULT_LANGUAGE_BY_COUNTRY[c.code] || "en");
                    router.push(`/${c.code}`);
                    setOpen(false);
                  }}
                >
                  <span className="row-left">
                    <img src={c.flag} alt="" className="flag" />
                    <span className="row-text">
                      <span className="row-code">{c.code.toUpperCase()}</span>
                      <span className="row-name">({c.name})</span>
                    </span>
                  </span>
                  <span className="row-right chevron">›</span>
                </button>
              ))}
            </div>

            <div className="picker-subtitle">Language</div>
            <div className="picker-section">
              {langs.map((l) => (
                <button
                  key={l.code}
                  className={`picker-row ${l.code === lang ? "checked" : ""}`}
                  onClick={() => {
                    setCookieLang(l.code);
                    setOpen(false);
                  }}
                >
                  <span className="row-left">{l.label}</span>
                  <span className="row-right tick">{l.code === lang ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
