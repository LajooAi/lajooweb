import {
  recordPersistedAdminAuditEvent,
  validateAdminActionReason,
} from "./adminPersistence.js";
import { ADMIN_PERMISSIONS, hasAdminPermission, normalizeAdminRole } from "./adminRoles.js";

let prismaClient;

async function getPrisma() {
  if (!prismaClient) {
    const { PrismaClient } = await import("@prisma/client");
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

function isCustomerQaDatabaseUnavailable(error) {
  const message = String(error?.message || "");
  return [
    "P1001",
    "P1002",
    "P1003",
    "P2021",
    "does not exist",
    "Unknown arg",
    "Can't reach database",
    "Cannot read properties of undefined",
  ].some((needle) => String(error?.code || "").includes(needle) || message.includes(needle));
}

function getRequestIpAddress(request) {
  const forwarded = request?.headers?.get("x-forwarded-for") || "";
  if (forwarded) return forwarded.split(",")[0].trim();
  return request?.headers?.get("x-real-ip") || request?.headers?.get("cf-connecting-ip") || null;
}

function getRequestUserAgent(request) {
  return request?.headers?.get("user-agent") || null;
}

function persistedActorUserId(session) {
  return session?.source === "database" && session?.id ? session.id : undefined;
}

function assertReason(reason) {
  const result = validateAdminActionReason(reason);
  if (result.error) {
    const error = new Error(result.error);
    error.status = 400;
    throw error;
  }
  return result.reason;
}

function assertPermission(allowed, message) {
  if (!allowed) {
    const error = new Error(message);
    error.status = 403;
    throw error;
  }
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return value.toISOString();
  } catch {
    return null;
  }
}

function normalizeValue(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function sanitizeQaMetadata(metadata = {}) {
  const blockedKeys = /ic|nric|email|phone|address|token|secret|password|signature|authorization|payload|prompt|chat|raw/i;
  return Object.fromEntries(
    Object.entries(metadata || {})
      .filter(([key]) => !blockedKeys.test(key))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 240) : value]),
  );
}

export const CUSTOMER_LAUNCH_QA_CATEGORIES = [
  "end_to_end",
  "stuck_flow",
  "mobile",
  "payment_failure",
  "support_handoff",
];

export const CUSTOMER_LAUNCH_QA_STATUSES = [
  "not_started",
  "in_progress",
  "passed",
  "needs_fix",
  "blocked",
  "failed",
];

export const CUSTOMER_LAUNCH_UAT_STATUSES = [
  "planned",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
];

export const CUSTOMER_LAUNCH_UAT_SIGNOFF_STATUSES = [
  "not_ready",
  "ready_for_review",
  "signed_off",
  "rejected",
  "blocked",
];

export function canInspectCustomerLaunchQa(session) {
  if (!session?.role) return false;
  const role = normalizeAdminRole(session.role);
  return ["founder", "ops", "compliance", "ai_qa", "engineer"].includes(role)
    || hasAdminPermission(role, ADMIN_PERMISSIONS.BUSINESS_ADMIN)
    || hasAdminPermission(role, ADMIN_PERMISSIONS.SECURITY_ACCESS)
    || hasAdminPermission(role, ADMIN_PERMISSIONS.AI_KNOWLEDGE);
}

export function canManageCustomerLaunchQa(session) {
  if (!session?.role) return false;
  return ["founder", "ops", "compliance"].includes(normalizeAdminRole(session.role));
}

export function canManageCustomerLaunchQaItem(session, item = {}) {
  if (canManageCustomerLaunchQa(session)) return true;
  const role = normalizeAdminRole(session?.role);
  if (role !== "ai_qa") return false;
  return item.category === "stuck_flow" || item.itemKey === "customer_side_questions";
}

function assertValidStatus(status, allowed, message) {
  const normalized = normalizeValue(status, allowed);
  if (!normalized) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  return normalized;
}

