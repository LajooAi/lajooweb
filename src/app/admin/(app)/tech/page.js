import AdminDashboardClient from "../../_components/AdminDashboardClient.jsx";
import { getTechAdminData } from "@/server/admin/adminMockData.js";
import { ADMIN_PERMISSIONS } from "@/server/admin/adminRoles.js";
import { requireAdminPermission } from "@/server/admin/adminSession.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tech Logs",
};

export default async function TechAdminPage() {
  const session = await requireAdminPermission(ADMIN_PERMISSIONS.TECH_ADMIN);
  return <AdminDashboardClient data={await getTechAdminData()} session={session} workspace="tech" />;
}
