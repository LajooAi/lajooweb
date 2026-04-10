import { createDirectInsurerAdapter } from "./directInsurerAdapterFactory.js";

const allianzAdapter = createDirectInsurerAdapter({
  key: "allianz_direct",
  name: "Allianz Direct Adapter",
  envPrefix: "ALLIANZ_API",
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

export default allianzAdapter;
