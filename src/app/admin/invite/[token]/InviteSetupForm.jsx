"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InviteSetupForm({ token }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/admin/invite/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to accept invite.");
      router.replace("/admin/login");
      router.refresh();
    } catch (inviteError) {
      setError(inviteError?.message || "Unable to accept invite.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="admin-login-form" onSubmit={handleSubmit}>
      <label>
        <span>New password</span>
        <input
          autoComplete="new-password"
          disabled={loading}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Minimum 8 characters"
          type="password"
          value={password}
        />
      </label>
      <label>
        <span>Confirm password</span>
        <input
          autoComplete="new-password"
          disabled={loading}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Repeat password"
          type="password"
          value={confirmPassword}
        />
      </label>
      {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
      <button className="admin-primary-button" disabled={loading} type="submit">
        {loading ? "Setting password..." : "Set password"}
      </button>
      <p className="admin-login-footnote">
        After setup, sign in with your email and password. MFA can be enabled from Security & Access.
      </p>
    </form>
  );
}
