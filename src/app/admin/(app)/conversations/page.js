import ConversationAuditClient from "../../conversations/ConversationAuditClient.jsx";
import "../../conversations/conversation-admin.css";
import { ADMIN_PERMISSIONS } from "@/server/admin/adminRoles.js";
import { requireAdminPermission } from "@/server/admin/adminSession.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Conversation Audit",
};

export default async function ConversationAuditPage() {
  await requireAdminPermission(ADMIN_PERMISSIONS.CONVERSATION_AUDIT);
  return <ConversationAuditClient />;
}
