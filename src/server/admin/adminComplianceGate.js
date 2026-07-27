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

function isComplianceDatabaseUnavailable(error) {
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

function normalizeDateInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeValue(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function safeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function sanitizeComplianceMetadata(metadata = {}) {
  const blockedKeys = /ic|nric|email|phone|address|token|secret|password|signature|authorization|payload|prompt|chat/i;
  return Object.fromEntries(
    Object.entries(metadata || {})
      .filter(([key]) => !blockedKeys.test(key))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 220) : value]),
  );
}

export const COMPLIANCE_OPERATING_MODEL_TYPES = [
  "licensed_insurer",
  "registered_agent",
  "approved_broker",
  "financial_adviser",
  "technology_vendor_partner",
  "sandbox_manual_ops_model",
  "unknown_requires_legal_review",
];

export const COMPLIANCE_OPERATING_MODEL_STATUSES = [
  "requires_legal_review",
  "legal_review",
  "approved",
  "blocked",
  "launch_ready",
];

export const COMPLIANCE_DOCUMENT_TYPES = [
  "terms_conditions",
  "privacy_policy_pdpa_notice",
  "consent_wording",
  "recommendation_disclaimer",
  "data_retention_sop",
  "data_export_deletion_sop",
  "manual_insurer_ops_sop",
  "payment_refund_sop_placeholder",
  "insurer_approved_scripts_facts",
];

export const COMPLIANCE_DOCUMENT_STATUSES = [
  "draft",
  "legal_review",
  "insurer_review",
  "approved",
  "expired",
  "blocked",
];

export const COMPLIANCE_CHECKLIST_STATUSES = [
  "not_started",
  "in_progress",
  "evidence_added",
  "legal_review",
  "approved",
  "blocked",
];

export const COMPLIANCE_SCRIPT_FACT_STATUSES = COMPLIANCE_DOCUMENT_STATUSES;
export const COMPLIANCE_LAUNCH_DECISION_STATUSES = ["not_ready", "ready", "blocked"];

export const COMPLIANCE_OFFICIAL_SOURCES = [
  {
    key: "bnm_market_conduct",
    authority: "Bank Negara Malaysia",
    title: "Market Conduct and Financial Services Act references",
    url: "https://www.bnm.gov.my/market-conduct",
    status: "reference_only",
    note: "Use for financial service provider conduct and intermediary model review. Legal counsel must confirm LAJOO's model.",
  },
  {
    key: "bnm_intermediaries",
    authority: "Bank Negara Malaysia",
    title: "List of Approved and Registered Intermediaries",
    url: "https://www.bnm.gov.my/list-of-approved-and-registered-intermediaries",
    status: "reference_only",
    note: "Use to verify approved broker/intermediary assumptions before any launch-ready claim.",
  },
  {
    key: "pdpa_act_709",
    authority: "Malaysia Personal Data Protection Department",
    title: "Personal Data Protection Act 2010 [Act 709]",
    url: "https://www.pdp.gov.my/ppdpv1/en/akta/pdp-act-2010-en/",
    status: "reference_only",
    note: "Official Act 709 reference for commercial personal data processing.",
  },
  {
    key: "pdpa_notice_guidance",
    authority: "Malaysia Personal Data Protection Department",
    title: "Guidance on the Preparation of Personal Data Protection Notices",
    url: "https://www.pdp.gov.my/ppdpv1/en/akta/guidance-on-the-preparation-of-personal-data-protection-notices/",
    status: "reference_only",
    note: "Use for privacy/PDPA notice review and customer notice wording.",
  },
  {
    key: "pdpa_principles",
    authority: "Malaysia Personal Data Protection Department",
    title: "Principles of Personal Data Protection",
    url: "https://www.pdp.gov.my/ppdpv1/en/principles-of-personal-data-protection/",
    status: "reference_only",
    note: "Use for checklist coverage of the seven personal data protection principles.",
  },
  {
    key: "jpj_lkm_renewal",
    authority: "Road Transport Department Malaysia",
    title: "Motor Vehicle License Renewal Guide (LKM)",
    url: "https://www.jpj.gov.my/en/motor-vehicle-license-renewal-guide-lkm/",
    status: "reference_only",
    note: "Use for LKM renewal requirements including insurance coverage period and renewal timing.",
  },
];

export function canInspectComplianceGate(session) {
  if (!session?.role) return false;
  const role = normalizeAdminRole(session.role);
  return ["founder", "compliance", "ops", "ai_qa", "engineer"].includes(role)
    || hasAdminPermission(role, ADMIN_PERMISSIONS.SECURITY_ACCESS);
}

