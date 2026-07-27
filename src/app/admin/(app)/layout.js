import AdminShell from "../_components/AdminShell.jsx";
import { requireAdminSession } from "@/server/admin/adminSession.js";
import { getAdminNavigationForRole } from "@/server/admin/adminRoles.js";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({ children }) {
  const session = await requireAdminSession();
  const navigation = getAdminNavigationForRole(session.role);

  return (
    <AdminShell navigation={navigation} session={session}>
      {children}
    </AdminShell>
  );
}
