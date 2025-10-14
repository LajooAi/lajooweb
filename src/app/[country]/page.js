"use client";
import Head from "next/head";
import { useState } from "react";

export default function Home() {
  const [inputText, setInputText] = useState("");
  return (
    <>
      <Head>
        <title>Renew Insurance In Minutes With LAJOO</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
      </Head>

      <main className="hero">
        <h1>Instant Car Insurance <br />&amp; Road Tax Renewal</h1>
        <h2>Get covered in 2 minutes, <br />fully AI-powered.</h2>

        <div className="recommended-actions">
          <button>Renew Insurance</button>
          <button>View My Policy</button>
          <button>Make A Claim</button>
          <button>Accident Help</button>
        </div>
      </main>

      <div className="chat-box">
        <div className="chat-column">
          <div className="bubble">
            <button className="add-button">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="icon">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            <div
              className="input-area"
              contentEditable={true}
              onInput={(e) => setInputText(e.currentTarget.textContent || "")}
            />
            <p className="placeholder" style={{ display: inputText.trim() ? "none" : "block" }}>
              Renew or ask anything
            </p>

            <button className="send-button">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="icon">
                <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="terms-privacy">
          <p>By messaging LAJOO, you agree to our Terms &amp; Privacy Policy.</p>
        </div>
      </div>
    </>
  );
}
