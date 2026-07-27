import { redirect } from "next/navigation";
import LoginForm from "./LoginForm.jsx";
import { getAdminCredentialConfig, getAdminSession } from "@/server/admin/adminSession.js";
import { getDefaultAdminHrefForRole } from "@/server/admin/adminRoles.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Login",
};

function normalizeNextPath(value) {
  const nextPath = String(value || "");
  if (!nextPath.startsWith("/admin")) return "/admin";
  if (nextPath === "/admin/login" || nextPath.startsWith("/admin/login/")) return "/admin";
  return nextPath;
}

export default async function AdminLoginPage({ searchParams }) {
  const session = await getAdminSession();
  if (session) redirect(getDefaultAdminHrefForRole(session.role));

  const params = await searchParams;
  const nextPath = normalizeNextPath(params?.next);

  return (
    <main className="admin-login-page">
      <section className="admin-login-panel" aria-labelledby="admin-login-title">
        <div className="admin-login-brand">
          <span className="admin-brand-mark">LAJOO</span>
          <span>Admin Operating System</span>
        </div>
        <div className="admin-login-copy">
          <p className="admin-eyebrow">Secure internal access</p>
          <h1 id="admin-login-title">Sign in to LAJOO Admin</h1>
          <p>
            Role-based tools for renewal operations, AI knowledge quality,
            security review, and controlled PII access.
          </p>
        </div>
        <LoginForm config={getAdminCredentialConfig()} nextPath={nextPath} />
      </section>
    </main>
  );
}
