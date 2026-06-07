'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const REVIEW_FILTER_OPTIONS = [
  { value: 'all', label: 'All sessions' },
  { value: 'unreviewed', label: 'Has unreviewed AI answers' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'wrong', label: 'Wrong answers' },
  { value: 'good', label: 'Good answers' },
];

const REVIEW_ACTIONS = [
  { value: 'good', label: 'Good' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'wrong', label: 'Wrong' },
];

function getStoredToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('lajoo_admin_token') || '';
}

function storeToken(token) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem('lajoo_admin_token', token);
  else window.localStorage.removeItem('lajoo_admin_token');
}

function buildQuery(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  try {
    return new Intl.DateTimeFormat('en-MY', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusLabel(value) {
  if (!value) return 'Unreviewed';
  return String(value).replace(/_/g, ' ');
}

function TokenPanel({ token, onUnlock, error }) {
  const [draftToken, setDraftToken] = useState(token || '');

  useEffect(() => {
    setDraftToken(token || '');
  }, [token]);

  return (
    <section className="conversation-token-panel">
      <h2>Admin access</h2>
      <p>Enter your `LAJOO_ADMIN_TOKEN` to review AI conversations and source traces.</p>
      <div className="conversation-token-row">
        <input
          value={draftToken}
          onChange={(event) => setDraftToken(event.target.value)}
          placeholder="Admin token"
          type="password"
        />
        <button type="button" onClick={() => onUnlock(draftToken)}>Unlock</button>
      </div>
      {error ? <p className="conversation-error-text">{error}</p> : null}
    </section>
  );
}

function SessionCard({ session, active, onSelect }) {
  const auditCounts = session.auditCounts || {};
  const hasRisk = Number(auditCounts.wrong || 0) > 0 || Number(auditCounts.needs_review || 0) > 0;
  return (
    <button
      type="button"
      className={`conversation-session-card${active ? ' conversation-session-card-active' : ''}`}
      onClick={() => onSelect(session.id)}
    >
      <span className="conversation-session-id">{session.id}</span>
      <span className="conversation-session-meta">
        {formatDateTime(session.updatedAt)} • {session.messageCount} messages
      </span>
      <span className="conversation-session-preview">{session.lastUserPreview || 'No user message preview'}</span>
      <span className="conversation-session-badges">
        <span>{session.sourcedAnswerCount} sourced</span>
        <span className={hasRisk ? 'conversation-badge-risk' : ''}>
          {Number(auditCounts.needs_review || 0) + Number(auditCounts.wrong || 0)} flagged
        </span>
      </span>
    </button>
  );
}

function SourceTrace({ trace }) {
  if (!trace?.traceId) {
    return (
      <div className="conversation-source-empty">
        No source trace stored for this AI answer.
      </div>
    );
  }

  return (
    <div className="conversation-source-trace">
      <div className="conversation-source-header">
        <strong>Source trace</strong>
        <span>{trace.sourceCount} source{trace.sourceCount === 1 ? '' : 's'} • {trace.traceId}</span>
      </div>
      {trace.questionPreview ? (
        <p className="conversation-source-question">
          <strong>Question:</strong> {trace.questionPreview}
        </p>
      ) : null}
      <div className="conversation-source-list">
        {(trace.sources || []).map((source, index) => (
          <div key={`${source.id || source.sourceLabel || index}-${index}`} className="conversation-source-item">
            <div>
              <strong>{source.insurerName || 'Unknown insurer'}</strong>
              <span>{source.category || source.factType || 'general'} • {source.validityStatus || 'validity unknown'}</span>
            </div>
            <p>{source.sourceLabel || source.sourceRelativePath || 'No source label'}</p>
            {source.statementPreview ? <blockquote>{source.statementPreview}</blockquote> : null}
          </div>
        ))}
      </div>
      {trace.recommendation?.insurerName ? (
        <div className="conversation-recommendation-trace">
          <strong>Recommendation trace:</strong> {trace.recommendation.insurerName}
          {(trace.recommendation.factReasons || []).length ? (
            <ul>
              {trace.recommendation.factReasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReviewControls({ message, token, note, setNote, onUpdated }) {
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const saveReview = async (auditStatus) => {
    setSaving(auditStatus || 'clear');
    setError('');
    try {
      const response = await fetch('/api/admin/conversations', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-lajoo-admin-token': token } : {}),
        },
        body: JSON.stringify({
          messageId: message.id,
          auditStatus,
          auditNote: note,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to save review.');
      onUpdated(payload.message);
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save review.');
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="conversation-review-controls">
      <div className="conversation-review-status-row">
        <span className={`conversation-review-status conversation-review-status-${message.auditStatus || 'unreviewed'}`}>
          {statusLabel(message.auditStatus)}
        </span>
        {message.auditedAt ? <span>Reviewed {formatDateTime(message.auditedAt)}</span> : null}
      </div>
      <textarea
        value={note}
        onChange={(event) => setNote(message.id, event.target.value)}
        placeholder="Optional internal note for this answer..."
        rows={2}
      />
      <div className="conversation-review-actions">
        {REVIEW_ACTIONS.map((action) => (
          <button
            key={action.value}
            type="button"
            className={`conversation-review-button conversation-review-button-${action.value}`}
            disabled={Boolean(saving)}
            onClick={() => saveReview(action.value)}
          >
            {saving === action.value ? 'Saving...' : action.label}
          </button>
        ))}
        <button
          type="button"
          className="conversation-review-button"
          disabled={Boolean(saving)}
          onClick={() => saveReview(null)}
        >
          {saving === 'clear' ? 'Clearing...' : 'Clear'}
        </button>
      </div>
      {error ? <p className="conversation-error-text">{error}</p> : null}
    </div>
  );
}

function MessageCard({ message, token, note, setNote, onUpdated }) {
  const isAssistant = message.role === 'assistant';
  return (
    <article className={`conversation-message conversation-message-${message.role}`}>
      <header>
        <strong>{isAssistant ? 'LAJOO AI' : 'User'}</strong>
        <span>{formatDateTime(message.createdAt)}</span>
      </header>
      {message.piiMasked ? <p className="conversation-pii-note">Sensitive personal data masked in admin view.</p> : null}
      <p className="conversation-message-content">{message.content || 'Empty message'}</p>
      {isAssistant ? <SourceTrace trace={message.knowledgeTrace} /> : null}
      {isAssistant ? (
        <ReviewControls
          message={message}
          token={token}
          note={note}
          setNote={setNote}
          onUpdated={onUpdated}
        />
      ) : null}
    </article>
  );
}

function EmptyState({ message }) {
  return (
    <div className="conversation-empty">
      <p>{message}</p>
    </div>
  );
}

export default function ConversationAuditClient() {
  const [token, setToken] = useState('');
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [needsToken, setNeedsToken] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [sessionsData, setSessionsData] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [reviewNotes, setReviewNotes] = useState({});
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 20,
    reviewStatus: 'all',
    query: '',
  });

  useEffect(() => {
    setToken(getStoredToken());
    setTokenLoaded(true);
  }, []);

  const loadSessions = useCallback(async (nextFilters = filters, nextToken = token) => {
    setLoadingSessions(true);
    setError('');
    try {
      const query = buildQuery(nextFilters);
      const response = await fetch(`/api/admin/conversations?${query}`, {
        headers: nextToken ? { 'x-lajoo-admin-token': nextToken } : {},
      });
      const payload = await response.json();
      if (response.status === 401) {
        setNeedsToken(true);
        throw new Error(payload?.error || 'Admin token required.');
      }
      if (!response.ok) throw new Error(payload?.error || 'Unable to load conversations.');
      setSessionsData(payload);
      setNeedsToken(false);
      setError('');
      storeToken(nextToken);
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load conversations.');
    } finally {
      setLoadingSessions(false);
    }
  }, [filters, token]);

  const loadSessionDetail = useCallback(async (sessionId, nextToken = token) => {
    if (!sessionId) return;
    setLoadingDetail(true);
    setError('');
    try {
      const query = buildQuery({ sessionId });
      const response = await fetch(`/api/admin/conversations?${query}`, {
        headers: nextToken ? { 'x-lajoo-admin-token': nextToken } : {},
      });
      const payload = await response.json();
      if (response.status === 401) {
        setNeedsToken(true);
        throw new Error(payload?.error || 'Admin token required.');
      }
      if (!response.ok) throw new Error(payload?.error || 'Unable to load conversation.');
      setSelectedSession(payload.session);
      setSelectedSessionId(payload.session.id);
      setReviewNotes(Object.fromEntries((payload.session.messages || []).map((message) => [
        message.id,
        message.auditNote || '',
      ])));
      setNeedsToken(false);
      setError('');
      storeToken(nextToken);
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load conversation.');
    } finally {
      setLoadingDetail(false);
    }
  }, [token]);

  useEffect(() => {
    if (!tokenLoaded) return;
    loadSessions(filters, token);
  }, [filters, token, tokenLoaded, loadSessions]);

  const updateFilter = (field, value) => {
    setFilters((current) => ({
      ...current,
      [field]: value,
      page: field === 'page' ? value : 1,
    }));
  };

  const updateReviewNote = (messageId, value) => {
    setReviewNotes((current) => ({ ...current, [messageId]: value }));
  };

  const replaceMessage = (updatedMessage) => {
    setSelectedSession((current) => {
      if (!current) return current;
      return {
        ...current,
        messages: current.messages.map((message) => message.id === updatedMessage.id ? updatedMessage : message),
      };
    });
    setReviewNotes((current) => ({ ...current, [updatedMessage.id]: updatedMessage.auditNote || '' }));
    loadSessions(filters, token);
  };

  const summary = useMemo(() => {
    const total = sessionsData?.total || 0;
    const totalPages = sessionsData?.totalPages || 1;
    return `${total.toLocaleString()} sessions • page ${filters.page} of ${totalPages}`;
  }, [sessionsData, filters.page]);

  return (
    <main className="conversation-admin-shell">
      <section className="conversation-admin-hero">
        <div>
          <p className="conversation-eyebrow">LAJOO Internal Admin</p>
          <h1>Conversation Audit</h1>
          <p>
            Review AI answers, inspect insurer source traces, and flag weak responses before
            they become repeated customer-facing mistakes.
          </p>
        </div>
        <a href="/admin/knowledge">Knowledge Review</a>
      </section>

      {needsToken ? (
        <TokenPanel
          token={token}
          error={error}
          onUnlock={(nextToken) => {
            setToken(nextToken);
            loadSessions(filters, nextToken);
          }}
        />
      ) : null}

      <section className="conversation-toolbar">
        <div className="conversation-filter">
          <label>Review filter</label>
          <select value={filters.reviewStatus} onChange={(event) => updateFilter('reviewStatus', event.target.value)}>
            {REVIEW_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="conversation-filter conversation-search">
          <label>Search</label>
          <input
            value={filters.query}
            onChange={(event) => updateFilter('query', event.target.value)}
            placeholder="session id, betterment, towing..."
          />
        </div>
        <button type="button" className="conversation-secondary-button" onClick={() => loadSessions(filters, token)}>
          Refresh
        </button>
      </section>

      <section className="conversation-layout">
        <aside className="conversation-session-list">
          <div className="conversation-list-header">
            <strong>{summary}</strong>
            <div className="conversation-pagination">
              <button
                type="button"
                className="conversation-secondary-button"
                disabled={filters.page <= 1}
                onClick={() => updateFilter('page', Math.max(1, Number(filters.page) - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="conversation-secondary-button"
                disabled={filters.page >= (sessionsData?.totalPages || 1)}
                onClick={() => updateFilter('page', Number(filters.page) + 1)}
              >
                Next
              </button>
            </div>
          </div>
          {loadingSessions ? <EmptyState message="Loading conversations..." /> : null}
          {!loadingSessions && error && !needsToken ? <EmptyState message={error} /> : null}
          {!loadingSessions && !error && (sessionsData?.sessions || []).length === 0 ? (
            <EmptyState message="No conversations match these filters." />
          ) : null}
          <div className="conversation-session-stack">
            {(sessionsData?.sessions || []).map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                active={selectedSessionId === session.id}
                onSelect={(sessionId) => loadSessionDetail(sessionId, token)}
              />
            ))}
          </div>
        </aside>

        <section className="conversation-detail">
          {!selectedSession && !loadingDetail ? (
            <EmptyState message="Select a conversation to review its AI answers and sources." />
          ) : null}
          {loadingDetail ? <EmptyState message="Loading selected conversation..." /> : null}
          {selectedSession && !loadingDetail ? (
            <>
              <header className="conversation-detail-header">
                <div>
                  <span>Session</span>
                  <h2>{selectedSession.id}</h2>
                  <p>
                    Updated {formatDateTime(selectedSession.updatedAt)} •
                    {' '}{selectedSession.sourcedAnswerCount} sourced AI answer{selectedSession.sourcedAnswerCount === 1 ? '' : 's'}
                  </p>
                </div>
                <button type="button" className="conversation-secondary-button" onClick={() => loadSessionDetail(selectedSession.id, token)}>
                  Reload
                </button>
              </header>
              <div className="conversation-message-stack">
                {(selectedSession.messages || []).map((message) => (
                  <MessageCard
                    key={message.id}
                    message={message}
                    token={token}
                    note={reviewNotes[message.id] || ''}
                    setNote={updateReviewNote}
                    onUpdated={replaceMessage}
                  />
                ))}
              </div>
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}
