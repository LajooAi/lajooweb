import { createDirectInsurerAdapter } from "./directInsurerAdapterFactory.js";

const tokioMarineAdapter = createDirectInsurerAdapter({
  key: "tokio_marine_direct",
  name: "Tokio Marine Direct Adapter",
  envPrefix: "TOKIO_MARINE_API",
  defaults: {
    endpoints: {
      health: "/health",
      getToken: "/oauth/token",
      vehicleLookup: "/vehicle/lookup",
      createQuoteJob: "/quotes/jobs",
      getQuoteJobStatus: "/quotes/jobs/:jobId",
      getQuoteResult: "/quotes/jobs/:jobId/result",
      repriceQuote: "/quotes/:quoteId/reprice",
      createProposal: "/proposals",
      submitProposal: "/proposals/:proposalId/submit",
      createPaymentIntent: "/payments/intents",
      confirmPaymentIntent: "/payments/intents/:paymentIntentId/confirm",
      issuePolicy: "/policies/issue",
    },
  },
});

export default tokioMarineAdapter;
