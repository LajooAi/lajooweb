'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const STATUS_OPTIONS = ['ALL', 'VERIFIED', 'DRAFT', 'ARCHIVED'];
const CONFIDENCE_OPTIONS = ['low', 'medium', 'high'];
const VALIDITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All validity' },
  { value: 'undated', label: 'Undated' },
  { value: 'active', label: 'Active dated' },
  { value: 'expired', label: 'Expired' },
  { value: 'future', label: 'Future' },
];
const REVIEW_QUEUE_OPTIONS = [
  { value: 'all', label: 'All review queues' },
  { value: 'priority', label: 'Priority dating queue' },
  { value: 'needs_dates', label: 'Needs dates' },
  { value: 'critical', label: 'Expired / future' },
  { value: 'high_impact', label: 'High-impact topics' },
  { value: 'brand_program', label: 'Brand-program review' },
];
const VALIDITY_LABELS = {
  active: 'Active',
  undated: 'Undated',
  expired: 'Expired',
  not_yet_effective: 'Future',
};
const REVIEW_PRIORITY_LABELS = {
  normal: 'Normal review',
  high: 'High priority',
  critical: 'Critical review',
};

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

function tagsToInput(tags = []) {
  return Array.isArray(tags) ? tags.join(', ') : '';
}

function createDraft(fact) {
  return {
    title: fact.title || '',
    value: fact.value || '',
    advisorUse: fact.advisorUse || '',
    category: fact.category || '',
    tags: tagsToInput(fact.tags),
    confidence: fact.confidence || 'medium',
    status: fact.status || 'DRAFT',
    validFrom: fact.validFrom || '',
    validTo: fact.validTo || '',
  };
}

function createDocumentDraft(fact) {
  return {
    versionLabel: fact.policyDocumentVersionLabel || '',
    effectiveFrom: fact.policyDocumentEffectiveFrom || '',
    effectiveTo: fact.policyDocumentEffectiveTo || '',
  };
}

function EmptyState({ message }) {
  return (
    <div className="knowledge-empty">
      <p>{message}</p>
    </div>
  );
}

function TokenPanel({ token, onUnlock, error }) {
  const [draftToken, setDraftToken] = useState(token || '');

  useEffect(() => {
    setDraftToken(token || '');
  }, [token]);

  return (
    <section className="knowledge-token-panel">
      <h2>Admin access</h2>
      <p>
        Enter your `LAJOO_ADMIN_TOKEN` to review or edit insurer facts. In local development,
        this may be optional if no token is configured.
      </p>
      <div className="knowledge-token-row">
        <input
          value={draftToken}
          onChange={(event) => setDraftToken(event.target.value)}
          placeholder="Admin token"
          type="password"
        />
        <button type="button" onClick={() => onUnlock(draftToken)}>Unlock</button>
      </div>
      {error ? <p className="knowledge-error-text">{error}</p> : null}
    </section>
  );
}

function FactEditor({ fact, draft, setDraft, onCancel, onSave, saving }) {
  const updateDraft = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  return (
    <div className="knowledge-editor">
      <label>
        <span>Title</span>
        <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} />
      </label>
      <label>
        <span>AI-safe fact statement</span>
        <textarea value={draft.value} onChange={(event) => updateDraft('value', event.target.value)} rows={4} />
      </label>
      <label>
        <span>Advisor use</span>
        <textarea value={draft.advisorUse} onChange={(event) => updateDraft('advisorUse', event.target.value)} rows={4} />
      </label>
      <div className="knowledge-editor-grid">
        <label>
          <span>Category</span>
          <input value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} />
        </label>
        <label>
          <span>Tags</span>
          <input value={draft.tags} onChange={(event) => updateDraft('tags', event.target.value)} />
        </label>
        <label>
          <span>Confidence</span>
          <select value={draft.confidence} onChange={(event) => updateDraft('confidence', event.target.value)}>
            {CONFIDENCE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={draft.status} onChange={(event) => updateDraft('status', event.target.value)}>
            <option value="VERIFIED">VERIFIED</option>
            <option value="DRAFT">DRAFT</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </label>
        <label>
          <span>Effective from</span>
          <input value={draft.validFrom} onChange={(event) => updateDraft('validFrom', event.target.value)} type="date" />
        </label>
        <label>
          <span>Effective to</span>
          <input value={draft.validTo} onChange={(event) => updateDraft('validTo', event.target.value)} type="date" />
        </label>
      </div>
      <div className="knowledge-editor-source">
        <strong>Source:</strong> {fact.sourceLabel || fact.sourceRelativePath || 'No source file'}
        <br />
        <span>Fact dates control whether this fact can be used by LAJOO AI.</span>
      </div>
      <div className="knowledge-editor-actions">
        <button type="button" className="knowledge-secondary-button" onClick={onCancel}>Cancel</button>
        <button type="button" className="knowledge-primary-button" onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save fact'}
        </button>
      </div>
    </div>
  );
}

