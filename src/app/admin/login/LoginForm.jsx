"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ config, nextPath }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const configured = Boolean(config?.configured);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!configured || loading) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to sign in.");
      if (payload?.mfaRequired) {
        setMfaChallenge(payload.challenge);
        setPassword("");
        setMfaCode("");
        return;
      }
      router.replace(nextPath || "/admin");
      router.refresh();
    } catch (loginError) {
      setError(loginError?.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(event) {
    event.preventDefault();
    if (!mfaChallenge?.challengeToken || loading) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/auth/mfa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeToken: mfaChallenge.challengeToken,
          code: mfaCode,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to verify MFA code.");
      router.replace(nextPath || "/admin");
      router.refresh();
    } catch (mfaError) {
      setError(mfaError?.message || "Unable to verify MFA code.");
      setMfaChallenge(null);
      setMfaCode("");
    } finally {
      setLoading(false);
    }
  }

  if (mfaChallenge) {
    return (
      <form className="admin-login-form" onSubmit={handleMfaSubmit}>
        <div className="admin-login-warning" role="status">
          Enter the 6-digit code for <strong>{mfaChallenge.email}</strong>. Challenge expires at{" "}
          {new Intl.DateTimeFormat("en-MY", { timeStyle: "short" }).format(new Date(mfaChallenge.expiresAt))}.
        </div>
        <label>
          <span>MFA code</span>
          <input
            autoComplete="one-time-code"
            disabled={loading}
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            value={mfaCode}
          />
        </label>
        {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
        <button className="admin-primary-button" disabled={loading || mfaCode.length !== 6} type="submit">
          {loading ? "Verifying..." : "Verify MFA"}
        </button>
        <button
          className="admin-secondary-button"
          disabled={loading}
          onClick={() => {
            setMfaChallenge(null);
            setMfaCode("");
            setError("");
          }}
          type="button"
        >
          Back to password
        </button>
      </form>
    );
  }

  return (
    <form className="admin-login-form" onSubmit={handleSubmit}>
      {!configured ? (
        <div className="admin-login-warning" role="alert">
          Set <code>LAJOO_ADMIN_EMAIL</code> and <code>LAJOO_ADMIN_PASSWORD</code> for bootstrap, or configure persisted admin users.
        </div>
      ) : null}
      <label>
        <span>Email</span>
        <input
          autoComplete="username"
          disabled={!configured || loading}
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@lajoo.my"
          type="email"
          value={email}
        />
      </label>
      <label>
        <span>Password</span>
        <input
          autoComplete="current-password"
          disabled={!configured || loading}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Environment-managed password"
          type="password"
          value={password}
        />
      </label>
      {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
      <button className="admin-primary-button" disabled={!configured || loading} type="submit">
        {loading ? "Signing in..." : "Sign in"}
      </button>
      <p className="admin-login-footnote">
        Login is required for all admin routes. Session cookies are HTTP-only and expire after 8 hours.
      </p>
    </form>
  );
}
