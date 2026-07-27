"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPermissionLabel } from "@/lib/admin/piiMasking.js";

const REVEAL_PERMISSION = "reveal_pii";
const ADMIN_ROLES = ["founder", "ops", "ai_qa", "engineer", "compliance", "agent_manager"];

function hasPermission(session, permission) {
  return Array.isArray(session?.permissions) && session.permissions.includes(permission);
}

function canExport(session) {
  return session?.role === "founder";
}

function canReviewExports(session) {
  return ["founder", "compliance"].includes(session?.role);
}

function canRecoverMfa(session) {
  return ["founder", "compliance"].includes(session?.role);
}

function canRetryScheduledJob(session, attempt) {
  if (!["founder", "compliance", "engineer"].includes(session?.role)) return false;
  if (!["failed", "partial"].includes(attempt?.status)) return false;
  if (!["notification_digest", "mfa_recovery_sla", "webhook_monitoring"].includes(attempt?.jobKind)) return false;
  if (session?.role === "engineer") return attempt?.jobKind === "webhook_monitoring";
  return true;
}

function canManageCronAlert(session) {
  return ["founder", "compliance", "engineer"].includes(session?.role);
}

function canManagePaymentOps(session) {
  return ["founder", "ops"].includes(session?.role);
}

function canManageComplianceGate(session) {
  return ["founder", "compliance"].includes(session?.role);
}

function canManageCustomerLaunchQa(session) {
  return ["founder", "ops", "compliance"].includes(session?.role);
}

function canManageCustomerLaunchQaItem(session, item = {}) {
  if (canManageCustomerLaunchQa(session)) return true;
  return session?.role === "ai_qa" && (item.category === "stuck_flow" || item.itemKey === "customer_side_questions");
}

function canManageRenewalOps(session) {
  return ["founder", "ops"].includes(session?.role);
}

function canVerifyPolicyDocuments(session) {
  return ["founder", "ops", "compliance"].includes(session?.role);
}