export function canManageComplianceGate(session) {
  if (!session?.role) return false;
  return ["founder", "compliance"].includes(normalizeAdminRole(session?.role));
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

const fallbackOperatingModels = [
  {
    id: "compliance-model-licensed-insurer",
    modelType: "licensed_insurer",
    title: "Licensed insurer",
    status: "requires_legal_review",
    launchReady: false,
    evidenceTitle: "BNM insurance/takaful and FSA reference",
    evidenceUrl: "https://www.bnm.gov.my/insurance-takaful",
    evidenceSummary: "Only mark ready if LAJOO is itself licensed or operating under a verified licensed insurer structure.",
    sourceUrls: [COMPLIANCE_OFFICIAL_SOURCES[0].url],
    blockers: ["No proof LAJOO is a licensed insurer."],
    notes: "Requires legal and insurer review.",
  },
  {
    id: "compliance-model-registered-agent",
    modelType: "registered_agent",
    title: "Registered agent",
    status: "requires_legal_review",
    launchReady: false,
    evidenceTitle: "BNM intermediary model review",
    evidenceUrl: "https://www.bnm.gov.my/list-of-approved-and-registered-intermediaries",
    evidenceSummary: "Confirm agency appointment, allowed activity, scripts, and disclosure wording.",
    sourceUrls: [COMPLIANCE_OFFICIAL_SOURCES[1].url],
    blockers: ["No approved agency appointment evidence captured."],
    notes: "Potential model; not approved.",
  },
  {
    id: "compliance-model-approved-broker",
    modelType: "approved_broker",
    title: "Approved broker",
    status: "requires_legal_review",
    launchReady: false,
    evidenceTitle: "BNM approved intermediaries directory",
    evidenceUrl: "https://www.bnm.gov.my/list-of-approved-and-registered-intermediaries",
    evidenceSummary: "Do not claim broker status unless approval is verified.",
    sourceUrls: [COMPLIANCE_OFFICIAL_SOURCES[1].url],
    blockers: ["No approved broker evidence captured."],
    notes: "Requires legal review.",
  },
  {
    id: "compliance-model-financial-adviser",
    modelType: "financial_adviser",
    title: "Financial adviser",
    status: "requires_legal_review",
    launchReady: false,
    evidenceTitle: "BNM financial advisory reference",
    evidenceUrl: "https://www.bnm.gov.my/market-conduct",
    evidenceSummary: "Treat advice/recommendation wording as legally sensitive until counsel approves.",
    sourceUrls: [COMPLIANCE_OFFICIAL_SOURCES[0].url],
    blockers: ["No approved financial adviser evidence captured."],
    notes: "Requires legal review.",
  },
  {
    id: "compliance-model-tech-vendor",
    modelType: "technology_vendor_partner",
    title: "Technology/vendor partner",
    status: "legal_review",
    launchReady: false,
    evidenceTitle: "Partner/vendor operating model review",
    evidenceUrl: "https://www.bnm.gov.my/market-conduct",
    evidenceSummary: "Potential model if LAJOO acts as technology provider to a licensed/approved partner.",
    sourceUrls: [COMPLIANCE_OFFICIAL_SOURCES[0].url],
    blockers: ["Partner agreement and permitted activities not captured."],
    notes: "Most likely demo-safe assumption, still requires legal confirmation.",
  },
  {
    id: "compliance-model-sandbox-manual",
    modelType: "sandbox_manual_ops_model",
    title: "Sandbox/manual ops model",
    status: "legal_review",
    launchReady: false,
    evidenceTitle: "Manual ops demo and insurer review gate",
    evidenceUrl: "https://www.bnm.gov.my/market-conduct",
    evidenceSummary: "Demo/manual processing must not imply licensed activity, live insurer API, or policy issuance.",
    sourceUrls: [COMPLIANCE_OFFICIAL_SOURCES[0].url, COMPLIANCE_OFFICIAL_SOURCES[5].url],
    blockers: ["Legal position and customer-facing disclaimers not approved."],
    notes: "Allowed for internal demos only until reviewed.",
  },
  {
    id: "compliance-model-unknown",
    modelType: "unknown_requires_legal_review",
    title: "Unknown / requires legal review",
    status: "requires_legal_review",
    launchReady: false,
    evidenceTitle: "Launch gate default",
    evidenceUrl: "https://www.bnm.gov.my/market-conduct",
    evidenceSummary: "Default state until founder/legal/insurer review determines the operating model.",
    sourceUrls: [COMPLIANCE_OFFICIAL_SOURCES[0].url],
    blockers: ["Operating model not confirmed."],
    notes: "Default blocker.",
  },
];

const fallbackLegalDocuments = [
  ["terms_conditions", "Terms & Conditions", "founder", "draft"],
  ["privacy_policy_pdpa_notice", "Privacy Policy / PDPA Notice", "compliance", "legal_review"],
  ["consent_wording", "Customer consent wording", "compliance", "legal_review"],
  ["recommendation_disclaimer", "Recommendation disclaimer", "compliance", "draft"],
  ["data_retention_sop", "Data retention SOP", "compliance", "draft"],
  ["data_export_deletion_sop", "Data export/deletion SOP", "compliance", "draft"],
  ["manual_insurer_ops_sop", "Manual insurer ops SOP", "ops", "draft"],
  ["payment_refund_sop_placeholder", "Payment/refund SOP placeholder", "founder", "draft"],
  ["insurer_approved_scripts_facts", "Insurer-approved scripts/facts registry", "ai_qa", "insurer_review"],
].map(([documentType, title, ownerRole, status], index) => ({
  id: `compliance-doc-${documentType}`,
  documentType,
  title,
  version: "v0.1-draft",
  status,
  ownerRole,
  ownerName: ownerRole === "ops" ? "Ops" : ownerRole === "ai_qa" ? "AI QA" : "Compliance",
  reviewerName: "Unassigned legal reviewer",
  sourceLinks: documentType.includes("pdpa") || documentType.includes("consent")
    ? [COMPLIANCE_OFFICIAL_SOURCES[2], COMPLIANCE_OFFICIAL_SOURCES[3]]
    : [COMPLIANCE_OFFICIAL_SOURCES[index % COMPLIANCE_OFFICIAL_SOURCES.length]],
  reviewDueAt: new Date(Date.UTC(2026, 6, 15 + index)).toISOString(),
  notes: "Draft launch artifact for legal/insurer review. Not legal advice.",
  createdAt: "2026-06-21T00:00:00.000Z",
  updatedAt: "2026-06-21T00:00:00.000Z",
}));

const fallbackChecklistItems = [
  ["pdpa", "personal_data_inventory", "Personal data inventory", "Map customer, vehicle, payment, consent, and admin data fields.", "compliance", "in_progress"],
  ["pdpa", "purpose_limitation", "Purpose limitation", "Document why each data category is collected and processed.", "compliance", "not_started"],
  ["pdpa", "consent_capture", "Consent capture", "Confirm consent wording and persisted consent evidence.", "compliance", "legal_review"],
  ["pdpa", "notice_wording", "Notice wording", "Review PDPA notice against official guidance.", "compliance", "legal_review"],
  ["pdpa", "access_export_deletion", "Access/export/deletion handling", "Define SOP for data subject access/export/deletion requests.", "compliance", "not_started"],
  ["pdpa", "retention_policy", "Retention policy", "Define retention windows for chat, renewal, audit, and payment records.", "compliance", "not_started"],
  ["pdpa", "breach_response", "Breach response placeholder", "Prepare breach assessment and notification workflow.", "compliance", "not_started"],
  ["pdpa", "vendor_processor_list", "Vendor/data processor list", "List OpenAI, hosting, database, email, storage, and future payment processors.", "engineer", "in_progress"],
  ["pdpa", "admin_pii_audit", "Admin PII masking/reveal audit", "Confirm masking, reveal reason, and audit logs are active.", "compliance", "evidence_added"],
  ["ai_recommendation", "recommendation_disclaimer", "Recommendation disclaimer", "Approve wording that AI assists and does not guarantee best/cheapest unless supported.", "compliance", "legal_review"],
  ["ai_recommendation", "no_unsupported_guarantees", "No unsupported guarantees", "Block cheapest/best/same-day issuance claims without source-backed support.", "ai_qa", "in_progress"],
  ["ai_recommendation", "insurer_fact_source_trace", "Insurer fact source trace", "Require source trace for insurer facts and recommendation rules.", "ai_qa", "evidence_added"],
  ["ai_recommendation", "approved_scripts", "Approved scripts", "Only use approved scripts for regulated/insurance-sensitive guidance.", "ai_qa", "insurer_review"],
  ["ai_recommendation", "human_ops_escalation", "Human ops escalation", "Escalate uncertain licensing, payment, issuance, or insurer-specific answers.", "ops", "in_progress"],
  ["ai_recommendation", "wrong_answer_loop", "Wrong-answer review loop", "Maintain review queue and correction workflow.", "ai_qa", "evidence_added"],
  ["ai_recommendation", "unsupported_claims_blocker", "Launch-blocking unsupported claims", "Identify and block claims that are not legal/insurer-approved.", "compliance", "blocked"],
].map(([checklistType, itemKey, title, description, ownerRole, status], index) => ({
  id: `compliance-check-${checklistType}-${itemKey}`,
  checklistType,
  itemKey,
  title,
  description,
  status,
  ownerRole,
  ownerName: ownerRole === "ai_qa" ? "AI QA" : ownerRole === "ops" ? "Ops" : ownerRole === "engineer" ? "Engineering" : "Compliance",
  reviewerName: "Unassigned reviewer",
  launchBlocking: true,
  dueAt: new Date(Date.UTC(2026, 6, 20 + index)).toISOString(),
  evidence: checklistType === "pdpa" ? [COMPLIANCE_OFFICIAL_SOURCES[2], COMPLIANCE_OFFICIAL_SOURCES[3]] : [],
  reviewerNote: "Requires founder/compliance approval before launch-ready.",
  createdAt: "2026-06-21T00:00:00.000Z",
  updatedAt: "2026-06-21T00:00:00.000Z",
}));

const fallbackScriptFacts = [
  {
    id: "compliance-script-general-disclaimer",
    insurer: "All insurers",
    recordType: "script",
    title: "General recommendation disclaimer",
    status: "legal_review",
    sourceTitle: "LAJOO legal review draft",
    sourceUrl: "https://www.pdp.gov.my/ppdpv1/en/akta/guidance-on-the-preparation-of-personal-data-protection-notices/",
    allowedUseCases: ["quote_recommendation", "side_questions"],
    scriptSummary: "AI can explain options and tradeoffs, but final regulated advice status requires legal review.",
    reviewerName: "Compliance",
    notes: "Not insurer-approved yet.",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  },
  {
    id: "compliance-fact-jpj-lkm-insurance",
    insurer: "All insurers",
    recordType: "fact_pack",
    title: "JPJ LKM renewal requires insurance coverage for the applied period",
    status: "legal_review",
    sourceTitle: "JPJ Motor Vehicle License Renewal Guide (LKM)",
    sourceUrl: "https://www.jpj.gov.my/en/motor-vehicle-license-renewal-guide-lkm/",
    allowedUseCases: ["road_tax_questions", "renewal_timing"],
    scriptSummary: "Use for road tax/LKM eligibility explanations after legal/ops review.",
    reviewerName: "Ops",
    notes: "Official source captured; not marked approved until admin action.",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  },
];

let memoryOperatingModels = fallbackOperatingModels.map((item) => ({ ...item }));
let memoryLegalDocuments = fallbackLegalDocuments.map((item) => ({ ...item }));
let memoryChecklistItems = fallbackChecklistItems.map((item) => ({ ...item }));
let memoryScriptFacts = fallbackScriptFacts.map((item) => ({ ...item }));
let memoryLaunchDecisions = [
  {
    id: "compliance-decision-initial",
    decisionType: "launch_gate",
    status: "not_ready",
    decidedByEmail: "system@lajoo.my",
    decidedByRole: "system",
    reason: "Initial Phase 16 launch gate seed: legal, PDPA, operating model, and insurer-script blockers remain open.",
    blockers: ["Operating model not approved", "Legal documents pending", "PDPA checklist pending", "AI compliance blockers pending"],
    createdAt: "2026-06-21T00:00:00.000Z",
  },
];
let memoryEvents = [];

export function resetAdminComplianceGateMemoryForTest() {
  memoryOperatingModels = fallbackOperatingModels.map((item) => ({ ...item }));
  memoryLegalDocuments = fallbackLegalDocuments.map((item) => ({ ...item }));
  memoryChecklistItems = fallbackChecklistItems.map((item) => ({ ...item }));
  memoryScriptFacts = fallbackScriptFacts.map((item) => ({ ...item }));
  memoryLaunchDecisions = [
    {
      id: "compliance-decision-initial",
      decisionType: "launch_gate",
      status: "not_ready",
      decidedByEmail: "system@lajoo.my",
      decidedByRole: "system",
      reason: "Initial Phase 16 launch gate seed: legal, PDPA, operating model, and insurer-script blockers remain open.",
      blockers: ["Operating model not approved", "Legal documents pending", "PDPA checklist pending", "AI compliance blockers pending"],
      createdAt: "2026-06-21T00:00:00.000Z",
    },
  ];
  memoryEvents = [];
}

function mapOperatingModel(row) {
  return {
    ...row,
    sourceUrls: row.sourceUrls || [],
    blockers: row.blockers || [],
    reviewedAt: toIso(row.reviewedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapLegalDocument(row) {
  return {
    ...row,
    sourceLinks: row.sourceLinks || [],
    effectiveAt: toIso(row.effectiveAt),
    reviewDueAt: toIso(row.reviewDueAt),
    approvedAt: toIso(row.approvedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapChecklistItem(row) {
  return {
    ...row,
    evidence: row.evidence || [],
    dueAt: toIso(row.dueAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapScriptFact(row) {
  return {
    ...row,
    allowedUseCases: row.allowedUseCases || [],
    effectiveFrom: toIso(row.effectiveFrom),
    effectiveTo: toIso(row.effectiveTo),
    approvedAt: toIso(row.approvedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapLaunchDecision(row) {
  return {
    ...row,
    blockers: row.blockers || [],
    createdAt: toIso(row.createdAt),
  };
}

function mapEvent(row) {
  return {
    ...row,
    metadata: row.metadata || {},
    createdAt: toIso(row.createdAt),
  };
}

export function buildComplianceLaunchSummary({
  operatingModels = [],
  legalDocuments = [],
  checklistItems = [],
  scriptFacts = [],
  launchDecisions = [],
} = {}) {
  const launchBlockers = [];
  const operatingReady = operatingModels.some((item) => item.launchReady && item.status === "launch_ready");
  if (!operatingReady) launchBlockers.push("Operating model is not approved as launch-ready.");

  const legalPending = legalDocuments.filter((item) => item.status !== "approved");
  if (legalPending.length) launchBlockers.push(`${legalPending.length} legal document(s) are not approved.`);

  const pdpaItems = checklistItems.filter((item) => item.checklistType === "pdpa");
  const aiItems = checklistItems.filter((item) => item.checklistType === "ai_recommendation");
  const pdpaOpen = pdpaItems.filter((item) => item.launchBlocking && item.status !== "approved");
  const aiOpen = aiItems.filter((item) => item.launchBlocking && item.status !== "approved");
  if (pdpaOpen.length) launchBlockers.push(`${pdpaOpen.length} PDPA/data protection checklist item(s) remain open.`);
  if (aiOpen.length) launchBlockers.push(`${aiOpen.length} AI/recommendation compliance item(s) remain open.`);

  const scriptPending = scriptFacts.filter((item) => item.status !== "approved");
  const unsafeClaims = checklistItems.filter((item) => item.itemKey === "unsupported_claims_blocker" && item.status !== "approved");
  if (scriptPending.length) launchBlockers.push(`${scriptPending.length} insurer script/fact record(s) are not approved.`);
  if (unsafeClaims.length) launchBlockers.push("Unsupported customer-facing claims remain launch-blocking.");

  const latestDecision = [...launchDecisions].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
  const launchReady = launchBlockers.length === 0 && latestDecision?.status === "ready";

  return {
    launchReady,
    decisionStatus: latestDecision?.status || "not_ready",
    launchBlockers,
    blockerCount: launchBlockers.length,
    operatingModelStatus: operatingReady ? "launch_ready" : "requires_legal_review",
    legalDocsPending: legalPending.length,
    pdpaApproved: pdpaItems.filter((item) => item.status === "approved").length,
    pdpaTotal: pdpaItems.length,
    aiApproved: aiItems.filter((item) => item.status === "approved").length,
    aiTotal: aiItems.length,
    insurerReviewPending: scriptPending.length,
    unsafeClaims: unsafeClaims.length,
    latestDecision: latestDecision ? mapLaunchDecision(latestDecision) : null,
  };
}

function fallbackData() {
  const operatingModels = memoryOperatingModels.map(mapOperatingModel);
  const legalDocuments = memoryLegalDocuments.map(mapLegalDocument);
  const checklistItems = memoryChecklistItems.map(mapChecklistItem);
  const scriptFacts = memoryScriptFacts.map(mapScriptFact);
  const launchDecisions = memoryLaunchDecisions.map(mapLaunchDecision);
  const summary = buildComplianceLaunchSummary({
    operatingModels,
    legalDocuments,
    checklistItems,
    scriptFacts,
    launchDecisions,
  });
  return {
    persisted: false,
    dataMode: "Mock/manual fallback",
    officialSources: COMPLIANCE_OFFICIAL_SOURCES,
    operatingModels,
    legalDocuments,
    checklistItems,
    pdpaChecklist: checklistItems.filter((item) => item.checklistType === "pdpa"),
    aiChecklist: checklistItems.filter((item) => item.checklistType === "ai_recommendation"),
    scriptFacts,
    launchDecisions,
    events: memoryEvents.map(mapEvent),
    summary,
  };
}

async function ensureMockComplianceGateData(prisma) {
  const count = await prisma.adminComplianceOperatingModelGate.count();
  if (count) return;
  await prisma.$transaction(async (tx) => {
    await tx.adminComplianceOperatingModelGate.createMany({
      data: fallbackOperatingModels.map((item) => ({
        ...item,
        createdAt: new Date(item.createdAt || "2026-06-21T00:00:00.000Z"),
        updatedAt: new Date(item.updatedAt || "2026-06-21T00:00:00.000Z"),
      })),
      skipDuplicates: true,
    });
    await tx.adminComplianceLegalDocument.createMany({
      data: fallbackLegalDocuments.map((item) => ({
        ...item,
        effectiveAt: item.effectiveAt ? new Date(item.effectiveAt) : null,
        reviewDueAt: item.reviewDueAt ? new Date(item.reviewDueAt) : null,
        approvedAt: item.approvedAt ? new Date(item.approvedAt) : null,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      })),
      skipDuplicates: true,
    });
    await tx.adminComplianceChecklistItem.createMany({
      data: fallbackChecklistItems.map((item) => ({
        ...item,
        dueAt: item.dueAt ? new Date(item.dueAt) : null,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      })),
      skipDuplicates: true,
    });
    await tx.adminInsurerApprovedScriptFact.createMany({
      data: fallbackScriptFacts.map((item) => ({
        ...item,
        effectiveFrom: item.effectiveFrom ? new Date(item.effectiveFrom) : null,
        effectiveTo: item.effectiveTo ? new Date(item.effectiveTo) : null,
        approvedAt: item.approvedAt ? new Date(item.approvedAt) : null,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      })),
      skipDuplicates: true,
    });
    await tx.adminComplianceLaunchDecision.create({
      data: {
        decisionType: "launch_gate",
        status: "not_ready",
        decidedByEmail: "system@lajoo.my",
        decidedByRole: "system",
        reason: "Initial Phase 16 launch gate seed: legal, PDPA, operating model, and insurer-script blockers remain open.",
        blockers: ["Operating model not approved", "Legal documents pending", "PDPA checklist pending", "AI compliance blockers pending"],
        createdAt: new Date("2026-06-21T00:00:00.000Z"),
      },
    });
  });
}

export async function getPersistedComplianceLaunchGateData({ session } = {}) {
  assertPermission(canInspectComplianceGate(session), "Compliance launch gate access required.");
  if (!process.env.DATABASE_URL) return fallbackData();

  try {
    const prisma = await getPrisma();
    await ensureMockComplianceGateData(prisma);
    const [operatingModels, legalDocuments, checklistItems, scriptFacts, launchDecisions, events] = await Promise.all([
      prisma.adminComplianceOperatingModelGate.findMany({ orderBy: { updatedAt: "desc" } }),
      prisma.adminComplianceLegalDocument.findMany({ orderBy: [{ status: "asc" }, { documentType: "asc" }] }),
      prisma.adminComplianceChecklistItem.findMany({ orderBy: [{ checklistType: "asc" }, { itemKey: "asc" }] }),
      prisma.adminInsurerApprovedScriptFact.findMany({ orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.adminComplianceLaunchDecision.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.adminComplianceGateEvent.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    ]);
    const mappedOperatingModels = operatingModels.map(mapOperatingModel);
    const mappedLegalDocuments = legalDocuments.map(mapLegalDocument);
    const mappedChecklistItems = checklistItems.map(mapChecklistItem);
    const mappedScriptFacts = scriptFacts.map(mapScriptFact);
    const mappedLaunchDecisions = launchDecisions.map(mapLaunchDecision);
    const summary = buildComplianceLaunchSummary({
      operatingModels: mappedOperatingModels,
      legalDocuments: mappedLegalDocuments,
      checklistItems: mappedChecklistItems,
      scriptFacts: mappedScriptFacts,
      launchDecisions: mappedLaunchDecisions,
    });
    return {
      persisted: true,
      dataMode: "Persisted compliance launch gate",
      officialSources: COMPLIANCE_OFFICIAL_SOURCES,
      operatingModels: mappedOperatingModels,
      legalDocuments: mappedLegalDocuments,
      checklistItems: mappedChecklistItems,
      pdpaChecklist: mappedChecklistItems.filter((item) => item.checklistType === "pdpa"),
      aiChecklist: mappedChecklistItems.filter((item) => item.checklistType === "ai_recommendation"),
      scriptFacts: mappedScriptFacts,
      launchDecisions: mappedLaunchDecisions,
      events: events.map(mapEvent),
      summary,
    };
  } catch (error) {
    if (!isComplianceDatabaseUnavailable(error)) throw error;
    return fallbackData();
  }
}

async function recordComplianceEvent({ session, targetType, targetId, action, previousStatus, status, reason, note, metadata, request, prisma }) {
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
    note: note ? String(note).slice(0, 240) : null,
    ipAddress: getRequestIpAddress(request),
    userAgent: getRequestUserAgent(request),
    metadata: sanitizeComplianceMetadata(metadata),
  };
  if (prisma) return prisma.adminComplianceGateEvent.create({ data });
  const event = {
    id: `compliance-event-${Date.now()}`,
    ...data,
    createdAt: new Date().toISOString(),
  };
  memoryEvents.unshift(event);
  return event;
}

async function auditComplianceAction({ session, targetType, targetId, action, field, reason, status, metadata, request }) {
  return recordPersistedAdminAuditEvent({
    session,
    action,
    targetType,
    targetId,
    field,
    reason,
    status: status || "logged",
    metadata: sanitizeComplianceMetadata(metadata),
    request,
  });
}

function updateMemoryRow(rows, id, patch) {
  const row = rows.find((item) => item.id === id || item.modelType === id || item.documentType === id || item.itemKey === id);
  if (!row) {
    const error = new Error("Compliance launch gate record was not found.");
    error.status = 404;
    throw error;
  }
  const previousStatus = row.status;
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  return { row, previousStatus };
}

export async function updateComplianceOperatingModel({ session, modelId, status, launchReady, reason, note, request, forceFallback = false }) {
  assertPermission(canManageComplianceGate(session), "Founder or compliance role required for compliance launch-gate decisions.");
  const actionReason = assertReason(reason);
  const nextStatus = assertValidStatus(status, COMPLIANCE_OPERATING_MODEL_STATUSES, "Unsupported operating model status.");
  const ready = nextStatus === "launch_ready" ? true : Boolean(launchReady);
  const patch = {
    status: nextStatus,
    launchReady: ready,
    reviewerName: session?.name || session?.email || "Admin reviewer",
    reviewerRole: normalizeAdminRole(session?.role),
    updatedByUserId: persistedActorUserId(session),
    updatedByEmail: session?.email || null,
    reviewedAt: new Date(),
    notes: note ? String(note).slice(0, 300) : undefined,
  };

  if (forceFallback || !process.env.DATABASE_URL) {
    const { row, previousStatus } = updateMemoryRow(memoryOperatingModels, modelId, { ...patch, reviewedAt: patch.reviewedAt.toISOString() });
    await recordComplianceEvent({ session, targetType: "compliance_operating_model", targetId: row.id, action: "operating_model_update", previousStatus, status: nextStatus, reason: actionReason, note, metadata: { modelType: row.modelType, launchReady: row.launchReady }, request });
    const auditEvent = await auditComplianceAction({ session, targetType: "compliance_operating_model", targetId: row.id, action: "compliance_operating_model_update", field: "status", reason: actionReason, metadata: { previousStatus, nextStatus, launchReady: row.launchReady }, request });
    return { operatingModel: mapOperatingModel(row), event: auditEvent, persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.adminComplianceOperatingModelGate.findFirst({ where: { OR: [{ id: modelId }, { modelType: modelId }] } });
      if (!existing) {
        const error = new Error("Compliance operating model record was not found.");
        error.status = 404;
        throw error;
      }
      const updated = await tx.adminComplianceOperatingModelGate.update({
        where: { id: existing.id },
        data: patch,
      });
      const event = await recordComplianceEvent({ session, targetType: "compliance_operating_model", targetId: updated.id, action: "operating_model_update", previousStatus: existing.status, status: nextStatus, reason: actionReason, note, metadata: { modelType: updated.modelType, launchReady: updated.launchReady }, request, prisma: tx });
      return { updated, previousStatus: existing.status, event };
    });
    const auditEvent = await auditComplianceAction({ session, targetType: "compliance_operating_model", targetId: result.updated.id, action: "compliance_operating_model_update", field: "status", reason: actionReason, metadata: { previousStatus: result.previousStatus, nextStatus, launchReady: result.updated.launchReady }, request });
    return { operatingModel: mapOperatingModel(result.updated), complianceEvent: mapEvent(result.event), event: auditEvent, persisted: true };
  } catch (error) {
    if (error?.status || !isComplianceDatabaseUnavailable(error)) throw error;
    return updateComplianceOperatingModel({ session, modelId, status, launchReady, reason, note, request: null, forceFallback: true });
  }
}

export async function updateComplianceLegalDocument({ session, documentId, status, version, reason, note, request, forceFallback = false }) {
  assertPermission(canManageComplianceGate(session), "Founder or compliance role required for legal document decisions.");
  const actionReason = assertReason(reason);
  const nextStatus = assertValidStatus(status, COMPLIANCE_DOCUMENT_STATUSES, "Unsupported legal document status.");
  const patch = {
    status: nextStatus,
    version: version ? safeText(version) : undefined,
    reviewerName: session?.name || session?.email || "Admin reviewer",
    approvedAt: nextStatus === "approved" ? new Date() : null,
    blockedReason: nextStatus === "blocked" ? actionReason : null,
    notes: note ? String(note).slice(0, 300) : undefined,
  };
  Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);

  if (forceFallback || !process.env.DATABASE_URL) {
    const { row, previousStatus } = updateMemoryRow(memoryLegalDocuments, documentId, { ...patch, approvedAt: toIso(patch.approvedAt) });
    await recordComplianceEvent({ session, targetType: "compliance_legal_document", targetId: row.id, action: "legal_document_update", previousStatus, status: nextStatus, reason: actionReason, note, metadata: { documentType: row.documentType }, request });
    const auditEvent = await auditComplianceAction({ session, targetType: "compliance_legal_document", targetId: row.id, action: "compliance_legal_document_update", field: "status", reason: actionReason, metadata: { previousStatus, nextStatus, documentType: row.documentType }, request });
    return { legalDocument: mapLegalDocument(row), event: auditEvent, persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.adminComplianceLegalDocument.findFirst({ where: { OR: [{ id: documentId }, { documentType: documentId }] } });
      if (!existing) {
        const error = new Error("Compliance legal document record was not found.");
        error.status = 404;
        throw error;
      }
      const updated = await tx.adminComplianceLegalDocument.update({ where: { id: existing.id }, data: patch });
      const event = await recordComplianceEvent({ session, targetType: "compliance_legal_document", targetId: updated.id, action: "legal_document_update", previousStatus: existing.status, status: nextStatus, reason: actionReason, note, metadata: { documentType: updated.documentType }, request, prisma: tx });
      return { updated, previousStatus: existing.status, event };
    });
    const auditEvent = await auditComplianceAction({ session, targetType: "compliance_legal_document", targetId: result.updated.id, action: "compliance_legal_document_update", field: "status", reason: actionReason, metadata: { previousStatus: result.previousStatus, nextStatus, documentType: result.updated.documentType }, request });
    return { legalDocument: mapLegalDocument(result.updated), complianceEvent: mapEvent(result.event), event: auditEvent, persisted: true };
  } catch (error) {
    if (error?.status || !isComplianceDatabaseUnavailable(error)) throw error;
    return updateComplianceLegalDocument({ session, documentId, status, version, reason, note, request: null, forceFallback: true });
  }
}

export async function updateComplianceChecklistItem({ session, itemId, status, evidence, reason, note, request, forceFallback = false }) {
  assertPermission(canManageComplianceGate(session), "Founder or compliance role required for compliance checklist decisions.");
  const actionReason = assertReason(reason);
  const nextStatus = assertValidStatus(status, COMPLIANCE_CHECKLIST_STATUSES, "Unsupported compliance checklist status.");
  const patch = {
    status: nextStatus,
    evidence: Array.isArray(evidence) ? evidence : undefined,
    reviewerName: session?.name || session?.email || "Admin reviewer",
    reviewerNote: note ? String(note).slice(0, 300) : undefined,
  };
  Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);

  if (forceFallback || !process.env.DATABASE_URL) {
    const { row, previousStatus } = updateMemoryRow(memoryChecklistItems, itemId, patch);
    await recordComplianceEvent({ session, targetType: "compliance_checklist_item", targetId: row.id, action: "checklist_item_update", previousStatus, status: nextStatus, reason: actionReason, note, metadata: { checklistType: row.checklistType, itemKey: row.itemKey }, request });
    const auditEvent = await auditComplianceAction({ session, targetType: "compliance_checklist_item", targetId: row.id, action: "compliance_checklist_item_update", field: "status", reason: actionReason, metadata: { previousStatus, nextStatus, checklistType: row.checklistType, itemKey: row.itemKey }, request });
    return { checklistItem: mapChecklistItem(row), event: auditEvent, persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.adminComplianceChecklistItem.findFirst({ where: { OR: [{ id: itemId }, { itemKey: itemId }] } });
      if (!existing) {
        const error = new Error("Compliance checklist item was not found.");
        error.status = 404;
        throw error;
      }
      const updated = await tx.adminComplianceChecklistItem.update({ where: { id: existing.id }, data: patch });
      const event = await recordComplianceEvent({ session, targetType: "compliance_checklist_item", targetId: updated.id, action: "checklist_item_update", previousStatus: existing.status, status: nextStatus, reason: actionReason, note, metadata: { checklistType: updated.checklistType, itemKey: updated.itemKey }, request, prisma: tx });
      return { updated, previousStatus: existing.status, event };
    });
    const auditEvent = await auditComplianceAction({ session, targetType: "compliance_checklist_item", targetId: result.updated.id, action: "compliance_checklist_item_update", field: "status", reason: actionReason, metadata: { previousStatus: result.previousStatus, nextStatus, checklistType: result.updated.checklistType, itemKey: result.updated.itemKey }, request });
    return { checklistItem: mapChecklistItem(result.updated), complianceEvent: mapEvent(result.event), event: auditEvent, persisted: true };
  } catch (error) {
    if (error?.status || !isComplianceDatabaseUnavailable(error)) throw error;
    return updateComplianceChecklistItem({ session, itemId, status, evidence, reason, note, request: null, forceFallback: true });
  }
}

export async function updateInsurerApprovedScriptFact({ session, recordId, status, reason, note, request, forceFallback = false }) {
  assertPermission(canManageComplianceGate(session), "Founder or compliance role required for insurer script/fact decisions.");
  const actionReason = assertReason(reason);
  const nextStatus = assertValidStatus(status, COMPLIANCE_SCRIPT_FACT_STATUSES, "Unsupported insurer script/fact status.");
  const patch = {
    status: nextStatus,
    reviewerName: session?.name || session?.email || "Admin reviewer",
    approvedAt: nextStatus === "approved" ? new Date() : null,
    notes: note ? String(note).slice(0, 300) : undefined,
  };
  Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);

  if (forceFallback || !process.env.DATABASE_URL) {
    const { row, previousStatus } = updateMemoryRow(memoryScriptFacts, recordId, { ...patch, approvedAt: toIso(patch.approvedAt) });
    await recordComplianceEvent({ session, targetType: "insurer_approved_script_fact", targetId: row.id, action: "script_fact_update", previousStatus, status: nextStatus, reason: actionReason, note, metadata: { insurer: row.insurer, recordType: row.recordType }, request });
    const auditEvent = await auditComplianceAction({ session, targetType: "insurer_approved_script_fact", targetId: row.id, action: "compliance_script_fact_update", field: "status", reason: actionReason, metadata: { previousStatus, nextStatus, insurer: row.insurer, recordType: row.recordType }, request });
    return { scriptFact: mapScriptFact(row), event: auditEvent, persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.adminInsurerApprovedScriptFact.findUnique({ where: { id: recordId } });
      if (!existing) {
        const error = new Error("Insurer script/fact record was not found.");
        error.status = 404;
        throw error;
      }
      const updated = await tx.adminInsurerApprovedScriptFact.update({ where: { id: existing.id }, data: patch });
      const event = await recordComplianceEvent({ session, targetType: "insurer_approved_script_fact", targetId: updated.id, action: "script_fact_update", previousStatus: existing.status, status: nextStatus, reason: actionReason, note, metadata: { insurer: updated.insurer, recordType: updated.recordType }, request, prisma: tx });
      return { updated, previousStatus: existing.status, event };
    });
    const auditEvent = await auditComplianceAction({ session, targetType: "insurer_approved_script_fact", targetId: result.updated.id, action: "compliance_script_fact_update", field: "status", reason: actionReason, metadata: { previousStatus: result.previousStatus, nextStatus, insurer: result.updated.insurer, recordType: result.updated.recordType }, request });
    return { scriptFact: mapScriptFact(result.updated), complianceEvent: mapEvent(result.event), event: auditEvent, persisted: true };
  } catch (error) {
    if (error?.status || !isComplianceDatabaseUnavailable(error)) throw error;
    return updateInsurerApprovedScriptFact({ session, recordId, status, reason, note, request: null, forceFallback: true });
  }
}

export async function recordComplianceLaunchDecision({ session, status, reason, request, forceFallback = false }) {
  assertPermission(canManageComplianceGate(session), "Founder or compliance role required for launch gate decisions.");
  const actionReason = assertReason(reason);
  const nextStatus = assertValidStatus(status, COMPLIANCE_LAUNCH_DECISION_STATUSES, "Unsupported compliance launch decision status.");
  const currentData = forceFallback || !process.env.DATABASE_URL
    ? fallbackData()
    : await getPersistedComplianceLaunchGateData({ session });
  if (nextStatus === "ready" && currentData.summary.blockerCount > 0) {
    const error = new Error("Launch cannot be marked ready while compliance blockers remain.");
    error.status = 400;
    throw error;
  }
  const row = {
    id: `compliance-decision-${Date.now()}`,
    decisionType: "launch_gate",
    status: nextStatus,
    decidedById: persistedActorUserId(session),
    decidedByEmail: session?.email || "unknown@lajoo.my",
    decidedByRole: normalizeAdminRole(session?.role),
    reason: actionReason,
    blockers: currentData.summary.launchBlockers,
    metadata: sanitizeComplianceMetadata({ blockerCount: currentData.summary.blockerCount }),
    ipAddress: getRequestIpAddress(request),
    userAgent: getRequestUserAgent(request),
    createdAt: new Date(),
  };

  if (forceFallback || !process.env.DATABASE_URL) {
    memoryLaunchDecisions.unshift({ ...row, createdAt: row.createdAt.toISOString() });
    await recordComplianceEvent({ session, targetType: "compliance_launch_decision", targetId: row.id, action: "launch_decision", previousStatus: currentData.summary.decisionStatus, status: nextStatus, reason: actionReason, metadata: { blockerCount: currentData.summary.blockerCount }, request });
    const auditEvent = await auditComplianceAction({ session, targetType: "compliance_launch_decision", targetId: row.id, action: "compliance_launch_decision", field: "status", reason: actionReason, status: nextStatus, metadata: { blockerCount: currentData.summary.blockerCount }, request });
    return { launchDecision: mapLaunchDecision(row), event: auditEvent, persisted: false };
  }

  try {
    const prisma = await getPrisma();
    const created = await prisma.adminComplianceLaunchDecision.create({ data: row });
    const complianceEvent = await recordComplianceEvent({ session, targetType: "compliance_launch_decision", targetId: created.id, action: "launch_decision", previousStatus: currentData.summary.decisionStatus, status: nextStatus, reason: actionReason, metadata: { blockerCount: currentData.summary.blockerCount }, request, prisma });
    const auditEvent = await auditComplianceAction({ session, targetType: "compliance_launch_decision", targetId: created.id, action: "compliance_launch_decision", field: "status", reason: actionReason, status: nextStatus, metadata: { blockerCount: currentData.summary.blockerCount }, request });
    return { launchDecision: mapLaunchDecision(created), complianceEvent: mapEvent(complianceEvent), event: auditEvent, persisted: true };
  } catch (error) {
    if (error?.status || !isComplianceDatabaseUnavailable(error)) throw error;
    return recordComplianceLaunchDecision({ session, status, reason, request: null, forceFallback: true });
  }
}
