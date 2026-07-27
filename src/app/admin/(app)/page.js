import AdminDashboardClient from "../_components/AdminDashboardClient.jsx";
import { getBusinessAdminData } from "@/server/admin/adminMockData.js";
import { ADMIN_PERMISSIONS } from "@/server/admin/adminRoles.js";
import { requireAdminPermission } from "@/server/admin/adminSession.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Business Admin",
};

export default async function BusinessAdminPage() {
  const session = await requireAdminPermission(ADMIN_PERMISSIONS.BUSINESS_ADMIN);
  return <AdminDashboardClient data={await getBusinessAdminData(session)} session={session} workspace="business" />;
}
