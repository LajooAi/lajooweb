import {
  withAdminCronReminderLog,
  withAdminJobQueueLog,
} from "./adminTechLogs.js";

export function runAdminLoggedJob(jobConfig, handler) {
  return withAdminJobQueueLog({
    queueName: "admin-foundation",
    source: "system",
    ...jobConfig,
  }, handler);
}

export function runAdminLoggedCron(cronConfig, handler) {
  return withAdminCronReminderLog({
    cronName: "admin-foundation",
    source: "system",
    ...cronConfig,
  }, handler);
}