const fallbackQaItems = [
  ["end_to_end", "start_renewal", "Start renewal", "User can start /my renewal from the first screen without admin setup copy.", "ops", "passed", true],
  ["end_to_end", "vehicle_lookup", "Vehicle lookup", "Vehicle lookup fallback remains honest when real provider data is unavailable.", "ops", "in_progress", true],
  ["end_to_end", "quote_comparison", "Quote comparison", "Quote comparison explains tradeoffs without forcing a quote-card dump.", "ai_qa", "passed", true],
  ["end_to_end", "insurer_selection_change", "Insurer selection/change", "User can select an insurer and later change insurer without getting stuck.", "ops", "passed", true],
  ["end_to_end", "addons_change", "Add-ons change", "User can change add-ons after progressing downstream.", "ops", "passed", true],
  ["end_to_end", "road_tax_change", "Road tax change", "User can change road tax selection after moving forward.", "ops", "passed", true],
  ["end_to_end", "customer_side_questions", "Customer side questions", "AI answers mid-flow questions first, then resumes the current decision.", "ai_qa", "passed", true],
  ["end_to_end", "payment_parked_manual_state", "Payment parked/manual state", "Payment launch is parked; /my must not imply real provider payment is live.", "founder", "needs_fix", true],
  ["end_to_end", "support_handoff", "Support handoff", "User can ask for a human and get a safe ops handoff path.", "ops", "in_progress", true],
  ["end_to_end", "consent_disclaimer_visibility", "Consent/disclaimer visibility", "Consent and legal caution remain visible in the customer flow.", "compliance", "in_progress", true],
  ["end_to_end", "policy_issuance_blocked", "Policy issuance blocked", "No customer-facing issued-policy state is allowed before verified payment and insurer handoff.", "compliance", "passed", true],
  ["stuck_flow", "question_mid_flow", "Question mid-flow", "User asks an insurance question during quote/add-on/road-tax steps and resumes correctly.", "ai_qa", "passed", true],
  ["stuck_flow", "change_insurer_after_quote", "Change insurer after quote", "User changes insurer after selecting a quote.", "ops", "passed", true],
  ["stuck_flow", "change_addons_after_roadtax", "Change add-ons after road tax", "User edits add-ons after choosing road tax.", "ops", "passed", true],
  ["stuck_flow", "back_and_forth_navigation", "Back/forth navigation", "User moves back and forward without stale state or duplicate asks.", "ops", "in_progress", true],
  ["stuck_flow", "ambiguous_answer", "Ambiguous answer", "AI asks one clear follow-up instead of guessing.", "ai_qa", "passed", true],
  ["stuck_flow", "human_help_request", "Human help request", "Support handoff works from any stage.", "ops", "in_progress", true],
  ["stuck_flow", "payment_policy_question_before_live", "Payment/policy before live provider", "AI refuses fake paid/issued claims and explains manual parked state.", "compliance", "passed", true],
  ["mobile", "iphone_small", "iPhone small", "Check 320-375px width: no text overlap, usable input, safe scroll behavior.", "ops", "in_progress", true, "iphone_small"],
  ["mobile", "iphone_standard", "iPhone standard", "Check 390-430px width: keyboard/input affordances and no layout overlap.", "ops", "in_progress", true, "iphone_standard"],
  ["mobile", "android_standard", "Android standard", "Check 360-412px width: input and drawer behavior remain usable.", "ops", "in_progress", true, "android_standard"],
  ["mobile", "tablet", "Tablet", "Check tablet layout and chat input stability.", "ops", "not_started", true, "tablet"],
  ["mobile", "desktop", "Desktop", "Desktop customer flow smoke remains stable.", "ops", "passed", true, "desktop"],
  ["payment_failure", "no_fake_paid_state", "No fake paid state", "Customer UI cannot show paid unless provider verification exists.", "compliance", "passed", true],
  ["payment_failure", "no_fake_issued_policy", "No fake issued policy", "Customer UI cannot show issued policy unless issuance is explicitly enabled.", "compliance", "passed", true],
  ["payment_failure", "unverified_payment_blocked", "Unverified payment blocked", "Unverified payment cannot complete issuance.", "compliance", "passed", true],
  ["payment_failure", "failed_cancelled_manual_states", "Failed/cancelled/manual states", "Payment failure and parked/manual states are clearly handled.", "ops", "in_progress", true],
  ["support_handoff", "user_requests_human", "User requests human", "Route human request to ops/support without pretending instant live support.", "ops", "in_progress", true],
  ["support_handoff", "ai_uncertainty", "AI uncertainty", "AI escalates uncertain insurer/payment/issuance questions.", "ai_qa", "passed", true],
  ["support_handoff", "compliance_legal_question", "Compliance/legal question", "Legal/regulatory questions escalate instead of giving legal conclusions.", "compliance", "passed", true],
  ["support_handoff", "payment_issue", "Payment issue", "Payment uncertainty routes to manual ops review while payment launch is parked.", "ops", "in_progress", true],
  ["support_handoff", "insurer_manual_renewal_issue", "Insurer/manual renewal issue", "Manual insurer portal issues route to renewal ops queue.", "ops", "in_progress", true],
].map(([category, itemKey, title, description, ownerRole, status, launchBlocking, viewport], index) => ({
  id: `customer-qa-${category}-${itemKey}`,
  category,
  itemKey,
  title,
  description,
  status,
  ownerRole,
  ownerName: ownerRole === "ai_qa" ? "AI QA" : ownerRole === "compliance" ? "Compliance" : ownerRole === "founder" ? "Founder" : "Ops",
  reviewerName: "Unassigned QA reviewer",
  launchBlocking: Boolean(launchBlocking),
  blocker: ["needs_fix", "blocked", "failed", "not_started", "in_progress"].includes(status),
  severity: status === "needs_fix" ? "high" : status === "not_started" ? "medium" : "normal",
  viewport: viewport || null,
  slaHours: category === "support_handoff" ? 24 : category === "payment_failure" ? 8 : 48,
  evidence: [
    {
      label: "Phase 17 seed",
      note: "Manual QA record. No transcript text, PII, model input, or payment payload is stored.",
    },
  ],
  reviewerNote: "Requires launch QA evidence and reviewer signoff before final customer launch.",
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
  dueAt: new Date(Date.UTC(2026, 6, 5 + (index % 14))).toISOString(),
}));

