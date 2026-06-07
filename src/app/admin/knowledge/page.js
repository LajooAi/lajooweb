import KnowledgeReviewClient from './KnowledgeReviewClient.jsx';
import './knowledge-admin.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'LAJOO Knowledge Review',
  robots: { index: false, follow: false },
};

export default function KnowledgeReviewPage() {
  return <KnowledgeReviewClient />;
}
