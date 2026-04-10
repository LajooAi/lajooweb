import { InsurerGatewayError } from "../../insurerGateway.js";

function notImplemented(providerKey, methodName) {
  throw new InsurerGatewayError(
    `Adapter "${providerKey}" does not implement "${methodName}" yet.`,
    {
      status: 501,
      code: "ADAPTER_NOT_IMPLEMENTED",
      endpoint: `${providerKey}.${methodName}`,
      details: {
        provider: providerKey,
        method: methodName,
      },
    }
  );
}

export function makeUnimplementedAdapter(providerKey, displayName) {
  return {
    key: providerKey,
    name: displayName,
    mode: "direct-insurer",
    async health() {
      return notImplemented(providerKey, "health");
    },
    async getToken() {
      return notImplemented(providerKey, "getToken");
    },
    async vehicleLookup() {
      return notImplemented(providerKey, "vehicleLookup");
    },
    async createQuoteJob() {
      return notImplemented(providerKey, "createQuoteJob");
    },
    async getQuoteJobStatus() {
      return notImplemented(providerKey, "getQuoteJobStatus");
    },
    async getQuoteResult() {
      return notImplemented(providerKey, "getQuoteResult");
    },
    async repriceQuote() {
      return notImplemented(providerKey, "repriceQuote");
    },
    async createProposal() {
      return notImplemented(providerKey, "createProposal");
    },
    async submitProposal() {
      return notImplemented(providerKey, "submitProposal");
    },
    async createPaymentIntent() {
      return notImplemented(providerKey, "createPaymentIntent");
    },
    async confirmPaymentIntent() {
      return notImplemented(providerKey, "confirmPaymentIntent");
    },
    async issuePolicy() {
      return notImplemented(providerKey, "issuePolicy");
    },
  };
}