const fallbackUatRuns = [
  {
    id: "customer-uat-staging-ops-dry-run",
    runName: "Staging UAT - ops dry run",
    environment: "staging",
    testerName: "Ops lead",
    testerRole: "ops",
    team: "Operations",
    status: "in_progress",
    blockerCount: 10,
    signoffStatus: "not_ready",
    signoffReason: "Initial Phase 17 UAT record: launch QA blockers remain open.",
    notes: "Use for real ops team UAT before launch. Payment remains parked/manual.",
    startedAt: "2026-06-30T00:00:00.000Z",
    completedAt: null,
    signedOffAt: null,
    signedOffByEmail: null,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
];

let memoryQaItems = fallbackQaItems.map((item) => ({ ...item }));
let memoryUatRuns = fallbackUatRuns.map((item) => ({ ...item }));
let memoryQaEvents = [];

export function resetAdminCustomerLaunchQaMemoryForTest() {
  memoryQaItems = fallbackQaItems.map((item) => ({ ...item }));
  memoryUatRuns = fallbackUatRuns.map((item) => ({ ...item }));
  memoryQaEvents = [];
}

function mapQaItem(row) {
  return {
    ...row,
    evidence: row.evidence || [],
    dueAt: toIso(row.dueAt),
    reviewedAt: toIso(row.reviewedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapUatRun(row) {
  return {
    ...row,
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
    signedOffAt: toIso(row.signedOffAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapQaEvent(row) {
  return {
    ...row,
    metadata: row.metadata || {},
    createdAt: toIso(row.createdAt),
  };
}

export function buildCustomerLaunchQaSummary({ qaItems = [], uatRuns = [] } = {}) {
  const launchBlockingItems = qaItems.filter((item) => item.launchBlocking);
  const openStatuses = new Set(["not_started", "in_progress", "needs_fix", "blocked", "failed"]);
  const blockerItems = launchBlockingItems.filter((item) => item.blocker || openStatuses.has(item.status));
  const passedItems = qaItems.filter((item) => item.status === "passed");
  const categoryCounts = CUSTOMER_LAUNCH_QA_CATEGORIES.reduce((acc, category) => {
    const rows = qaItems.filter((item) => item.category === category);
    acc[category] = {
      total: rows.length,
      passed: rows.filter((item) => item.status === "passed").length,
      blockers: rows.filter((item) => item.launchBlocking && (item.blocker || openStatuses.has(item.status))).length,
    };
    return acc;
  }, {});
  const latestUat = [...uatRuns].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0] || null;
  const uatSignedOff = latestUat?.signoffStatus === "signed_off";
  const launchReady = blockerItems.length === 0 && uatSignedOff;

  return {
    launchReady,
    blockerCount: blockerItems.length,
    totalItems: qaItems.length,
    passedItems: passedItems.length,
    coveragePercent: qaItems.length ? Math.round((passedItems.length / qaItems.length) * 100) : 0,
    stuckFlowBlockers: categoryCounts.stuck_flow?.blockers || 0,
    mobileBlockers: categoryCounts.mobile?.blockers || 0,
    paymentFailureBlockers: categoryCounts.payment_failure?.blockers || 0,
    supportHandoffBlockers: categoryCounts.support_handoff?.blockers || 0,
    endToEndBlockers: categoryCounts.end_to_end?.blockers || 0,
    uatSignoffStatus: latestUat?.signoffStatus || "not_ready",
    latestUat: latestUat ? mapUatRun(latestUat) : null,
    categoryCounts,
    launchBlockers: blockerItems.slice(0, 12).map((item) => `${item.title}: ${item.status}`),
  };
}

function fallbackData() {
  const qaItems = memoryQaItems.map(mapQaItem);
  const uatRuns = memoryUatRuns.map(mapUatRun);
  return {
    persisted: false,
    dataMode: "Mock/manual fallback",
    qaItems,
    endToEndChecklist: qaItems.filter((item) => item.category === "end_to_end"),
    stuckFlowScenarios: qaItems.filter((item) => item.category === "stuck_flow"),
    mobileChecklist: qaItems.filter((item) => item.category === "mobile"),
    paymentFailureChecklist: qaItems.filter((item) => item.category === "payment_failure"),
    supportHandoffChecklist: qaItems.filter((item) => item.category === "support_handoff"),
    uatRuns,
    events: memoryQaEvents.map(mapQaEvent),
    summary: buildCustomerLaunchQaSummary({ qaItems, uatRuns }),
  };
}

async function ensureMockCustomerLaunchQaData(prisma) {
  const count = await prisma.adminCustomerLaunchQaItem.count();
  if (count) return;
  await prisma.$transaction(async (tx) => {
    await tx.adminCustomerLaunchQaItem.createMany({
      data: fallbackQaItems.map((item) => ({
        ...item,
        dueAt: item.dueAt ? new Date(item.dueAt) : null,
        reviewedAt: item.reviewedAt ? new Date(item.reviewedAt) : null,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      })),
      skipDuplicates: true,
    });
    await tx.adminCustomerLaunchUatRun.createMany({
      data: fallbackUatRuns.map((item) => ({
        ...item,
        startedAt: item.startedAt ? new Date(item.startedAt) : null,
        completedAt: item.completedAt ? new Date(item.completedAt) : null,
        signedOffAt: item.signedOffAt ? new Date(item.signedOffAt) : null,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      })),
      skipDuplicates: true,
    });
  });
}

export async function getPersistedCustomerLaunchQaData({ session } = {}) {
  assertPermission(canInspectCustomerLaunchQa(session), "Customer launch QA access required.");
  if (!process.env.DATABASE_URL) return fallbackData();

  try {
    const prisma = await getPrisma();
    await ensureMockCustomerLaunchQaData(prisma);
    const [qaItems, uatRuns, events] = await Promise.all([
      prisma.adminCustomerLaunchQaItem.findMany({ orderBy: [{ category: "asc" }, { itemKey: "asc" }] }),
      prisma.adminCustomerLaunchUatRun.findMany({ orderBy: { updatedAt: "desc" }, take: 20 }),
      prisma.adminCustomerLaunchQaEvent.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    ]);
    const mappedQaItems = qaItems.map(mapQaItem);
    const mappedUatRuns = uatRuns.map(mapUatRun);
    return {
      persisted: true,
      dataMode: "Persisted customer launch QA",
      qaItems: mappedQaItems,
      endToEndChecklist: mappedQaItems.filter((item) => item.category === "end_to_end"),
      stuckFlowScenarios: mappedQaItems.filter((item) => item.category === "stuck_flow"),
      mobileChecklist: mappedQaItems.filter((item) => item.category === "mobile"),
      paymentFailureChecklist: mappedQaItems.filter((item) => item.category === "payment_failure"),
      supportHandoffChecklist: mappedQaItems.filter((item) => item.category === "support_handoff"),
      uatRuns: mappedUatRuns,
      events: events.map(mapQaEvent),
      summary: buildCustomerLaunchQaSummary({ qaItems: mappedQaItems, uatRuns: mappedUatRuns }),
    };
  } catch (error) {
    if (!isCustomerQaDatabaseUnavailable(error)) throw error;
    return fallbackData();
  }
}

async function recordCustomerLaunchQaEvent({ session, targetType, targetId, action, previousStatus, status, reason, note, metadata, request, prisma }) {
  const data = {
    targetType,
    targetId,
    action,
    previousStatus,
    status,
    actorUserId: persistedActorUserId(session),
    actorEmail: session?.email || "unknown@lajoo.my",
    actorRole: normalizeAdminRole(session?.role || "founder"),
    reason,
    note: note ? String(note).slice(0, 300) : null,
    ipAddress: getRequestIpAddress(request),
    userAgent: getRequestUserAgent(request),
    metadata: sanitizeQaMetadata(metadata),
  };
  if (prisma) return prisma.adminCustomerLaunchQaEvent.create({ data });
  const event = {
    id: `customer-qa-event-${Date.now()}`,
    ...data,
    createdAt: new Date().toISOString(),
  };
  memoryQaEvents.unshift(event);
  return event;
}

async function auditCustomerLaunchQaAction({ session, targetType, targetId, action, field, reason, status, metadata, request }) {
  return recordPersistedAdminAuditEvent({
    session,
    action,
    targetType,
    targetId,
    field,
    reason,
    status: status || "logged",
    metadata: sanitizeQaMetadata(metadata),
    request,
  });
}

function updateMemoryQaItem(id, patch) {
  const row = memoryQaItems.find((item) => item.id === id || item.itemKey === id);
  if (!row) {
    const error = new Error("Customer launch QA record was not found.");
    error.status = 404;
    throw error;
  }
  const previousStatus = row.status;
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  return { row, previousStatus };
}

function updateMemoryUatRun(id, patch) {
  const row = memoryUatRuns.find((item) => item.id === id || item.runName === id);
  if (!row) {
    const error = new Error("Customer launch UAT run was not found.");
    error.status = 404;
    throw error;
  }
  const previousStatus = row.signoffStatus || row.status;
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  return { row, previousStatus };
}

export async function updateCustomerLaunchQaItem({ session, itemId, status, blocker, evidence, note, reason, request, forceFallback = false }) {
  const actionReason = assertReason(reason);
  const nextStatus = assertValidStatus(status, CUSTOMER_LAUNCH_QA_STATUSES, "Unsupported customer launch QA status.");
  const currentData = forceFallback || !process.env.DATABASE_URL
    ? fallbackData()
    : await getPersistedCustomerLaunchQaData({ session });
  const existingItem = currentData.qaItems.find((item) => item.id === itemId || item.itemKey === itemId);
  assertPermission(canManageCustomerLaunchQaItem(session, existingItem), "Founder, ops, compliance, or scoped AI QA role required for customer launch QA updates.");
  const patch = {
    status: nextStatus,
    blocker: typeof blocker === "boolean" ? blocker : ["needs_fix", "blocked", "failed", "not_started", "in_progress"].includes(nextStatus),
    evidence: Array.isArray(evidence) ? evidence.map(sanitizeQaMetadata) : undefined,
    reviewerName: session?.name || session?.email || "QA reviewer",
    reviewerRole: normalizeAdminRole(session?.role),
    reviewerNote: note ? String(note).slice(0, 300) : undefined,
    reviewedAt: ["passed", "needs_fix", "blocked", "failed"].includes(nextStatus) ? new Date() : undefined,
  };
  Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);

  if (forceFallback || !process.env.DATABASE_URL) {
    const { row, previousStatus } = updateMemoryQaItem(itemId, { ...patch, reviewedAt: toIso(patch.reviewedAt) });
    await recordCustomerLaunchQaEvent({ session, targetType: "customer_launch_qa_item", targetId: row.id, action: "qa_item_update", previousStatus, status: nextStatus, reason: actionReason, note, metadata: { category: row.category, itemKey: row.itemKey, blocker: row.blocker }, request });
    const auditEvent = await auditCustomerLaunchQaAction({ session, targetType: "customer_launch_qa_item", targetId: row.id, action: "customer_launch_qa_item_update", field: "status", reason: actionReason, metadata: { previousStatus, nextStatus, category: row.category, itemKey: row.itemKey, blocker: row.blocker }, request });
    return { qaItem: mapQaItem(row), event: auditEvent, persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.adminCustomerLaunchQaItem.findFirst({ where: { OR: [{ id: itemId }, { itemKey: itemId }] } });
      if (!existing) {
        const error = new Error("Customer launch QA record was not found.");
        error.status = 404;
        throw error;
      }
      assertPermission(canManageCustomerLaunchQaItem(session, existing), "Founder, ops, compliance, or scoped AI QA role required for customer launch QA updates.");
      const updated = await tx.adminCustomerLaunchQaItem.update({ where: { id: existing.id }, data: patch });
      const qaEvent = await recordCustomerLaunchQaEvent({ session, targetType: "customer_launch_qa_item", targetId: updated.id, action: "qa_item_update", previousStatus: existing.status, status: nextStatus, reason: actionReason, note, metadata: { category: updated.category, itemKey: updated.itemKey, blocker: updated.blocker }, request, prisma: tx });
      return { updated, previousStatus: existing.status, qaEvent };
    });
    const auditEvent = await auditCustomerLaunchQaAction({ session, targetType: "customer_launch_qa_item", targetId: result.updated.id, action: "customer_launch_qa_item_update", field: "status", reason: actionReason, metadata: { previousStatus: result.previousStatus, nextStatus, category: result.updated.category, itemKey: result.updated.itemKey, blocker: result.updated.blocker }, request });
    return { qaItem: mapQaItem(result.updated), qaEvent: mapQaEvent(result.qaEvent), event: auditEvent, persisted: true };
  } catch (error) {
    if (error?.status || !isCustomerQaDatabaseUnavailable(error)) throw error;
    return updateCustomerLaunchQaItem({ session, itemId, status, blocker, evidence, note, reason, request: null, forceFallback: true });
  }
}

export async function updateCustomerLaunchUatRun({ session, runId, status, signoffStatus, note, reason, request, forceFallback = false }) {
  assertPermission(canManageCustomerLaunchQa(session), "Founder, ops, or compliance role required for customer launch UAT signoff.");
  const actionReason = assertReason(reason);
  const nextStatus = status ? assertValidStatus(status, CUSTOMER_LAUNCH_UAT_STATUSES, "Unsupported UAT status.") : null;
  const nextSignoffStatus = signoffStatus ? assertValidStatus(signoffStatus, CUSTOMER_LAUNCH_UAT_SIGNOFF_STATUSES, "Unsupported UAT signoff status.") : null;
  const currentData = forceFallback || !process.env.DATABASE_URL
    ? fallbackData()
    : await getPersistedCustomerLaunchQaData({ session });
  if (nextSignoffStatus === "signed_off" && currentData.summary.blockerCount > 0) {
    const error = new Error("UAT cannot be signed off while customer launch QA blockers remain.");
    error.status = 400;
    throw error;
  }
  const patch = {
    status: nextStatus || undefined,
    signoffStatus: nextSignoffStatus || undefined,
    signoffReason: nextSignoffStatus ? actionReason : undefined,
    blockerCount: currentData.summary.blockerCount,
    notes: note ? String(note).slice(0, 300) : undefined,
    signedOffById: nextSignoffStatus === "signed_off" ? persistedActorUserId(session) : undefined,
    signedOffByEmail: nextSignoffStatus === "signed_off" ? session?.email || null : undefined,
    signedOffByRole: nextSignoffStatus === "signed_off" ? normalizeAdminRole(session?.role) : undefined,
    signedOffAt: nextSignoffStatus === "signed_off" ? new Date() : undefined,
    completedAt: nextStatus === "completed" ? new Date() : undefined,
  };
  Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);

  if (forceFallback || !process.env.DATABASE_URL) {
    const { row, previousStatus } = updateMemoryUatRun(runId, { ...patch, signedOffAt: toIso(patch.signedOffAt), completedAt: toIso(patch.completedAt) });
    await recordCustomerLaunchQaEvent({ session, targetType: "customer_launch_uat_run", targetId: row.id, action: "uat_run_update", previousStatus, status: nextSignoffStatus || nextStatus, reason: actionReason, note, metadata: { blockerCount: row.blockerCount, signoffStatus: row.signoffStatus }, request });
    const auditEvent = await auditCustomerLaunchQaAction({ session, targetType: "customer_launch_uat_run", targetId: row.id, action: "customer_launch_uat_update", field: nextSignoffStatus ? "signoffStatus" : "status", reason: actionReason, metadata: { previousStatus, nextStatus, nextSignoffStatus, blockerCount: row.blockerCount }, request });
    return { uatRun: mapUatRun(row), event: auditEvent, persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.adminCustomerLaunchUatRun.findFirst({ where: { OR: [{ id: runId }, { runName: runId }] } });
      if (!existing) {
        const error = new Error("Customer launch UAT run was not found.");
        error.status = 404;
        throw error;
      }
      const updated = await tx.adminCustomerLaunchUatRun.update({ where: { id: existing.id }, data: patch });
      const qaEvent = await recordCustomerLaunchQaEvent({ session, targetType: "customer_launch_uat_run", targetId: updated.id, action: "uat_run_update", previousStatus: existing.signoffStatus || existing.status, status: nextSignoffStatus || nextStatus || updated.status, reason: actionReason, note, metadata: { blockerCount: updated.blockerCount, signoffStatus: updated.signoffStatus }, request, prisma: tx });
      return { updated, previousStatus: existing.signoffStatus || existing.status, qaEvent };
    });
    const auditEvent = await auditCustomerLaunchQaAction({ session, targetType: "customer_launch_uat_run", targetId: result.updated.id, action: "customer_launch_uat_update", field: nextSignoffStatus ? "signoffStatus" : "status", reason: actionReason, metadata: { previousStatus: result.previousStatus, nextStatus, nextSignoffStatus, blockerCount: result.updated.blockerCount }, request });
    return { uatRun: mapUatRun(result.updated), qaEvent: mapQaEvent(result.qaEvent), event: auditEvent, persisted: true };
  } catch (error) {
    if (error?.status || !isCustomerQaDatabaseUnavailable(error)) throw error;
    return updateCustomerLaunchUatRun({ session, runId, status, signoffStatus, note, reason, request: null, forceFallback: true });
  }
}
