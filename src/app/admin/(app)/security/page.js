import AdminDashboardClient from "../../_components/AdminDashboardClient.jsx";
import { getSecurityAccessAdminData } from "@/server/admin/adminMockData.js";
import { ADMIN_PERMISSIONS } from "@/server/admin/adminRoles.js";
import { requireAdminPermission } from "@/server/admin/adminSession.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Security & Access",
};

export default async function SecurityAccessAdminPage() {
  const session = await requireAdminPermission(ADMIN_PERMISSIONS.SECURITY_ACCESS);
  return <AdminDashboardClient data={await getSecurityAccessAdminData(session)} session={session} workspace="security" />;
}
