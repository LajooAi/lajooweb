import { InsurerGatewayError } from "../insurerGateway.js";
import { getInsurerAdapter, resolveAdapterKey } from "./registry.js";

function adapterFor(options = {}) {
  const key = resolveAdapterKey(options?.provider || null);
  return getInsurerAdapter(key);
}

export function getActiveInsurerPlatformInfo(options = {}) {
  const adapter = adapterFor(options);
  return {
    key: adapter.key,
    name: adapter.name,
    mode: adapter.mode,
  };
}

export async function health(options = {}) {
  return adapterFor(options).health(options);
}

export async function getToken(options = {}) {
  return adapterFor(options).getToken(options);
}

export async function vehicleLookup(payload, options = {}) {
  return adapterFor(options).vehicleLookup(payload, options);
}

export async function createQuoteJob(payload, options = {}) {
  return adapterFor(options).createQuoteJob(payload, options);
}

export async function getQuoteJobStatus(jobId, options = {}) {
  return adapterFor(options).getQuoteJobStatus(jobId, options);
}

export async function getQuoteResult(jobId, options = {}) {
  return adapterFor(options).getQuoteResult(jobId, options);
}

export async function repriceQuote(quoteId, payload, options = {}) {
  return adapterFor(options).repriceQuote(quoteId, payload, options);
}

export async function createProposal(payload, options = {}) {
  return adapterFor(options).createProposal(payload, options);
}

export async function submitProposal(proposalId, payload = {}, options = {}) {
  return adapterFor(options).submitProposal(proposalId, payload, options);
}

export async function createPaymentIntent(payload, options = {}) {
  return adapterFor(options).createPaymentIntent(payload, options);
}

export async function confirmPaymentIntent(paymentIntentId, payload = {}, options = {}) {
  return adapterFor(options).confirmPaymentIntent(paymentIntentId, payload, options);
}

export async function issuePolicy(payload, options = {}) {
  return adapterFor(options).issuePolicy(payload, options);
}

export { InsurerGatewayError };

export default {
  getActiveInsurerPlatformInfo,
  health,
  getToken,
  vehicleLookup,
  createQuoteJob,
  getQuoteJobStatus,
  getQuoteResult,
  repriceQuote,
  createProposal,
  submitProposal,
  createPaymentIntent,
  confirmPaymentIntent,
  issuePolicy,
  InsurerGatewayError,
};
