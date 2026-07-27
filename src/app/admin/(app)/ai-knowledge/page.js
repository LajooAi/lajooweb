import AdminDashboardClient from "../../_components/AdminDashboardClient.jsx";
import { getAiKnowledgeAdminData } from "@/server/admin/adminMockData.js";
import { ADMIN_PERMISSIONS } from "@/server/admin/adminRoles.js";
import { requireAdminPermission } from "@/server/admin/adminSession.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI & Knowledge",
};

export default async function AiKnowledgeAdminPage() {
  const session = await requireAdminPermission(ADMIN_PERMISSIONS.AI_KNOWLEDGE);
  return <AdminDashboardClient data={await getAiKnowledgeAdminData(session)} session={session} workspace="ai" />;
}
