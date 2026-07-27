import {
  getFallbackAdminAuditLogs,
  listPersistedAdminAuditLogs,
  recordPersistedAdminAuditEvent,
} from "./adminPersistence.js";

export async function listAdminAuditLogs(options = {}) {
  return listPersistedAdminAuditLogs(options);
}

export function listFallbackAdminAuditLogs(options = {}) {
  return getFallbackAdminAuditLogs(options);
}

export async function recordAdminAuditEvent(payload) {
  return recordPersistedAdminAuditEvent(payload);
}
