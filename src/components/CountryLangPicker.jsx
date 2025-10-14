"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { COUNTRIES, DEFAULT_LANGUAGE_BY_COUNTRY } from "@/lib/localeConfig";

export default function CountryLangPicker({ currentCountry }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const params = useParams();
  const country = (currentCountry || params?.country || "my").toLowerCase();

  // read cookie on mount
  const [lang, setLang] = useState(() => {
    if (typeof document === "undefined") return DEFAULT_LANGUAGE_BY_COUNTRY[country] || "en";
    const m = document.cookie.match(/lajoo_lang=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : (DEFAULT_LANGUAGE_BY_COUNTRY[country] || "en");
  });

  // available languages for current country
  const langs = useMemo(
    () => (COUNTRIES.find(c => c.code === country)?.languages || []),
    [country]
  );

  function setCookieLang(val) {
    setLang(val);
    const expires = new Date(Date.now() + 365*24*3600*1000).toUTCString();
    document.cookie = `lajoo_lang=${encodeURIComponent(val)}; path=/; expires=${expires}; SameSite=Lax`;
  }

  return (
    <>
      {/* The button in header */}
      <button className="country-language-button" onClick={() => setOpen(true)}>
        <img src={COUNTRIES.find(c=>c.code===country)?.flag || "/icons/malaysia-flag.svg"} alt="" />
        <span>{country.toUpperCase()}|{lang.toUpperCase()}</span>
      </button>

      {/* Simple sheet modal */}
      {open && (
        <div className="picker-overlay" onClick={()=>setOpen(false)}>
          <div className="picker-panel" onClick={(e)=>e.stopPropagation()}>
            <div className="picker-header">
              <strong>Country</strong>
              <button aria-label="Close" onClick={()=>setOpen(false)}>×</button>
            </div>

            <div className="picker-section">
              {COUNTRIES.map(c => (
                <button
                  key={c.code}
                  className={`picker-row ${c.code === country ? "active" : ""}`}
                  onClick={() => {
                    // navigate to /{country}
                    router.push(`/${c.code}`);
                    // reset language to default for that country
                    setCookieLang(DEFAULT_LANGUAGE_BY_COUNTRY[c.code] || "en");
                    setOpen(false);
                  }}
                >
                  <span className="row-left">
                    <img src={c.flag} alt="" className="flag" />
                    {c.code.toUpperCase()} ({c.name})
                  </span>
                  <span className="row-right">›</span>
                </button>
              ))}
            </div>

            <div className="picker-subtitle">Language</div>
            <div className="picker-section">
              {langs.map(l => (
                <button
                  key={l.code}
                  className={`picker-row ${l.code === lang ? "checked" : ""}`}
                  onClick={() => {
                    setCookieLang(l.code);
                    setOpen(false);
                  }}
                >
                  <span className="row-left">{l.label}</span>
                  <span className="row-right">{l.code === lang ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
