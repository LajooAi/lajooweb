import KnowledgeReviewClient from "../../knowledge/KnowledgeReviewClient.jsx";
import "../../knowledge/knowledge-admin.css";
import { ADMIN_PERMISSIONS } from "@/server/admin/adminRoles.js";
import { requireAdminPermission } from "@/server/admin/adminSession.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Knowledge Facts",
};

export default async function KnowledgeReviewPage() {
  await requireAdminPermission(ADMIN_PERMISSIONS.KNOWLEDGE_ADMIN);
  return <KnowledgeReviewClient />;
}
