"use client";
import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams, usePathname } from "next/navigation";
import { COUNTRIES, DEFAULT_LANGUAGE_BY_COUNTRY } from "@/lib/localeConfig";

const SUPPORTED = new Set(COUNTRIES.map(c => c.code));

export default function CountryLangPicker({ currentCountry }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("main"); // "main" | "countryList"
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const country = (currentCountry || params?.country || "my").toLowerCase();

  useEffect(() => setMounted(true), []);

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

  function pathWithCountry(path, code) {
    const parts = path.split("/"); // ["", "my", "what-is-lajoo", ...]
    if (SUPPORTED.has((parts[1] || "").toLowerCase())) {
      parts[1] = code;
      return parts.join("/") || "/";
    }
    return `/${code}${path.startsWith("/") ? path : `/${path}`}`;
  }

  const current = COUNTRIES.find(c => c.code === country) || COUNTRIES[0];
  const close = () => { setOpen(false); setMode("main"); };

  return (
    <>
      {/* Header button: show CODE | LANG (same as before) */}
      <button className="country-language-button" onClick={() => setOpen(true)}>
        <img src={current.flag} alt="" />
        <span>{country.toUpperCase()}|{lang.toUpperCase()}</span>
      </button>

      {mounted && createPortal(
        <div className={`picker-overlay ${open ? "open" : ""}`} onClick={close}>
          <aside
            className={`picker-panel ${open ? "open" : ""}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="picker-head">
              {mode === "countryList" && (
                <button className="picker-back" aria-label="Back" onClick={() => setMode("main")}>‹</button>
              )}
              <span className="picker-title">Country</span>
              <button className="picker-x" aria-label="Close" onClick={close}>×</button>
            </div>

            {mode === "main" ? (
              <>
                {/* Only current country; tap to open full list */}
                <div className="picker-section">
                  <button className="picker-row active" onClick={() => setMode("countryList")}>
                    <span className="row-left">
                      <img src={current.flag} alt="" className="flag" />
                      <span className="row-text">
                        <span className="row-code">{current.code.toUpperCase()}</span>
                        <span className="row-name">({current.name})</span>
                      </span>
                    </span>
                    <span className="row-right chevron">›</span>
                  </button>
                </div>

                <div className="picker-subtitle">Language</div>
                <div className="picker-section">
                  {langs.map((l) => (
                    <button
                      key={l.code}
                      className={`picker-row ${l.code === lang ? "checked" : ""}`}
                      onClick={() => { setCookieLang(l.code); close(); }}
                    >
                      <span className="row-left">{l.label}</span>
                      <span className="row-right tick">{l.code === lang ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              // Full country list; keep sheet open and show the new country's languages after switch
              <div className="picker-section">
                {COUNTRIES.map((c) => (
                  <button
                    key={c.code}
                    className={`picker-row ${c.code === country ? "active" : ""}`}
                    onClick={() => {
                      setCountryCookie(c.code);
                      const allowed = (COUNTRIES.find(x => x.code === c.code)?.languages || []).map(x => x.code);
                      if (!allowed.includes(lang)) {
                        setCookieLang(DEFAULT_LANGUAGE_BY_COUNTRY[c.code] || "en");
                      }
                      router.replace(pathWithCountry(pathname, c.code)); // stay on the same page, just switch country segment
                      setMode("main");          // go back to main view
                      setOpen(true);            // keep sheet open to show language list for the new country
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
            )}
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}