function DocumentValidityEditor({ fact, draft, setDraft, applyToFacts, setApplyToFacts, onSave, saving }) {
  if (!fact.policyDocumentId) {
    return (
      <div className="knowledge-document-panel knowledge-document-panel-muted">
        <strong>No linked PDF document</strong>
        <p>This fact can still be edited directly, but document-level date approval is not available.</p>
      </div>
    );
  }

  const updateDraft = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const factCount = Number(fact.policyDocumentFactCount || 0);

  return (
    <div className="knowledge-document-panel">
      <div className="knowledge-document-panel-header">
        <div>
          <strong>PDF document validity</strong>
          <p>{fact.policyDocumentSourceRelativePath || fact.sourceRelativePath || fact.policyDocumentTitle || 'Linked source PDF'}</p>
        </div>
        <span>{factCount.toLocaleString()} linked fact{factCount === 1 ? '' : 's'}</span>
      </div>
      <div className="knowledge-document-grid">
        <label>
          <span>Version label</span>
          <input
            value={draft.versionLabel}
            onChange={(event) => updateDraft('versionLabel', event.target.value)}
            placeholder="e.g. PDS/12/2025"
          />
        </label>
        <label>
          <span>Document effective from</span>
          <input
            value={draft.effectiveFrom}
            onChange={(event) => updateDraft('effectiveFrom', event.target.value)}
            type="date"
          />
        </label>
        <label>
          <span>Document effective to</span>
          <input
            value={draft.effectiveTo}
            onChange={(event) => updateDraft('effectiveTo', event.target.value)}
            type="date"
          />
        </label>
      </div>
      <label className="knowledge-checkbox-row">
        <input
          type="checkbox"
          checked={applyToFacts}
          onChange={(event) => setApplyToFacts(event.target.checked)}
        />
        <span>Apply these document dates to all facts extracted from this PDF.</span>
      </label>
      <div className="knowledge-document-actions">
        <button type="button" className="knowledge-primary-button" onClick={onSave} disabled={saving}>
          {saving ? 'Saving document...' : 'Save document dates'}
        </button>
      </div>
    </div>
  );
}

