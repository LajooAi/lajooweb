import {
  runAdminLoggedCron,
  runAdminLoggedJob,
} from "./adminOperationalJobs.js";

export function getAdminOperationalJobReadiness() {
  return {
    liveReminderCron: false,
    liveReconciliationJob: false,
    liveDigestScheduler: false,
    status: "placeholder",
    note: "No production reminder, reconciliation, queue, digest, or cron scheduler is registered in this codebase yet. Phase 11 adds CRON_SECRET-protected admin cron routes while keeping reminder/reconciliation placeholders explicit.",
    placeholders: [
      "renewal-reminders",
      "provider-reconciliation",
      "mfa-recovery-sla-reminders",
      "admin-notification-digests",
    ],
  };
}

export async function previewLoggedRenewalReminderPlaceholder(handler = async () => ({ affectedCount: 0, wired: false })) {
  return runAdminLoggedCron({
    cronName: "placeholder-renewal-reminders",
    source: "placeholder",
    metadata: { liveAutomation: false },
  }, handler);
}

export async function previewLoggedReconciliationJobPlaceholder(handler = async () => ({ processedCount: 0, wired: false })) {
  return runAdminLoggedJob({
    queueName: "placeholder-reconciliation",
    jobName: "provider-reconciliation-preview",
    source: "placeholder",
    metadata: { liveAutomation: false },
  }, handler);
}

export async function previewLoggedMfaRecoverySlaReminderPlaceholder(handler = async () => ({ matchedCount: 0, sentCount: 0, wired: false })) {
  return runAdminLoggedCron({
    cronName: "placeholder-mfa-recovery-sla-reminders",
    source: "placeholder",
    metadata: { liveAutomation: false, phase: "admin_phase10" },
  }, handler);
}
