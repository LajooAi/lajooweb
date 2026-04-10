import {
  health as gatewayHealth,
  getToken as gatewayGetToken,
  vehicleLookup as gatewayVehicleLookup,
  createQuoteJob as gatewayCreateQuoteJob,
  getQuoteJobStatus as gatewayGetQuoteJobStatus,
  getQuoteResult as gatewayGetQuoteResult,
  repriceQuote as gatewayRepriceQuote,
  createProposal as gatewayCreateProposal,
  submitProposal as gatewaySubmitProposal,
  createPaymentIntent as gatewayCreatePaymentIntent,
  confirmPaymentIntent as gatewayConfirmPaymentIntent,
  issuePolicy as gatewayIssuePolicy,
} from "../../insurerGateway.js";

const mockoonAggregatorAdapter = {
  key: "mockoon_aggregator",
  name: "Mockoon Aggregator (Sandbox)",
  mode: "aggregator",
  async health(options = {}) {
    return gatewayHealth(options);
  },
  async getToken(options = {}) {
    return gatewayGetToken(options);
  },
  async vehicleLookup(payload, options = {}) {
    return gatewayVehicleLookup(payload, options);
  },
  async createQuoteJob(payload, options = {}) {
    return gatewayCreateQuoteJob(payload, options);
  },
  async getQuoteJobStatus(jobId, options = {}) {
    return gatewayGetQuoteJobStatus(jobId, options);
  },
  async getQuoteResult(jobId, options = {}) {
    return gatewayGetQuoteResult(jobId, options);
  },
  async repriceQuote(quoteId, payload, options = {}) {
    return gatewayRepriceQuote(quoteId, payload, options);
  },
  async createProposal(payload, options = {}) {
    return gatewayCreateProposal(payload, options);
  },
  async submitProposal(proposalId, payload = {}, options = {}) {
    return gatewaySubmitProposal(proposalId, payload, options);
  },
  async createPaymentIntent(payload, options = {}) {
    return gatewayCreatePaymentIntent(payload, options);
  },
  async confirmPaymentIntent(paymentIntentId, payload = {}, options = {}) {
    return gatewayConfirmPaymentIntent(paymentIntentId, payload, options);
  },
  async issuePolicy(payload, options = {}) {
    return gatewayIssuePolicy(payload, options);
  },
};

export default mockoonAggregatorAdapter;
