"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

function roleLabel(role = "") {
  return role.replace(/_/g, " ");
}

export default function AdminShell({ children, navigation, session }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const isActive = (href) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname?.startsWith(`${href}/`);
  };

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  return (
    <div className="admin-os">
      <aside className="admin-sidebar" aria-label="Admin workspaces">
        <div className="admin-sidebar-brand">
          <span className="admin-brand-mark">LAJOO</span>
          <span>Admin OS</span>
        </div>
        <nav className="admin-sidebar-nav">
          {navigation.map((item) => (
            <Link
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`admin-sidebar-link${isActive(item.href) ? " admin-sidebar-link-active" : ""}`}
              href={item.href}
              key={item.href}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <span>Admin data mode</span>
          <strong>Persisted security, mock insurer/payment ops</strong>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="admin-topbar-kicker">LAJOO internal</span>
            <strong>24/7 insurance operations console</strong>
          </div>
          <div className="admin-account">
            <div className="admin-account-meta">
              <span>{session.name}</span>
              <strong>{roleLabel(session.role)}</strong>
            </div>
            <button className="admin-secondary-button" disabled={loggingOut} onClick={logout} type="button">
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
