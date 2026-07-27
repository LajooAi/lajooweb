import InviteSetupForm from "./InviteSetupForm.jsx";
import { getPersistedAdminInviteByToken } from "@/server/admin/adminPersistence.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Invite Setup",
};

export default async function AdminInviteSetupPage({ params }) {
  const { token } = await params;
  let inviteState;

  try {
    inviteState = await getPersistedAdminInviteByToken(token);
  } catch {
    inviteState = { valid: false, reason: "unavailable" };
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-panel" aria-labelledby="admin-invite-title">
        <div className="admin-login-brand">
          <span className="admin-brand-mark">LAJOO</span>
          <span>Admin Operating System</span>
        </div>
        <div className="admin-login-copy">
          <p className="admin-eyebrow">Admin invite</p>
          <h1 id="admin-invite-title">Set up admin access</h1>
          {inviteState.valid ? (
            <p>
              Invite for {inviteState.invite.name} as {inviteState.invite.role.replace(/_/g, " ")}.
              This link expires on {new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(inviteState.invite.expiresAt))}.
            </p>
          ) : (
            <p>This invite link is invalid, expired, already used, or unavailable. Ask a founder to issue a new invite.</p>
          )}
        </div>
        {inviteState.valid ? (
          <InviteSetupForm token={token} />
        ) : (
          <div className="admin-login-warning" role="alert">
            Invite status: <code>{inviteState.reason || "invalid"}</code>
          </div>
        )}
      </section>
    </main>
  );
}
