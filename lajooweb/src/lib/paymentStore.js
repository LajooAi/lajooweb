/**
 * Payment Store - Server-side payment state management
 *
 * In production, replace this with Redis or a database.
 * This in-memory store is for development/demo purposes only.
 *
 * WARNING: Data is lost on server restart!
 */

// Global in-memory store for payments
// Using globalThis to persist across hot reloads in development
if (!globalThis.__paymentStore) {
  globalThis.__paymentStore = new Map();
}

const store = globalThis.__paymentStore;

/**
 * Payment statuses
 */
export const PAYMENT_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  CONFIRMED: "confirmed",
  FAILED: "failed",
  EXPIRED: "expired",
};

/**
 * Create a new pending payment
 */
export function createPayment(paymentData) {
  const payment = {
    ...paymentData,
    status: PAYMENT_STATUS.PENDING,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
  };

  store.set(paymentData.paymentId, payment);
  return payment;
}

/**
 * Get a payment by ID
 */
export function getPayment(paymentId) {
  const payment = store.get(paymentId);

  if (!payment) {
    return null;
  }

  // Check if expired
  if (payment.expiresAt && Date.now() > payment.expiresAt) {
    payment.status = PAYMENT_STATUS.EXPIRED;
    store.set(paymentId, payment);
  }

  return payment;
}

/**
 * Update payment status
 */
export function updatePaymentStatus(paymentId, status, additionalData = {}) {
  const payment = store.get(paymentId);

  if (!payment) {
    return null;
  }

  const updated = {
    ...payment,
    ...additionalData,
    status,
    updatedAt: Date.now(),
  };

  if (status === PAYMENT_STATUS.CONFIRMED) {
    updated.confirmedAt = Date.now();
  }

  store.set(paymentId, updated);
  return updated;
}

/**
 * Confirm a payment (called by webhook or demo confirmation)
 */
export function confirmPayment(paymentId, transactionRef = null) {
  return updatePaymentStatus(paymentId, PAYMENT_STATUS.CONFIRMED, {
    transactionRef,
  });
}

/**
 * Mark payment as failed
 */
export function failPayment(paymentId, reason = null) {
  return updatePaymentStatus(paymentId, PAYMENT_STATUS.FAILED, {
    failureReason: reason,
  });
}

/**
 * Get payments by session ID (for retrieving user's payment history)
 */
export function getPaymentsBySession(sessionId) {
  const payments = [];
  for (const [id, payment] of store) {
    if (payment.sessionId === sessionId) {
      payments.push(payment);
    }
  }
  return payments.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Clean up expired payments (call periodically)
 */
export function cleanupExpiredPayments() {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, payment] of store) {
    // Remove payments older than 24 hours
    if (now - payment.createdAt > 24 * 60 * 60 * 1000) {
      store.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}

export default {
  createPayment,
  getPayment,
  updatePaymentStatus,
  confirmPayment,
  failPayment,
  getPaymentsBySession,
  cleanupExpiredPayments,
  PAYMENT_STATUS,
};
