import ConversationAuditClient from './ConversationAuditClient.jsx';
import './conversation-admin.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'LAJOO Conversation Audit',
  robots: { index: false, follow: false },
};

export default function ConversationAuditPage() {
  return <ConversationAuditClient />;
}
