export const ADMIN_ROLES = [
  "founder",
  "ops",
  "ai_qa",
  "engineer",
  "compliance",
  "agent_manager",
];

export const ADMIN_PERMISSIONS = {
  BUSINESS_ADMIN: "business_admin",
  AI_KNOWLEDGE: "ai_knowledge",
  SECURITY_ACCESS: "security_access",
  TECH_ADMIN: "tech_admin",
  AGENT_B2B: "agent_b2b",
  CONVERSATION_AUDIT: "conversation_audit",
  KNOWLEDGE_ADMIN: "knowledge_admin",
  REVEAL_PII: "reveal_pii",
  EXPORT_DATA: "export_data",
  MANAGE_ACCESS: "manage_access",
};

export const ROLE_DEFINITIONS = {
  founder: {
    label: "Founder",
    description: "Full platform, audit, export, and access control.",
    permissions: Object.values(ADMIN_PERMISSIONS),
  },
  ops: {
    label: "Operations",
    description: "Run renewals, support, payment follow-up, and customer operations.",
    permissions: [
      ADMIN_PERMISSIONS.BUSINESS_ADMIN,
      ADMIN_PERMISSIONS.REVEAL_PII,
    ],
  },
  ai_qa: {
    label: "AI QA",
    description: "Review conversations, facts, traces, and AI answer quality.",
    permissions: [
      ADMIN_PERMISSIONS.AI_KNOWLEDGE,
      ADMIN_PERMISSIONS.CONVERSATION_AUDIT,
      ADMIN_PERMISSIONS.KNOWLEDGE_ADMIN,
      ADMIN_PERMISSIONS.REVEAL_PII,
    ],
  },
  engineer: {
    label: "Engineer",
    description: "Inspect technical health, logs, security signals, and diagnostics.",
    permissions: [
      ADMIN_PERMISSIONS.SECURITY_ACCESS,
      ADMIN_PERMISSIONS.TECH_ADMIN,
    ],
  },
  compliance: {
    label: "Compliance",
    description: "Audit consent, PII handling, recommendation records, and evidence trails.",
    permissions: [
      ADMIN_PERMISSIONS.SECURITY_ACCESS,
      ADMIN_PERMISSIONS.REVEAL_PII,
    ],
  },
  agent_manager: {
    label: "Agent Manager",
    description: "Manage partner and B2B renewal activity without exports.",
    permissions: [
      ADMIN_PERMISSIONS.BUSINESS_ADMIN,
      ADMIN_PERMISSIONS.AGENT_B2B,
      ADMIN_PERMISSIONS.REVEAL_PII,
    ],
  },
};

export const ADMIN_NAVIGATION = [
  {
    href: "/admin",
    label: "Business Admin",
    shortLabel: "Business",
    description: "Renewals, customers, payments, support, and sales operations.",
    permission: ADMIN_PERMISSIONS.BUSINESS_ADMIN,
  },
  {
    href: "/admin/ai-knowledge",
    label: "AI & Knowledge",
    shortLabel: "AI",
    description: "Conversation QA, approved facts, source traces, and eval queues.",
    permission: ADMIN_PERMISSIONS.AI_KNOWLEDGE,
  },
  {
    href: "/admin/security",
    label: "Security & Access",
    shortLabel: "Security",
    description: "Team roles, reveal logs, export controls, and PII governance.",
    permission: ADMIN_PERMISSIONS.SECURITY_ACCESS,
  },
  {
    href: "/admin/tech",
    label: "Tech Logs",
    shortLabel: "Tech",
    description: "Payment webhooks, adapters, AI usage, jobs, and reminders.",
    permission: ADMIN_PERMISSIONS.TECH_ADMIN,
  },
  {
    href: "/admin/conversations",
    label: "Conversation Audit",
    shortLabel: "Conversations",
    description: "Detailed conversation replay and answer review.",
    permission: ADMIN_PERMISSIONS.CONVERSATION_AUDIT,
  },
  {
    href: "/admin/knowledge",
    label: "Knowledge Facts",
    shortLabel: "Facts",
    description: "Fact approval, document dating, and AI-safe insurer knowledge.",
    permission: ADMIN_PERMISSIONS.KNOWLEDGE_ADMIN,
  },
];

export function isValidAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

export function normalizeAdminRole(role) {
  return isValidAdminRole(role) ? role : "founder";
}

export function getRoleDefinition(role) {
  return ROLE_DEFINITIONS[normalizeAdminRole(role)];
}

export function getPermissionsForRole(role) {
  return getRoleDefinition(role).permissions;
}

export function hasAdminPermission(role, permission) {
  return getPermissionsForRole(role).includes(permission);
}

export function canExportAdminData(role) {
  return normalizeAdminRole(role) === "founder";
}

export function getAdminNavigationForRole(role) {
  return ADMIN_NAVIGATION.filter((item) => hasAdminPermission(role, item.permission));
}

export function getDefaultAdminHrefForRole(role) {
  return getAdminNavigationForRole(role)[0]?.href || "/admin/login";
}