function formatDateTime(value) {
  if (!value) return "Not active";
  try {
    return new Intl.DateTimeFormat("en-MY", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function titleCase(value = "") {
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoney(value, currency = "MYR") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Not captured";
  if (String(currency).toUpperCase() === "MYR") return `RM ${number.toFixed(2)}`;
  return `${String(currency).toUpperCase()} ${number.toFixed(2)}`;
}

function MetricGrid({ metrics }) {
  return (
    <section className="admin-metric-grid" aria-label="Workspace metrics">
      {metrics.map((metric) => (
        <article className={`admin-metric-card admin-tone-${metric.tone}`} key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <small>{metric.detail}</small>
        </article>
      ))}
    </section>
  );
}

function StatusBadge({ value }) {
  const normalized = String(value || "unknown").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return <span className={`admin-status admin-status-${normalized}`}>{titleCase(value)}</span>;
}

function SectionHeader({ eyebrow, title, detail, action }) {
  return (
    <div className="admin-section-header">
      <div>
        <p className="admin-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

function AuditLogTable({ logs, onInspect }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Action</th>
            <th scope="col">Actor</th>
            <th scope="col">Target</th>
            <th scope="col">Reason</th>
            <th scope="col">Status</th>
            <th scope="col">Review</th>
            {onInspect ? <th scope="col">Details</th> : null}
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{formatDateTime(log.createdAt)}</td>
              <td>{titleCase(log.action)}</td>
              <td>
                <strong>{log.actorEmail}</strong>
                <small>{titleCase(log.actorRole)}</small>
              </td>
              <td>
                <strong>{log.targetId}</strong>
                <small>{titleCase(log.field)}</small>
              </td>
              <td>{log.reason}</td>
              <td><StatusBadge value={log.status} /></td>
              <td>
                <StatusBadge value={log.reviewStatus || "unreviewed"} />
                {log.priority ? <StatusBadge value={log.priority} /> : null}
                {log.escalationStatus && log.escalationStatus !== "none" ? <StatusBadge value={`escalated_${log.escalationStatus}`} /> : null}
                {log.assignedToEmail ? <small>Assigned {log.assignedToEmail}</small> : null}
                {log.assignmentDueAt ? <small>Due {formatDateTime(log.assignmentDueAt)}</small> : null}
                {log.escalationReason ? <small>{log.escalationReason}</small> : null}
                {log.reviewedAt ? <small>{formatDateTime(log.reviewedAt)}</small> : null}
              </td>
              {onInspect ? (
                <td>
                  <button className="admin-inline-button" onClick={() => onInspect(log)} type="button">
                    Review
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditReviewModal({ actions, log, onClose, teamMembers = [] }) {
  const [reviewStatus, setReviewStatus] = useState(log?.reviewStatus || "reviewed");
  const [reviewNote, setReviewNote] = useState(log?.reviewNote || "");
  const [assignedToUserId, setAssignedToUserId] = useState(log?.assignedToUserId || "unassigned");
  const [priority, setPriority] = useState(log?.priority || "normal");
  const [escalationStatus, setEscalationStatus] = useState(log?.escalationStatus || "none");
  const [assignmentDueAt, setAssignmentDueAt] = useState(formatDateTimeInput(log?.assignmentDueAt));
  const [escalationReason, setEscalationReason] = useState(log?.escalationReason || "");

  if (!log) return null;

  async function submitReview(event) {
    event.preventDefault();
    const result = await actions.runAdminMutation({
      endpoint: "/api/admin/audit",
      method: "PATCH",
      body: {
        auditLogId: log.id,
        reviewStatus,
        reviewNote,
        assignedToUserId,
        priority,
        escalationStatus,
        assignmentDueAt: assignmentDueAt ? new Date(assignmentDueAt).toISOString() : null,
        escalationReason,
      },
      successMessage: "Audit review saved.",
    });
    if (result?.log) onClose();
  }

  return (
    <div className="admin-modal-backdrop" role="presentation">
      <section className="admin-modal admin-modal-wide" aria-labelledby="admin-audit-review-title" role="dialog" aria-modal="true">
        <div className="admin-modal-header">
          <div>
            <p className="admin-eyebrow">Audit review</p>
            <h2 id="admin-audit-review-title">{titleCase(log.action)}</h2>
          </div>
          <button className="admin-icon-button" onClick={onClose} type="button" aria-label="Close">x</button>
        </div>
        <div className="admin-detail-grid">
          <div><span>Actor</span><strong>{log.actorEmail}</strong><small>{titleCase(log.actorRole)}</small></div>
          <div><span>Target</span><strong>{log.targetId}</strong><small>{titleCase(log.targetType)} - {titleCase(log.field)}</small></div>
          <div><span>Status</span><StatusBadge value={log.status} /></div>
          <div><span>Time</span><strong>{formatDateTime(log.createdAt)}</strong></div>
          <div className="admin-detail-wide"><span>Reason</span><p>{log.reason}</p></div>
          <div className="admin-detail-wide">
            <span>Metadata</span>
            <pre className="admin-metadata-block">{JSON.stringify(log.metadata || {}, null, 2)}</pre>
          </div>
        </div>
        <form className="admin-inline-form admin-inline-form-compact" onSubmit={submitReview}>
          <label>
            <span>Review status</span>
            <select onChange={(event) => setReviewStatus(event.target.value)} value={reviewStatus}>
              <option value="reviewed">Reviewed</option>
              <option value="needs_follow_up">Needs follow-up</option>
              <option value="unreviewed">Unreviewed</option>
            </select>
          </label>
          <label>
            <span>Assignee</span>
            <select onChange={(event) => setAssignedToUserId(event.target.value)} value={assignedToUserId}>
              <option value="unassigned">Unassigned</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select onChange={(event) => setPriority(event.target.value)} value={priority}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label>
            <span>Escalation</span>
            <select onChange={(event) => setEscalationStatus(event.target.value)} value={escalationStatus}>
              <option value="none">None</option>
              <option value="compliance">Compliance</option>
              <option value="founder">Founder</option>
            </select>
          </label>
          <label>
            <span>Due date</span>
            <input
              onChange={(event) => setAssignmentDueAt(event.target.value)}
              type="datetime-local"
              value={assignmentDueAt}
            />
          </label>
          <label className="admin-inline-form-full">
            <span>Escalation reason</span>
            <input
              onChange={(event) => setEscalationReason(event.target.value)}
              placeholder="Example: High-risk action needs compliance owner review."
              value={escalationReason}
            />
          </label>
          <label className="admin-inline-form-full">
            <span>Reviewer note</span>
            <textarea
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Example: Evidence is complete and reason is acceptable."
              rows={3}
              value={reviewNote}
            />
          </label>
          <div className="admin-inline-form-actions">
            <small>Review status, reviewer, timestamp, and note are persisted.</small>
            <button
              className="admin-primary-button"
              disabled={actions.busy || ((reviewStatus !== "unreviewed" || escalationStatus !== "none") && reviewNote.trim().length < 4) || (escalationStatus !== "none" && escalationReason.trim().length < 8)}
              type="submit"
            >
              Save review
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AuditReviewPanel({ actions, logs, teamMembers = [] }) {
  const [filters, setFilters] = useState({
    actor: "",
    role: "all",
    action: "",
    targetType: "",
    status: "all",
    reviewStatus: "all",
    assignedToUserId: "all",
    ownerRole: "all",
    priority: "all",
    escalationStatus: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [selectedLog, setSelectedLog] = useState(null);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  async function applyFilters(event) {
    event.preventDefault();
    const params = new URLSearchParams({ limit: "50" });
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== "all") params.set(key, value);
    }
    const response = await fetch(`/api/admin/audit?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) {
      return;
    }
    actions.setAuditLogs(payload.logs || []);
  }

  return (
    <section className="admin-panel">
      <SectionHeader
        detail="Filter persisted audit records, inspect metadata, and mark review outcomes with notes."
        eyebrow="Audit review"
        title="Admin audit review queue"
      />
      <form className="admin-filter-row admin-filter-row-wrap" onSubmit={applyFilters}>
        <input aria-label="Actor filter" onChange={(event) => updateFilter("actor", event.target.value)} placeholder="Actor email or role" value={filters.actor} />
        <select aria-label="Role filter" onChange={(event) => updateFilter("role", event.target.value)} value={filters.role}>
          <option value="all">All roles</option>
          {ADMIN_ROLES.map((role) => <option key={role} value={role}>{titleCase(role)}</option>)}
        </select>
        <input aria-label="Action filter" onChange={(event) => updateFilter("action", event.target.value)} placeholder="Action exact match" value={filters.action} />
        <input aria-label="Target type filter" onChange={(event) => updateFilter("targetType", event.target.value)} placeholder="Target type" value={filters.targetType} />
        <select aria-label="Status filter" onChange={(event) => updateFilter("status", event.target.value)} value={filters.status}>
          <option value="all">All statuses</option>
          <option value="logged">Logged</option>
          <option value="blocked">Blocked</option>
          <option value="failed">Failed</option>
          <option value="requested">Requested</option>
        </select>
        <select aria-label="Review status filter" onChange={(event) => updateFilter("reviewStatus", event.target.value)} value={filters.reviewStatus}>
          <option value="all">All review</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="reviewed">Reviewed</option>
          <option value="needs_follow_up">Needs follow-up</option>
        </select>
        <select aria-label="Assignee filter" onChange={(event) => updateFilter("assignedToUserId", event.target.value)} value={filters.assignedToUserId}>
          <option value="all">All assignees</option>
          {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
        <select aria-label="Owner role filter" onChange={(event) => updateFilter("ownerRole", event.target.value)} value={filters.ownerRole}>
          <option value="all">All owners</option>
          <option value="founder">Founder queue</option>
          <option value="compliance">Compliance queue</option>
          <option value="engineer">Engineer queue</option>
          <option value="ops">Ops queue</option>
          <option value="ai_qa">AI QA queue</option>
          <option value="agent_manager">Agent manager queue</option>
        </select>
        <select aria-label="Priority filter" onChange={(event) => updateFilter("priority", event.target.value)} value={filters.priority}>
          <option value="all">All priorities</option>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <select aria-label="Escalation filter" onChange={(event) => updateFilter("escalationStatus", event.target.value)} value={filters.escalationStatus}>
          <option value="all">All escalations</option>
          <option value="none">None</option>
          <option value="compliance">Compliance</option>
          <option value="founder">Founder</option>
        </select>
        <input aria-label="From date" onChange={(event) => updateFilter("dateFrom", event.target.value)} type="date" value={filters.dateFrom} />
        <input aria-label="To date" onChange={(event) => updateFilter("dateTo", event.target.value)} type="date" value={filters.dateTo} />
        <button className="admin-secondary-button" disabled={actions.busy} type="submit">Apply</button>
      </form>
      <AuditLogTable logs={logs} onInspect={setSelectedLog} />
      <AuditReviewModal
        actions={actions}
        key={selectedLog?.id || "no-audit-log"}
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
        teamMembers={teamMembers}
      />
    </section>
  );
}

function AuditEscalationQueuesPanel({ queues }) {
  const queueList = [
    { key: "myAssignments", label: "My assignments" },
    { key: "founderQueue", label: "Founder queue" },
    { key: "complianceQueue", label: "Compliance queue" },
    { key: "unassignedCritical", label: "Unassigned critical" },
    { key: "overdueBySla", label: "Overdue by SLA" },
    { key: "unassignedHighPriority", label: "Unassigned high priority" },
  ];

  return (
    <section className="admin-panel">
      <SectionHeader
        detail="Ownership queues are derived from persisted audit assignments, due dates, priority, and escalation fields."
        eyebrow="Audit ownership"
        title="Escalation queues"
      />
      <div className="admin-queue-grid">
        {queueList.map((queue) => {
          const rows = queues?.[queue.key] || [];
          return (
            <article className="admin-queue-card" key={queue.key}>
              <div className="admin-queue-card-header">
                <strong>{queue.label}</strong>
                <StatusBadge value={`${rows.length}_items`} />
              </div>
              {rows.length ? rows.slice(0, 4).map((log) => (
                <div className="admin-queue-item" key={log.id}>
                  <div>
                    <strong>{titleCase(log.action)}</strong>
                    <span>{log.targetId}</span>
                  </div>
                  <div>
                    <StatusBadge value={log.priority || "normal"} />
                    {log.ownerRole ? <StatusBadge value={`${log.ownerRole}_owner`} /> : null}
                    {log.assignmentDueAt ? <small>Due {formatDateTime(log.assignmentDueAt)}</small> : null}
                    {log.escalationReason ? <small>{log.escalationReason}</small> : null}
                  </div>
                </div>
              )) : <p>No matching audit events.</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AuditWorkloadPanel({ workload, trends }) {
  const rows = workload?.overdueRows || [];
  const trendBuckets = trends?.buckets || [];
  const ownerTrendRows = trends?.ownerRows || [];
  const [filters, setFilters] = useState({
    ownerRole: "all",
    priority: "all",
    escalationStatus: "all",
    reviewStatus: "all",
  });
  const filteredRows = rows.filter((row) => {
    if (filters.ownerRole !== "all" && (row.ownerRole || "unassigned") !== filters.ownerRole) return false;
    if (filters.priority !== "all" && row.priority !== filters.priority) return false;
    if (filters.escalationStatus !== "all" && row.escalationStatus !== filters.escalationStatus) return false;
    if (filters.reviewStatus !== "all" && row.reviewStatus !== filters.reviewStatus) return false;
    return true;
  });
  const metrics = workload?.metrics || {};
  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="admin-panel">
      <SectionHeader
        detail="Workload metrics are computed from persisted audit assignments, ownership roles, due dates, priority, and review state."
        eyebrow="Audit workload"
        title="Ownership dashboard"
      />
      <div className="admin-provider-summary">
        <div><span>Assigned to me</span><strong>{metrics.assignedToMe || 0}</strong></div>
        <div><span>Critical unassigned</span><strong>{metrics.criticalUnassigned || 0}</strong></div>
        <div><span>Founder queue</span><strong>{metrics.founderQueueVolume || 0}</strong></div>
        <div><span>Compliance queue</span><strong>{metrics.complianceQueueVolume || 0}</strong></div>
        <div><span>Average review age</span><strong>{metrics.averageReviewAgeHours || 0}h</strong></div>
      </div>
      {trendBuckets.length ? (
        <div className="admin-two-column">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Assigned</th>
                  <th scope="col">Overdue</th>
                  <th scope="col">Critical</th>
                  <th scope="col">Avg age</th>
                </tr>
              </thead>
              <tbody>
                {trendBuckets.slice(-7).map((bucket) => (
                  <tr key={bucket.day}>
                    <td>{bucket.day}</td>
                    <td>{bucket.assignedWorkload}</td>
                    <td>{bucket.overdueCount}</td>
                    <td>{bucket.criticalUnassigned}</td>
                    <td>{bucket.averageReviewAgeHours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Owner</th>
                  <th scope="col">Assigned</th>
                  <th scope="col">Overdue</th>
                  <th scope="col">Critical</th>
                </tr>
              </thead>
              <tbody>
                {ownerTrendRows.slice(0, 6).map((owner) => (
                  <tr key={owner.ownerKey}>
                    <td><strong>{titleCase(owner.ownerRole || "unassigned")}</strong><small>{owner.assignedToEmail || "Role queue"}</small></td>
                    <td>{owner.assignedCount}</td>
                    <td>{owner.overdueCount}</td>
                    <td>{owner.criticalCount}</td>
                  </tr>
                ))}
                {!ownerTrendRows.length ? <tr><td colSpan={4}>No current owner trend rows.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      <div className="admin-filter-row">
        <select aria-label="Owner role workload filter" onChange={(event) => updateFilter("ownerRole", event.target.value)} value={filters.ownerRole}>
          {(workload?.filters?.ownerRoles || ["all"]).map((role) => <option key={role} value={role}>{titleCase(role)}</option>)}
        </select>
        <select aria-label="Priority workload filter" onChange={(event) => updateFilter("priority", event.target.value)} value={filters.priority}>
          {(workload?.filters?.priorities || ["all"]).map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}
        </select>
        <select aria-label="Escalation workload filter" onChange={(event) => updateFilter("escalationStatus", event.target.value)} value={filters.escalationStatus}>
          {(workload?.filters?.escalationStatuses || ["all"]).map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
        </select>
        <select aria-label="Review workload filter" onChange={(event) => updateFilter("reviewStatus", event.target.value)} value={filters.reviewStatus}>
          {(workload?.filters?.reviewStatuses || ["all"]).map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
        </select>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Owner</th>
              <th scope="col">Priority</th>
              <th scope="col">Escalation</th>
              <th scope="col">Review</th>
              <th scope="col">Due</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, index) => (
              <tr key={`${row.createdAt}-${index}`}>
                <td><strong>{titleCase(row.ownerRole || "unassigned")}</strong><small>{row.assignedToEmail || "Unassigned"}</small></td>
                <td><StatusBadge value={row.priority || "normal"} /></td>
                <td><StatusBadge value={row.escalationStatus || "none"} /></td>
                <td><StatusBadge value={row.reviewStatus || "unreviewed"} /></td>
                <td>{formatDateTime(row.dueAt)}</td>
              </tr>
            ))}
            {!filteredRows.length ? (
              <tr><td colSpan={5}>No overdue audit ownership rows match the filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExportArtifactPolicyPanel({ actions, policy, session }) {
  const canReview = canReviewExports(session);
  const counts = policy?.counts || {};
  const config = policy?.config || {};
  const activePolicy = policy?.activePolicy || (policy?.activePolicies || [])[0] || {};
  const [form, setForm] = useState({
    environment: policy?.currentEnvironment || activePolicy.environment || "development",
    status: activePolicy.status === "disabled" ? "disabled" : "active",
    ttlSeconds: String(activePolicy.ttlSeconds || policy?.ttlSeconds || 600),
    minTtlSeconds: String(activePolicy.minTtlSeconds || config.minTtlSeconds || 60),
    maxTtlSeconds: String(activePolicy.maxTtlSeconds || config.maxTtlSeconds || 3600),
    reason: "",
  });

  function updatePolicyForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitPolicy(event) {
    event.preventDefault();
    const result = await actions.runAdminMutation({
      endpoint: "/api/admin/exports/artifact-policy",
      method: "PATCH",
      body: {
        environment: form.environment,
        status: form.status,
        ttlSeconds: Number(form.ttlSeconds),
        minTtlSeconds: Number(form.minTtlSeconds),
        maxTtlSeconds: Number(form.maxTtlSeconds),
        reason: form.reason,
      },
      successMessage: "Export artifact policy updated.",
    });
    if (result) setForm((current) => ({ ...current, reason: "" }));
  }
  return (
    <section className="admin-panel">
      <SectionHeader
        detail="Approval artifacts remain no-PII. Signed links are short-lived and can be rotated or revoked with a logged reason."
        eyebrow="Export artifacts"
        title="Signed-link policy"
      />
      <div className="admin-provider-summary">
        <div><span>TTL</span><strong>{policy?.ttlMinutes || 10} min</strong><small>{policy?.ttlSource || "default"}</small></div>
        <div><span>Policy</span><StatusBadge value={config.status || "default"} /></div>
        <div><span>Min TTL</span><strong>{config.minTtlSeconds || 60}s</strong></div>
        <div><span>Max TTL</span><strong>{config.maxTtlSeconds || 3600}s</strong></div>
        <div><span>Active</span><strong>{counts.active || 0}</strong></div>
        <div><span>Expired</span><strong>{counts.expired || 0}</strong></div>
        <div><span>Revoked</span><strong>{counts.revoked || 0}</strong></div>
        <div><span>Rotated</span><strong>{counts.rotated || 0}</strong></div>
      </div>
      <form className="admin-inline-form admin-inline-form-compact" onSubmit={submitPolicy}>
        <label>
          <span>Environment</span>
          <select disabled={!canReview || actions.busy} onChange={(event) => updatePolicyForm("environment", event.target.value)} value={form.environment}>
            <option value="development">Development</option>
            <option value="preview">Preview</option>
            <option value="production">Production</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select disabled={!canReview || actions.busy} onChange={(event) => updatePolicyForm("status", event.target.value)} value={form.status}>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label>
          <span>TTL seconds</span>
          <input disabled={!canReview || actions.busy} min="60" onChange={(event) => updatePolicyForm("ttlSeconds", event.target.value)} type="number" value={form.ttlSeconds} />
        </label>
        <label>
          <span>Min seconds</span>
          <input disabled={!canReview || actions.busy} min="1" onChange={(event) => updatePolicyForm("minTtlSeconds", event.target.value)} type="number" value={form.minTtlSeconds} />
        </label>
        <label>
          <span>Max seconds</span>
          <input disabled={!canReview || actions.busy} min="60" onChange={(event) => updatePolicyForm("maxTtlSeconds", event.target.value)} type="number" value={form.maxTtlSeconds} />
        </label>
        <label className="admin-inline-form-wide">
          <span>Required reason</span>
          <input disabled={!canReview || actions.busy} onChange={(event) => updatePolicyForm("reason", event.target.value)} placeholder="Example: Shorten production artifact access during compliance review." value={form.reason} />
        </label>
        <div className="admin-inline-form-actions">
          <small>Policy changes are logged. Artifacts remain approval metadata only.</small>
          <button className="admin-primary-button" disabled={!canReview || actions.busy} type="submit">
            Save policy
          </button>
        </div>
      </form>
      {(policy?.activePolicies || []).length ? (
        <div className="admin-provider-summary">
          {policy.activePolicies.map((item) => (
            <div key={item.environment}>
              <span>{titleCase(item.environment)}</span>
              <strong>{item.ttlMinutes} min</strong>
              <small>{item.mode} - {item.status}</small>
            </div>
          ))}
        </div>
      ) : null}
      {(policy?.policyHistory || []).length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Environment</th>
                <th scope="col">TTL</th>
                <th scope="col">Status</th>
                <th scope="col">Changed</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {policy.policyHistory.slice(0, 6).map((item) => (
                <tr key={item.id || `${item.environment}-${item.effectiveFrom}`}>
                  <td>{titleCase(item.environment)}</td>
                  <td>{item.ttlSeconds}s</td>
                  <td><StatusBadge value={item.status} /></td>
                  <td><strong>{item.changedByEmail || "Env/default"}</strong><small>{formatDateTime(item.effectiveFrom || item.createdAt)}</small></td>
                  <td>{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {(config.validationWarnings || []).length ? (
        <div className="admin-stack-list">
          {config.validationWarnings.map((warning) => (
            <article className="admin-compact-row" key={warning}>
              <div>
                <strong>Policy validation</strong>
                <span>{warning}</span>
              </div>
              <StatusBadge value="warning" />
            </article>
          ))}
        </div>
      ) : null}
      <div className="admin-stack-list">
        {(policy?.activeLinks || []).map((access) => (
          <article className="admin-compact-row" key={access.id}>
            <div>
              <strong>{access.id}</strong>
              <span>Export {access.exportEventId} - expires {formatDateTime(access.expiresAt)}</span>
            </div>
            <div className="admin-row-actions">
              <StatusBadge value={access.state || access.status} />
              <button
                className="admin-inline-button"
                disabled={!canReview || actions.busy || access.state !== "active"}
                onClick={() => actions.openOperation({
                  eyebrow: "Artifact access rotation",
                  title: `Rotate signed artifact access ${access.id}`,
                  endpoint: `/api/admin/exports/${access.exportEventId}/artifact/access`,
                  method: "PATCH",
                  payload: { operation: "rotate", accessId: access.id },
                })}
                type="button"
              >
                Rotate
              </button>
              <button
                className="admin-inline-button"
                disabled={!canReview || actions.busy || access.state !== "active"}
                onClick={() => actions.openOperation({
                  eyebrow: "Artifact access revocation",
                  title: `Revoke signed artifact access ${access.id}`,
                  endpoint: `/api/admin/exports/${access.exportEventId}/artifact/access`,
                  method: "PATCH",
                  payload: { accessId: access.id },
                })}
                type="button"
              >
                Revoke
              </button>
            </div>
          </article>
        ))}
        {!(policy?.activeLinks || []).length ? <p>No active signed artifact links.</p> : null}
      </div>
    </section>
  );
}

function SensitiveField({ canRevealField, field, label, onReveal, revealed, targetId, targetType, value }) {
  const revealKey = `${targetId}:${field}`;
  const revealedValue = revealed[revealKey];

  return (
    <div className="admin-sensitive-field">
      <span className={revealedValue ? "admin-sensitive-value admin-sensitive-value-revealed" : "admin-sensitive-value"}>
        {revealedValue || value}
      </span>
      {revealedValue ? (
        <small>Revealed</small>
      ) : (
        <button
          className="admin-inline-button"
          disabled={!canRevealField}
          onClick={() => onReveal({ field, label, targetId, targetType })}
          title={canRevealField ? `Reveal ${label}` : "Reveal permission required"}
          type="button"
        >
          Reveal
        </button>
      )}
    </div>
  );
}

function ExportButton({ onExport, scope, session }) {
  const allowed = canExport(session);
  return (
    <button
      className="admin-secondary-button"
      disabled={!allowed}
      onClick={() => onExport(scope)}
      title={allowed ? "Create mock export request" : "Founder role required"}
      type="button"
    >
      {allowed ? "Request export" : "Export locked"}
    </button>
  );
}

function ActionReasonModal({ modal, reason, setReason, busy, error, onClose, onSubmit }) {
  if (!modal) return null;
  return (
    <div className="admin-modal-backdrop" role="presentation">
      <section className="admin-modal" aria-labelledby="admin-action-modal-title" role="dialog" aria-modal="true">
        <div className="admin-modal-header">
          <div>
            <p className="admin-eyebrow">
              {modal.eyebrow || (modal.actionType === "export" ? "Export control" : modal.actionType === "reveal" ? "PII reveal" : "Admin action")}
            </p>
            <h2 id="admin-action-modal-title">{modal.title}</h2>
          </div>
          <button className="admin-icon-button" onClick={onClose} type="button" aria-label="Close">x</button>
        </div>
        <p className="admin-modal-copy">
          Enter a specific operational reason. The action will be written to the admin audit log.
        </p>
        <label className="admin-field-label">
          <span>Required reason</span>
          <textarea
            autoFocus
            onChange={(event) => setReason(event.target.value)}
            placeholder="Example: Customer called support and asked us to verify the renewal contact number."
            rows={4}
            value={reason}
          />
        </label>
        {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
        <div className="admin-modal-actions">
          <button className="admin-secondary-button" disabled={busy} onClick={onClose} type="button">Cancel</button>
          <button className="admin-primary-button" disabled={busy} onClick={onSubmit} type="button">
            {busy ? "Logging..." : (modal.submitLabel || "Log and continue")}
          </button>
        </div>
      </section>
    </div>
  );
}

function useAuditActions(initialLogs) {
  const router = useRouter();
  const [auditLogs, setAuditLogs] = useState(initialLogs || []);
  const [revealed, setRevealed] = useState({});
  const [modal, setModal] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [artifactAccess, setArtifactAccess] = useState(null);

  function mergeAuditPayload(payload) {
    const incoming = [payload?.event, payload?.emailEvent, payload?.notificationEvent].filter(Boolean);
    if (payload?.log) {
      setAuditLogs((current) => current.map((log) => (log.id === payload.log.id ? payload.log : log)));
    }
    if (incoming.length) {
      setAuditLogs((current) => [
        ...incoming,
        ...current.filter((log) => !incoming.some((item) => item.id === log.id)),
      ].slice(0, 30));
    }
    if (payload?.access?.signedArtifactUrl) {
      setArtifactAccess(payload.access);
    }
  }

  function openReveal(payload) {
    setError("");
    setNotice("");
    setReason("");
    setModal({
      actionType: "reveal",
      title: `Reveal ${payload.label}`,
      ...payload,
    });
  }

  function openExport(scope) {
    setError("");
    setNotice("");
    setReason("");
    setModal({
      actionType: "export",
      title: `Export ${scope.label}`,
      targetType: scope.targetType,
      targetId: scope.targetId,
      field: scope.field || "bulk_export",
    });
  }

  function openOperation(config) {
    setError("");
    setNotice("");
    setReason("");
    setModal({
      actionType: "operation",
      submitLabel: "Log action",
      ...config,
    });
  }

  async function runAdminMutation({ endpoint, method = "POST", body = {}, successMessage }) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      mergeAuditPayload(payload);
      if (!response.ok) throw new Error(payload?.error || "Unable to complete admin action.");
      setNotice(payload?.message || successMessage || "Admin action logged.");
      router.refresh();
      return payload;
    } catch (actionError) {
      setError(actionError?.message || "Unable to complete admin action.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submitAction() {
    if (!modal || busy) return;
    setBusy(true);
    setError("");

    try {
      if (modal.endpoint) {
        const response = await fetch(modal.endpoint, {
          method: modal.method || "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(modal.payload || {}),
            reason,
          }),
        });
        const payload = await response.json();
        mergeAuditPayload(payload);
        if (!response.ok) throw new Error(payload?.error || "Unable to complete admin action.");
        setNotice(payload?.message || modal.successMessage || "Admin action logged.");
        setModal(null);
        setReason("");
        router.refresh();
        return;
      }

      const response = await fetch("/api/admin/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionType: modal.actionType,
          targetType: modal.targetType,
          targetId: modal.targetId,
          field: modal.field,
          reason,
        }),
      });
      const payload = await response.json();
      mergeAuditPayload(payload);
      if (!response.ok) throw new Error(payload?.error || "Unable to log admin action.");

      if (modal.actionType === "reveal") {
        setRevealed((current) => ({
          ...current,
          [`${modal.targetId}:${modal.field}`]: payload.value,
        }));
        setNotice("Sensitive value revealed and logged.");
      } else {
        setNotice(payload?.message || "Export action logged.");
        router.refresh();
      }
      setModal(null);
      setReason("");
    } catch (actionError) {
      setError(actionError?.message || "Unable to log admin action.");
    } finally {
      setBusy(false);
    }
  }

  function closeModal() {
    if (busy) return;
    setModal(null);
    setReason("");
    setError("");
  }

  return {
    auditLogs,
    artifactAccess,
    busy,
    closeModal,
    error,
    modal,
    notice,
    openOperation,
    openExport,
    openReveal,
    reason,
    revealed,
    runAdminMutation,
    setAuditLogs,
    setArtifactAccess,
    setReason,
    submitAction,
  };
}

function DashboardHero({ dataMode, dataModeDetail, eyebrow, title, detail, generatedAt }) {
  return (
    <section className="admin-dashboard-hero">
      <div>
        <p className="admin-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      <div className="admin-hero-meta">
        <span>Data mode</span>
        <strong>{dataMode || "Mock"}</strong>
        <small>{dataModeDetail || `Generated ${generatedAt}`}</small>
      </div>
    </section>
  );
}

function RenewalOpsPanel({ actions, renewalOps, session }) {
  const canRevealField = hasPermission(session, REVEAL_PERMISSION);
  const canManage = canManageRenewalOps(session);
  const canVerifyDocs = canVerifyPolicyDocuments(session);
  const cases = renewalOps?.cases || [];
  const submissionQueue = renewalOps?.submissionQueue || [];
  const policyDocumentQueue = renewalOps?.policyDocumentQueue || [];
  const manualTasks = renewalOps?.manualIssuanceTasks || [];
  const metrics = renewalOps?.metrics || {};
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [insurerFilter, setInsurerFilter] = useState("all");

  const ownerOptions = useMemo(() => (
    Array.from(new Set(cases.map((item) => item.ownerName).filter(Boolean))).sort()
  ), [cases]);
  const insurerOptions = useMemo(() => (
    Array.from(new Set(cases.map((item) => item.selectedInsurer || item.requestedInsurer).filter(Boolean))).sort()
  ), [cases]);
  const filteredCases = useMemo(() => (
    cases.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (ownerFilter !== "all" && item.ownerName !== ownerFilter) return false;
      if (insurerFilter !== "all" && item.selectedInsurer !== insurerFilter && item.requestedInsurer !== insurerFilter) return false;
      return true;
    })
  ), [cases, insurerFilter, ownerFilter, statusFilter]);

  function openStatusAction(caseItem, status, title, submitLabel = "Update status") {
    actions.openOperation({
      endpoint: "/api/admin/renewal-ops",
      method: "PATCH",
      payload: {
        operation: "update_case_status",
        caseId: caseItem.id,
        status,
      },
      submitLabel,
      successMessage: "Renewal status updated.",
      title,
    });
  }

  function openSubmissionAction(submission, status, title, submitLabel = "Update submission") {
    actions.openOperation({
      endpoint: "/api/admin/renewal-ops",
      method: "PATCH",
      payload: {
        operation: "update_submission",
        submissionId: submission.id,
        caseId: submission.caseId,
        insurer: submission.insurer,
        channel: submission.channel,
        status,
      },
      submitLabel,
      successMessage: "Insurer submission updated.",
      title,
    });
  }

  function openDocumentAction(document, status, title, submitLabel = "Update document") {
    actions.openOperation({
      endpoint: "/api/admin/renewal-ops",
      method: "PATCH",
      payload: {
        operation: "upsert_policy_document",
        documentId: document.id,
        caseId: document.caseId,
        insurer: document.insurer,
        documentType: document.documentType,
        policyNumber: document.policyNumber,
        effectiveFrom: document.effectiveFrom,
        effectiveTo: document.effectiveTo,
        storageMode: document.storageMode,
        fileReference: document.fileReference,
        verificationStatus: status,
      },
      submitLabel,
      successMessage: "Policy document verification updated.",
      title,
    });
  }

  function openNewDocumentAction(caseItem) {
    actions.openOperation({
      endpoint: "/api/admin/renewal-ops",
      method: "PATCH",
      payload: {
        operation: "upsert_policy_document",
        caseId: caseItem.id,
        insurer: caseItem.selectedInsurer || caseItem.requestedInsurer,
        documentType: "policy_document_metadata",
        policyNumber: "Manual placeholder",
        storageMode: "metadata_placeholder",
        verificationStatus: "uploaded_metadata",
      },
      submitLabel: "Create metadata",
      successMessage: "Policy document metadata placeholder created.",
      title: `Create document metadata for ${caseItem.caseRef}`,
    });
  }

  return (
    <section className="admin-panel">
      <SectionHeader
        action={<ExportButton onExport={actions.openExport} scope={{ label: "renewal ops pipeline", targetType: "renewal_ops", targetId: "renewal-ops-pipeline" }} session={session} />}
        detail="Quote requests, insurer submissions, manual issuance, and policy document verification are tracked here. Items marked mock/demo or manual do not represent live insurer API issuance."
        eyebrow="Renewal Ops"
        title="Insurer and renewal workflow"
      />

      <div className="admin-provider-status">
        <div className="admin-provider-summary">
          <div>
            <span>Workflow data</span>
            <strong>{renewalOps?.persisted ? "Database-backed" : "Mock/manual fallback"}</strong>
            <StatusBadge value={renewalOps?.persisted ? "configured" : "mock_demo"} />
          </div>
          <div>
            <span>Active cases</span>
            <strong>{metrics.activeCases ?? cases.length}</strong>
            <small>{metrics.blockedCases || 0} blocked or waiting</small>
          </div>
          <div>
            <span>Manual insurer work</span>
            <strong>{metrics.manualSubmissions ?? submissionQueue.length}</strong>
            <small>No live insurer API claim</small>
          </div>
          <div>
            <span>Customer policy release</span>
            <strong>Blocked</strong>
            <StatusBadge value="blocked" />
          </div>
        </div>
        <div className="admin-env-grid">
          {(renewalOps?.manualIssuanceLabels || []).map((item) => (
            <div key={item.value}>
              <span>{item.label}</span>
              <StatusBadge value={item.value} />
            </div>
          ))}
        </div>
      </div>

      <div className="admin-metric-grid admin-metric-grid-compact">
        <article className="admin-metric-card admin-tone-blue">
          <span>Pipeline premium</span>
          <strong>RM {Number(metrics.grossPremium || 0).toFixed(2)}</strong>
          <small>Snapshot only, not booked revenue</small>
        </article>
        <article className="admin-metric-card admin-tone-amber">
          <span>Quotes waiting</span>
          <strong>{metrics.quoteWaiting ?? 0}</strong>
          <small>Review, insurer submission, or quote response</small>
        </article>
        <article className="admin-metric-card admin-tone-red">
          <span>Blocked cases</span>
          <strong>{metrics.blockedCases ?? 0}</strong>
          <small>Needs customer, insurer, or ops resolution</small>
        </article>
        <article className="admin-metric-card admin-tone-green">
          <span>Policy docs pending</span>
          <strong>{metrics.policyDocumentsPending ?? policyDocumentQueue.length}</strong>
          <small>Verification does not release to customer</small>
        </article>
      </div>

      <div className="admin-filter-row">
        <select aria-label="Renewal status filter" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
          <option value="all">All statuses</option>
          {(renewalOps?.lifecycleStatuses || []).map((status) => (
            <option key={status} value={status}>{titleCase(status)}</option>
          ))}
        </select>
        <select aria-label="Renewal owner filter" onChange={(event) => setOwnerFilter(event.target.value)} value={ownerFilter}>
          <option value="all">All owners</option>
          {ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
        </select>
        <select aria-label="Renewal insurer filter" onChange={(event) => setInsurerFilter(event.target.value)} value={insurerFilter}>
          <option value="all">All insurers</option>
          {insurerOptions.map((insurer) => <option key={insurer} value={insurer}>{insurer}</option>)}
        </select>
        <button className="admin-secondary-button" onClick={() => { setStatusFilter("all"); setOwnerFilter("all"); setInsurerFilter("all"); }} type="button">Clear</button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table admin-table-dense">
          <thead>
            <tr>
              <th scope="col">Case</th>
              <th scope="col">Customer</th>
              <th scope="col">Contact</th>
              <th scope="col">Vehicle</th>
              <th scope="col">Insurer</th>
              <th scope="col">Coverage</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCases.length ? filteredCases.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.caseRef}</strong><small>{formatDateTime(item.updatedAt)}</small></td>
                <td>
                  <strong>{item.customerName}</strong>
                  <small>{item.ownerName}</small>
                  <SensitiveField
                    canRevealField={canRevealField}
                    field="customerIc"
                    label={`${item.caseRef} IC`}
                    onReveal={actions.openReveal}
                    revealed={actions.revealed}
                    targetId={item.id}
                    targetType="renewal_ops_case"
                    value={item.customerIc}
                  />
                </td>
                <td>
                  <SensitiveField
                    canRevealField={canRevealField}
                    field="customerEmail"
                    label={`${item.caseRef} email`}
                    onReveal={actions.openReveal}
                    revealed={actions.revealed}
                    targetId={item.id}
                    targetType="renewal_ops_case"
                    value={item.customerEmail}
                  />
                  <SensitiveField
                    canRevealField={canRevealField}
                    field="customerPhone"
                    label={`${item.caseRef} phone`}
                    onReveal={actions.openReveal}
                    revealed={actions.revealed}
                    targetId={item.id}
                    targetType="renewal_ops_case"
                    value={item.customerPhone}
                  />
                </td>
                <td><strong>{item.vehicleSummary}</strong><small>{item.vehiclePlate}</small></td>
                <td><strong>{item.selectedInsurer}</strong><small>Requested: {item.requestedInsurer}</small></td>
                <td><strong>{item.premiumLabel}</strong><small>{item.coverageType} - Road tax: {titleCase(item.roadTaxOption)}</small></td>
                <td>
                  <StatusBadge value={item.status} />
                  <small><StatusBadge value={item.issuanceMode} /> {item.customerReleaseBlocked ? "Customer release blocked" : "Release enabled"}</small>
                </td>
                <td>
                  <div className="admin-row-actions">
                    {canManage ? (
                      <>
                        <button className="admin-inline-button" onClick={() => openStatusAction(item, "submitted_to_insurer", `Submit ${item.caseRef} to insurer`, "Submit")} type="button">Submit</button>
                        <button className="admin-inline-button" onClick={() => openStatusAction(item, "info_needed", `Mark ${item.caseRef} as info needed`, "Mark info needed")} type="button">Info</button>
                        <button className="admin-inline-button" onClick={() => openStatusAction(item, "manual_issuance_required", `Require manual issuance for ${item.caseRef}`, "Require issuance")} type="button">Issuance</button>
                        <button className="admin-inline-button" onClick={() => openStatusAction(item, "blocked", `Block ${item.caseRef}`, "Block case")} type="button">Block</button>
                      </>
                    ) : <small>Inspect only</small>}
                    {canVerifyDocs ? (
                      <button className="admin-inline-button" onClick={() => openNewDocumentAction(item)} type="button">Doc metadata</button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8}>No renewal ops cases match the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-two-column">
        <section className="admin-subpanel">
          <SectionHeader eyebrow="Insurer queue" title="Manual partner submissions" detail="Source labels stay explicit until real insurer adapters are live." />
          <div className="admin-table-wrap">
            <table className="admin-table admin-table-dense">
              <thead>
                <tr>
                  <th scope="col">Submission</th>
                  <th scope="col">Channel</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {submissionQueue.length ? submissionQueue.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.caseRef}</strong><small>{item.insurer} - {item.vehiclePlate}</small></td>
                    <td><StatusBadge value={item.channel} /><small>{item.sourceLabel}</small></td>
                    <td><StatusBadge value={item.status} /><small>{item.note || "No note"}</small></td>
                    <td>
                      <div className="admin-row-actions">
                        {canManage ? (
                          <>
                            <button className="admin-inline-button" onClick={() => openSubmissionAction(item, "submitted_to_insurer", `Mark ${item.caseRef} submitted to insurer`, "Submitted")} type="button">Submitted</button>
                            <button className="admin-inline-button" onClick={() => openSubmissionAction(item, "insurer_response_needed", `Mark ${item.caseRef} waiting for insurer response`, "Response needed")} type="button">Response</button>
                            <button className="admin-inline-button" onClick={() => openSubmissionAction(item, "manual_follow_up", `Mark ${item.caseRef} for manual follow-up`, "Follow up")} type="button">Follow-up</button>
                            <button className="admin-inline-button" onClick={() => openSubmissionAction(item, "blocked", `Block submission ${item.caseRef}`, "Block")} type="button">Block</button>
                          </>
                        ) : <small>Inspect only</small>}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={4}>No insurer submission queue items yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-subpanel">
          <SectionHeader eyebrow="Policy documents" title="Verification queue" detail="Metadata placeholders are supported when file storage is not configured." />
          <div className="admin-table-wrap">
            <table className="admin-table admin-table-dense">
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Metadata</th>
                  <th scope="col">Verification</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {policyDocumentQueue.length ? policyDocumentQueue.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.caseRef}</strong><small>{item.insurer} - {item.documentType}</small></td>
                    <td><strong>{item.policyNumber}</strong><small>{item.storageMode} - No customer release</small></td>
                    <td><StatusBadge value={item.verificationStatus} /><small>{item.reviewerName}</small></td>
                    <td>
                      <div className="admin-row-actions">
                        {canVerifyDocs ? (
                          <>
                            <button className="admin-inline-button" onClick={() => openDocumentAction(item, "under_review", `Review document ${item.caseRef}`, "Review")} type="button">Review</button>
                            <button className="admin-inline-button" onClick={() => openDocumentAction(item, "verified", `Verify document ${item.caseRef}`, "Verify")} type="button">Verify</button>
                            <button className="admin-inline-button" onClick={() => openDocumentAction(item, "rejected", `Reject document ${item.caseRef}`, "Reject")} type="button">Reject</button>
                          </>
                        ) : <small>Inspect only</small>}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={4}>No policy document records yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="admin-subpanel">
        <SectionHeader eyebrow="Manual issuance" title="Ops tasks" detail="These tasks coordinate manual insurer portal work and do not issue policies to customers." />
        <div className="admin-stack-list">
          {manualTasks.length ? manualTasks.map((item) => (
            <article className="admin-compact-row" key={item.id}>
              <div>
                <strong>{titleCase(item.taskType)}</strong>
                <span>{item.caseRef} - {item.assignedToName}</span>
              </div>
              <div>
                <StatusBadge value={item.issuanceMode} />
                <StatusBadge value={item.status} />
              </div>
            </article>
          )) : (
            <article className="admin-compact-row">
              <div><strong>No manual issuance tasks</strong><span>Create tasks when insurer portal work is required.</span></div>
              <StatusBadge value="manual_ops_upload" />
            </article>
          )}
        </div>
      </section>
    </section>
  );
}

function PaymentLaunchPanel({ actions, paymentLaunch, session }) {
  const readiness = paymentLaunch?.readiness || {};
  const metrics = paymentLaunch?.metrics || {};
  const incidentSummary = paymentLaunch?.incidentSummary || {};
  const reconciliationQueue = paymentLaunch?.reconciliationQueue || [];
  const exceptions = paymentLaunch?.exceptions || [];
  const verificationEvents = paymentLaunch?.verificationEvents || [];
  const pendingConfirmations = paymentLaunch?.pendingConfirmations || [];
  const canManage = canManagePaymentOps(session);
  const canApproveRefund = session?.role === "founder";
  const canActOnRecord = (record) => canManage && (paymentLaunch?.persisted || !String(record?.id || "").includes("mock"));

  return (
    <section className="admin-panel">
      <SectionHeader
        action={canManage ? (
          <button
            className="admin-secondary-button"
            onClick={() => actions.openOperation({
              endpoint: "/api/admin/payments",
              method: "POST",
              payload: {
                operation: "create_exception",
                provider: readiness.provider || "mock",
                exceptionType: "manual_refund_review",
                priority: "normal",
              },
              submitLabel: "Create exception",
              successMessage: "Payment exception created.",
              title: "Create payment exception",
            })}
            type="button"
          >
            Open exception
          </button>
        ) : null}
        detail="Stripe is the first implemented provider path because this codebase already has a Stripe shell, SDK-grade webhook verification, sandbox Checkout, and low integration risk. No provider secrets, signatures, raw payloads, or customer PII are shown."
        eyebrow="Payment Launch"
        title="Readiness, reconciliation, and exceptions"
      />

      <div className="admin-provider-status">
        <div className="admin-provider-summary">
          <div>
            <span>Provider</span>
            <strong>{readiness.label || readiness.provider || "Not selected"}</strong>
            <StatusBadge value={readiness.status || "unknown"} />
          </div>
          <div>
            <span>Environment</span>
            <strong>{readiness.environment || "development"}</strong>
            <small>{readiness.mode || "not configured"}</small>
          </div>
          <div>
            <span>API key</span>
            <strong>{readiness.apiKeyConfigured ? "Configured" : "Missing or mock"}</strong>
            <StatusBadge value={readiness.apiKeyConfigured ? "configured" : "missing_env"} />
          </div>
          <div>
            <span>Webhook secret</span>
            <strong>{readiness.webhookSecretConfigured ? "Configured" : "Missing"}</strong>
            <StatusBadge value={readiness.webhookSecretConfigured ? "configured" : "missing_env"} />
          </div>
        </div>
        <div className="admin-provider-summary">
          <div>
            <span>Endpoint</span>
            <strong>{readiness.endpointUrl || "Not available"}</strong>
            <small>Register with the payment provider when live.</small>
          </div>
          <div>
            <span>Verifier</span>
            <strong>{readiness.verifierImplemented ? "Implemented" : "Shell only"}</strong>
            <StatusBadge value={readiness.verifierImplemented ? "configured" : "verifier_not_implemented"} />
          </div>
          <div>
            <span>Checkout</span>
            <strong>{readiness.checkoutImplemented ? "Implemented" : "Not implemented"}</strong>
            <StatusBadge value={readiness.paymentAvailable ? "configured" : readiness.status || "manual_fallback"} />
          </div>
          <div>
            <span>Last verification</span>
            <strong>{readiness.lastWebhookVerificationStatus || "Not tracked"}</strong>
            <small>{readiness.lastWebhookVerificationAt ? formatDateTime(readiness.lastWebhookVerificationAt) : "No verified event yet"}</small>
          </div>
          <div>
            <span>Policy issuance</span>
            <strong>Blocked</strong>
            <StatusBadge value="blocked" />
          </div>
        </div>
        <div className="admin-provider-summary">
          <div>
            <span>Sandbox/live</span>
            <strong>{readiness.sandbox === false ? "Live mode" : "Sandbox/manual"}</strong>
            <StatusBadge value={readiness.sandbox === false ? "configured" : "manual_fallback"} />
          </div>
          <div>
            <span>Reconciliation automation</span>
            <strong>{titleCase(readiness.reconciliationAutomation || "manual_review")}</strong>
            <small>Matched verified success events auto-resolve; mismatches stay manual.</small>
          </div>
          <div>
            <span>Refund approval</span>
            <strong>{titleCase(readiness.refundApprovalStatus || "approval_required_provider_disabled")}</strong>
            <StatusBadge value={readiness.refundApprovalStatus || "approval_required_provider_disabled"} />
          </div>
          <div>
            <span>Payment methods</span>
            <strong>{(readiness.supportedPaymentMethods || []).join(", ") || "Not enabled"}</strong>
            <small>Unsupported methods return a safe disabled response.</small>
          </div>
        </div>
        <div className="admin-env-grid">
          {(readiness.required || []).slice(0, 8).map((item) => (
            <div key={item.key}>
              <span>{item.key}</span>
              <StatusBadge value={item.configured ? "configured" : "missing"} />
            </div>
          ))}
        </div>
      </div>

      <div className="admin-metric-grid admin-metric-grid-compact">
        <article className="admin-metric-card admin-tone-amber">
          <span>Pending confirmations</span>
          <strong>{metrics.pendingConfirmations ?? pendingConfirmations.length}</strong>
          <small>{incidentSummary.stalePendingConfirmations || 0} stale pending records</small>
        </article>
        <article className="admin-metric-card admin-tone-red">
          <span>Manual review</span>
          <strong>{metrics.manualReview ?? reconciliationQueue.length}</strong>
          <small>{incidentSummary.repeatedMismatchEvents || 0} amount mismatches</small>
        </article>
        <article className="admin-metric-card admin-tone-red">
          <span>Exceptions</span>
          <strong>{metrics.openExceptions ?? exceptions.length}</strong>
          <small>No real refund API is executed</small>
        </article>
        <article className="admin-metric-card admin-tone-blue">
          <span>Webhook failures</span>
          <strong>{incidentSummary.webhookFailures || 0}</strong>
          <small>{incidentSummary.verificationFailures || 0} verification failures</small>
        </article>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table admin-table-dense">
          <thead>
            <tr>
              <th scope="col">Queue item</th>
              <th scope="col">Issue</th>
              <th scope="col">Amount</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reconciliationQueue.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.paymentReference || item.paymentId || item.id}</strong><small>{item.provider} - {item.providerEventId || "No provider event"}</small></td>
                <td><StatusBadge value={item.issueType} /><small>{item.priority} priority</small></td>
                <td><strong>{formatMoney(item.amountExpected, item.currency)}</strong><small>Received: {formatMoney(item.amountReceived, item.currency)}</small></td>
                <td><StatusBadge value={item.status} /><small>{item.createdAt ? formatDateTime(item.createdAt) : "Mock row"}</small></td>
                <td>
                  <div className="admin-row-actions">
                    {canActOnRecord(item) ? (
                      <>
                        <button
                          className="admin-inline-button"
                          onClick={() => actions.openOperation({
                            endpoint: "/api/admin/payments",
                            method: "PATCH",
                            payload: { operation: "update_reconciliation", itemId: item.id, status: "reviewing" },
                            submitLabel: "Mark reviewing",
                            title: `Review ${item.paymentReference || item.id}`,
                          })}
                          type="button"
                        >
                          Review
                        </button>
                        <button
                          className="admin-inline-button"
                          onClick={() => actions.openOperation({
                            endpoint: "/api/admin/payments",
                            method: "PATCH",
                            payload: { operation: "update_reconciliation", itemId: item.id, status: "resolved" },
                            submitLabel: "Resolve",
                            title: `Resolve ${item.paymentReference || item.id}`,
                          })}
                          type="button"
                        >
                          Resolve
                        </button>
                        <button
                          className="admin-inline-button"
                          onClick={() => actions.openOperation({
                            endpoint: "/api/admin/payments",
                            method: "PATCH",
                            payload: { operation: "update_reconciliation", itemId: item.id, status: "dismissed" },
                            submitLabel: "Dismiss",
                            title: `Dismiss ${item.paymentReference || item.id}`,
                          })}
                          type="button"
                        >
                          Dismiss
                        </button>
                      </>
                    ) : <small>{canManage ? "Fallback row only" : "Inspect only"}</small>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table admin-table-dense">
          <thead>
            <tr>
              <th scope="col">Exception</th>
              <th scope="col">Type</th>
              <th scope="col">Refund mode</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {exceptions.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.paymentReference || item.paymentId || item.id}</strong><small>{item.provider} - {formatMoney(item.amount, item.currency)}</small></td>
                <td><StatusBadge value={item.exceptionType} /><small>{item.priority} priority</small></td>
                <td><strong>{titleCase(item.refundMode || "manual_placeholder")}</strong><small>{item.noRealRefund ? "No real refund executed" : "Provider action required"}</small></td>
                <td><StatusBadge value={item.status} /><small>{item.createdAt ? formatDateTime(item.createdAt) : "Mock row"}</small></td>
                <td>
                  <div className="admin-row-actions">
                    {canActOnRecord(item) ? (
                      <>
                        <button
                          className="admin-inline-button"
                          onClick={() => actions.openOperation({
                            endpoint: "/api/admin/payments",
                            method: "PATCH",
                            payload: { operation: "update_exception", exceptionId: item.id, status: "investigating" },
                            submitLabel: "Mark investigating",
                            title: `Investigate ${item.paymentReference || item.id}`,
                          })}
                          type="button"
                        >
                          Investigate
                        </button>
                        <button
                          className="admin-inline-button"
                          onClick={() => actions.openOperation({
                            endpoint: "/api/admin/payments",
                            method: "PATCH",
                            payload: { operation: "update_exception", exceptionId: item.id, status: "waiting_provider" },
                            submitLabel: "Mark waiting",
                            title: `Waiting provider ${item.paymentReference || item.id}`,
                          })}
                          type="button"
                        >
                          Waiting
                        </button>
                        {canApproveRefund && ["refund_request", "manual_refund_review"].includes(item.exceptionType) ? (
                          <>
                            <button
                              className="admin-inline-button"
                              onClick={() => actions.openOperation({
                                endpoint: "/api/admin/payments",
                                method: "PATCH",
                                payload: { operation: "update_exception", exceptionId: item.id, status: "approved" },
                                submitLabel: "Approve",
                                title: `Approve refund workflow ${item.paymentReference || item.id}`,
                              })}
                              type="button"
                            >
                              Approve
                            </button>
                            <button
                              className="admin-inline-button"
                              onClick={() => actions.openOperation({
                                endpoint: "/api/admin/payments",
                                method: "PATCH",
                                payload: { operation: "update_exception", exceptionId: item.id, status: "rejected" },
                                submitLabel: "Reject",
                                title: `Reject refund workflow ${item.paymentReference || item.id}`,
                              })}
                              type="button"
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
                        <button
                          className="admin-inline-button"
                          onClick={() => actions.openOperation({
                            endpoint: "/api/admin/payments",
                            method: "PATCH",
                            payload: { operation: "update_exception", exceptionId: item.id, status: item.exceptionType === "refund_request" ? "completed" : "resolved" },
                            submitLabel: item.exceptionType === "refund_request" ? "Complete" : "Resolve",
                            title: `${item.exceptionType === "refund_request" ? "Complete refund workflow" : "Resolve exception"} ${item.paymentReference || item.id}`,
                          })}
                          type="button"
                        >
                          {item.exceptionType === "refund_request" ? "Complete" : "Resolve"}
                        </button>
                      </>
                    ) : <small>{canManage ? "Fallback row only" : "Inspect only"}</small>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table admin-table-dense">
          <thead>
            <tr>
              <th scope="col">Webhook</th>
              <th scope="col">Provider</th>
              <th scope="col">Verification</th>
              <th scope="col">Safe status</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {verificationEvents.length ? verificationEvents.map((event) => (
              <tr key={event.id}>
                <td><strong>{event.paymentReference || event.paymentId || "No payment reference"}</strong><small>{event.providerEventId || event.requestId || "No provider event"}</small></td>
                <td><strong>{event.provider}</strong><small>{event.providerEnvironment || "unknown"}</small></td>
                <td><StatusBadge value={event.verificationStatus} /><small>{event.errorClass || "No error class"}</small></td>
                <td><StatusBadge value={event.safeStatus} /></td>
                <td>{formatDateTime(event.createdAt)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5}>No payment webhook verification events captured yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CustomerLaunchQaPanel({ actions, customerLaunchQa, session, compact = false }) {
  const qa = customerLaunchQa || {};
  const summary = qa.summary || {};
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const canManageUat = canManageCustomerLaunchQa(session);
  const categoryGroups = [
    ["end_to_end", "Critical /my flows", qa.endToEndChecklist || []],
    ["stuck_flow", "User cannot get stuck", qa.stuckFlowScenarios || []],
    ["mobile", "Mobile QA", qa.mobileChecklist || []],
    ["payment_failure", "Payment failure safety", qa.paymentFailureChecklist || []],
    ["support_handoff", "Support handoff", qa.supportHandoffChecklist || []],
  ];
  const visibleGroups = categoryGroups
    .filter(([category]) => categoryFilter === "all" || categoryFilter === category)
    .map(([category, title, items]) => [
      category,
      title,
      items.filter((item) => statusFilter === "all" || item.status === statusFilter),
    ]);
  const statuses = Array.from(new Set((qa.qaItems || []).map((item) => item.status))).sort();

  function openQaItemAction(item, status, blocker) {
    actions.openOperation({
      endpoint: "/api/admin/customer-launch-qa",
      method: "PATCH",
      payload: {
        operation: "update_item",
        itemId: item.id,
        status,
        blocker,
      },
      submitLabel: titleCase(status),
      successMessage: "Customer launch QA action saved.",
      title: `${titleCase(status)} ${item.title}`,
    });
  }

  function openUatAction(run, payload, title, submitLabel) {
    actions.openOperation({
      endpoint: "/api/admin/customer-launch-qa",
      method: "PATCH",
      payload: {
        operation: "update_uat",
        runId: run.id,
        ...payload,
      },
      submitLabel,
      successMessage: "Customer launch UAT action saved.",
      title,
    });
  }

  return (
    <section className="admin-panel">
      <SectionHeader
        detail="/my is checked as-is. These QA records store no raw PII, raw chat logs, prompts, payment payloads, or provider secrets."
        eyebrow="Customer Launch QA"
        title="/my launch readiness, stuck-flow, mobile, payment, and UAT checks"
      />

      <div className="admin-provider-status">
        <div className="admin-provider-summary">
          <div><span>Launch QA</span><strong>{summary.launchReady ? "Ready" : "Not ready"}</strong><StatusBadge value={summary.launchReady ? "ready" : "not_ready"} /></div>
          <div><span>Open blockers</span><strong>{summary.blockerCount || 0}</strong><small>{summary.coveragePercent || 0}% total checklist coverage</small></div>
          <div><span>Stuck-flow blockers</span><strong>{summary.stuckFlowBlockers || 0}</strong><small>User cannot get stuck scenarios</small></div>
          <div><span>Mobile blockers</span><strong>{summary.mobileBlockers || 0}</strong><small>Viewport QA open items</small></div>
        </div>
        <div className="admin-provider-summary">
          <div><span>Payment safety blockers</span><strong>{summary.paymentFailureBlockers || 0}</strong><small>Payment remains parked/manual</small></div>
          <div><span>Support blockers</span><strong>{summary.supportHandoffBlockers || 0}</strong><small>Human handoff QA</small></div>
          <div><span>UAT signoff</span><strong>{titleCase(summary.uatSignoffStatus || "not_ready")}</strong><StatusBadge value={summary.uatSignoffStatus || "not_ready"} /></div>
          <div><span>Data mode</span><strong>{qa.persisted ? "Database-backed" : "Mock/manual fallback"}</strong><StatusBadge value={qa.persisted ? "configured" : "mock_demo"} /></div>
        </div>
      </div>

      {summary.launchBlockers?.length ? (
        <div className="admin-stack-list">
          {summary.launchBlockers.map((blocker) => (
            <article className="admin-compact-row" key={blocker}>
              <div><strong>{blocker}</strong><span>Launch-blocking until tested, fixed, or signed off.</span></div>
              <StatusBadge value="blocked" />
            </article>
          ))}
        </div>
      ) : null}

      <div className="admin-filter-row admin-filter-row-wrap">
        <select aria-label="Customer QA category filter" onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
          <option value="all">All QA areas</option>
          {categoryGroups.map(([category, title]) => <option key={category} value={category}>{title}</option>)}
        </select>
        <select aria-label="Customer QA status filter" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
          <option value="all">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
        </select>
        <button className="admin-secondary-button" onClick={() => { setCategoryFilter("all"); setStatusFilter("all"); }} type="button">Clear</button>
      </div>

      {visibleGroups.map(([category, title, items]) => (
        <section className="admin-subpanel" key={category}>
          <SectionHeader
            detail={category === "payment_failure" ? "No fake paid or issued-policy state is allowed while payment launch is parked." : category === "mobile" ? "Viewport records cover input usability, text overlap, scroll behavior, and chat interaction safety." : null}
            eyebrow={titleCase(category)}
            title={title}
          />
          <div className="admin-table-wrap">
            <table className="admin-table admin-table-dense">
              <thead>
                <tr>
                  <th scope="col">QA item</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Evidence / note</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? items.map((item) => {
                  const canManageItem = canManageCustomerLaunchQaItem(session, item);
                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.title}</strong>
                        <small>{item.description}</small>
                        {item.viewport ? <small>Viewport: {titleCase(item.viewport)}</small> : null}
                      </td>
                      <td>{titleCase(item.ownerRole || "unassigned")}<small>{item.slaHours ? `${item.slaHours}h SLA` : "No SLA"}</small></td>
                      <td>
                        <strong>{item.reviewerName || "Unassigned"}</strong>
                        <small>{item.reviewerNote || "No reviewer note"}</small>
                        <small>{formatDateTime(item.dueAt)}</small>
                      </td>
                      <td>
                        <StatusBadge value={item.status} />
                        {item.blocker ? <StatusBadge value="blocked" /> : <StatusBadge value="passed" />}
                        <small>{item.launchBlocking ? "Launch-blocking" : "Optional"}</small>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          {canManageItem ? (
                            <>
                              <button className="admin-inline-button" onClick={() => openQaItemAction(item, "in_progress", true)} type="button">Progress</button>
                              <button className="admin-inline-button" onClick={() => openQaItemAction(item, "passed", false)} type="button">Pass</button>
                              <button className="admin-inline-button" onClick={() => openQaItemAction(item, "needs_fix", true)} type="button">Needs fix</button>
                              <button className="admin-inline-button" onClick={() => openQaItemAction(item, "blocked", true)} type="button">Block</button>
                            </>
                          ) : <small>Inspect only</small>}
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={5}>No QA items match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {!compact ? (
        <section className="admin-subpanel">
          <SectionHeader eyebrow="Staging UAT" title="UAT runs and signoff" detail="Founder, ops, or compliance signoff is blocked while launch QA blockers remain." />
          <div className="admin-table-wrap">
            <table className="admin-table admin-table-dense">
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Tester</th>
                  <th scope="col">Blockers</th>
                  <th scope="col">Signoff</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(qa.uatRuns || []).map((run) => (
                  <tr key={run.id}>
                    <td><strong>{run.runName}</strong><small>{run.environment} - {titleCase(run.status)}</small></td>
                    <td>{run.testerName || "Unassigned"}<small>{run.team || titleCase(run.testerRole || "team")}</small></td>
                    <td><strong>{run.blockerCount}</strong><small>{run.notes || "No notes"}</small></td>
                    <td><StatusBadge value={run.signoffStatus} /><small>{run.signedOffAt ? formatDateTime(run.signedOffAt) : run.signoffReason || "Not signed off"}</small></td>
                    <td>
                      <div className="admin-row-actions">
                        {canManageUat ? (
                          <>
                            <button className="admin-inline-button" onClick={() => openUatAction(run, { status: "in_progress", signoffStatus: "not_ready" }, `Mark ${run.runName} in progress`, "Mark in progress")} type="button">Progress</button>
                            <button className="admin-inline-button" onClick={() => openUatAction(run, { signoffStatus: "ready_for_review" }, `Mark ${run.runName} ready for review`, "Ready for review")} type="button">Review</button>
                            <button className="admin-inline-button" onClick={() => openUatAction(run, { status: "completed", signoffStatus: "signed_off" }, `Sign off ${run.runName}`, "Sign off")} type="button">Sign off</button>
                            <button className="admin-inline-button" onClick={() => openUatAction(run, { signoffStatus: "blocked" }, `Block ${run.runName}`, "Block")} type="button">Block</button>
                          </>
                        ) : <small>Inspect only</small>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!qa.uatRuns?.length ? <tr><td colSpan={5}>No staging UAT runs yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function BusinessDashboard({ actions, data, session }) {
  const canRevealField = hasPermission(session, REVEAL_PERMISSION);
  return (
    <>
      <DashboardHero
        dataMode={data.dataMode}
        dataModeDetail={data.dataModeDetail}
        detail="Run renewals, quote requests, payment follow-up, support, reminders, and agent-ready operations without implying live issuance."
        eyebrow="Business Admin"
        generatedAt={data.generatedAt}
        title="Renewal operations command center"
      />
      <MetricGrid metrics={data.metrics} />
      <EmailProviderStatusPanel status={data.emailProviderStatus} />
      <NotificationPreferencesPanel actions={actions} preferences={data.notificationPreferences || []} session={session} />
      <RenewalOpsPanel actions={actions} renewalOps={data.renewalOps} session={session} />
      <PaymentLaunchPanel actions={actions} paymentLaunch={data.paymentLaunch} session={session} />
      <CustomerLaunchQaPanel actions={actions} customerLaunchQa={data.customerLaunchQa} session={session} />
      <section className="admin-panel">
        <SectionHeader
          action={<ExportButton onExport={actions.openExport} scope={{ label: "renewal pipeline", targetType: "renewals", targetId: "renewal-pipeline" }} session={session} />}
          detail="IC, phone, email, and address are masked until a reason is logged."
          eyebrow="Pipeline"
          title="Quote and renewal requests"
        />
        <div className="admin-filter-row">
          <select aria-label="Status filter" defaultValue="all">
            <option value="all">All statuses</option>
            <option value="quote_review">Quote review</option>
            <option value="payment_pending">Payment pending</option>
            <option value="support_needed">Support needed</option>
          </select>
          <select aria-label="Owner filter" defaultValue="all">
            <option value="all">All owners</option>
            <option value="ops">Ops</option>
            <option value="finance">Finance</option>
            <option value="support">Support</option>
          </select>
          <button className="admin-secondary-button" type="button">Apply filters</button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table-dense">
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Customer</th>
                <th scope="col">IC</th>
                <th scope="col">Contact</th>
                <th scope="col">Address</th>
                <th scope="col">Vehicle</th>
                <th scope="col">Premium</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.renewalRequests.map((request) => (
                <tr key={request.id}>
                  <td><strong>{request.id}</strong><small>{formatDateTime(request.updatedAt)}</small></td>
                  <td><strong>{request.customerName}</strong><small>{request.owner}</small></td>
                  <td>
                    <SensitiveField
                      canRevealField={canRevealField}
                      field="ic"
                      label={`${request.id} IC`}
                      onReveal={actions.openReveal}
                      revealed={actions.revealed}
                      targetId={request.id}
                      targetType="customer"
                      value={request.ic}
                    />
                  </td>
                  <td>
                    <SensitiveField
                      canRevealField={canRevealField}
                      field="email"
                      label={`${request.id} email`}
                      onReveal={actions.openReveal}
                      revealed={actions.revealed}
                      targetId={request.id}
                      targetType="customer"
                      value={request.email}
                    />
                    <SensitiveField
                      canRevealField={canRevealField}
                      field="phone"
                      label={`${request.id} phone`}
                      onReveal={actions.openReveal}
                      revealed={actions.revealed}
                      targetId={request.id}
                      targetType="customer"
                      value={request.phone}
                    />
                  </td>
                  <td>
                    <SensitiveField
                      canRevealField={canRevealField}
                      field="address"
                      label={`${request.id} address`}
                      onReveal={actions.openReveal}
                      revealed={actions.revealed}
                      targetId={request.id}
                      targetType="customer"
                      value={request.address}
                    />
                  </td>
                  <td><strong>{request.vehicle}</strong><small>{request.plate} - {request.insurer}</small></td>
                  <td><strong>{request.premium}</strong><small>Road tax: {request.roadTax}</small></td>
                  <td><StatusBadge value={request.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="admin-two-column">
        <section className="admin-panel">
          <SectionHeader eyebrow="Payment ops" title="Provider-agnostic payment monitor" />
          <div className="admin-stack-list">
            {data.paymentEvents.map((event) => (
              <article className="admin-compact-row" key={event.id}>
                <div><strong>{event.id}</strong><span>{event.customerRef} - {event.method}</span></div>
                <div><strong>{event.amount}</strong><StatusBadge value={event.status} /></div>
              </article>
            ))}
          </div>
        </section>
        <section className="admin-panel">
          <SectionHeader eyebrow="Support" title="Inbox requiring human follow-up" />
          <div className="admin-stack-list">
            {data.supportInbox.map((item) => (
              <article className="admin-compact-row" key={item.id}>
                <div><strong>{item.topic}</strong><span>{item.id} - {item.owner}</span></div>
                <div><strong>{item.age}</strong><StatusBadge value={item.priority} /></div>
              </article>
            ))}
          </div>
        </section>
      </div>
      <section className="admin-panel">
        <SectionHeader eyebrow="Audit" title="Recent reveal and export log" detail="Reveal/export rows are persisted when the admin database migration is applied." />
        <AuditLogTable logs={actions.auditLogs} />
      </section>
    </>
  );
}

function AiKnowledgeDashboard({ actions, data, session }) {
  return (
    <>
      <DashboardHero
        dataMode={data.dataMode}
        dataModeDetail={data.dataModeDetail}
        detail="Improve answer quality, inspect source traces, review approved facts, and keep AI recommendations compliant."
        eyebrow="AI & Knowledge Admin"
        generatedAt={data.generatedAt}
        title="AI quality and insurer knowledge control room"
      />
      <MetricGrid metrics={data.metrics} />
      <CustomerLaunchQaPanel actions={actions} compact customerLaunchQa={data.customerLaunchQa} session={session} />
      <section className="admin-panel">
        <SectionHeader
          action={<div className="admin-action-group"><Link className="admin-secondary-button" href="/admin/conversations">Open audit tool</Link><ExportButton onExport={actions.openExport} scope={{ label: "AI review queue", targetType: "ai_review", targetId: "ai-review-queue" }} session={session} /></div>}
          detail="Review risky or unsupported answers before they become product guidance."
          eyebrow="Conversation QA"
          title="AI review queue"
        />
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Conversation</th>
                <th scope="col">User question</th>
                <th scope="col">Category</th>
                <th scope="col">Source trace</th>
                <th scope="col">Reviewer</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.reviewQueue.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.id}</strong></td>
                  <td>{item.userQuestion}</td>
                  <td>{titleCase(item.category)}</td>
                  <td><code>{item.sourceTrace}</code></td>
                  <td>{item.reviewer}</td>
                  <td><StatusBadge value={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="admin-panel">
        <SectionHeader
          action={<Link className="admin-secondary-button" href="/admin/knowledge">Open fact review</Link>}
          detail="Facts need effective and expiry dates before they should ground recommendations."
          eyebrow="Knowledge governance"
          title="Approved insurer facts"
        />
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Fact</th>
                <th scope="col">Insurer</th>
                <th scope="col">Effective</th>
                <th scope="col">Expiry</th>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.approvedFacts.map((fact) => (
                <tr key={fact.id}>
                  <td><strong>{fact.title}</strong><small>{fact.id}</small></td>
                  <td>{fact.insurer}</td>
                  <td>{fact.effectiveFrom}</td>
                  <td>{fact.effectiveTo}</td>
                  <td>{fact.source}</td>
                  <td><StatusBadge value={fact.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="admin-two-column">
        <section className="admin-panel">
          <SectionHeader eyebrow="Prompt policy" title="Active recommendation guardrails" />
          <div className="admin-stack-list">
            {data.promptPolicies.map((policy) => (
              <article className="admin-compact-row" key={policy.id}>
                <div><strong>{policy.name}</strong><span>{policy.id} - {policy.owner}</span></div>
                <StatusBadge value={policy.status} />
              </article>
            ))}
          </div>
        </section>
        <section className="admin-panel">
          <SectionHeader eyebrow="Audit" title="Recent AI admin actions" />
          <AuditLogTable logs={actions.auditLogs} />
        </section>
      </div>
    </>
  );
}

function PermissionPills({ permissions }) {
  const visible = permissions.slice(0, 5);
  const remainder = permissions.length - visible.length;
  return (
    <div className="admin-permission-pills">
      {visible.map((permission) => <span key={permission}>{formatPermissionLabel(permission)}</span>)}
      {remainder > 0 ? <span>+{remainder}</span> : null}
    </div>
  );
}

function AdminUserCreateForm({ actions, isFounder }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "ops",
    reason: "",
  });
  const [inviteUrl, setInviteUrl] = useState("");
  const [delivery, setDelivery] = useState(null);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitCreate(event) {
    event.preventDefault();
    setInviteUrl("");
    setDelivery(null);
    const result = await actions.runAdminMutation({
      endpoint: "/api/admin/users",
      method: "POST",
      body: form,
      successMessage: "Manual invite link created.",
    });
    if (result) {
      setInviteUrl(result?.invite?.manualInviteUrl || "");
      setDelivery({
        status: result?.invite?.deliveryStatus || "manual_required",
        provider: result?.invite?.deliveryProvider || "manual",
        error: result?.invite?.deliveryError || "",
      });
      setForm({ name: "", email: "", role: "ops", reason: "" });
    }
  }

  return (
    <form className="admin-inline-form" onSubmit={submitCreate}>
      <label>
        <span>Name</span>
        <input
          disabled={!isFounder || actions.busy}
          onChange={(event) => updateForm("name", event.target.value)}
          placeholder="Ops Reviewer"
          value={form.name}
        />
      </label>
      <label>
        <span>Email</span>
        <input
          disabled={!isFounder || actions.busy}
          onChange={(event) => updateForm("email", event.target.value)}
          placeholder="admin@lajoo.my"
          type="email"
          value={form.email}
        />
      </label>
      <label>
        <span>Role</span>
        <select disabled={!isFounder || actions.busy} onChange={(event) => updateForm("role", event.target.value)} value={form.role}>
          {ADMIN_ROLES.map((role) => <option key={role} value={role}>{titleCase(role)}</option>)}
        </select>
      </label>
      <label className="admin-inline-form-wide">
        <span>Required reason</span>
        <input
          disabled={!isFounder || actions.busy}
          onChange={(event) => updateForm("reason", event.target.value)}
          placeholder="Example: New ops user for payment follow-up coverage."
          value={form.reason}
        />
      </label>
      <div className="admin-inline-form-actions">
        <small>Invite email sends only when provider env vars are configured; otherwise use the manual setup link.</small>
        <button className="admin-primary-button" disabled={!isFounder || actions.busy} type="submit">
          Create invite
        </button>
      </div>
      {delivery ? (
        <div className="admin-inline-form-full admin-delivery-status">
          <StatusBadge value={delivery.status} />
          <span>{delivery.provider ? `Provider: ${delivery.provider}` : "Manual invite fallback"}</span>
          {delivery.error ? <small>{delivery.error}</small> : null}
        </div>
      ) : null}
      {inviteUrl ? (
        <label className="admin-inline-form-full">
          <span>Manual invite setup link</span>
          <input readOnly value={inviteUrl} />
        </label>
      ) : null}
    </form>
  );
}

function EmailProviderStatusPanel({ actions, session, status }) {
  const safeStatus = status || { provider: "manual", configured: false, required: [], optional: [], deliveryMode: "manual_fallback" };
  const events = safeStatus.deliveryEvents || [];
  const webhook = safeStatus.webhook || {};
  const webhookEvents = safeStatus.webhookEvents || [];
  const webhookChecks = safeStatus.webhookStatusChecks || [];
  const monitoringState = webhook.monitoringState || {};
  const monitoringAlerts = safeStatus.webhookMonitoringAlerts || webhook.monitoringAlerts || [];
  const registration = webhook.registration || webhookChecks[0] || null;
  const productionReadiness = safeStatus.productionReadiness || {};
  return (
    <section className="admin-panel">
      <SectionHeader
        action={actions ? (
          <button
            className="admin-secondary-button"
            disabled={actions.busy}
            onClick={() => actions.openOperation({
              eyebrow: "Resend webhook",
              title: "Check Resend webhook registration",
              endpoint: "/api/admin/webhooks/resend/status",
              method: "POST",
              payload: {},
              submitLabel: "Check webhook",
            })}
            type="button"
          >
            Check webhook
          </button>
        ) : null}
        detail="Resend invite delivery uses env vars only. Secret values, API keys, and message contents are never shown here."
        eyebrow="Invite email"
        title="Provider readiness and delivery monitoring"
      />
      <div className="admin-provider-status">
        <article className="admin-compact-row">
          <div>
            <strong>{titleCase(safeStatus.provider)}</strong>
            <span>{safeStatus.safeMessage || "Manual invite links remain available when provider delivery is not configured."}</span>
          </div>
          <StatusBadge value={safeStatus.status || (safeStatus.configured ? "configured" : safeStatus.deliveryMode || "manual_fallback")} />
        </article>
        <div className="admin-provider-summary">
          <div><span>Domain</span><strong>{safeStatus.domain || "Not configured"}</strong></div>
          <div><span>Domain status</span><StatusBadge value={safeStatus.domainStatus || "unchecked"} /></div>
          <div><span>Last send</span><StatusBadge value={safeStatus.lastSendStatus || "none"} /></div>
          <div><span>Last error</span><StatusBadge value={safeStatus.lastErrorClass || "none"} /></div>
          <div><span>Webhook</span><StatusBadge value={webhook.status || "missing_env"} /></div>
          <div><span>Endpoint</span><strong>{webhook.endpointUrl || webhook.endpoint || "Configure public base URL"}</strong></div>
          <div><span>Registration</span><StatusBadge value={webhook.registrationStatus || registration?.status || "not_checked"} /></div>
          <div><span>Monitor</span><StatusBadge value={monitoringState.status || "not_checked"} /></div>
          <div><span>Severity</span><StatusBadge value={monitoringState.severity || "none"} /></div>
          <div><span>Last webhook</span><StatusBadge value={webhook.lastWebhookStatus || "none"} /></div>
          <div><span>Verification</span><StatusBadge value={webhook.lastVerificationStatus || "not_received"} /></div>
        </div>
        <div className="admin-provider-summary">
          <div><span>Resend API</span><StatusBadge value={productionReadiness.resendApiConfigured ? "configured" : "missing_env"} /></div>
          <div><span>Sender domain</span><StatusBadge value={productionReadiness.senderDomainStatus || "unchecked"} /></div>
          <div><span>Webhook secret</span><StatusBadge value={productionReadiness.webhookSecretConfigured ? "configured" : "missing"} /></div>
          <div><span>Endpoint registered</span><StatusBadge value={productionReadiness.webhookEndpointRegistered ? "registered" : "missing"} /></div>
          <div><span>Required events</span><StatusBadge value={productionReadiness.requiredEventsCovered ? "covered" : "missing"} /></div>
          <div><span>Production ready</span><StatusBadge value={productionReadiness.ready ? "ready" : "manual_fallback"} /></div>
        </div>
        <div className="admin-env-grid">
          {(safeStatus.required || []).map((item) => (
            <div key={item.key}>
              <span>{item.key}</span>
              <StatusBadge value={item.configured ? "configured" : "missing"} />
            </div>
          ))}
          {(safeStatus.optional || []).map((item) => (
            <div key={item.key}>
              <span>{item.key}</span>
              <StatusBadge value={item.configured ? "configured" : "optional"} />
            </div>
          ))}
          {(webhook.required || []).map((item) => (
            <div key={item.key}>
              <span>{item.key}</span>
              <StatusBadge value={item.configured ? "configured" : "missing"} />
            </div>
          ))}
        </div>
        {safeStatus.providerError ? <p className="admin-form-error">{safeStatus.providerError}</p> : null}
        {monitoringAlerts.length ? (
          <div className="admin-stack-list">
            {monitoringAlerts.slice(0, 4).map((alert) => (
              <article className="admin-compact-row" key={alert.id}>
                <div>
                  <strong>{titleCase(alert.alertType)}</strong>
                  <span>{alert.message}</span>
                  <small>
                    {alert.assignedToEmail ? `Assigned ${alert.assignedToEmail}` : "Unassigned"} - {alert.snoozedUntil ? `Snoozed until ${formatDateTime(alert.snoozedUntil)}` : "Not snoozed"}
                  </small>
                </div>
                <div className="admin-row-actions">
                  <StatusBadge value={alert.priority || "normal"} />
                  <StatusBadge value={alert.severity} />
                  <StatusBadge value={alert.status} />
                  <button
                    className="admin-inline-button"
                    disabled={!actions || actions.busy || alert.status === "resolved"}
                    onClick={() => actions.openOperation({
                      eyebrow: "Webhook alert",
                      title: `Acknowledge ${titleCase(alert.alertType)}`,
                      endpoint: "/api/admin/webhooks/resend/alerts",
                      method: "PATCH",
                      payload: { alertId: alert.id, operation: "acknowledge" },
                    })}
                    type="button"
                  >
                    Acknowledge
                  </button>
                  <button
                    className="admin-inline-button"
                    disabled={!actions || actions.busy || !session?.id || alert.assignedToUserId === session.id}
                    onClick={() => actions.openOperation({
                      eyebrow: "Webhook alert",
                      title: `Assign ${titleCase(alert.alertType)} to you`,
                      endpoint: "/api/admin/webhooks/resend/alerts",
                      method: "PATCH",
                      payload: { alertId: alert.id, operation: "assign", assignedToUserId: session?.id, priority: alert.priority || "normal" },
                    })}
                    type="button"
                  >
                    Assign me
                  </button>
                  <button
                    className="admin-inline-button"
                    disabled={!actions || actions.busy || alert.status === "resolved"}
                    onClick={() => actions.openOperation({
                      eyebrow: "Webhook alert",
                      title: `Snooze ${titleCase(alert.alertType)} for 24 hours`,
                      endpoint: "/api/admin/webhooks/resend/alerts",
                      method: "PATCH",
                      payload: {
                        alertId: alert.id,
                        operation: "snooze",
                        snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                      },
                    })}
                    type="button"
                  >
                    Snooze
                  </button>
                  <button
                    className="admin-inline-button"
                    disabled={!actions || actions.busy || alert.status === "resolved"}
                    onClick={() => actions.openOperation({
                      eyebrow: "Webhook alert",
                      title: `Resolve ${titleCase(alert.alertType)}`,
                      endpoint: "/api/admin/webhooks/resend/alerts",
                      method: "PATCH",
                      payload: { alertId: alert.id, operation: "resolve" },
                    })}
                    type="button"
                  >
                    Resolve
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {registration ? (
          <article className="admin-compact-row">
            <div>
              <strong>Last registration check</strong>
              <span>{formatDateTime(registration.checkedAt)} - {registration.endpointMatched ? "Endpoint registered" : "Endpoint not matched"}</span>
            </div>
            <div className="admin-row-actions">
              <StatusBadge value={registration.status} />
              <StatusBadge value={`${registration.webhookCount || 0}_webhooks`} />
              {registration.requiredEventsMissing?.length ? <StatusBadge value="events_missing" /> : null}
            </div>
          </article>
        ) : null}
        {events.length ? (
          <div className="admin-delivery-events">
            {events.map((event) => (
              <article key={event.id}>
                <div>
                  <strong>{event.email}</strong>
                  <span>{formatDateTime(event.createdAt)} - {event.provider}</span>
                </div>
                <div>
                  <StatusBadge value={event.status} />
                  {event.errorClass ? <StatusBadge value={event.errorClass} /> : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {webhookEvents.length ? (
          <div className="admin-delivery-events">
            {webhookEvents.map((event) => (
              <article key={event.id}>
                <div>
                  <strong>{event.eventType}</strong>
                  <span>{formatDateTime(event.receivedAt)} - {event.recipientMasked || "No recipient stored"}</span>
                </div>
                <div>
                  <StatusBadge value={event.status} />
                  <StatusBadge value={event.verificationStatus} />
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function WebhookIncidentDashboardPanel({ actions, alerts = [], summary = {}, session, teamMembers = [] }) {
  const [filters, setFilters] = useState({
    status: "all",
    owner: "all",
    priority: "all",
    provider: "all",
    alertType: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [priorityDrafts, setPriorityDrafts] = useState({});
  const alertTypes = Array.from(new Set(alerts.map((alert) => alert.alertType).filter(Boolean))).sort();
  const providers = Array.from(new Set(alerts.map((alert) => alert.provider || "resend"))).sort();
  const now = Date.now();
  const filteredAlerts = alerts.filter((alert) => {
    const incidentState = alert.incidentState || alert.status || "open";
    if (filters.status !== "all" && incidentState !== filters.status && alert.status !== filters.status) return false;
    if (filters.owner === "me" && alert.assignedToUserId !== session?.id) return false;
    if (filters.owner === "unassigned" && alert.assignedToUserId) return false;
    if (!["all", "me", "unassigned"].includes(filters.owner) && alert.assignedToUserId !== filters.owner) return false;
    if (filters.priority !== "all" && alert.priority !== filters.priority) return false;
    if (filters.provider !== "all" && (alert.provider || "resend") !== filters.provider) return false;
    if (filters.alertType !== "all" && alert.alertType !== filters.alertType) return false;
    if (filters.dateFrom && new Date(alert.detectedAt || alert.createdAt).getTime() < new Date(`${filters.dateFrom}T00:00:00`).getTime()) return false;
    if (filters.dateTo && new Date(alert.detectedAt || alert.createdAt).getTime() > new Date(`${filters.dateTo}T23:59:59`).getTime()) return false;
    return true;
  });

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateAssignment(alertId, value) {
    setAssignmentDrafts((current) => ({ ...current, [alertId]: value }));
  }

  function updatePriority(alertId, value) {
    setPriorityDrafts((current) => ({ ...current, [alertId]: value }));
  }

  return (
    <section className="admin-panel">
      <SectionHeader
        detail="Incident workflow is backed by persisted webhook monitoring alerts, workflow events, notifications, and admin audit logs."
        eyebrow="Incident ownership"
        title="Webhook alert incident dashboard"
      />
      <div className="admin-provider-summary">
        <div><span>Open</span><strong>{summary.open || 0}</strong></div>
        <div><span>Acknowledged</span><strong>{summary.acknowledged || 0}</strong></div>
        <div><span>Snoozed</span><strong>{summary.snoozed || 0}</strong></div>
        <div><span>Resolved</span><strong>{summary.resolved || 0}</strong></div>
        <div><span>Assigned to me</span><strong>{summary.assignedToMe || 0}</strong></div>
        <div><span>Snoozed expired</span><strong>{summary.snoozedExpired || 0}</strong></div>
        <div><span>High/critical unassigned</span><strong>{summary.highCriticalUnassigned || 0}</strong></div>
      </div>
      <div className="admin-filter-row admin-filter-row-wrap">
        <select aria-label="Alert status filter" onChange={(event) => updateFilter("status", event.target.value)} value={filters.status}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="snoozed">Snoozed</option>
          <option value="snoozed_expired">Snoozed expired</option>
          <option value="resolved">Resolved</option>
        </select>
        <select aria-label="Alert owner filter" onChange={(event) => updateFilter("owner", event.target.value)} value={filters.owner}>
          <option value="all">All owners</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
        <select aria-label="Alert priority filter" onChange={(event) => updateFilter("priority", event.target.value)} value={filters.priority}>
          <option value="all">All priorities</option>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <select aria-label="Alert provider filter" onChange={(event) => updateFilter("provider", event.target.value)} value={filters.provider}>
          <option value="all">All providers</option>
          {providers.map((provider) => <option key={provider} value={provider}>{titleCase(provider)}</option>)}
        </select>
        <select aria-label="Alert type filter" onChange={(event) => updateFilter("alertType", event.target.value)} value={filters.alertType}>
          <option value="all">All alert types</option>
          {alertTypes.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
        </select>
        <input aria-label="Alert from date" onChange={(event) => updateFilter("dateFrom", event.target.value)} type="date" value={filters.dateFrom} />
        <input aria-label="Alert to date" onChange={(event) => updateFilter("dateTo", event.target.value)} type="date" value={filters.dateTo} />
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Alert</th>
              <th scope="col">Owner</th>
              <th scope="col">Status</th>
              <th scope="col">Timestamps</th>
              <th scope="col">Workflow</th>
            </tr>
          </thead>
          <tbody>
            {filteredAlerts.map((alert) => {
              const assignmentValue = assignmentDrafts[alert.id] ?? alert.assignedToUserId ?? "unassigned";
              const priorityValue = priorityDrafts[alert.id] ?? alert.priority ?? "normal";
              const snoozedExpired = alert.status === "snoozed" && alert.snoozedUntil && new Date(alert.snoozedUntil).getTime() <= now;
              return (
                <tr key={alert.id}>
                  <td>
                    <strong>{titleCase(alert.alertType)}</strong>
                    <small>{alert.message}</small>
                    <small>{alert.provider || "resend"} - {alert.endpointMatched ? "endpoint matched" : "endpoint not matched"}</small>
                  </td>
                  <td>
                    <strong>{alert.assignedToEmail || "Unassigned"}</strong>
                    <select aria-label={`Assign ${alert.alertType}`} onChange={(event) => updateAssignment(alert.id, event.target.value)} value={assignmentValue}>
                      <option value="unassigned">Unassigned</option>
                      {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <StatusBadge value={alert.incidentState || alert.status} />
                    <StatusBadge value={alert.priority || "normal"} />
                    {snoozedExpired ? <StatusBadge value="snooze_expired" /> : null}
                  </td>
                  <td>
                    <small>Detected {formatDateTime(alert.detectedAt || alert.createdAt)}</small>
                    {alert.snoozedUntil ? <small>Snoozed until {formatDateTime(alert.snoozedUntil)}</small> : null}
                    {alert.resolvedAt ? <small>Resolved {formatDateTime(alert.resolvedAt)}</small> : null}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        className="admin-inline-button"
                        disabled={!actions || actions.busy || alert.status === "resolved"}
                        onClick={() => actions.openOperation({
                          eyebrow: "Webhook incident",
                          title: `Acknowledge ${titleCase(alert.alertType)}`,
                          endpoint: "/api/admin/webhooks/resend/alerts",
                          method: "PATCH",
                          payload: { alertId: alert.id, operation: "acknowledge" },
                        })}
                        type="button"
                      >
                        Acknowledge
                      </button>
                      <button
                        className="admin-inline-button"
                        disabled={!actions || actions.busy}
                        onClick={() => actions.openOperation({
                          eyebrow: "Webhook incident",
                          title: `Assign ${titleCase(alert.alertType)}`,
                          endpoint: "/api/admin/webhooks/resend/alerts",
                          method: "PATCH",
                          payload: {
                            alertId: alert.id,
                            operation: "assign",
                            assignedToUserId: assignmentValue,
                            priority: alert.priority || "normal",
                            note: "Assignment updated from incident dashboard.",
                          },
                        })}
                        type="button"
                      >
                        Assign
                      </button>
                      <select aria-label={`Priority ${alert.alertType}`} onChange={(event) => updatePriority(alert.id, event.target.value)} value={priorityValue}>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                      <button
                        className="admin-inline-button"
                        disabled={!actions || actions.busy}
                        onClick={() => actions.openOperation({
                          eyebrow: "Webhook incident",
                          title: `Change priority for ${titleCase(alert.alertType)}`,
                          endpoint: "/api/admin/webhooks/resend/alerts",
                          method: "PATCH",
                          payload: {
                            alertId: alert.id,
                            operation: "assign",
                            assignedToUserId: alert.assignedToUserId || "unassigned",
                            priority: priorityValue,
                            note: "Priority updated from incident dashboard.",
                          },
                        })}
                        type="button"
                      >
                        Priority
                      </button>
                      <button
                        className="admin-inline-button"
                        disabled={!actions || actions.busy || alert.status === "resolved"}
                        onClick={() => actions.openOperation({
                          eyebrow: "Webhook incident",
                          title: `Snooze ${titleCase(alert.alertType)} for 24 hours`,
                          endpoint: "/api/admin/webhooks/resend/alerts",
                          method: "PATCH",
                          payload: {
                            alertId: alert.id,
                            operation: "snooze",
                            snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                          },
                        })}
                        type="button"
                      >
                        Snooze
                      </button>
                      {alert.status === "resolved" ? (
                        <button
                          className="admin-inline-button"
                          disabled={!actions || actions.busy}
                          onClick={() => actions.openOperation({
                            eyebrow: "Webhook incident",
                            title: `Reopen ${titleCase(alert.alertType)}`,
                            endpoint: "/api/admin/webhooks/resend/alerts",
                            method: "PATCH",
                            payload: { alertId: alert.id, operation: "reopen" },
                          })}
                          type="button"
                        >
                          Reopen
                        </button>
                      ) : (
                        <button
                          className="admin-inline-button"
                          disabled={!actions || actions.busy}
                          onClick={() => actions.openOperation({
                            eyebrow: "Webhook incident",
                            title: `Resolve ${titleCase(alert.alertType)}`,
                            endpoint: "/api/admin/webhooks/resend/alerts",
                            method: "PATCH",
                            payload: { alertId: alert.id, operation: "resolve" },
                          })}
                          type="button"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredAlerts.length ? (
              <tr><td colSpan={5}>No webhook incidents match the current filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NotificationPreferenceRow({ actions, preference, session }) {
  const [emailEnabled, setEmailEnabled] = useState(preference.emailEnabled !== false);
  const [frequency, setFrequency] = useState(preference.frequency || "immediate");
  const [manualFallbackEnabled, setManualFallbackEnabled] = useState(preference.manualFallbackEnabled !== false);

  async function savePreference() {
    await actions.runAdminMutation({
      endpoint: "/api/admin/notification-preferences",
      method: "PATCH",
      body: {
        userId: session?.id,
        category: preference.category,
        emailEnabled,
        frequency,
        manualFallbackEnabled,
      },
      successMessage: "Notification preference updated.",
    });
  }

  return (
    <article className="admin-compact-row">
      <div>
        <strong>{titleCase(preference.category)}</strong>
        <span>Email is the only real channel for now; manual fallback remains visible when provider delivery is unavailable.</span>
      </div>
      <div className="admin-row-actions">
        <label className="admin-toggle-label">
          <input checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} type="checkbox" />
          <span>Email</span>
        </label>
        <label className="admin-toggle-label">
          <input checked={manualFallbackEnabled} onChange={(event) => setManualFallbackEnabled(event.target.checked)} type="checkbox" />
          <span>Manual</span>
        </label>
        <select aria-label={`${preference.category} frequency`} onChange={(event) => setFrequency(event.target.value)} value={frequency}>
          <option value="immediate">Immediate</option>
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="manual_only">Manual only</option>
        </select>
        <button className="admin-inline-button" disabled={actions.busy} onClick={savePreference} type="button">
          Save
        </button>
      </div>
    </article>
  );
}

function NotificationPreferencesPanel({ actions, preferences, session }) {
  return (
    <section className="admin-panel">
      <SectionHeader
        detail="Admin preferences are persisted per category. Email is used only when the provider is configured; manual fallback stays explicit."
        eyebrow="Notifications"
        title="Your admin notification preferences"
      />
      <div className="admin-stack-list">
        {(preferences || []).map((preference) => (
          <NotificationPreferenceRow actions={actions} key={preference.category} preference={preference} session={session} />
        ))}
      </div>
    </section>
  );
}

function NotificationDigestPanel({ actions, digestEvents, jobAttempts, schedulerReadiness, session }) {
  const [frequency, setFrequency] = useState("hourly");
  const canRunJob = ["founder", "compliance"].includes(session?.role);
  return (
    <section className="admin-panel">
      <SectionHeader
        detail="Digest emails contain only counts, status classes, and operational IDs. They are sent only when provider email is configured; otherwise a manual fallback event is persisted."
        eyebrow="Notification digests"
        title="Hourly and daily summaries"
        action={(
          <div className="admin-row-actions">
            <select aria-label="Digest frequency" onChange={(event) => setFrequency(event.target.value)} value={frequency}>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
            </select>
            <button
              className="admin-secondary-button"
              disabled={actions.busy}
              onClick={() => actions.openOperation({
                eyebrow: "Notification digest",
                title: `Send ${frequency} admin digest`,
                endpoint: "/api/admin/notification-digests",
                method: "POST",
                payload: { userId: session?.id, frequency },
                submitLabel: "Send digest",
              })}
              type="button"
            >
              Send digest
            </button>
            <button
              className="admin-secondary-button"
              disabled={!canRunJob || actions.busy}
              onClick={() => actions.openOperation({
                eyebrow: "Notification digest job",
                title: `Run ${frequency} admin digest job`,
                endpoint: "/api/admin/notification-digests/jobs",
                method: "POST",
                payload: { frequency },
                submitLabel: "Run digest job",
              })}
              type="button"
            >
              Run job
            </button>
          </div>
        )}
      />
      <div className="admin-provider-summary">
        <div><span>Scheduler</span><StatusBadge value={schedulerReadiness?.status || "manual_only"} /></div>
        <div><span>Live scheduled</span><StatusBadge value={schedulerReadiness?.liveScheduled ? "live" : "not_live"} /></div>
        <div><span>Manual trigger</span><StatusBadge value={schedulerReadiness?.manualTriggerAvailable ? "available" : "blocked"} /></div>
        <div><span>Supported</span><strong>{(schedulerReadiness?.supportedFrequencies || ["hourly", "daily"]).join(", ")}</strong></div>
      </div>
      {schedulerReadiness?.note ? <p className="admin-muted-note">{schedulerReadiness.note}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Frequency</th>
              <th scope="col">Status</th>
              <th scope="col">Items</th>
              <th scope="col">Delivery</th>
            </tr>
          </thead>
          <tbody>
            {(digestEvents || []).map((event) => (
              <tr key={event.id}>
                <td>{formatDateTime(event.createdAt)}</td>
                <td><StatusBadge value={event.frequency} /></td>
                <td><StatusBadge value={event.status} /></td>
                <td>{event.itemCount}</td>
                <td>
                  <StatusBadge value={event.deliveryStatus || (event.manualFallback ? "manual_fallback" : "not_sent")} />
                  <small>{event.deliveryProvider || "manual"}</small>
                </td>
              </tr>
            ))}
            {!(digestEvents || []).length ? (
              <tr><td colSpan={5}>No digest attempts yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Job time</th>
              <th scope="col">Frequency</th>
              <th scope="col">Status</th>
              <th scope="col">Targets</th>
              <th scope="col">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {(jobAttempts || []).map((attempt) => (
              <tr key={attempt.id}>
                <td>{formatDateTime(attempt.startedAt)}</td>
                <td><StatusBadge value={attempt.frequency} /></td>
                <td><StatusBadge value={attempt.status} /></td>
                <td>{attempt.targetUserCount} users</td>
                <td>
                  <span>{attempt.sentCount} sent, {attempt.manualFallbackCount} manual, {attempt.failedCount} failed</span>
                  <small>{attempt.itemCount} no-PII items</small>
                </td>
              </tr>
            ))}
            {!(jobAttempts || []).length ? (
              <tr><td colSpan={5}>No digest job runs yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CronExecutionAlertsPanel({ actions, alerts, summary, session, teamMembers }) {
  const [filters, setFilters] = useState({
    status: "all",
    owner: "all",
    priority: "all",
    jobKind: "all",
    alertType: "all",
  });
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [priorityDrafts, setPriorityDrafts] = useState({});
  const canManage = canManageCronAlert(session);
  const alertTypes = Array.from(new Set((alerts || []).map((alert) => alert.alertType).filter(Boolean))).sort();
  const jobKinds = Array.from(new Set((alerts || []).map((alert) => alert.jobKind).filter(Boolean))).sort();
  const now = Date.now();
  const filteredAlerts = (alerts || []).filter((alert) => {
    const incidentState = alert.incidentState || alert.status || "open";
    if (filters.status !== "all" && incidentState !== filters.status && alert.status !== filters.status) return false;
    if (filters.owner === "me" && alert.assignedToUserId !== session?.id) return false;
    if (filters.owner === "unassigned" && alert.assignedToUserId) return false;
    if (!["all", "me", "unassigned"].includes(filters.owner) && alert.assignedToUserId !== filters.owner) return false;
    if (filters.priority !== "all" && alert.priority !== filters.priority) return false;
    if (filters.jobKind !== "all" && alert.jobKind !== filters.jobKind) return false;
    if (filters.alertType !== "all" && alert.alertType !== filters.alertType) return false;
    return true;
  });

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateAssignment(alertId, value) {
    setAssignmentDrafts((current) => ({ ...current, [alertId]: value }));
  }

  function updatePriority(alertId, value) {
    setPriorityDrafts((current) => ({ ...current, [alertId]: value }));
  }

  return (
    <section className="admin-panel">
      <SectionHeader
        detail="Cron execution alerts are created from persisted scheduled job attempts and auto-resolved after a clean successful run."
        eyebrow="Cron execution alerts"
        title="Admin scheduled job incidents"
      />
      <div className="admin-provider-summary">
        <div><span>Active</span><strong>{summary?.active || 0}</strong></div>
        <div><span>Open</span><strong>{summary?.open || 0}</strong></div>
        <div><span>Assigned to me</span><strong>{summary?.assignedToMe || 0}</strong></div>
        <div><span>Repeated failures</span><strong>{summary?.repeatedFailures || 0}</strong></div>
        <div><span>Stale success</span><strong>{summary?.staleSuccess || 0}</strong></div>
        <div><span>Disabled by env</span><strong>{summary?.disabledByEnv || 0}</strong></div>
        <div><span>High/critical unassigned</span><strong>{summary?.highCriticalUnassigned || 0}</strong></div>
      </div>
      <div className="admin-filter-row admin-filter-row-wrap">
        <select aria-label="Cron alert status filter" onChange={(event) => updateFilter("status", event.target.value)} value={filters.status}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="snoozed">Snoozed</option>
          <option value="snoozed_expired">Snoozed expired</option>
          <option value="resolved">Resolved</option>
        </select>
        <select aria-label="Cron alert owner filter" onChange={(event) => updateFilter("owner", event.target.value)} value={filters.owner}>
          <option value="all">All owners</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
        <select aria-label="Cron alert priority filter" onChange={(event) => updateFilter("priority", event.target.value)} value={filters.priority}>
          <option value="all">All priorities</option>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <select aria-label="Cron alert job filter" onChange={(event) => updateFilter("jobKind", event.target.value)} value={filters.jobKind}>
          <option value="all">All jobs</option>
          {jobKinds.map((kind) => <option key={kind} value={kind}>{titleCase(kind)}</option>)}
        </select>
        <select aria-label="Cron alert type filter" onChange={(event) => updateFilter("alertType", event.target.value)} value={filters.alertType}>
          <option value="all">All alert types</option>
          {alertTypes.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
        </select>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Alert</th>
              <th scope="col">Owner</th>
              <th scope="col">State</th>
              <th scope="col">Last run</th>
              <th scope="col">Workflow</th>
            </tr>
          </thead>
          <tbody>
            {filteredAlerts.map((alert) => {
              const assignmentValue = assignmentDrafts[alert.id] ?? alert.assignedToUserId ?? "unassigned";
              const priorityValue = priorityDrafts[alert.id] ?? alert.priority ?? "normal";
              const snoozedExpired = alert.status === "snoozed" && alert.snoozedUntil && new Date(alert.snoozedUntil).getTime() <= now;
              return (
                <tr key={alert.id}>
                  <td>
                    <strong>{titleCase(alert.alertType)}</strong>
                    <small>{alert.message}</small>
                    <small>{titleCase(alert.jobKind)} - {alert.jobName}</small>
                    {alert.scheduledJobAttemptId ? <small>Attempt {alert.scheduledJobAttemptId}</small> : null}
                  </td>
                  <td>
                    <strong>{alert.assignedToEmail || "Unassigned"}</strong>
                    <select aria-label={`Assign ${alert.alertType}`} disabled={!canManage} onChange={(event) => updateAssignment(alert.id, event.target.value)} value={assignmentValue}>
                      <option value="unassigned">Unassigned</option>
                      {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <StatusBadge value={alert.incidentState || alert.status} />
                    <StatusBadge value={alert.priority || "normal"} />
                    {alert.severity ? <StatusBadge value={alert.severity} /> : null}
                    {snoozedExpired ? <StatusBadge value="snooze_expired" /> : null}
                  </td>
                  <td>
                    <small>Status {titleCase(alert.lastAttemptStatus || "not_captured")}</small>
                    <small>Attempt {formatDateTime(alert.lastAttemptAt)}</small>
                    <small>Last success {formatDateTime(alert.lastSuccessAt)}</small>
                    <small>{alert.failureCount || 0} failures, {alert.skippedCount || 0} skipped</small>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        className="admin-inline-button"
                        disabled={!canManage || actions.busy || alert.status === "resolved"}
                        onClick={() => actions.openOperation({
                          eyebrow: "Cron execution alert",
                          title: `Acknowledge ${titleCase(alert.alertType)}`,
                          endpoint: "/api/admin/cron/alerts",
                          method: "PATCH",
                          payload: { alertId: alert.id, operation: "acknowledge" },
                        })}
                        type="button"
                      >
                        Acknowledge
                      </button>
                      <button
                        className="admin-inline-button"
                        disabled={!canManage || actions.busy || assignmentValue === "unassigned"}
                        onClick={() => actions.openOperation({
                          eyebrow: "Cron execution alert",
                          title: `Assign ${titleCase(alert.alertType)}`,
                          endpoint: "/api/admin/cron/alerts",
                          method: "PATCH",
                          payload: {
                            alertId: alert.id,
                            operation: "assign",
                            assignedToUserId: assignmentValue,
                            note: "Assignment updated from cron execution dashboard.",
                          },
                        })}
                        type="button"
                      >
                        Assign
                      </button>
                      <select aria-label={`Cron alert priority ${alert.alertType}`} disabled={!canManage} onChange={(event) => updatePriority(alert.id, event.target.value)} value={priorityValue}>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                      <button
                        className="admin-inline-button"
                        disabled={!canManage || actions.busy}
                        onClick={() => actions.openOperation({
                          eyebrow: "Cron execution alert",
                          title: `Change priority for ${titleCase(alert.alertType)}`,
                          endpoint: "/api/admin/cron/alerts",
                          method: "PATCH",
                          payload: {
                            alertId: alert.id,
                            operation: "set_priority",
                            priority: priorityValue,
                            note: "Priority updated from cron execution dashboard.",
                          },
                        })}
                        type="button"
                      >
                        Priority
                      </button>
                      <button
                        className="admin-inline-button"
                        disabled={!canManage || actions.busy || alert.status === "resolved"}
                        onClick={() => actions.openOperation({
                          eyebrow: "Cron execution alert",
                          title: `Snooze ${titleCase(alert.alertType)} for 24 hours`,
                          endpoint: "/api/admin/cron/alerts",
                          method: "PATCH",
                          payload: {
                            alertId: alert.id,
                            operation: "snooze",
                            snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                          },
                        })}
                        type="button"
                      >
                        Snooze
                      </button>
                      {alert.status === "resolved" ? (
                        <button
                          className="admin-inline-button"
                          disabled={!canManage || actions.busy}
                          onClick={() => actions.openOperation({
                            eyebrow: "Cron execution alert",
                            title: `Reopen ${titleCase(alert.alertType)}`,
                            endpoint: "/api/admin/cron/alerts",
                            method: "PATCH",
                            payload: { alertId: alert.id, operation: "reopen" },
                          })}
                          type="button"
                        >
                          Reopen
                        </button>
                      ) : (
                        <button
                          className="admin-inline-button"
                          disabled={!canManage || actions.busy}
                          onClick={() => actions.openOperation({
                            eyebrow: "Cron execution alert",
                            title: `Resolve ${titleCase(alert.alertType)}`,
                            endpoint: "/api/admin/cron/alerts",
                            method: "PATCH",
                            payload: { alertId: alert.id, operation: "resolve" },
                          })}
                          type="button"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredAlerts.length ? (
              <tr><td colSpan={5}>No cron execution alerts match the current filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScheduledOperationsPanel({ actions, attempts, readiness, retryDrilldowns, session }) {
  const jobs = readiness?.jobs || {};
  const cronEntries = readiness?.registration?.cronEntries || [];
  const registration = readiness?.registration || {};
  return (
    <section className="admin-panel">
      <SectionHeader
        detail="Cron routes are protected by CRON_SECRET. Live schedule registration is not assumed here unless deployment cron is explicitly configured."
        eyebrow="Scheduled operations"
        title="Cron-ready admin workflows"
      />
      <div className="admin-provider-summary">
        <div><span>Status</span><StatusBadge value={readiness?.status || "manual_only"} /></div>
        <div><span>CRON_SECRET</span><StatusBadge value={readiness?.cronSecretConfigured ? "configured" : "missing"} /></div>
        <div><span>Global flag</span><StatusBadge value={readiness?.globalCronEnabled ? "enabled" : "disabled"} /></div>
        <div><span>Live scheduled</span><StatusBadge value={readiness?.liveScheduled ? "live" : "not_live"} /></div>
        <div><span>Registration</span><StatusBadge value={registration.status || "deployment_ready"} /></div>
        <div><span>Plan limits</span><StatusBadge value={registration.planLimitStatus || "unknown"} /></div>
      </div>
      <div className="admin-provider-summary">
        {Object.entries(jobs).map(([key, job]) => (
          <div key={key}>
            <span>{titleCase(key)}</span>
            <StatusBadge value={job.enabled ? "enabled" : "disabled"} />
            <small>{job.route}</small>
          </div>
        ))}
      </div>
      {cronEntries.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table-dense">
            <thead>
              <tr>
                <th scope="col">Cron path</th>
                <th scope="col">Schedule</th>
                <th scope="col">Flag</th>
              </tr>
            </thead>
            <tbody>
              {cronEntries.map((entry) => (
                <tr key={`${entry.path}-${entry.schedule}`}>
                  <td><strong>{entry.path}</strong></td>
                  <td>{entry.schedule}</td>
                  <td><StatusBadge value={entry.envFlag} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {readiness?.note ? <p className="admin-muted-note">{readiness.note}</p> : null}
      {registration.deploymentInstruction ? <p className="admin-muted-note">{registration.deploymentInstruction}</p> : null}
      {Array.isArray(registration.blockers) && registration.blockers.length ? (
        <div className="admin-provider-summary">
          {registration.blockers.map((blocker) => (
            <div key={blocker}><span>Registration blocker</span><StatusBadge value={blocker} /></div>
          ))}
        </div>
      ) : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Started</th>
              <th scope="col">Job</th>
              <th scope="col">Status</th>
              <th scope="col">Counts</th>
              <th scope="col">Source</th>
              <th scope="col">Retry</th>
            </tr>
          </thead>
          <tbody>
            {(attempts || []).map((attempt) => (
              <tr key={attempt.id}>
                <td>{formatDateTime(attempt.startedAt)}</td>
                <td>
                  <strong>{attempt.jobName}</strong>
                  <small>{titleCase(attempt.jobKind)}</small>
                  {attempt.retryOfAttemptId ? <small>Retry of {attempt.retryOfAttemptId}</small> : null}
                  {attempt.retryCount ? <small>{attempt.retryCount} retries</small> : null}
                </td>
                <td>
                  <StatusBadge value={attempt.status} />
                  {attempt.errorClass ? <StatusBadge value={attempt.errorClass} /> : null}
                </td>
                <td>
                  {attempt.successCount} ok, {attempt.failedCount} failed, {attempt.skippedCount} skipped
                  {attempt.errorMessage ? <small>{attempt.errorMessage}</small> : null}
                </td>
                <td><StatusBadge value={attempt.liveCron ? "cron" : attempt.triggerSource} /></td>
                <td>
                  <button
                    className="admin-inline-button"
                    disabled={!actions || actions.busy || !canRetryScheduledJob(session, attempt)}
                    onClick={() => actions.openOperation({
                      eyebrow: "Scheduled job retry",
                      title: `Retry ${attempt.jobName}`,
                      endpoint: "/api/admin/cron/retry",
                      method: "POST",
                      payload: { attemptId: attempt.id },
                      submitLabel: "Retry job",
                    })}
                    type="button"
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ))}
            {!(attempts || []).length ? (
              <tr><td colSpan={6}>No scheduled admin job attempts yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table admin-table-dense">
          <thead>
            <tr>
              <th scope="col">Original attempt</th>
              <th scope="col">Retry attempt</th>
              <th scope="col">Result</th>
              <th scope="col">Safe error</th>
              <th scope="col">Actor/source</th>
            </tr>
          </thead>
          <tbody>
            {(retryDrilldowns || []).map((drilldown) => (
              <tr key={drilldown.id}>
                <td><strong>{drilldown.originalAttemptId}</strong><small>{drilldown.originalStatus}</small></td>
                <td><strong>{drilldown.retryAttemptId}</strong><small>{formatDateTime(drilldown.startedAt)} - {formatDateTime(drilldown.finishedAt)}</small></td>
                <td>
                  <StatusBadge value={drilldown.retryStatus} />
                  <small>{drilldown.resultCounts.success} ok, {drilldown.resultCounts.failed} failed, {drilldown.resultCounts.skipped} skipped</small>
                </td>
                <td>
                  {drilldown.safeErrorClass ? <StatusBadge value={drilldown.safeErrorClass} /> : "None"}
                  {drilldown.safeErrorMessage ? <small>{drilldown.safeErrorMessage}</small> : null}
                </td>
                <td><strong>{drilldown.actorEmail || "System"}</strong><small>{titleCase(drilldown.retryTriggerSource || "manual_retry")}</small></td>
              </tr>
            ))}
            {!(retryDrilldowns || []).length ? (
              <tr><td colSpan={5}>No retry drilldowns yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdminUserActions({ actions, member, session }) {
  const [selectedRole, setSelectedRole] = useState(member.role && ADMIN_ROLES.includes(member.role) ? member.role : "ops");
  const isFounder = canExport(session);
  const activeRoles = member.roles || [];
  const isSuspended = member.status === "suspended";
  const isCurrentUser = member.id === session?.id;
  const canResetMfa = canRecoverMfa(session) && member.mfaStatus === "enabled";

  return (
    <div className="admin-row-actions">
      <select
        aria-label={`Role action for ${member.name}`}
        disabled={!isFounder || actions.busy}
        onChange={(event) => setSelectedRole(event.target.value)}
        value={selectedRole}
      >
        {ADMIN_ROLES.map((role) => <option key={role} value={role}>{titleCase(role)}</option>)}
      </select>
      <button
        className="admin-inline-button"
        disabled={!isFounder || actions.busy || activeRoles.includes(selectedRole)}
        onClick={() => actions.openOperation({
          eyebrow: "Role assignment",
          title: `Assign ${titleCase(selectedRole)} to ${member.name}`,
          endpoint: "/api/admin/users",
          method: "PATCH",
          payload: { operation: "assign_role", userId: member.id, role: selectedRole },
        })}
        type="button"
      >
        Assign
      </button>
      <button
        className="admin-inline-button"
        disabled={!isFounder || actions.busy || !activeRoles.includes(selectedRole)}
        onClick={() => actions.openOperation({
          eyebrow: "Role revocation",
          title: `Revoke ${titleCase(selectedRole)} from ${member.name}`,
          endpoint: "/api/admin/users",
          method: "PATCH",
          payload: { operation: "revoke_role", userId: member.id, role: selectedRole },
        })}
        type="button"
      >
        Revoke
      </button>
      <button
        className="admin-inline-button"
        disabled={!isFounder || actions.busy || isCurrentUser}
        onClick={() => actions.openOperation({
          eyebrow: "User status",
          title: `${isSuspended ? "Reactivate" : "Suspend"} ${member.name}`,
          endpoint: "/api/admin/users",
          method: "PATCH",
          payload: { operation: "set_status", userId: member.id, status: isSuspended ? "active" : "suspended" },
        })}
        type="button"
      >
        {isSuspended ? "Reactivate" : "Suspend"}
      </button>
      <button
        className="admin-inline-button"
        disabled={!canResetMfa || actions.busy || isCurrentUser}
        onClick={() => actions.openOperation({
          eyebrow: "MFA recovery",
          title: `Request MFA recovery for ${member.name}`,
          endpoint: "/api/admin/mfa/recovery",
          method: "POST",
          payload: { targetUserId: member.id },
        })}
        type="button"
      >
        Recover MFA
      </button>
      <button
        className="admin-inline-button"
        disabled={!isFounder || !canResetMfa || actions.busy || isCurrentUser}
        onClick={() => actions.openOperation({
          eyebrow: "Emergency MFA override",
          title: `Emergency disable MFA for ${member.name}`,
          endpoint: "/api/admin/mfa/recovery",
          method: "PATCH",
          payload: { operation: "emergency_disable", targetUserId: member.id },
          submitLabel: "Emergency override",
        })}
        type="button"
      >
        Emergency
      </button>
    </div>
  );
}

function MfaRecoveryPanel({ actions, recoveryRequests, session, teamMembers }) {
  const candidates = (teamMembers || []).filter((member) => member.id !== session?.id && member.status !== "suspended");
  const [targetUserId, setTargetUserId] = useState(candidates[0]?.id || "");
  const [priority, setPriority] = useState("normal");
  const [filter, setFilter] = useState("pending");
  const [reason, setReason] = useState("");
  const canRequest = canRecoverMfa(session);
  const visibleRequests = (recoveryRequests || []).filter((item) => {
    if (filter === "all") return true;
    if (filter === "pending") return item.status === "requested";
    if (filter === "overdue") return item.slaStatus === "overdue" || Boolean(item.overdueAt);
    if (filter === "founder") return Boolean(item.founderApprovalRequired);
    return true;
  });

  async function submitRecovery(event) {
    event.preventDefault();
    const result = await actions.runAdminMutation({
      endpoint: "/api/admin/mfa/recovery",
      method: "POST",
      body: { targetUserId, priority, reason },
      successMessage: "MFA recovery request created.",
    });
    if (result) setReason("");
  }

  return (
    <section className="admin-panel">
      <SectionHeader
        detail="Cross-user MFA disables require a durable recovery request. Founder emergency override is logged separately."
        eyebrow="MFA recovery"
        title="Recovery approvals"
      />
      <form className="admin-inline-form admin-inline-form-compact" onSubmit={submitRecovery}>
        <label>
          <span>Target admin</span>
          <select disabled={!canRequest || actions.busy} onChange={(event) => setTargetUserId(event.target.value)} value={targetUserId}>
            {candidates.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select disabled={!canRequest || actions.busy} onChange={(event) => setPriority(event.target.value)} value={priority}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className="admin-inline-form-wide">
          <span>Required reason</span>
          <input
            disabled={!canRequest || actions.busy}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Example: Admin lost authenticator after device replacement."
            value={reason}
          />
        </label>
        <div className="admin-inline-form-actions">
          <small>Founder approval is required when the target admin has founder role.</small>
          <button className="admin-primary-button" disabled={!canRequest || actions.busy || !targetUserId || reason.trim().length < 8} type="submit">
            Request recovery
          </button>
        </div>
      </form>
      <div className="admin-filter-row">
        <select aria-label="MFA recovery filter" onChange={(event) => setFilter(event.target.value)} value={filter}>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="founder">Founder approval required</option>
          <option value="all">All requests</option>
        </select>
        <button
          className="admin-secondary-button"
          disabled={!canRecoverMfa(session) || actions.busy}
          onClick={() => actions.openOperation({
            eyebrow: "MFA recovery SLA",
            title: "Send reminders for overdue MFA recovery requests",
            endpoint: "/api/admin/mfa/recovery",
            method: "PATCH",
            payload: { operation: "remind_overdue" },
          })}
          type="button"
        >
          Remind overdue
        </button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Request</th>
              <th scope="col">Target</th>
              <th scope="col">Requester</th>
              <th scope="col">Reason</th>
              <th scope="col">SLA</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRequests.map((item) => {
              const targetIsFounder = (item.targetRoles || []).includes("founder");
              const canDecide = canRecoverMfa(session) && (!targetIsFounder || session?.role === "founder") && item.targetUserId !== session?.id;
              return (
                <tr key={item.id}>
                  <td>
                    <strong>{item.id}</strong>
                    <small>{formatDateTime(item.requestedAt)}</small>
                    <StatusBadge value={item.priority || "normal"} />
                  </td>
                  <td><strong>{item.targetName}</strong><small>{item.targetEmail} - {(item.targetRoles || []).map(titleCase).join(", ")}</small></td>
                  <td><strong>{item.requesterEmail}</strong><small>{titleCase(item.requesterRole)}</small></td>
                  <td>{item.reason}</td>
                  <td>
                    <StatusBadge value={item.status} />
                    <StatusBadge value={item.slaStatus || "not_tracked"} />
                    {item.founderApprovalRequired ? <StatusBadge value="founder_required" /> : null}
                    <small>Due {formatDateTime(item.dueAt)}</small>
                    <small>Notify {item.notificationStatus || "not_sent"}</small>
                    {item.reminderEvents?.[0] ? (
                      <small>Last reminder {formatDateTime(item.reminderEvents[0].createdAt)}</small>
                    ) : null}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        className="admin-inline-button"
                        disabled={!canRecoverMfa(session) || actions.busy || !["requested", "approved"].includes(item.status)}
                        onClick={() => actions.openOperation({
                          eyebrow: "MFA recovery notification",
                          title: `Send recovery reminder ${item.id}`,
                          endpoint: "/api/admin/mfa/recovery",
                          method: "PATCH",
                          payload: { operation: "remind", recoveryRequestId: item.id },
                        })}
                        type="button"
                      >
                        Remind
                      </button>
                      <button
                        className="admin-inline-button"
                        disabled={!canDecide || actions.busy || item.status !== "requested"}
                        onClick={() => actions.openOperation({
                          eyebrow: "MFA recovery approval",
                          title: `Approve MFA recovery ${item.id}`,
                          endpoint: "/api/admin/mfa/recovery",
                          method: "PATCH",
                          payload: { operation: "approve", recoveryRequestId: item.id },
                        })}
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        className="admin-inline-button"
                        disabled={!canDecide || actions.busy || item.status !== "requested"}
                        onClick={() => actions.openOperation({
                          eyebrow: "MFA recovery rejection",
                          title: `Reject MFA recovery ${item.id}`,
                          endpoint: "/api/admin/mfa/recovery",
                          method: "PATCH",
                          payload: { operation: "reject", recoveryRequestId: item.id },
                        })}
                        type="button"
                      >
                        Reject
                      </button>
                      <button
                        className="admin-inline-button"
                        disabled={!canDecide || actions.busy || item.status !== "approved"}
                        onClick={() => actions.openOperation({
                          eyebrow: "MFA recovery completion",
                          title: `Complete MFA recovery ${item.id}`,
                          endpoint: "/api/admin/mfa/recovery",
                          method: "PATCH",
                          payload: { operation: "complete", recoveryRequestId: item.id },
                        })}
                        type="button"
                      >
                        Complete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdminSessionTable({ actions, sessions, session }) {
  const isFounder = canExport(session);
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Admin</th>
            <th scope="col">Session</th>
            <th scope="col">Network</th>
            <th scope="col">Seen</th>
            <th scope="col">Expires</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((item) => (
            <tr key={item.id}>
              <td><strong>{item.userName}</strong><small>{item.userEmail} - {titleCase(item.role)}</small></td>
              <td><strong>{item.id === session?.sessionId ? "Current session" : item.id}</strong><small>{titleCase(item.status)}</small></td>
              <td><strong>{item.ipAddress}</strong><small>{item.userAgent}</small></td>
              <td>{formatDateTime(item.lastSeenAt || item.createdAt)}</td>
              <td>{formatDateTime(item.expiresAt)}</td>
              <td>
                <button
                  className="admin-inline-button"
                  disabled={actions.busy || item.id === session?.sessionId || (!isFounder && item.userId !== session?.id)}
                  onClick={() => actions.openOperation({
                    eyebrow: "Session revocation",
                    title: `Revoke session for ${item.userName}`,
                    endpoint: "/api/admin/sessions",
                    method: "PATCH",
                    payload: { operation: "revoke", sessionId: item.id },
                  })}
                  type="button"
                >
                  {item.id === session?.sessionId ? "Current" : "Revoke"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MfaSelfServicePanel({ actions, session }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");

  async function startMfa() {
    const result = await actions.runAdminMutation({
      endpoint: "/api/admin/mfa",
      method: "POST",
      body: { operation: "start" },
      successMessage: "MFA setup started.",
    });
    if (result?.secret) {
      setSetup({ secret: result.secret, otpauthUrl: result.otpauthUrl, qrCodeDataUrl: result.qrCodeDataUrl });
      setCode("");
    }
  }

  async function verifyMfa(event) {
    event.preventDefault();
    const result = await actions.runAdminMutation({
      endpoint: "/api/admin/mfa",
      method: "POST",
      body: { operation: "verify", code },
      successMessage: "MFA enabled.",
    });
    if (result) {
      setSetup(null);
      setCode("");
    }
  }

  return (
    <section className="admin-panel">
      <SectionHeader
        detail="TOTP is real. The secret is encrypted at rest; the setup secret is shown only during enrollment."
        eyebrow="MFA"
        title="Your authenticator setup"
      />
      <div className="admin-stack-list">
        <article className="admin-compact-row">
          <div>
            <strong>{session.name}</strong>
            <span>{session.email} - MFA status: {titleCase(session.mfaStatus || "not_configured")}</span>
          </div>
          <div className="admin-row-actions">
            <button
              className="admin-secondary-button"
              disabled={actions.busy || session.mfaStatus === "enabled"}
              onClick={startMfa}
              type="button"
            >
              {session.mfaStatus === "enabled" ? "MFA enabled" : "Set up MFA"}
            </button>
            <button
              className="admin-inline-button"
              disabled={actions.busy || session.mfaStatus !== "enabled"}
              onClick={() => actions.openOperation({
                eyebrow: "MFA disable",
                title: "Disable MFA for your admin account",
                endpoint: "/api/admin/mfa",
                method: "POST",
                payload: { operation: "disable" },
              })}
              type="button"
            >
              Disable
            </button>
          </div>
        </article>
        {setup ? (
          <form className="admin-inline-form admin-inline-form-compact" onSubmit={verifyMfa}>
            {setup.qrCodeDataUrl ? (
              <div
                aria-label="Authenticator QR code"
                className="admin-qr-code"
                role="img"
                style={{ backgroundImage: `url(${setup.qrCodeDataUrl})` }}
              />
            ) : null}
            <label className="admin-inline-form-full">
              <span>Authenticator secret</span>
              <input readOnly value={setup.secret} />
            </label>
            <label className="admin-inline-form-full">
              <span>Authenticator URI</span>
              <input readOnly value={setup.otpauthUrl} />
            </label>
            <label>
              <span>6-digit code</span>
              <input
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                value={code}
              />
            </label>
            <div className="admin-inline-form-actions">
              <small>Add the secret to your authenticator app, then verify the current code.</small>
              <button className="admin-primary-button" disabled={actions.busy || code.length !== 6} type="submit">
                Verify and enable
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function ExportWorkflowTable({ actions, exportEvents, session }) {
  const isFounder = canExport(session);
  const canReview = canReviewExports(session);
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Request</th>
            <th scope="col">Actor</th>
            <th scope="col">Target</th>
            <th scope="col">Reason</th>
            <th scope="col">Status</th>
            <th scope="col">Decision</th>
          </tr>
        </thead>
        <tbody>
          {exportEvents.map((event) => (
            <tr key={event.id}>
              <td><strong>{event.id}</strong><small>{formatDateTime(event.createdAt)} - {event.exportKind}</small></td>
              <td><strong>{event.actorEmail}</strong><small>{titleCase(event.actorRole)}</small></td>
              <td><strong>{event.targetId}</strong><small>{titleCase(event.targetType)} - {titleCase(event.field)}</small></td>
              <td>{event.reason}</td>
              <td><StatusBadge value={event.status} /></td>
              <td>
                <div className="admin-row-actions">
                  <button
                    className="admin-inline-button"
                    disabled={!canReview || actions.busy || event.status === "blocked" || event.status === "approved" || event.status === "completed_mock"}
                    onClick={() => actions.openOperation({
                      eyebrow: "Export approval",
                      title: `Approve export request ${event.id}`,
                      endpoint: "/api/admin/exports",
                      method: "PATCH",
                      payload: { exportEventId: event.id, status: "approved" },
                    })}
                    type="button"
                  >
                    Approve
                  </button>
                  <button
                    className="admin-inline-button"
                    disabled={!canReview || actions.busy || event.status === "blocked" || event.status === "rejected" || event.status === "completed_mock"}
                    onClick={() => actions.openOperation({
                      eyebrow: "Export rejection",
                      title: `Reject export request ${event.id}`,
                      endpoint: "/api/admin/exports",
                      method: "PATCH",
                      payload: { exportEventId: event.id, status: "rejected" },
                    })}
                    type="button"
                  >
                    Reject
                  </button>
                  <button
                    className="admin-inline-button"
                    disabled={!isFounder || actions.busy || event.status === "blocked" || event.status === "rejected" || event.status === "completed_mock"}
                    onClick={() => actions.openOperation({
                      eyebrow: "Mock completion",
                      title: `Complete mock export ${event.id}`,
                      endpoint: "/api/admin/exports",
                      method: "PATCH",
                      payload: { exportEventId: event.id, status: "completed_mock" },
                    })}
                    type="button"
                  >
                    Complete mock
                  </button>
                  {event.artifactReadyAt ? (
                    <button
                      className="admin-inline-button"
                      disabled={actions.busy}
                      onClick={() => actions.openOperation({
                        eyebrow: "Signed artifact access",
                        title: `Create signed artifact link for ${event.id}`,
                        endpoint: `/api/admin/exports/${event.id}/artifact/access`,
                        method: "POST",
                        payload: {},
                      })}
                      type="button"
                    >
                      Signed link
                    </button>
                  ) : null}
                </div>
                {event.artifactAccesses?.length ? (
                  <div className="admin-artifact-access-list">
                    {event.artifactAccesses.map((access) => (
                      <article key={access.id}>
                        <div>
                          <strong>{access.id}</strong>
                          <span>Expires {formatDateTime(access.expiresAt)}</span>
                          {access.accessedAt ? <span>Accessed {formatDateTime(access.accessedAt)}</span> : null}
                          {access.rotatedFromAccessId ? <span>Rotated from {access.rotatedFromAccessId}</span> : null}
                        </div>
                        <div className="admin-row-actions">
                          <StatusBadge value={access.state || access.status} />
                          {access.revokedAt ? <small>Revoked {formatDateTime(access.revokedAt)}</small> : null}
                          {access.rotatedAt ? <small>Rotated {formatDateTime(access.rotatedAt)}</small> : null}
                          <button
                            className="admin-inline-button"
                            disabled={!canReview || actions.busy || access.status !== "active" || access.state !== "active"}
                            onClick={() => actions.openOperation({
                              eyebrow: "Artifact access rotation",
                              title: `Rotate signed artifact access ${access.id}`,
                              endpoint: `/api/admin/exports/${event.id}/artifact/access`,
                              method: "PATCH",
                              payload: { operation: "rotate", accessId: access.id },
                            })}
                            type="button"
                          >
                            Rotate
                          </button>
                          <button
                            className="admin-inline-button"
                            disabled={!canReview || actions.busy || access.status !== "active" || access.state !== "active"}
                            onClick={() => actions.openOperation({
                              eyebrow: "Artifact access revocation",
                              title: `Revoke signed artifact access ${access.id}`,
                              endpoint: `/api/admin/exports/${event.id}/artifact/access`,
                              method: "PATCH",
                              payload: { accessId: access.id },
                            })}
                            type="button"
                          >
                            Revoke
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComplianceLaunchGatePanel({ actions, data, session }) {
  const launchGate = data || {};
  const summary = launchGate.summary || {};
  const canManage = canManageComplianceGate(session);

  function openComplianceAction(payload, title, submitLabel) {
    actions.openOperation({
      endpoint: "/api/admin/compliance",
      method: "PATCH",
      payload,
      submitLabel,
      successMessage: "Compliance launch gate action saved.",
      title,
    });
  }

  return (
    <section className="admin-panel">
      <SectionHeader
        action={canManage ? (
          <div className="admin-action-group">
            <button
              className="admin-secondary-button"
              onClick={() => openComplianceAction({ operation: "record_launch_decision", status: "not_ready" }, "Record launch gate as not ready", "Record not ready")}
              type="button"
            >
              Record not ready
            </button>
            <button
              className="admin-primary-button"
              onClick={() => openComplianceAction({ operation: "record_launch_decision", status: "ready" }, "Attempt launch-ready decision", "Mark ready")}
              type="button"
            >
              Mark ready
            </button>
          </div>
        ) : null}
        detail="Internal launch gate for founder, legal, compliance, and insurer review. This is not legal advice and does not mark LAJOO licensed or insurer-approved by default."
        eyebrow="Launch Gate"
        title="Legal, PDPA, and regulatory readiness"
      />

      <div className="admin-provider-status">
        <div className="admin-provider-summary">
          <div><span>Launch decision</span><strong>{summary.launchReady ? "Ready" : "Not ready"}</strong><StatusBadge value={summary.decisionStatus || "not_ready"} /></div>
          <div><span>Open blockers</span><strong>{summary.blockerCount || 0}</strong><small>{summary.launchReady ? "No blockers" : "Founder/compliance review required"}</small></div>
          <div><span>Operating model</span><strong>{titleCase(summary.operatingModelStatus || "requires_legal_review")}</strong><StatusBadge value={summary.operatingModelStatus || "requires_legal_review"} /></div>
          <div><span>Legal docs pending</span><strong>{summary.legalDocsPending || 0}</strong><small>{summary.insurerReviewPending || 0} script/fact records pending</small></div>
        </div>
        <div className="admin-provider-summary">
          <div><span>PDPA checklist</span><strong>{summary.pdpaApproved || 0}/{summary.pdpaTotal || 0}</strong><small>Approved launch-blocking items</small></div>
          <div><span>AI recommendation gate</span><strong>{summary.aiApproved || 0}/{summary.aiTotal || 0}</strong><small>{summary.unsafeClaims || 0} unsafe-claim blocker rows</small></div>
          <div><span>Data mode</span><strong>{launchGate.persisted ? "Database-backed" : "Mock/manual fallback"}</strong><StatusBadge value={launchGate.persisted ? "configured" : "mock_demo"} /></div>
          <div><span>Scope</span><strong>Internal review only</strong><small>No licensing claim is made</small></div>
        </div>
      </div>

      {summary.launchBlockers?.length ? (
        <div className="admin-stack-list">
          {summary.launchBlockers.map((blocker) => (
            <article className="admin-compact-row" key={blocker}>
              <div><strong>{blocker}</strong><span>Launch-blocking until resolved and approved.</span></div>
              <StatusBadge value="blocked" />
            </article>
          ))}
        </div>
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-table admin-table-dense">
          <thead>
            <tr>
              <th scope="col">Operating model</th>
              <th scope="col">Evidence</th>
              <th scope="col">Blockers</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(launchGate.operatingModels || []).map((item) => (
              <tr key={item.id}>
                <td><strong>{item.title}</strong><small>{item.modelType}</small></td>
                <td><strong>{item.evidenceTitle || "No evidence"}</strong><small>{item.evidenceUrl || "Requires source"}</small></td>
                <td>{(item.blockers || []).slice(0, 2).join("; ") || "No blocker note"}</td>
                <td><StatusBadge value={item.status} /><small>{item.launchReady ? "Launch-ready model" : "Not launch-ready"}</small></td>
                <td>
                  <div className="admin-row-actions">
                    {canManage ? (
                      <>
                        <button className="admin-inline-button" onClick={() => openComplianceAction({ operation: "update_operating_model", modelId: item.id, status: "legal_review" }, `Send ${item.title} to legal review`, "Send to review")} type="button">Review</button>
                        <button className="admin-inline-button" onClick={() => openComplianceAction({ operation: "update_operating_model", modelId: item.id, status: "approved" }, `Approve ${item.title} operating model record`, "Approve")} type="button">Approve</button>
                        <button className="admin-inline-button" onClick={() => openComplianceAction({ operation: "update_operating_model", modelId: item.id, status: "launch_ready", launchReady: true }, `Mark ${item.title} model launch-ready`, "Mark launch-ready")} type="button">Launch-ready</button>
                        <button className="admin-inline-button" onClick={() => openComplianceAction({ operation: "update_operating_model", modelId: item.id, status: "blocked" }, `Block ${item.title} operating model`, "Block")} type="button">Block</button>
                      </>
                    ) : <small>Inspect only</small>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-two-column">
        <section className="admin-subpanel">
          <SectionHeader eyebrow="Legal registry" title="Documents and SOPs" detail="Versioned records remain draft/review until founder/compliance action." />
          <div className="admin-table-wrap">
            <table className="admin-table admin-table-dense">
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Review</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(launchGate.legalDocuments || []).map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.title}</strong><small>{item.documentType} - {item.version}</small></td>
                    <td>{titleCase(item.ownerRole || "unassigned")}<small>{item.ownerName || "No owner"}</small></td>
                    <td>{formatDateTime(item.reviewDueAt)}<small>{item.reviewerName || "Unassigned"}</small></td>
                    <td><StatusBadge value={item.status} /></td>
                    <td>
                      <div className="admin-row-actions">
                        {canManage ? (
                          <>
                            <button className="admin-inline-button" onClick={() => openComplianceAction({ operation: "update_legal_document", documentId: item.id, status: "legal_review" }, `Send ${item.title} to legal review`, "Legal review")} type="button">Legal</button>
                            <button className="admin-inline-button" onClick={() => openComplianceAction({ operation: "update_legal_document", documentId: item.id, status: "insurer_review" }, `Send ${item.title} to insurer review`, "Insurer review")} type="button">Insurer</button>
                            <button className="admin-inline-button" onClick={() => openComplianceAction({ operation: "update_legal_document", documentId: item.id, status: "approved" }, `Approve ${item.title}`, "Approve")} type="button">Approve</button>
                            <button className="admin-inline-button" onClick={() => openComplianceAction({ operation: "update_legal_document", documentId: item.id, status: "blocked" }, `Block ${item.title}`, "Block")} type="button">Block</button>
                          </>
                        ) : <small>Inspect only</small>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-subpanel">
          <SectionHeader eyebrow="Official references" title="Source register" detail="Stored as references only; uncertain points require legal review." />
          <div className="admin-stack-list">
            {(launchGate.officialSources || []).map((source) => (
              <article className="admin-compact-row" key={source.key}>
                <div>
                  <strong>{source.authority}</strong>
                  <span>{source.title}</span>
                  <span>{source.url}</span>
                </div>
                <StatusBadge value={source.status || "reference_only"} />
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="admin-two-column">
        <section className="admin-subpanel">
          <SectionHeader eyebrow="PDPA" title="Data protection checklist" detail="No raw customer data is stored in these records." />
          <ComplianceChecklistTable
            canManage={canManage}
            items={launchGate.pdpaChecklist || []}
            onAction={(item, status) => openComplianceAction({ operation: "update_checklist_item", itemId: item.id, status }, `${titleCase(status)} ${item.title}`, titleCase(status))}
          />
        </section>
        <section className="admin-subpanel">
          <SectionHeader
            action={<Link className="admin-secondary-button" href="/admin/ai-knowledge">AI & Knowledge</Link>}
            detail="AI assists; regulated advice status requires legal review."
            eyebrow="AI Compliance"
            title="Recommendation safety checklist"
          />
          <ComplianceChecklistTable
            canManage={canManage}
            items={launchGate.aiChecklist || []}
            onAction={(item, status) => openComplianceAction({ operation: "update_checklist_item", itemId: item.id, status }, `${titleCase(status)} ${item.title}`, titleCase(status))}
          />
        </section>
      </div>

      <section className="admin-subpanel">
        <SectionHeader eyebrow="Insurer scripts" title="Approved scripts and fact packs" detail="Records are not approved without explicit founder/compliance action and reason." />
        <div className="admin-table-wrap">
          <table className="admin-table admin-table-dense">
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th scope="col">Source</th>
                <th scope="col">Use cases</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(launchGate.scriptFacts || []).map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.title}</strong><small>{item.insurer} - {item.recordType}</small></td>
                  <td><strong>{item.sourceTitle || "No source"}</strong><small>{item.sourceUrl || "Requires source"}</small></td>
                  <td>{(item.allowedUseCases || []).map(titleCase).join(", ") || "Not defined"}</td>
                  <td><StatusBadge value={item.status} /><small>{item.approvedAt ? formatDateTime(item.approvedAt) : "Not approved"}</small></td>
                  <td>
                    <div className="admin-row-actions">
                      {canManage ? (
                        <>
                          <button className="admin-inline-button" onClick={() => openComplianceAction({ operation: "update_script_fact", recordId: item.id, status: "legal_review" }, `Send ${item.title} to legal review`, "Legal review")} type="button">Legal</button>
                          <button className="admin-inline-button" onClick={() => openComplianceAction({ operation: "update_script_fact", recordId: item.id, status: "insurer_review" }, `Send ${item.title} to insurer review`, "Insurer review")} type="button">Insurer</button>
                          <button className="admin-inline-button" onClick={() => openComplianceAction({ operation: "update_script_fact", recordId: item.id, status: "approved" }, `Approve ${item.title}`, "Approve")} type="button">Approve</button>
                          <button className="admin-inline-button" onClick={() => openComplianceAction({ operation: "update_script_fact", recordId: item.id, status: "blocked" }, `Block ${item.title}`, "Block")} type="button">Block</button>
                        </>
                      ) : <small>Inspect only</small>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function ComplianceChecklistTable({ canManage, items, onAction }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table admin-table-dense">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Owner</th>
            <th scope="col">Due</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td><strong>{item.title}</strong><small>{item.description}</small></td>
              <td>{titleCase(item.ownerRole || "unassigned")}<small>{item.launchBlocking ? "Launch-blocking" : "Optional"}</small></td>
              <td>{formatDateTime(item.dueAt)}</td>
              <td><StatusBadge value={item.status} /><small>{item.reviewerNote || "No reviewer note"}</small></td>
              <td>
                <div className="admin-row-actions">
                  {canManage ? (
                    <>
                      <button className="admin-inline-button" onClick={() => onAction(item, "in_progress")} type="button">Progress</button>
                      <button className="admin-inline-button" onClick={() => onAction(item, "legal_review")} type="button">Review</button>
                      <button className="admin-inline-button" onClick={() => onAction(item, "approved")} type="button">Approve</button>
                      <button className="admin-inline-button" onClick={() => onAction(item, "blocked")} type="button">Block</button>
                    </>
                  ) : <small>Inspect only</small>}
                </div>
              </td>
            </tr>
          ))}
          {!items.length ? <tr><td colSpan={5}>No checklist items yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function SecurityDashboard({ actions, data, session }) {
  const canRevealField = hasPermission(session, REVEAL_PERMISSION);
  const isFounder = canExport(session);

  return (
    <>
      <DashboardHero
        dataMode={data.dataMode}
        dataModeDetail={data.dataModeDetail}
        detail="Control least-privilege access, sensitive-data reveals, export attempts, and operational audit trails."
        eyebrow="Security & Access"
        generatedAt={data.generatedAt}
        title="Admin trust and access control"
      />
      <MetricGrid metrics={data.metrics} />
      <ComplianceLaunchGatePanel actions={actions} data={data.complianceLaunchGate} session={session} />
      <CustomerLaunchQaPanel actions={actions} compact customerLaunchQa={data.customerLaunchQa} session={session} />
      <EmailProviderStatusPanel actions={actions} session={session} status={data.emailProviderStatus} />
      <WebhookIncidentDashboardPanel
        actions={actions}
        alerts={data.emailProviderStatus?.webhookMonitoringAlerts || []}
        session={session}
        summary={data.emailProviderStatus?.webhookIncidentSummary || data.emailProviderStatus?.webhook?.incidentSummary || {}}
        teamMembers={data.teamMembers || []}
      />
      <NotificationPreferencesPanel actions={actions} preferences={data.notificationPreferences || []} session={session} />
      <NotificationDigestPanel
        actions={actions}
        digestEvents={data.notificationDigestEvents || []}
        jobAttempts={data.notificationDigestJobAttempts || []}
        schedulerReadiness={data.notificationDigestSchedulerReadiness || {}}
        session={session}
      />
      <ScheduledOperationsPanel
        actions={actions}
        attempts={data.scheduledJobAttempts || []}
        readiness={data.scheduledWorkflowReadiness || {}}
        retryDrilldowns={data.scheduledJobRetryDrilldowns || []}
        session={session}
      />
      <CronExecutionAlertsPanel
        actions={actions}
        alerts={data.cronExecutionAlerts || []}
        session={session}
        summary={data.cronExecutionAlertSummary || {}}
        teamMembers={data.teamMembers || []}
      />
      <section className="admin-panel">
        <SectionHeader
          action={<ExportButton onExport={actions.openExport} scope={{ label: "admin audit log", targetType: "admin_audit", targetId: "audit-log" }} session={session} />}
          detail="Founder-only user and role changes are enforced server-side. Admin emails are masked by default."
          eyebrow="Team"
          title="Admin users and access status"
        />
        <AdminUserCreateForm actions={actions} isFounder={isFounder} />
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Role</th>
                <th scope="col">Permissions</th>
                <th scope="col">Created</th>
                <th scope="col">Last active</th>
                <th scope="col">MFA</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.teamMembers.map((member) => (
                <tr key={member.id}>
                  <td><strong>{member.name}</strong><small>{member.email}</small></td>
                  <td>{(member.roles || [member.role]).map(titleCase).join(", ")}</td>
                  <td><PermissionPills permissions={data.roleMatrix.find((role) => role.role === member.role)?.permissions || []} /></td>
                  <td>{formatDateTime(member.createdAt)}</td>
                  <td>{formatDateTime(member.lastActive)}</td>
                  <td><StatusBadge value={member.mfaStatus || "not_configured"} /></td>
                  <td><StatusBadge value={member.status} /></td>
                  <td><AdminUserActions actions={actions} member={member} session={session} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <MfaSelfServicePanel actions={actions} session={session} />
      <MfaRecoveryPanel
        actions={actions}
        recoveryRequests={data.mfaRecoveryRequests || []}
        session={session}
        teamMembers={data.teamMembers || []}
      />
      <ExportArtifactPolicyPanel actions={actions} policy={data.exportArtifactPolicy || {}} session={session} />
      <div className="admin-two-column">
        <section className="admin-panel">
          <SectionHeader eyebrow="Role matrix" title="Least-privilege permission model" />
          <div className="admin-stack-list">
            {data.roleMatrix.map((role) => (
              <article className="admin-role-card" key={role.role}>
                <div>
                  <strong>{role.label}</strong>
                  <p>{role.description}</p>
                </div>
                <PermissionPills permissions={role.permissions} />
                <StatusBadge value={role.canExport ? "export_allowed" : "export_blocked"} />
              </article>
            ))}
          </div>
        </section>
        <section className="admin-panel">
          <SectionHeader eyebrow="PII helpers" title="Masking defaults and reveal test" detail="Values shown here are masked mock examples." />
          <div className="admin-stack-list">
            {data.piiExamples.map((example) => (
              <article className="admin-compact-row" key={example.id}>
                <div><strong>{example.field}</strong><span>Type: {example.type}</span></div>
                <SensitiveField
                  canRevealField={canRevealField}
                  field={example.type}
                  label={`${example.field} example`}
                  onReveal={actions.openReveal}
                  revealed={actions.revealed}
                  targetId={example.id}
                  targetType="pii_helper"
                  value={example.value}
                />
              </article>
            ))}
          </div>
        </section>
      </div>
      <div className="admin-two-column">
        <section className="admin-panel">
          <SectionHeader
            detail="Founder can revoke persisted sessions. Logout continues to revoke the current session."
            eyebrow="Sessions"
            title="Active admin sessions"
          />
          <AdminSessionTable actions={actions} sessions={data.sessions || []} session={session} />
        </section>
        <section className="admin-panel">
          <SectionHeader
            detail="Requests are durable records. Completed rows are mock only and do not produce customer files."
            eyebrow="Export workflow"
            title="Export requests and blocked attempts"
          />
          <ExportWorkflowTable actions={actions} exportEvents={data.exportEvents || []} session={session} />
        </section>
      </div>
      <section className="admin-panel">
        <SectionHeader eyebrow="Audit" title="Reveal and export audit trail" detail="Backed by AdminAuditLog plus reveal/export event tables when the migration is applied." />
        <AuditLogTable logs={actions.auditLogs} />
      </section>
      <AuditWorkloadPanel workload={data.auditWorkload || {}} trends={data.auditSlaTrends || {}} />
      <AuditEscalationQueuesPanel queues={data.auditEscalationQueues || {}} />
      <AuditReviewPanel actions={actions} logs={actions.auditLogs} teamMembers={data.teamMembers || []} />
    </>
  );
}

function getTechProviderFilterValue(category, row = {}) {
  if (category === "paymentWebhooks") return row.provider || "unknown";
  if (category === "insurerAdapters") return row.insurerCode || row.adapterName || "unknown";
  if (category === "openAiUsage") return row.model || "unknown";
  if (category === "jobQueue") return row.queueName || "default";
  if (category === "cronReminders") return row.cronName || "unknown";
  return "unknown";
}

function getTechStatusFilterValue(category, row = {}) {
  if (category === "paymentWebhooks") return row.eventStatus || "unknown";
  return row.status || "unknown";
}

function TechObservabilityPanel({ filters, observability, onFilterChange }) {
  const totals = observability?.totals || {};
  const categories = observability?.categories || {};
  const filterOptions = observability?.filters || {};
  const wiring = observability?.wiring || {};
  return (
    <section className="admin-panel">
      <SectionHeader
        detail="Summaries use sanitized DB-backed log fields only. Raw payloads, prompts, auth headers, signatures, provider secrets, and PII are excluded."
        eyebrow="Observability"
        title="Provider and job health summary"
      />
      <div className="admin-provider-summary">
        <div><span>Total rows</span><strong>{totals.rows || 0}</strong></div>
        <div><span>System rows</span><strong>{totals.systemRows || 0}</strong></div>
        <div><span>Mock/sample rows</span><strong>{totals.mockRows || 0}</strong></div>
        <div><span>Error rows</span><strong>{totals.errorRows || 0}</strong></div>
      </div>
      <div className="admin-filter-row">
        <select aria-label="Tech provider filter" onChange={(event) => onFilterChange("provider", event.target.value)} value={filters.provider}>
          {(filterOptions.providers || ["all"]).map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
        </select>
        <select aria-label="Tech environment filter" onChange={(event) => onFilterChange("environment", event.target.value)} value={filters.environment}>
          {(filterOptions.environments || ["all"]).map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
        </select>
        <select aria-label="Tech source filter" onChange={(event) => onFilterChange("source", event.target.value)} value={filters.source}>
          {(filterOptions.sources || ["all"]).map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
        </select>
        <select aria-label="Tech error filter" onChange={(event) => onFilterChange("errorClass", event.target.value)} value={filters.errorClass}>
          {(filterOptions.errorClasses || ["all"]).map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
        </select>
      </div>
      <div className="admin-provider-summary">
        {Object.entries(categories).map(([key, summary]) => (
          <div key={key}>
            <span>{titleCase(key)}</span>
            <strong>{summary.total || 0}</strong>
            <small>{summary.errorCount || 0} errors, {summary.avgLatencyMs === null ? "no latency" : `${summary.avgLatencyMs}ms avg`}, {summary.maxRetryCount || 0} max retries</small>
            <small>{summary.uptimePercent ?? 100}% ok, {summary.errorRate || 0}% error rate, {summary.retryRate || 0}% retry rate</small>
            <small>P50 {summary.latencyP50Ms === null ? "n/a" : `${summary.latencyP50Ms}ms`} / P95 {summary.latencyP95Ms === null ? "n/a" : `${summary.latencyP95Ms}ms`}</small>
          </div>
        ))}
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table admin-table-dense">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Wiring</th>
              <th scope="col">Path</th>
              <th scope="col">Boundary</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(wiring).map(([key, item]) => (
              <tr key={key}>
                <td><strong>{titleCase(key)}</strong><small>{titleCase(item.source || "system")}</small></td>
                <td><StatusBadge value={item.status || "unknown"} /></td>
                <td>{item.path}</td>
                <td>{item.note}</td>
              </tr>
            ))}
            {!Object.keys(wiring).length ? (
              <tr><td colSpan={4}>No provider wiring status available.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Latest SLO day</th>
              <th scope="col">Latency trend</th>
              <th scope="col">Retry trend</th>
              <th scope="col">Error classes</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(categories).map(([key, summary]) => {
              const latest = (summary.sloTrend || []).at(-1) || null;
              return (
                <tr key={`slo-trend-${key}`}>
                  <td><strong>{titleCase(key)}</strong><small>{summary.total || 0} sanitized rows</small></td>
                  <td>
                    {latest ? (
                      <>
                        <strong>{latest.date}</strong>
                        <small>{latest.uptimePercent}% ok, {latest.errorRate}% error rate</small>
                      </>
                    ) : "No trend"}
                  </td>
                  <td>{(summary.latencyTrend || []).slice(-4).map((item) => `${item.date}: ${item.latencyP95Ms ?? "n/a"}ms p95`).join(", ") || "No latency"}</td>
                  <td>{(summary.retryTrend || []).slice(-4).map((item) => `${item.date}: ${item.retryRate}%`).join(", ") || "No retries"}</td>
                  <td>{(summary.errorClassTrend || []).slice(-4).map((item) => `${item.date} ${item.errorClass}: ${item.count}`).join(", ") || "No errors"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Providers</th>
              <th scope="col">Errors</th>
              <th scope="col">Sources</th>
              <th scope="col">Incident trend</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(categories).map(([key, summary]) => (
              <tr key={`slo-${key}`}>
                <td><strong>{titleCase(key)}</strong><small>{summary.total || 0} rows</small></td>
                <td>{Object.entries(summary.providerCounts || {}).map(([label, count]) => `${label}: ${count}`).join(", ") || "None"}</td>
                <td>{Object.entries(summary.errorClassCounts || {}).map(([label, count]) => `${label}: ${count}`).join(", ") || "None"}</td>
                <td>{Object.entries(summary.sourceCounts || {}).map(([label, count]) => `${label}: ${count}`).join(", ") || "None"}</td>
                <td>{(summary.incidentTrend || []).map((item) => `${item.date}: ${item.count}`).join(", ") || "No incidents"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TechLogTable({ columns, rows }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TechDashboard({ actions, data }) {
  const techLogs = data.techLogs || {};
  const observability = data.observability || {};
  const [techFilters, setTechFilters] = useState({
    provider: "all",
    environment: "all",
    source: "all",
    errorClass: "all",
  });
  function updateTechFilter(key, value) {
    setTechFilters((current) => ({ ...current, [key]: value }));
  }
  function filterTechRows(category, rows = []) {
    return rows.filter((row) => {
      if (techFilters.provider !== "all" && getTechProviderFilterValue(category, row) !== techFilters.provider) return false;
      if (techFilters.environment !== "all" && (row.providerEnvironment || row.environment || "not_captured") !== techFilters.environment) return false;
      if (techFilters.source !== "all" && (row.source || "unknown") !== techFilters.source) return false;
      if (techFilters.errorClass !== "all" && (row.errorClass || "not_captured") !== techFilters.errorClass) return false;
      return true;
    });
  }
  return (
    <>
      <DashboardHero
        dataMode={data.dataMode}
        dataModeDetail={data.dataModeDetail}
        detail="Inspect provider-agnostic technical event foundations without claiming real insurer, payment, queue, or OpenAI integrations are live."
        eyebrow="Tech / Developer Admin"
        generatedAt={data.generatedAt}
        title="Operational integration log foundation"
      />
      <MetricGrid metrics={data.metrics} />
      <TechObservabilityPanel
        filters={techFilters}
        observability={observability}
        onFilterChange={updateTechFilter}
      />
      {data.operationalJobReadiness ? (
        <section className="admin-panel">
          <SectionHeader
            detail={data.operationalJobReadiness.note}
            eyebrow="Job readiness"
            title="Reminder and reconciliation wiring"
          />
          <div className="admin-provider-summary">
            <div><span>Status</span><StatusBadge value={data.operationalJobReadiness.status} /></div>
            <div><span>Reminder cron</span><StatusBadge value={data.operationalJobReadiness.liveReminderCron ? "live" : "placeholder"} /></div>
            <div><span>Reconciliation job</span><StatusBadge value={data.operationalJobReadiness.liveReconciliationJob ? "live" : "placeholder"} /></div>
            <div><span>Source</span><strong>adminOperationalJobPlaceholders</strong></div>
          </div>
        </section>
      ) : null}
      <section className="admin-panel">
        <SectionHeader
          detail="Rows are database-backed; the source badge separates wired system events from mock samples."
          eyebrow="Payments"
          title="Payment webhook logs"
        />
        <TechLogTable
          columns={[
            { key: "createdAt", label: "Time", render: (row) => formatDateTime(row.createdAt) },
            { key: "provider", label: "Provider" },
            { key: "providerEnvironment", label: "Env", render: (row) => row.providerEnvironment || "Not captured" },
            { key: "eventType", label: "Event" },
            { key: "paymentId", label: "Payment" },
            { key: "verificationStatus", label: "Verification", render: (row) => row.verificationStatus ? <StatusBadge value={row.verificationStatus} /> : "Not captured" },
            { key: "retryCount", label: "Retries" },
            { key: "latencyMs", label: "Latency", render: (row) => (row.latencyMs ? `${row.latencyMs}ms` : "Not captured") },
            { key: "errorClass", label: "Error class", render: (row) => row.errorClass ? <StatusBadge value={row.errorClass} /> : "None" },
            { key: "eventStatus", label: "Status", render: (row) => <StatusBadge value={row.eventStatus} /> },
            { key: "source", label: "Source", render: (row) => <StatusBadge value={row.source} /> },
          ]}
          rows={filterTechRows("paymentWebhooks", techLogs.paymentWebhooks || [])}
        />
      </section>
      <section className="admin-panel">
        <SectionHeader
          detail="Adapter logs are written by current adapter/gateway paths. Source labels stay honest for mock vs system rows."
          eyebrow="Insurers"
          title="Insurer adapter logs"
        />
        <TechLogTable
          columns={[
            { key: "createdAt", label: "Time", render: (row) => formatDateTime(row.createdAt) },
            { key: "insurerCode", label: "Insurer" },
            { key: "adapterName", label: "Adapter" },
            { key: "adapterVersion", label: "Version", render: (row) => row.adapterVersion || "Not captured" },
            { key: "providerEnvironment", label: "Env", render: (row) => row.providerEnvironment || "Not captured" },
            { key: "operation", label: "Operation" },
            { key: "latencyMs", label: "Latency", render: (row) => (row.latencyMs ? `${row.latencyMs}ms` : "Not captured") },
            { key: "retryCount", label: "Retries" },
            { key: "errorClass", label: "Error class", render: (row) => row.errorClass ? <StatusBadge value={row.errorClass} /> : "None" },
            { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
          ]}
          rows={filterTechRows("insurerAdapters", techLogs.insurerAdapters || [])}
        />
      </section>
      <div className="admin-two-column">
        <section className="admin-panel">
          <SectionHeader
            detail="Chat and embedding code paths write usage/error rows without storing prompts or customer text."
            eyebrow="AI operations"
            title="OpenAI usage and errors"
          />
          <TechLogTable
            columns={[
              { key: "createdAt", label: "Time", render: (row) => formatDateTime(row.createdAt) },
              { key: "model", label: "Model" },
              { key: "providerEnvironment", label: "Env", render: (row) => row.providerEnvironment || "Not captured" },
              { key: "operation", label: "Operation" },
              { key: "totalTokens", label: "Tokens" },
              { key: "latencyMs", label: "Latency", render: (row) => (row.latencyMs ? `${row.latencyMs}ms` : "Not captured") },
              { key: "retryCount", label: "Retries" },
              { key: "errorClass", label: "Error class", render: (row) => row.errorClass ? <StatusBadge value={row.errorClass} /> : "None" },
              { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
            ]}
            rows={filterTechRows("openAiUsage", techLogs.openAiUsage || [])}
          />
        </section>
        <section className="admin-panel">
          <SectionHeader
            detail="Foundation for async renewal, reminder, and reconciliation jobs."
            eyebrow="Jobs"
            title="Queue logs"
          />
          <TechLogTable
            columns={[
              { key: "createdAt", label: "Time", render: (row) => formatDateTime(row.createdAt) },
              { key: "queueName", label: "Queue" },
              { key: "jobName", label: "Job" },
              { key: "attempts", label: "Attempts" },
              { key: "retryCount", label: "Retries" },
              { key: "workerName", label: "Worker", render: (row) => row.workerName || "Not captured" },
              { key: "errorClass", label: "Error class", render: (row) => row.errorClass ? <StatusBadge value={row.errorClass} /> : "None" },
              { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
            ]}
            rows={filterTechRows("jobQueue", techLogs.jobQueue || [])}
          />
        </section>
      </div>
      <section className="admin-panel">
        <SectionHeader
          detail="Reminder cron records are mock until scheduled jobs are wired."
          eyebrow="Cron"
          title="Cron and reminder logs"
        />
        <TechLogTable
          columns={[
            { key: "createdAt", label: "Time", render: (row) => formatDateTime(row.createdAt) },
            { key: "cronName", label: "Cron" },
            { key: "scheduledFor", label: "Scheduled", render: (row) => formatDateTime(row.scheduledFor) },
            { key: "affectedCount", label: "Affected" },
            { key: "retryCount", label: "Retries" },
            { key: "workerName", label: "Worker", render: (row) => row.workerName || "Not captured" },
            { key: "errorClass", label: "Error class", render: (row) => row.errorClass ? <StatusBadge value={row.errorClass} /> : "None" },
            { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
            { key: "source", label: "Source", render: (row) => <StatusBadge value={row.source} /> },
          ]}
          rows={filterTechRows("cronReminders", techLogs.cronReminders || [])}
        />
      </section>
      <section className="admin-panel">
        <SectionHeader eyebrow="Audit" title="Recent admin actions" detail="Shown here for engineer/founder operational correlation." />
        <AuditLogTable logs={actions.auditLogs} />
      </section>
    </>
  );
}

export default function AdminDashboardClient({ data, session, workspace }) {
  const actions = useAuditActions(data.auditLogs);
  const content = useMemo(() => {
    if (workspace === "ai") return <AiKnowledgeDashboard actions={actions} data={data} session={session} />;
    if (workspace === "security") return <SecurityDashboard actions={actions} data={data} session={session} />;
    if (workspace === "tech") return <TechDashboard actions={actions} data={data} session={session} />;
    return <BusinessDashboard actions={actions} data={data} session={session} />;
  }, [actions, data, session, workspace]);

  return (
    <div className="admin-dashboard">
      {actions.notice ? <div className="admin-notice" role="status">{actions.notice}</div> : null}
      {actions.artifactAccess?.signedArtifactUrl ? (
        <div className="admin-notice" role="status">
          Signed artifact link expires {formatDateTime(actions.artifactAccess.expiresAt)}:{" "}
          <a href={actions.artifactAccess.signedArtifactUrl}>Download approval artifact</a>
        </div>
      ) : null}
      {actions.error && !actions.modal ? <div className="admin-form-error" role="alert">{actions.error}</div> : null}
      {content}
      <ActionReasonModal
        busy={actions.busy}
        error={actions.error}
        modal={actions.modal}
        onClose={actions.closeModal}
        onSubmit={actions.submitAction}
        reason={actions.reason}
        setReason={actions.setReason}
      />
    </div>
  );
}