function FactCard({ fact, onUpdate, onRefresh, token }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => createDraft(fact));
  const [documentDraft, setDocumentDraft] = useState(() => createDocumentDraft(fact));
  const [applyDocumentDates, setApplyDocumentDates] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);
  const [error, setError] = useState('');
  const [documentMessage, setDocumentMessage] = useState('');

  useEffect(() => {
    setDraft(createDraft(fact));
    setDocumentDraft(createDocumentDraft(fact));
    setDocumentMessage('');
  }, [fact]);

  const saveUpdates = async (updates = null) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/knowledge/facts', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-lajoo-admin-token': token } : {}),
        },
        body: JSON.stringify({
          id: fact.id,
          updates: updates || {
            ...draft,
            tags: draft.tags,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to save fact.');
      onUpdate(payload.fact);
      setEditing(false);
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save fact.');
    } finally {
      setSaving(false);
    }
  };

  const saveDocumentUpdates = async () => {
    if (!fact.policyDocumentId) return;
    setSavingDocument(true);
    setError('');
    setDocumentMessage('');
    try {
      const response = await fetch('/api/admin/knowledge/facts', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-lajoo-admin-token': token } : {}),
        },
        body: JSON.stringify({
          action: 'updateDocumentValidity',
          documentId: fact.policyDocumentId,
          applyToFacts: applyDocumentDates,
          updates: documentDraft,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to save document dates.');
      const affected = Number(payload?.affectedFacts || 0);
      setDocumentMessage(applyDocumentDates
        ? `Document saved. ${affected.toLocaleString()} linked fact${affected === 1 ? '' : 's'} updated.`
        : 'Document saved.');
      onRefresh();
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save document dates.');
    } finally {
      setSavingDocument(false);
    }
  };

  const statusClass = `knowledge-status knowledge-status-${String(fact.status || '').toLowerCase()}`;
  const validityClass = `knowledge-validity knowledge-validity-${String(fact.validityStatus || 'unknown').replace(/_/g, '-')}`;
  const validityLabel = VALIDITY_LABELS[fact.validityStatus] || 'Unknown';
  const reviewPriority = fact.reviewPriority || 'normal';
  const reviewPriorityClass = `knowledge-review-priority knowledge-review-priority-${reviewPriority}`;
  const reviewPriorityLabel = REVIEW_PRIORITY_LABELS[reviewPriority] || REVIEW_PRIORITY_LABELS.normal;

  return (
    <article className="knowledge-fact-card">
      <header className="knowledge-fact-header">
        <div>
          <div className="knowledge-fact-meta">
            <span>{fact.insurerCode}</span>
            <span>{fact.factType}</span>
            <span>{fact.category || 'uncategorized'}</span>
          </div>
          <h3>{fact.title}</h3>
        </div>
        <div className="knowledge-fact-badges">
          <span className={statusClass}>{fact.status}</span>
          <span className={validityClass}>{validityLabel}</span>
          {reviewPriority !== 'normal' ? <span className={reviewPriorityClass}>{reviewPriorityLabel}</span> : null}
          {fact.usableForAi ? (
            <span className="knowledge-ai-usable">AI usable</span>
          ) : (
            <span className="knowledge-ai-blocked">AI blocked</span>
          )}
        </div>
      </header>

      {editing ? (
        <FactEditor
          fact={fact}
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          onCancel={() => {
            setEditing(false);
            setDraft(createDraft(fact));
          }}
          onSave={() => saveUpdates()}
        />
      ) : (
        <>
          <p className="knowledge-fact-value">{fact.value}</p>
          {fact.needsReview ? (
            <div className="knowledge-review-alert">
              <strong>Review needed:</strong> {(fact.reviewReasons || []).join(' ')}
            </div>
          ) : null}
          {reviewPriority !== 'normal' ? (
            <div className={`knowledge-priority-alert knowledge-priority-alert-${reviewPriority}`}>
              <strong>{reviewPriorityLabel}:</strong> {fact.reviewTopicLabel || 'High-impact insurance topic'}.
              {' '}{(fact.reviewPriorityReasons || []).slice(0, 2).join(' ')}
            </div>
          ) : null}
          {fact.advisorUse ? <p className="knowledge-advisor-use">{fact.advisorUse}</p> : null}
          <div className="knowledge-tags">
            {(fact.tags || []).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <button type="button" className="knowledge-link-button" onClick={() => setExpanded((current) => !current)}>
            {expanded ? 'Hide evidence' : 'Show evidence'}
          </button>
          {expanded ? (
            <div className="knowledge-evidence">
              <p><strong>Source:</strong> {fact.sourceLabel || 'Not available'}</p>
              <p><strong>Source file:</strong> {fact.sourceRelativePath || 'Not available'}</p>
              <p><strong>Source page:</strong> {fact.sourcePage || 'Not captured'}</p>
              <p><strong>Policy document:</strong> {fact.policyDocumentTitle || 'Not available'}</p>
              <p><strong>Document type:</strong> {fact.policyDocumentType || 'Not available'} • {fact.policyDocumentLanguage || 'language unknown'}</p>
              <p><strong>Document version:</strong> {fact.policyDocumentVersionLabel || 'Not set'}</p>
              <p><strong>Document effective:</strong> {fact.policyDocumentEffectiveFrom || 'Not set'} to {fact.policyDocumentEffectiveTo || 'Not set'}</p>
              <p><strong>Confidence:</strong> {fact.confidence || 'medium'}</p>
              <p><strong>Validity:</strong> {validityLabel} • AI use: {fact.usableForAi ? 'allowed' : 'blocked'}</p>
              <p><strong>Review priority:</strong> {reviewPriorityLabel} • {fact.reviewTopicLabel || 'No high-impact topic detected'}</p>
              <p><strong>Fact effective:</strong> {fact.validFrom || 'Not set'} to {fact.validTo || 'Not set'}</p>
              <p><strong>Updated:</strong> {formatDateTime(fact.updatedAt)}</p>
              {fact.sourceExcerpt ? (
                <blockquote>{fact.sourceExcerpt}</blockquote>
              ) : (
                <p>No source excerpt stored yet.</p>
              )}
              <DocumentValidityEditor
                fact={fact}
                draft={documentDraft}
                setDraft={setDocumentDraft}
                applyToFacts={applyDocumentDates}
                setApplyToFacts={setApplyDocumentDates}
                saving={savingDocument}
                onSave={saveDocumentUpdates}
              />
              {documentMessage ? <p className="knowledge-success-text">{documentMessage}</p> : null}
            </div>
          ) : null}
          <div className="knowledge-card-actions">
            <button type="button" className="knowledge-secondary-button" onClick={() => setEditing(true)}>Edit</button>
            {fact.status !== 'VERIFIED' ? (
              <button type="button" className="knowledge-primary-button" disabled={saving} onClick={() => saveUpdates({ status: 'VERIFIED' })}>
                Verify
              </button>
            ) : null}
            {fact.status !== 'ARCHIVED' ? (
              <button type="button" className="knowledge-danger-button" disabled={saving} onClick={() => saveUpdates({ status: 'ARCHIVED' })}>
                Archive
              </button>
            ) : null}
            {fact.status === 'ARCHIVED' ? (
              <button type="button" className="knowledge-secondary-button" disabled={saving} onClick={() => saveUpdates({ status: 'DRAFT' })}>
                Restore to draft
              </button>
            ) : null}
          </div>
          {error ? <p className="knowledge-error-text">{error}</p> : null}
        </>
      )}
    </article>
  );
}

export default function KnowledgeReviewClient() {
  const [token, setToken] = useState('');
  const [needsToken, setNeedsToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 30,
    status: 'VERIFIED',
    insurerCode: 'ALL',
    category: 'all',
    factType: 'ALL',
    validity: 'all',
    reviewQueue: 'all',
    query: '',
  });

  useEffect(() => {
    setToken(getStoredToken());
  }, []);

  const loadFacts = useCallback(async (nextFilters = filters, nextToken = token) => {
    setLoading(true);
    setError('');
    try {
      const query = buildQuery(nextFilters);
      const response = await fetch(`/api/admin/knowledge/facts?${query}`, {
        headers: nextToken ? { 'x-lajoo-admin-token': nextToken } : {},
      });
      const payload = await response.json();
      if (response.status === 401) {
        setNeedsToken(true);
        throw new Error(payload?.error || 'Admin token required.');
      }
      if (!response.ok) throw new Error(payload?.error || 'Unable to load facts.');
      setData(payload);
      setNeedsToken(false);
      storeToken(nextToken);
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load facts.');
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

  useEffect(() => {
    loadFacts(filters, token);
  }, [filters, token, loadFacts]);

  const updateFilter = (field, value) => {
    setFilters((current) => ({
      ...current,
      [field]: value,
      page: field === 'page' ? value : 1,
    }));
  };

  const replaceFact = (updatedFact) => {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        facts: current.facts.map((fact) => fact.id === updatedFact.id ? updatedFact : fact),
      };
    });
  };

  const summary = useMemo(() => {
    const total = data?.total || 0;
    const totalPages = data?.totalPages || 1;
    return `${total.toLocaleString()} facts • page ${filters.page} of ${totalPages}`;
  }, [data, filters.page]);

  const validitySummary = data?.filters?.validitySummary || {};
  const reviewQueueSummary = data?.filters?.reviewQueueSummary || {};

  return (
    <main className="knowledge-admin-shell">
      <section className="knowledge-admin-hero">
        <p className="knowledge-eyebrow">LAJOO Internal Admin</p>
        <h1>Knowledge Review</h1>
        <p>
          Review the verified insurer facts that LAJOO uses for answers and recommendations.
          Keep every fact source-bound, cautious, and safe for Malaysian motor insurance users.
        </p>
      </section>

      {needsToken ? (
        <TokenPanel
          token={token}
          error={error}
          onUnlock={(nextToken) => {
            setToken(nextToken);
            loadFacts(filters, nextToken);
          }}
        />
      ) : null}

      <section className="knowledge-toolbar">
        <div className="knowledge-filter">
          <label>Status</label>
          <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <div className="knowledge-filter">
          <label>Insurer</label>
          <select value={filters.insurerCode} onChange={(event) => updateFilter('insurerCode', event.target.value)}>
            <option value="ALL">All insurers</option>
            {(data?.filters?.insurers || []).map((insurer) => (
              <option key={insurer.code} value={insurer.code}>{insurer.code} • {insurer.name}</option>
            ))}
          </select>
        </div>
        <div className="knowledge-filter">
          <label>Category</label>
          <select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}>
            <option value="all">All categories</option>
            {(data?.filters?.categories || []).map((row) => (
              <option key={row.category} value={row.category}>{row.category} ({row.count})</option>
            ))}
          </select>
        </div>
        <div className="knowledge-filter">
          <label>Fact type</label>
          <select value={filters.factType} onChange={(event) => updateFilter('factType', event.target.value)}>
            <option value="ALL">All types</option>
            {(data?.filters?.factTypes || []).map((row) => (
              <option key={row.factType} value={row.factType}>{row.factType} ({row.count})</option>
            ))}
          </select>
        </div>
        <div className="knowledge-filter">
          <label>Validity</label>
          <select value={filters.validity} onChange={(event) => updateFilter('validity', event.target.value)}>
            {VALIDITY_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="knowledge-filter">
          <label>Review queue</label>
          <select value={filters.reviewQueue} onChange={(event) => updateFilter('reviewQueue', event.target.value)}>
            {REVIEW_QUEUE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="knowledge-filter knowledge-search">
          <label>Search</label>
          <input
            value={filters.query}
            onChange={(event) => updateFilter('query', event.target.value)}
            placeholder="betterment, towing, flood..."
          />
        </div>
        <button type="button" className="knowledge-secondary-button" onClick={() => loadFacts(filters, token)}>
          Refresh
        </button>
      </section>

      <section className="knowledge-list-header">
        <div>
          <strong>{summary}</strong>
          <span>
            Only VERIFIED facts should influence production AI advice.
            {' '}
            Active: {(validitySummary.active || 0).toLocaleString()} •
            {' '}Undated: {(validitySummary.undated || 0).toLocaleString()} •
            {' '}Expired: {(validitySummary.expired || 0).toLocaleString()} •
            {' '}Future: {(validitySummary.future || 0).toLocaleString()}
          </span>
          <span>
            Priority queue: {(reviewQueueSummary.priority || 0).toLocaleString()} •
            {' '}Needs dates: {(reviewQueueSummary.needsDates || 0).toLocaleString()} •
            {' '}Critical: {(reviewQueueSummary.critical || 0).toLocaleString()} •
            {' '}High-impact: {(reviewQueueSummary.highImpact || 0).toLocaleString()} •
            {' '}Brand-program: {(reviewQueueSummary.brandProgram || 0).toLocaleString()}
          </span>
        </div>
        <div className="knowledge-pagination">
          <button
            type="button"
            className="knowledge-secondary-button"
            disabled={filters.page <= 1}
            onClick={() => updateFilter('page', Math.max(1, Number(filters.page) - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className="knowledge-secondary-button"
            disabled={filters.page >= (data?.totalPages || 1)}
            onClick={() => updateFilter('page', Number(filters.page) + 1)}
          >
            Next
          </button>
        </div>
      </section>

      {loading ? <EmptyState message="Loading insurer facts..." /> : null}
      {!loading && error && !needsToken ? <EmptyState message={error} /> : null}
      {!loading && !error && data?.facts?.length === 0 ? <EmptyState message="No facts match these filters." /> : null}

      <section className="knowledge-fact-list">
        {(data?.facts || []).map((fact) => (
          <FactCard key={fact.id} fact={fact} token={token} onUpdate={replaceFact} onRefresh={() => loadFacts(filters, token)} />
        ))}
      </section>
    </main>
  );
}
