import { maskSensitiveAdminValue } from "../../lib/admin/piiMasking.js";
import {
  recordPersistedAdminAuditEvent,
  validateAdminActionReason,
} from "./adminPersistence.js";
import {
  ADMIN_PERMISSIONS,
  hasAdminPermission,
  normalizeAdminRole,
} from "./adminRoles.js";

let prismaClient;

async function getPrisma() {
  if (!prismaClient) {
    const { PrismaClient } = await import("@prisma/client");
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

function isRenewalOpsDatabaseUnavailable(error) {
  const message = String(error?.message || "");
  return [
    "P1001",
    "P1002",
    "P1003",
    "P2021",
    "does not exist",
    "Unknown arg",
    "Can't reach database",
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

export const RENEWAL_OPS_STATUSES = [
  "intake_received",
  "quote_review",
  "info_needed",
  "submitted_to_insurer",
  "insurer_quoted",
  "customer_selected",
  "payment_pending",
  "payment_verified",
  "manual_issuance_required",
  "policy_uploaded",
  "policy_verified",
  "completed",
  "cancelled",
  "blocked",
];

export const INSURER_SUBMISSION_STATUSES = [
  "pending_submission",
  "submitted_to_insurer",
  "insurer_response_needed",
  "manual_follow_up",
  "blocked",
];

export const POLICY_DOCUMENT_STATUSES = [
  "pending",
  "uploaded_metadata",
  "under_review",
  "verified",
  "rejected",
];

export const MANUAL_ISSUANCE_LABELS = [
  { value: "real_insurer_api", label: "Real insurer API", detail: "Only use when a live adapter is verified." },
  { value: "manual_insurer_portal", label: "Manual insurer portal", detail: "Ops submits in insurer portal outside LAJOO." },
  { value: "manual_ops_upload", label: "Manual ops upload", detail: "Ops uploads or records policy document metadata manually." },
  { value: "mock_demo", label: "Mock/demo", detail: "Demo data only; no live insurer action." },
];

const RENEWAL_STATUS_SET = new Set(RENEWAL_OPS_STATUSES);
const INSURER_SUBMISSION_STATUS_SET = new Set(INSURER_SUBMISSION_STATUSES);
const POLICY_DOCUMENT_STATUS_SET = new Set(POLICY_DOCUMENT_STATUSES);
const ISSUANCE_MODE_SET = new Set(MANUAL_ISSUANCE_LABELS.map((item) => item.value));
const TERMINAL_RENEWAL_STATUSES = new Set(["completed", "cancelled"]);

function normalizeStatus(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function assertRenewalStatus(status) {
  const normalized = normalizeStatus(status, RENEWAL_STATUS_SET);
  if (!normalized) {
    const error = new Error("Unsupported renewal ops status.");
    error.status = 400;
    throw error;
  }
  return normalized;
}

function assertSubmissionStatus(status) {
  const normalized = normalizeStatus(status, INSURER_SUBMISSION_STATUS_SET);
  if (!normalized) {
    const error = new Error("Unsupported insurer submission status.");
    error.status = 400;
    throw error;
  }
  return normalized;
}

function assertPolicyDocumentStatus(status) {
  const normalized = normalizeStatus(status, POLICY_DOCUMENT_STATUS_SET);
  if (!normalized) {
    const error = new Error("Unsupported policy document verification status.");
    error.status = 400;
    throw error;
  }
  return normalized;
}

function normalizeIssuanceMode(value) {
  return normalizeStatus(value, ISSUANCE_MODE_SET, "manual_ops_upload");
}

function normalizeDateInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

function safeString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function sanitizeOpsMetadata(metadata = {}) {
  const blockedKeys = /ic|nric|email|phone|address|token|secret|password|signature|authorization|payload|prompt/i;
  return Object.fromEntries(
    Object.entries(metadata || {})
      .filter(([key]) => !blockedKeys.test(key))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 180) : value]),
  );
}

export function canInspectRenewalOps(session) {
  return Boolean(
    hasAdminPermission(session?.role, ADMIN_PERMISSIONS.BUSINESS_ADMIN)
      || hasAdminPermission(session?.role, ADMIN_PERMISSIONS.SECURITY_ACCESS),
  );
}

export function canManageRenewalOps(session) {
  return ["founder", "ops"].includes(normalizeAdminRole(session?.role));
}

export function canVerifyPolicyDocuments(session) {
  return ["founder", "ops", "compliance"].includes(normalizeAdminRole(session?.role));
}

export function canReleasePolicyToCustomer(caseRecord, issuanceEnabled = process.env.LAJOO_POLICY_ISSUANCE_ENABLED === "true") {
  return Boolean(
    issuanceEnabled
      && caseRecord?.status === "policy_verified"
      && caseRecord?.policyIssuedToCustomer === true,
  );
}

const fallbackCases = [
  {
    id: "ops-case-qr-1028",
    caseRef: "QR-1028",
    sourceSessionId: "demo-session-1028",
    customerName: "Nur Aisyah Rahman",
    customerIc: "920418-14-5582",
    customerEmail: "aisyah.rahman@example.com",
    customerPhone: "+60 12 448 7789",
    customerAddress: "No. 18, Jalan SS 2/24, Petaling Jaya, Selangor",
    vehiclePlate: "VBP 8124",
    vehicleSummary: "Honda City 1.5V",
    requestedInsurer: "Etiqa",
    selectedInsurer: "Etiqa",
    coverageType: "Comprehensive",
    addOns: ["Windscreen", "Special perils"],
    roadTaxOption: "selected",
    premiumSnapshot: { currency: "MYR", grossPremium: 1248.4, roadTax: 90 },
    status: "quote_review",
    priority: "high",
    ownerName: "Ops Lead",
    issuanceMode: "manual_insurer_portal",
    sourceLabel: "mock_demo",
    policyIssuedToCustomer: false,
    createdAt: "2026-06-18T08:30:00.000Z",
    updatedAt: "2026-06-19T01:55:00.000Z",
  },
  {
    id: "ops-case-qr-1027",
    caseRef: "QR-1027",
    sourceSessionId: "demo-session-1027",
    customerName: "Daniel Tan",
    customerIc: "880907-10-2194",
    customerEmail: "daniel.tan@example.com",
    customerPhone: "+60 17 620 4412",
    customerAddress: "Block B, Jalan Kiara 3, Kuala Lumpur",
    vehiclePlate: "WXY 6148",
    vehicleSummary: "Toyota Vios 1.5G",
    requestedInsurer: "Allianz",
    selectedInsurer: "Allianz",
    coverageType: "Comprehensive",
    addOns: ["Flood cover"],
    roadTaxOption: "declined",
    premiumSnapshot: { currency: "MYR", grossPremium: 1036.8, roadTax: 0 },
    status: "payment_pending",
    priority: "normal",
    ownerName: "Finance Ops",
    issuanceMode: "manual_ops_upload",
    sourceLabel: "mock_demo",
    policyIssuedToCustomer: false,
    createdAt: "2026-06-18T05:10:00.000Z",
    updatedAt: "2026-06-18T13:20:00.000Z",
  },
  {
    id: "ops-case-qr-1025",
    caseRef: "QR-1025",
    sourceSessionId: "demo-session-1025",
    customerName: "Siti Mariam",
    customerIc: "951012-08-7640",
    customerEmail: "siti.mariam@example.com",
    customerPhone: "+60 13 775 9021",
    customerAddress: "Jalan Tun Razak, Johor Bahru, Johor",
    vehiclePlate: "JRF 2208",
    vehicleSummary: "Perodua Myvi AV",
    requestedInsurer: "Lonpac",
    selectedInsurer: "Lonpac",
    coverageType: "Comprehensive",
    addOns: ["Windscreen"],
    roadTaxOption: "selected",
    premiumSnapshot: { currency: "MYR", grossPremium: 812.5, roadTax: 70 },
    status: "info_needed",
    priority: "normal",
    ownerName: "Support Ops",
    issuanceMode: "mock_demo",
    sourceLabel: "mock_demo",
    policyIssuedToCustomer: false,
    blockedReason: "Customer needs to confirm address before manual submission.",
    createdAt: "2026-06-17T07:40:00.000Z",
    updatedAt: "2026-06-18T08:05:00.000Z",
  },
];

const fallbackStatusEvents = [
  {
    id: "ops-status-1028-1",
    caseId: "ops-case-qr-1028",
    action: "status_update",
    previousStatus: "intake_received",
    status: "quote_review",
    reason: "Demo case moved into quote review for ops workflow readiness.",
    actorEmail: "ops@lajoo.my",
    createdAt: "2026-06-19T01:55:00.000Z",
  },
];

const fallbackSubmissions = [
  {
    id: "sub-qr-1028-etiqa",
    caseId: "ops-case-qr-1028",
    caseRef: "QR-1028",
    insurer: "Etiqa",
    channel: "manual_insurer_portal",
    sourceLabel: "mock_demo",
    status: "pending_submission",
    reason: "Demo submission queue item for insurer portal processing.",
    note: "No real insurer API connected.",
    createdAt: "2026-06-19T01:56:00.000Z",
    updatedAt: "2026-06-19T01:56:00.000Z",
  },
  {
    id: "sub-qr-1025-lonpac",
    caseId: "ops-case-qr-1025",
    caseRef: "QR-1025",
    insurer: "Lonpac",
    channel: "manual_follow_up",
    sourceLabel: "mock_demo",
    status: "manual_follow_up",
    reason: "Demo manual follow-up after missing customer address confirmation.",
    note: "Follow up before submission.",
    createdAt: "2026-06-18T08:05:00.000Z",
    updatedAt: "2026-06-18T08:05:00.000Z",
  },
];

const fallbackPolicyDocuments = [
  {
    id: "doc-qr-1027-placeholder",
    caseId: "ops-case-qr-1027",
    caseRef: "QR-1027",
    insurer: "Allianz",
    documentType: "cover_note_metadata",
    policyNumber: "Manual placeholder",
    effectiveFrom: null,
    effectiveTo: null,
    storageMode: "metadata_placeholder",
    fileReference: null,
    verificationStatus: "pending",
    reason: "Demo metadata placeholder. No live file storage configured.",
    reviewerNote: "Payment still pending; do not release documents.",
    noCustomerRelease: true,
    createdAt: "2026-06-18T13:20:00.000Z",
    updatedAt: "2026-06-18T13:20:00.000Z",
  },
];

const fallbackManualTasks = [
  {
    id: "task-qr-1028-submit",
    caseId: "ops-case-qr-1028",
    caseRef: "QR-1028",
    taskType: "submit_to_insurer_portal",
    status: "open",
    issuanceMode: "manual_insurer_portal",
    reason: "Demo manual insurer portal task.",
    note: "No insurer API is live.",
    createdAt: "2026-06-19T02:00:00.000Z",
    updatedAt: "2026-06-19T02:00:00.000Z",
  },
];

let memoryCases = fallbackCases.map((item) => ({ ...item }));
let memoryStatusEvents = fallbackStatusEvents.map((item) => ({ ...item }));
let memorySubmissions = fallbackSubmissions.map((item) => ({ ...item }));
let memoryPolicyDocuments = fallbackPolicyDocuments.map((item) => ({ ...item }));
let memoryManualTasks = fallbackManualTasks.map((item) => ({ ...item }));

export function resetAdminRenewalOpsMemoryForTest() {
  memoryCases = fallbackCases.map((item) => ({ ...item }));
  memoryStatusEvents = fallbackStatusEvents.map((item) => ({ ...item }));
  memorySubmissions = fallbackSubmissions.map((item) => ({ ...item }));
  memoryPolicyDocuments = fallbackPolicyDocuments.map((item) => ({ ...item }));
  memoryManualTasks = fallbackManualTasks.map((item) => ({ ...item }));
}

function premiumLabel(snapshot = {}) {
  const amount = Number(snapshot?.grossPremium ?? snapshot?.amount);
  if (!Number.isFinite(amount)) return "Not captured";
  const currency = String(snapshot?.currency || "MYR").toUpperCase();
  return currency === "MYR" ? `RM ${amount.toFixed(2)}` : `${currency} ${amount.toFixed(2)}`;
}

function issuanceModeLabel(mode) {
  return MANUAL_ISSUANCE_LABELS.find((item) => item.value === normalizeIssuanceMode(mode))?.label || "Manual ops upload";
}

function mapCaseForClient(record) {
  const premiumSnapshot = record.premiumSnapshot || {};
  const sourceLabel = record.sourceLabel || "manual_ops";
  return {
    id: record.id,
    caseRef: record.caseRef,
    sourceSessionId: record.sourceSessionId,
    customerName: record.customerName || "Not captured",
    customerIc: maskSensitiveAdminValue(record.customerIc, "ic"),
    customerEmail: maskSensitiveAdminValue(record.customerEmail, "email"),
    customerPhone: maskSensitiveAdminValue(record.customerPhone, "phone"),
    customerAddress: maskSensitiveAdminValue(record.customerAddress, "address"),
    sensitiveFields: { customerIc: "ic", customerEmail: "email", customerPhone: "phone", customerAddress: "address" },
    vehiclePlate: record.vehiclePlate || "Not captured",
    vehicleSummary: record.vehicleSummary || "Not captured",
    requestedInsurer: record.requestedInsurer || "Not captured",
    selectedInsurer: record.selectedInsurer || record.requestedInsurer || "Not captured",
    coverageType: record.coverageType || "Not captured",
    addOns: Array.isArray(record.addOns) ? record.addOns : [],
    roadTaxOption: record.roadTaxOption || "Not captured",
    premiumSnapshot,
    premiumLabel: premiumLabel(premiumSnapshot),
    status: record.status,
    priority: record.priority || "normal",
    ownerUserId: record.ownerUserId || null,
    ownerName: record.owner?.name || record.ownerName || "Unassigned",
    issuanceMode: normalizeIssuanceMode(record.issuanceMode),
    issuanceModeLabel: issuanceModeLabel(record.issuanceMode),
    sourceLabel,
    policyIssuedToCustomer: Boolean(record.policyIssuedToCustomer),
    customerReleaseBlocked: !canReleasePolicyToCustomer(record),
    blockedReason: record.blockedReason || null,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  };
}

function mapStatusEventForClient(event) {
  return {
    id: event.id,
    caseId: event.caseId,
    caseRef: event.case?.caseRef || event.caseRef,
    action: event.action,
    previousStatus: event.previousStatus,
    status: event.status,
    reason: event.reason,
    note: event.note,
    actorEmail: event.actorUser?.email || event.actorEmail || "system",
    createdAt: toIso(event.createdAt),
  };
}

function mapSubmissionForClient(submission, caseMap = new Map()) {
  const caseRecord = submission.case || caseMap.get(submission.caseId) || {};
  return {
    id: submission.id,
    caseId: submission.caseId,
    caseRef: caseRecord.caseRef || submission.caseRef,
    customerName: caseRecord.customerName || "Not captured",
    vehiclePlate: caseRecord.vehiclePlate || "Not captured",
    insurer: submission.insurer,
    channel: submission.channel,
    sourceLabel: submission.sourceLabel || "manual",
    status: submission.status,
    externalReference: submission.externalReference || null,
    reason: submission.reason,
    note: submission.note,
    submittedAt: toIso(submission.submittedAt),
    respondedAt: toIso(submission.respondedAt),
    createdAt: toIso(submission.createdAt),
    updatedAt: toIso(submission.updatedAt),
  };
}

function mapManualTaskForClient(task, caseMap = new Map()) {
  const caseRecord = task.case || caseMap.get(task.caseId) || {};
  return {
    id: task.id,
    caseId: task.caseId,
    caseRef: caseRecord.caseRef || task.caseRef,
    taskType: task.taskType,
    status: task.status,
    issuanceMode: normalizeIssuanceMode(task.issuanceMode),
    issuanceModeLabel: issuanceModeLabel(task.issuanceMode),
    assignedToName: task.assignedTo?.name || "Unassigned",
    reason: task.reason,
    note: task.note,
    dueAt: toIso(task.dueAt),
    completedAt: toIso(task.completedAt),
    createdAt: toIso(task.createdAt),
    updatedAt: toIso(task.updatedAt),
  };
}

function mapPolicyDocumentForClient(document, caseMap = new Map()) {
  const caseRecord = document.case || caseMap.get(document.caseId) || {};
  return {
    id: document.id,
    caseId: document.caseId,
    caseRef: caseRecord.caseRef || document.caseRef,
    customerName: caseRecord.customerName || "Not captured",
    vehiclePlate: caseRecord.vehiclePlate || "Not captured",
    insurer: document.insurer,
    documentType: document.documentType,
    policyNumber: document.policyNumber || "Not captured",
    effectiveFrom: toIso(document.effectiveFrom),
    effectiveTo: toIso(document.effectiveTo),
    storageMode: document.storageMode,
    fileReference: document.fileReference || null,
    verificationStatus: document.verificationStatus,
    reason: document.reason,
    reviewerName: document.reviewer?.name || "Unassigned",
    reviewerNote: document.reviewerNote || null,
    noCustomerRelease: Boolean(document.noCustomerRelease),
    uploadedAt: toIso(document.uploadedAt),
    reviewedAt: toIso(document.reviewedAt),
    createdAt: toIso(document.createdAt),
    updatedAt: toIso(document.updatedAt),
  };
}

function summarizeRenewalOps({ cases, submissions, documents, tasks }) {
  const activeStatuses = new Set(RENEWAL_OPS_STATUSES.filter((status) => !["completed", "cancelled"].includes(status)));
  const activeCases = cases.filter((item) => activeStatuses.has(item.status)).length;
  const quoteWaiting = cases.filter((item) => ["quote_review", "submitted_to_insurer", "insurer_quoted"].includes(item.status)).length;
  const blockedCases = cases.filter((item) => item.status === "blocked" || item.blockedReason).length;
  const policyDocumentsPending = documents.filter((item) => item.verificationStatus !== "verified").length;
  const manualSubmissions = submissions.filter((item) => item.sourceLabel !== "real_provider" && item.sourceLabel !== "real_insurer_api").length;
  const manualTasks = tasks.filter((item) => item.status !== "completed").length;
  const grossPremium = cases.reduce((sum, item) => sum + (Number(item.premiumSnapshot?.grossPremium) || 0), 0);

  return {
    activeCases,
    quoteWaiting,
    blockedCases,
    policyDocumentsPending,
    manualSubmissions,
    manualTasks,
    grossPremium,
  };
}

function fallbackData() {
  const caseMap = new Map(memoryCases.map((item) => [item.id, item]));
  const cases = memoryCases.map(mapCaseForClient);
  const submissions = memorySubmissions.map((item) => mapSubmissionForClient(item, caseMap));
  const policyDocuments = memoryPolicyDocuments.map((item) => mapPolicyDocumentForClient(item, caseMap));
  const manualTasks = memoryManualTasks.map((item) => mapManualTaskForClient(item, caseMap));
  const summary = summarizeRenewalOps({
    cases: memoryCases,
    submissions: memorySubmissions,
    documents: memoryPolicyDocuments,
    tasks: memoryManualTasks,
  });

  return {
    persisted: false,
    dataMode: "Mock/manual fallback",
    lifecycleStatuses: RENEWAL_OPS_STATUSES,
    submissionStatuses: INSURER_SUBMISSION_STATUSES,
    policyDocumentStatuses: POLICY_DOCUMENT_STATUSES,
    manualIssuanceLabels: MANUAL_ISSUANCE_LABELS,
    metrics: summary,
    cases,
    submissionQueue: submissions,
    policyDocumentQueue: policyDocuments,
    manualIssuanceTasks: manualTasks,
    blockedCases: cases.filter((item) => item.status === "blocked" || item.blockedReason),
    statusHistory: memoryStatusEvents.map(mapStatusEventForClient),
  };
}

async function ensureMockRenewalOpsCases(prisma) {
  const count = await prisma.adminRenewalOpsCase.count();
  if (count) return;

  await prisma.$transaction(async (tx) => {
    for (const item of fallbackCases) {
      await tx.adminRenewalOpsCase.create({
        data: {
          id: item.id,
          caseRef: item.caseRef,
          sourceSessionId: item.sourceSessionId,
          customerName: item.customerName,
          customerIc: item.customerIc,
          customerEmail: item.customerEmail,
          customerPhone: item.customerPhone,
          customerAddress: item.customerAddress,
          vehiclePlate: item.vehiclePlate,
          vehicleSummary: item.vehicleSummary,
          requestedInsurer: item.requestedInsurer,
          selectedInsurer: item.selectedInsurer,
          coverageType: item.coverageType,
          addOns: item.addOns,
          roadTaxOption: item.roadTaxOption,
          premiumSnapshot: item.premiumSnapshot,
          status: item.status,
          priority: item.priority,
          issuanceMode: item.issuanceMode,
          sourceLabel: item.sourceLabel,
          policyIssuedToCustomer: false,
          blockedReason: item.blockedReason,
          createdAt: new Date(item.createdAt),
          updatedAt: new Date(item.updatedAt),
        },
      });
    }
    await tx.adminRenewalOpsStatusEvent.createMany({
      data: fallbackStatusEvents.map((event) => ({
        id: event.id,
        caseId: event.caseId,
        action: event.action,
        previousStatus: event.previousStatus,
        status: event.status,
        reason: event.reason,
        metadata: { source: "mock_demo" },
        createdAt: new Date(event.createdAt),
      })),
      skipDuplicates: true,
    });
    await tx.adminInsurerPartnerSubmission.createMany({
      data: fallbackSubmissions.map((submission) => ({
        id: submission.id,
        caseId: submission.caseId,
        insurer: submission.insurer,
        channel: submission.channel,
        sourceLabel: submission.sourceLabel,
        status: submission.status,
        reason: submission.reason,
        note: submission.note,
        createdAt: new Date(submission.createdAt),
        updatedAt: new Date(submission.updatedAt),
      })),
      skipDuplicates: true,
    });
    await tx.adminPolicyDocumentVerification.createMany({
      data: fallbackPolicyDocuments.map((document) => ({
        id: document.id,
        caseId: document.caseId,
        insurer: document.insurer,
        documentType: document.documentType,
        policyNumber: document.policyNumber,
        storageMode: document.storageMode,
        verificationStatus: document.verificationStatus,
        reason: document.reason,
        reviewerNote: document.reviewerNote,
        noCustomerRelease: true,
        createdAt: new Date(document.createdAt),
        updatedAt: new Date(document.updatedAt),
      })),
      skipDuplicates: true,
    });
    await tx.adminManualIssuanceTask.createMany({
      data: fallbackManualTasks.map((task) => ({
        id: task.id,
        caseId: task.caseId,
        taskType: task.taskType,
        status: task.status,
        issuanceMode: task.issuanceMode,
        reason: task.reason,
        note: task.note,
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt),
      })),
      skipDuplicates: true,
    });
  });
}

export async function getPersistedRenewalOpsData({ session } = {}) {
  assertPermission(canInspectRenewalOps(session), "Business or security access permission required.");
  if (!process.env.DATABASE_URL) return fallbackData();

  try {
    const prisma = await getPrisma();
    await ensureMockRenewalOpsCases(prisma);
    const [cases, submissions, policyDocuments, manualTasks, statusHistory] = await Promise.all([
      prisma.adminRenewalOpsCase.findMany({
        include: { owner: true },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      prisma.adminInsurerPartnerSubmission.findMany({
        include: { case: true },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      prisma.adminPolicyDocumentVerification.findMany({
        include: { case: true, reviewer: true },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      prisma.adminManualIssuanceTask.findMany({
        include: { case: true, assignedTo: true },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      prisma.adminRenewalOpsStatusEvent.findMany({
        include: { case: true, actorUser: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);
    const summary = summarizeRenewalOps({ cases, submissions, documents: policyDocuments, tasks: manualTasks });
    const mappedCases = cases.map(mapCaseForClient);
    return {
      persisted: true,
      dataMode: "Persisted renewal ops",
      lifecycleStatuses: RENEWAL_OPS_STATUSES,
      submissionStatuses: INSURER_SUBMISSION_STATUSES,
      policyDocumentStatuses: POLICY_DOCUMENT_STATUSES,
      manualIssuanceLabels: MANUAL_ISSUANCE_LABELS,
      metrics: summary,
      cases: mappedCases,
      submissionQueue: submissions.map((item) => mapSubmissionForClient(item)),
      policyDocumentQueue: policyDocuments.map((item) => mapPolicyDocumentForClient(item)),
      manualIssuanceTasks: manualTasks.map((item) => mapManualTaskForClient(item)),
      blockedCases: mappedCases.filter((item) => item.status === "blocked" || item.blockedReason),
      statusHistory: statusHistory.map(mapStatusEventForClient),
    };
  } catch (error) {
    if (!isRenewalOpsDatabaseUnavailable(error)) throw error;
    return fallbackData();
  }
}

function assertStatusTransitionAllowed(currentStatus, nextStatus) {
  if (TERMINAL_RENEWAL_STATUSES.has(currentStatus) && currentStatus !== nextStatus) {
    const error = new Error("Terminal renewal cases cannot be moved without reopening support in a future phase.");
    error.status = 400;
    throw error;
  }
  if (nextStatus === "completed" && currentStatus !== "policy_verified") {
    const error = new Error("A renewal case can only be completed after policy document verification.");
    error.status = 400;
    throw error;
  }
}

function auditPayloadForCase(record, extra = {}) {
  return sanitizeOpsMetadata({
    caseRef: record?.caseRef,
    status: record?.status,
    insurer: record?.selectedInsurer || record?.requestedInsurer,
    issuanceMode: record?.issuanceMode,
    sourceLabel: record?.sourceLabel,
    policyIssuedToCustomer: Boolean(record?.policyIssuedToCustomer),
    ...extra,
  });
}

export async function updateRenewalOpsCaseStatus({ session, caseId, status, reason, note, request, forceFallback = false }) {
  assertPermission(canManageRenewalOps(session), "Founder or ops role required for renewal status changes.");
  const actionReason = assertReason(reason);
  const nextStatus = assertRenewalStatus(status);
  const actorUserId = persistedActorUserId(session);
  const ipAddress = getRequestIpAddress(request);
  const userAgent = getRequestUserAgent(request);

  if (forceFallback || !process.env.DATABASE_URL) {
    const caseRecord = memoryCases.find((item) => item.id === caseId || item.caseRef === caseId);
    if (!caseRecord) {
      const error = new Error("Renewal ops case was not found.");
      error.status = 404;
      throw error;
    }
    assertStatusTransitionAllowed(caseRecord.status, nextStatus);
    const previousStatus = caseRecord.status;
    caseRecord.status = nextStatus;
    caseRecord.updatedAt = new Date().toISOString();
    caseRecord.blockedReason = nextStatus === "blocked" ? actionReason : caseRecord.blockedReason;
    const event = {
      id: `ops-status-${Date.now()}`,
      caseId: caseRecord.id,
      caseRef: caseRecord.caseRef,
      actorEmail: session?.email || "admin",
      action: "status_update",
      previousStatus,
      status: nextStatus,
      reason: actionReason,
      note: note ? String(note).slice(0, 240) : null,
      createdAt: new Date().toISOString(),
    };
    memoryStatusEvents.unshift(event);
    await recordPersistedAdminAuditEvent({
      session,
      action: "renewal_ops_status_update",
      targetType: "renewal_ops_case",
      targetId: caseRecord.id,
      field: "status",
      reason: actionReason,
      status: "logged",
      metadata: auditPayloadForCase(caseRecord, { previousStatus, nextStatus, source: "mock_fallback" }),
      request,
    });
    return { case: mapCaseForClient(caseRecord), event: mapStatusEventForClient(event), persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const caseRecord = await tx.adminRenewalOpsCase.findFirst({
        where: { OR: [{ id: caseId }, { caseRef: caseId }] },
      });
      if (!caseRecord) {
        const error = new Error("Renewal ops case was not found.");
        error.status = 404;
        throw error;
      }
      assertStatusTransitionAllowed(caseRecord.status, nextStatus);
      const previousStatus = caseRecord.status;
      const updated = await tx.adminRenewalOpsCase.update({
        where: { id: caseRecord.id },
        data: {
          status: nextStatus,
          blockedReason: nextStatus === "blocked" ? actionReason : caseRecord.blockedReason,
          updatedByUserId: actorUserId,
        },
      });
      const event = await tx.adminRenewalOpsStatusEvent.create({
        data: {
          caseId: caseRecord.id,
          actorUserId,
          action: "status_update",
          previousStatus,
          status: nextStatus,
          reason: actionReason,
          note: note ? String(note).slice(0, 240) : null,
          ipAddress,
          userAgent,
          metadata: sanitizeOpsMetadata({ source: "admin_action" }),
        },
      });
      await tx.adminRenewalQuoteLifecycleEvent.create({
        data: {
          caseId: caseRecord.id,
          actorUserId,
          eventType: "renewal_status_transition",
          insurer: updated.selectedInsurer || updated.requestedInsurer,
          status: nextStatus,
          reason: actionReason,
          premiumSnapshot: updated.premiumSnapshot,
          ipAddress,
          userAgent,
          metadata: sanitizeOpsMetadata({ previousStatus, source: "admin_action" }),
        },
      });
      return { caseRecord: updated, event };
    });
    const auditEvent = await recordPersistedAdminAuditEvent({
      session,
      action: "renewal_ops_status_update",
      targetType: "renewal_ops_case",
      targetId: result.caseRecord.id,
      field: "status",
      reason: actionReason,
      status: "logged",
      metadata: auditPayloadForCase(result.caseRecord, { nextStatus }),
      request,
    });
    return {
      case: mapCaseForClient(result.caseRecord),
      event: mapStatusEventForClient(result.event),
      log: auditEvent,
      persisted: true,
    };
  } catch (error) {
    if (error?.status || !isRenewalOpsDatabaseUnavailable(error)) throw error;
    return updateRenewalOpsCaseStatus({ session, caseId, status, reason, note, request: null, forceFallback: true });
  }
}

export async function updateInsurerPartnerSubmission({ session, submissionId, caseId, insurer, channel, status, reason, note, request, forceFallback = false }) {
  assertPermission(canManageRenewalOps(session), "Founder or ops role required for insurer submission changes.");
  const actionReason = assertReason(reason);
  const nextStatus = assertSubmissionStatus(status || "pending_submission");
  const actorUserId = persistedActorUserId(session);
  const ipAddress = getRequestIpAddress(request);
  const userAgent = getRequestUserAgent(request);

  if (forceFallback || !process.env.DATABASE_URL) {
    const existing = memorySubmissions.find((item) => item.id === submissionId);
    const caseRecord = memoryCases.find((item) => item.id === caseId || item.caseRef === caseId || item.id === existing?.caseId);
    if (!existing && !caseRecord) {
      const error = new Error("Renewal case or insurer submission was not found.");
      error.status = 404;
      throw error;
    }
    const row = existing || {
      id: `sub-${Date.now()}`,
      caseId: caseRecord.id,
      caseRef: caseRecord.caseRef,
      insurer: safeString(insurer, caseRecord.selectedInsurer || caseRecord.requestedInsurer || "Manual insurer"),
      channel: safeString(channel, "manual_insurer_portal"),
      sourceLabel: "manual",
      reason: actionReason,
      createdAt: new Date().toISOString(),
    };
    row.status = nextStatus;
    row.reason = actionReason;
    row.note = note ? String(note).slice(0, 240) : row.note;
    row.updatedAt = new Date().toISOString();
    if (nextStatus === "submitted_to_insurer") row.submittedAt = row.submittedAt || new Date().toISOString();
    if (nextStatus === "insurer_response_needed") row.respondedAt = row.respondedAt || new Date().toISOString();
    if (!existing) memorySubmissions.unshift(row);
    const auditEvent = await recordPersistedAdminAuditEvent({
      session,
      action: "renewal_ops_insurer_submission_update",
      targetType: "insurer_partner_submission",
      targetId: row.id,
      field: "status",
      reason: actionReason,
      status: "logged",
      metadata: sanitizeOpsMetadata({ caseRef: row.caseRef, nextStatus, channel: row.channel, source: "mock_fallback" }),
      request,
    });
    return { submission: mapSubmissionForClient(row, new Map(memoryCases.map((item) => [item.id, item]))), log: auditEvent, persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const row = await prisma.$transaction(async (tx) => {
      const existing = submissionId
        ? await tx.adminInsurerPartnerSubmission.findUnique({ where: { id: submissionId }, include: { case: true } })
        : null;
      const caseRecord = existing?.case || await tx.adminRenewalOpsCase.findFirst({
        where: { OR: [{ id: caseId || "" }, { caseRef: caseId || "" }] },
      });
      if (!existing && !caseRecord) {
        const error = new Error("Renewal case or insurer submission was not found.");
        error.status = 404;
        throw error;
      }
      const data = {
        actorUserId,
        insurer: safeString(insurer, existing?.insurer || caseRecord.selectedInsurer || caseRecord.requestedInsurer || "Manual insurer"),
        channel: safeString(channel, existing?.channel || "manual_insurer_portal"),
        sourceLabel: existing?.sourceLabel || "manual",
        status: nextStatus,
        reason: actionReason,
        note: note ? String(note).slice(0, 240) : existing?.note,
        ipAddress,
        userAgent,
        submittedAt: nextStatus === "submitted_to_insurer" ? (existing?.submittedAt || new Date()) : existing?.submittedAt,
        respondedAt: nextStatus === "insurer_response_needed" ? (existing?.respondedAt || new Date()) : existing?.respondedAt,
        safeSummary: sanitizeOpsMetadata({ caseRef: caseRecord.caseRef, noRealInsurerApi: true }),
      };
      if (existing) {
        return tx.adminInsurerPartnerSubmission.update({
          where: { id: existing.id },
          data,
          include: { case: true },
        });
      }
      return tx.adminInsurerPartnerSubmission.create({
        data: {
          caseId: caseRecord.id,
          ...data,
        },
        include: { case: true },
      });
    });
    const auditEvent = await recordPersistedAdminAuditEvent({
      session,
      action: "renewal_ops_insurer_submission_update",
      targetType: "insurer_partner_submission",
      targetId: row.id,
      field: "status",
      reason: actionReason,
      status: "logged",
      metadata: sanitizeOpsMetadata({ caseRef: row.case?.caseRef, nextStatus, channel: row.channel, sourceLabel: row.sourceLabel }),
      request,
    });
    return { submission: mapSubmissionForClient(row), log: auditEvent, persisted: true };
  } catch (error) {
    if (error?.status || !isRenewalOpsDatabaseUnavailable(error)) throw error;
    return updateInsurerPartnerSubmission({ session, submissionId, caseId, insurer, channel, status, reason, note, request: null, forceFallback: true });
  }
}

export async function upsertPolicyDocumentVerification({
  session,
  documentId,
  caseId,
  insurer,
  documentType,
  policyNumber,
  effectiveFrom,
  effectiveTo,
  storageMode,
  fileReference,
  verificationStatus,
  reason,
  reviewerNote,
  request,
  forceFallback = false,
}) {
  assertPermission(canVerifyPolicyDocuments(session), "Founder, ops, or compliance role required for policy document verification.");
  const actionReason = assertReason(reason);
  const nextStatus = assertPolicyDocumentStatus(verificationStatus || "uploaded_metadata");
  const actorUserId = persistedActorUserId(session);
  const ipAddress = getRequestIpAddress(request);
  const userAgent = getRequestUserAgent(request);

  if (forceFallback || !process.env.DATABASE_URL) {
    const existing = memoryPolicyDocuments.find((item) => item.id === documentId);
    const caseRecord = memoryCases.find((item) => item.id === caseId || item.caseRef === caseId || item.id === existing?.caseId);
    if (!existing && !caseRecord) {
      const error = new Error("Renewal case or policy document record was not found.");
      error.status = 404;
      throw error;
    }
    const row = existing || {
      id: `doc-${Date.now()}`,
      caseId: caseRecord.id,
      caseRef: caseRecord.caseRef,
      createdAt: new Date().toISOString(),
      uploadedAt: new Date().toISOString(),
      noCustomerRelease: true,
    };
    row.insurer = safeString(insurer, existing?.insurer || caseRecord.selectedInsurer || caseRecord.requestedInsurer || "Manual insurer");
    row.documentType = safeString(documentType, existing?.documentType || "policy_document_metadata");
    row.policyNumber = safeString(policyNumber, existing?.policyNumber || "Manual placeholder");
    row.effectiveFrom = effectiveFrom || existing?.effectiveFrom || null;
    row.effectiveTo = effectiveTo || existing?.effectiveTo || null;
    row.storageMode = safeString(storageMode, existing?.storageMode || "metadata_placeholder");
    row.fileReference = fileReference ? String(fileReference).slice(0, 160) : existing?.fileReference || null;
    row.verificationStatus = nextStatus;
    row.reason = actionReason;
    row.reviewerNote = reviewerNote ? String(reviewerNote).slice(0, 240) : existing?.reviewerNote;
    row.reviewedAt = ["verified", "rejected", "under_review"].includes(nextStatus) ? new Date().toISOString() : row.reviewedAt;
    row.updatedAt = new Date().toISOString();
    if (!existing) memoryPolicyDocuments.unshift(row);
    if (nextStatus === "verified" && caseRecord) {
      const previousStatus = caseRecord.status;
      caseRecord.status = "policy_verified";
      caseRecord.policyIssuedToCustomer = false;
      caseRecord.updatedAt = new Date().toISOString();
      memoryStatusEvents.unshift({
        id: `ops-status-doc-${Date.now()}`,
        caseId: caseRecord.id,
        caseRef: caseRecord.caseRef,
        actorEmail: session?.email || "admin",
        action: "policy_document_verified",
        previousStatus,
        status: "policy_verified",
        reason: actionReason,
        note: "Policy document metadata verified. Customer release remains blocked.",
        createdAt: new Date().toISOString(),
      });
    }
    await recordPersistedAdminAuditEvent({
      session,
      action: "renewal_ops_policy_document_update",
      targetType: "policy_document_verification",
      targetId: row.id,
      field: "verificationStatus",
      reason: actionReason,
      status: "logged",
      metadata: sanitizeOpsMetadata({ caseRef: row.caseRef, nextStatus, storageMode: row.storageMode, noCustomerRelease: true, source: "mock_fallback" }),
      request,
    });
    return { document: mapPolicyDocumentForClient(row, new Map(memoryCases.map((item) => [item.id, item]))), persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const row = await prisma.$transaction(async (tx) => {
      const existing = documentId
        ? await tx.adminPolicyDocumentVerification.findUnique({ where: { id: documentId }, include: { case: true, reviewer: true } })
        : null;
      const caseRecord = existing?.case || await tx.adminRenewalOpsCase.findFirst({
        where: { OR: [{ id: caseId || "" }, { caseRef: caseId || "" }] },
      });
      if (!existing && !caseRecord) {
        const error = new Error("Renewal case or policy document record was not found.");
        error.status = 404;
        throw error;
      }
      const data = {
        actorUserId,
        reviewerUserId: ["verified", "rejected", "under_review"].includes(nextStatus) ? actorUserId : existing?.reviewerUserId,
        insurer: safeString(insurer, existing?.insurer || caseRecord.selectedInsurer || caseRecord.requestedInsurer || "Manual insurer"),
        documentType: safeString(documentType, existing?.documentType || "policy_document_metadata"),
        policyNumber: safeString(policyNumber, existing?.policyNumber || "Manual placeholder"),
        effectiveFrom: normalizeDateInput(effectiveFrom) || existing?.effectiveFrom,
        effectiveTo: normalizeDateInput(effectiveTo) || existing?.effectiveTo,
        storageMode: safeString(storageMode, existing?.storageMode || "metadata_placeholder"),
        fileReference: fileReference ? String(fileReference).slice(0, 160) : existing?.fileReference,
        verificationStatus: nextStatus,
        reason: actionReason,
        reviewerNote: reviewerNote ? String(reviewerNote).slice(0, 240) : existing?.reviewerNote,
        safeSummary: sanitizeOpsMetadata({ noCustomerRelease: true, storageMode: storageMode || existing?.storageMode || "metadata_placeholder" }),
        noCustomerRelease: true,
        ipAddress,
        userAgent,
        uploadedAt: existing?.uploadedAt || new Date(),
        reviewedAt: ["verified", "rejected", "under_review"].includes(nextStatus) ? new Date() : existing?.reviewedAt,
      };
      const document = existing
        ? await tx.adminPolicyDocumentVerification.update({
            where: { id: existing.id },
            data,
            include: { case: true, reviewer: true },
          })
        : await tx.adminPolicyDocumentVerification.create({
            data: {
              caseId: caseRecord.id,
              ...data,
            },
            include: { case: true, reviewer: true },
          });
      if (nextStatus === "verified") {
        await tx.adminRenewalOpsCase.update({
          where: { id: document.caseId },
          data: {
            status: "policy_verified",
            updatedByUserId: actorUserId,
            policyIssuedToCustomer: false,
          },
        });
        await tx.adminRenewalOpsStatusEvent.create({
          data: {
            caseId: document.caseId,
            actorUserId,
            action: "policy_document_verified",
            previousStatus: caseRecord.status,
            status: "policy_verified",
            reason: actionReason,
            note: "Policy document metadata verified. Customer release remains blocked.",
            ipAddress,
            userAgent,
            metadata: sanitizeOpsMetadata({ noCustomerRelease: true }),
          },
        });
      }
      return document;
    });
    const auditEvent = await recordPersistedAdminAuditEvent({
      session,
      action: "renewal_ops_policy_document_update",
      targetType: "policy_document_verification",
      targetId: row.id,
      field: "verificationStatus",
      reason: actionReason,
      status: "logged",
      metadata: sanitizeOpsMetadata({ caseRef: row.case?.caseRef, nextStatus, storageMode: row.storageMode, noCustomerRelease: true }),
      request,
    });
    return { document: mapPolicyDocumentForClient(row), log: auditEvent, persisted: true };
  } catch (error) {
    if (error?.status || !isRenewalOpsDatabaseUnavailable(error)) throw error;
    return upsertPolicyDocumentVerification({
      session,
      documentId,
      caseId,
      insurer,
      documentType,
      policyNumber,
      effectiveFrom,
      effectiveTo,
      storageMode,
      fileReference,
      verificationStatus,
      reason,
      reviewerNote,
      request: null,
      forceFallback: true,
    });
  }
}

export function getMockRenewalOpsSensitiveValue(targetId, field) {
  const normalizedField = String(field || "");
  const caseRecord = memoryCases.find((item) => item.id === targetId || item.caseRef === targetId);
  const fieldMap = {
    customerIc: { key: "customerIc", type: "ic", label: "IC" },
    ic: { key: "customerIc", type: "ic", label: "IC" },
    customerEmail: { key: "customerEmail", type: "email", label: "email" },
    email: { key: "customerEmail", type: "email", label: "email" },
    customerPhone: { key: "customerPhone", type: "phone", label: "phone" },
    phone: { key: "customerPhone", type: "phone", label: "phone" },
    customerAddress: { key: "customerAddress", type: "address", label: "address" },
    address: { key: "customerAddress", type: "address", label: "address" },
  };
  const meta = fieldMap[normalizedField];
  if (!caseRecord || !meta || !caseRecord[meta.key]) return null;
  return {
    value: caseRecord[meta.key],
    type: meta.type,
    label: `${caseRecord.caseRef} ${meta.label}`,
  };
}
