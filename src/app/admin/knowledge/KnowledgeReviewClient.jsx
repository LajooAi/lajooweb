'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const STATUS_OPTIONS = ['ALL', 'VERIFIED', 'DRAFT', 'ARCHIVED'];
const CONFIDENCE_OPTIONS = ['low', 'medium', 'high'];

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
        <strong>Source:</strong> {fact.sourceRelativePath || 'No source file'}
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

function FactCard({ fact, onUpdate, token }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => createDraft(fact));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(createDraft(fact));
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

  const statusClass = `knowledge-status knowledge-status-${String(fact.status || '').toLowerCase()}`;

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
        <span className={statusClass}>{fact.status}</span>
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
          {fact.advisorUse ? <p className="knowledge-advisor-use">{fact.advisorUse}</p> : null}
          <div className="knowledge-tags">
            {(fact.tags || []).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <button type="button" className="knowledge-link-button" onClick={() => setExpanded((current) => !current)}>
            {expanded ? 'Hide evidence' : 'Show evidence'}
          </button>
          {expanded ? (
            <div className="knowledge-evidence">
              <p><strong>Source file:</strong> {fact.sourceRelativePath || 'Not available'}</p>
              <p><strong>Policy document:</strong> {fact.policyDocumentTitle || 'Not available'}</p>
              <p><strong>Confidence:</strong> {fact.confidence || 'medium'}</p>
              <p><strong>Effective:</strong> {fact.validFrom || 'Not set'} to {fact.validTo || 'Not set'}</p>
              <p><strong>Updated:</strong> {formatDateTime(fact.updatedAt)}</p>
              {fact.sourceExcerpt ? (
                <blockquote>{fact.sourceExcerpt}</blockquote>
              ) : (
                <p>No source excerpt stored yet.</p>
              )}
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
          <span>Only VERIFIED facts should influence production AI advice.</span>
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
          <FactCard key={fact.id} fact={fact} token={token} onUpdate={replaceFact} />
        ))}
      </section>
    </main>
  );
}
