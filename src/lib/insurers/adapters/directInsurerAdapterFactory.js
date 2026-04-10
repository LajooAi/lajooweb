import { randomUUID } from "node:crypto";
import { InsurerGatewayError } from "../../insurerGateway.js";

const DEFAULT_TIMEOUT_MS = 12000;

const ENDPOINT_KEYS = {
  health: "HEALTH",
  getToken: "TOKEN",
  vehicleLookup: "VEHICLE_LOOKUP",
  createQuoteJob: "QUOTES_JOBS_CREATE",
  getQuoteJobStatus: "QUOTES_JOBS_STATUS",
  getQuoteResult: "QUOTES_JOBS_RESULT",
  repriceQuote: "QUOTES_REPRICE",
  createProposal: "PROPOSALS_CREATE",
  submitProposal: "PROPOSALS_SUBMIT",
  createPaymentIntent: "PAYMENTS_INTENTS_CREATE",
  confirmPaymentIntent: "PAYMENTS_INTENTS_CONFIRM",
  issuePolicy: "POLICIES_ISSUE",
};

function getEnvValue(keys, fallback = "") {
  const keyList = Array.isArray(keys) ? keys : [keys];
  for (const key of keyList) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return fallback;
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function parseTimeout(value, fallback = DEFAULT_TIMEOUT_MS) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function buildUrl(baseUrl, endpoint, query = null) {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = new URL(`${baseUrl}${normalizedEndpoint}`);

  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function compileEndpointTemplate(endpointTemplate, params = {}) {
  if (!endpointTemplate) return endpointTemplate;
  return String(endpointTemplate).replace(/:([A-Za-z0-9_]+)/g, (_, token) => {
    const value = params?.[token];
    if (value === undefined || value === null) {
      throw new InsurerGatewayError(
        `Missing endpoint param "${token}" for template "${endpointTemplate}".`,
        {
          status: 400,
          code: "ADAPTER_ENDPOINT_PARAM_MISSING",
          endpoint: endpointTemplate,
          details: { token, params },
        }
      );
    }
    return encodeURIComponent(String(value));
  });
}

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function makeCorrelationId(prefix = "corr") {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function makeIdempotencyKey(prefix = "idem") {
  return `${prefix}-${randomUUID()}`;
}

function invokeHook(hooks, operation, phase, payload, context) {
  const fn = hooks?.[operation]?.[phase];
  if (typeof fn !== "function") return payload;
  return fn(payload, context);
}

function toTransportBody(payload, contentType) {
  const normalizedType = String(contentType || "application/json").toLowerCase();
  if (payload === null || payload === undefined) return undefined;

  if (normalizedType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) continue;
      params.set(key, String(value));
    }
    return params.toString();
  }

  return JSON.stringify(payload);
}

function toGatewayError(error, endpoint) {
  if (error instanceof InsurerGatewayError) return error;
  if (error?.name === "AbortError") {
    return new InsurerGatewayError(`Request timed out: ${endpoint}`, {
      endpoint,
      code: "DOWNSTREAM_TIMEOUT",
    });
  }
  return new InsurerGatewayError(error?.message || "Direct adapter request failed", {
    endpoint,
  });
}

function resolveConfig({ key, name, envPrefix, defaults }) {
  const prefix = String(envPrefix || "").trim().toUpperCase();
  const timeoutMs = parseTimeout(
    getEnvValue([`${prefix}_TIMEOUT_MS`], String(defaults.timeoutMs || DEFAULT_TIMEOUT_MS))
  );
  const baseUrl = normalizeBaseUrl(
    getEnvValue([`${prefix}_BASE_URL`], defaults.baseUrl || "")
  );
  const clientId = getEnvValue([`${prefix}_CLIENT_ID`], defaults.clientId || "");
  const clientSecret = getEnvValue([`${prefix}_CLIENT_SECRET`], defaults.clientSecret || "");
  const tokenScope = getEnvValue([`${prefix}_TOKEN_SCOPE`], defaults.tokenScope || "");
  const tokenGrantType = getEnvValue([`${prefix}_TOKEN_GRANT_TYPE`], defaults.tokenGrantType || "client_credentials");
  const tokenContentType = getEnvValue([`${prefix}_TOKEN_CONTENT_TYPE`], defaults.tokenContentType || "application/json");

  const endpoints = {};
  for (const [operation, envSuffix] of Object.entries(ENDPOINT_KEYS)) {
    endpoints[operation] = getEnvValue(
      [`${prefix}_ENDPOINT_${envSuffix}`],
      defaults?.endpoints?.[operation] || ""
    );
  }

  return {
    key,
    name,
    prefix,
    baseUrl,
    timeoutMs,
    clientId,
    clientSecret,
    tokenScope,
    tokenGrantType,
    tokenContentType,
    endpoints,
    hooks: defaults?.hooks || {},
  };
}

export function createDirectInsurerAdapter({
  key,
  name,
  envPrefix,
  defaults = {},
}) {
  if (!key || !name || !envPrefix) {
    throw new Error("createDirectInsurerAdapter requires key, name, and envPrefix.");
  }

  let tokenCache = {
    accessToken: null,
    expiresAtMs: 0,
  };

  async function requestRaw(cfg, endpoint, {
    method = "GET",
    headers = {},
    body = null,
    query = null,
    contentType = "application/json",
  } = {}) {
    if (!cfg.baseUrl) {
      throw new InsurerGatewayError(
        `Adapter "${cfg.key}" missing base URL (${cfg.prefix}_BASE_URL).`,
        {
          status: 500,
          code: "ADAPTER_BASE_URL_MISSING",
          endpoint,
          details: {
            adapter: cfg.key,
            env: `${cfg.prefix}_BASE_URL`,
          },
        }
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
      const response = await fetch(buildUrl(cfg.baseUrl, endpoint, query), {
        method,
        headers: {
          "Content-Type": contentType,
          ...headers,
        },
        body: toTransportBody(body, contentType),
        signal: controller.signal,
      });

      const text = await response.text();
      const parsed = safeJsonParse(text);

      if (!response.ok) {
        const firstError = parsed?.errors?.[0];
        throw new InsurerGatewayError(
          firstError?.message || `HTTP ${response.status} from ${cfg.key}:${endpoint}`,
          {
            status: response.status,
            code: firstError?.code || null,
            endpoint,
            details: parsed || text,
          }
        );
      }

      return parsed;
    } catch (error) {
      throw toGatewayError(error, endpoint);
    } finally {
      clearTimeout(timer);
    }
  }

  function endpointFor(cfg, operation) {
    const endpoint = cfg?.endpoints?.[operation];
    if (endpoint) return endpoint;

    const envSuffix = ENDPOINT_KEYS[operation];
    throw new InsurerGatewayError(
      `Adapter "${cfg.key}" missing endpoint for "${operation}" (${cfg.prefix}_ENDPOINT_${envSuffix}).`,
      {
        status: 500,
        code: "ADAPTER_ENDPOINT_MISSING",
        endpoint: operation,
        details: {
          adapter: cfg.key,
          operation,
          env: `${cfg.prefix}_ENDPOINT_${envSuffix}`,
        },
      }
    );
  }

  async function getTokenInternal(cfg, options = {}) {
    const now = Date.now();
    const forceRefresh = !!options.forceRefresh;

    if (!forceRefresh && tokenCache.accessToken && now < tokenCache.expiresAtMs - 30_000) {
      return tokenCache.accessToken;
    }

    const endpoint = endpointFor(cfg, "getToken");
    const tokenRequestBody = invokeHook(
      cfg.hooks,
      "getToken",
      "request",
      {
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: cfg.tokenGrantType,
        ...(cfg.tokenScope ? { scope: cfg.tokenScope } : {}),
      },
      { adapter: cfg, options }
    );

    const response = await requestRaw(cfg, endpoint, {
      method: "POST",
      body: tokenRequestBody,
      contentType: cfg.tokenContentType,
    });

    const tokenResponse = invokeHook(cfg.hooks, "getToken", "response", response, {
      adapter: cfg,
      options,
    });

    const accessToken = tokenResponse?.data?.access_token || tokenResponse?.access_token;
    const expiresInSeconds = Number(
      tokenResponse?.data?.expires_in
      || tokenResponse?.expires_in
      || 3600
    );

    if (!accessToken) {
      throw new InsurerGatewayError(
        `Adapter "${cfg.key}" token response missing access_token.`,
        {
          status: 500,
          code: "ADAPTER_TOKEN_MISSING",
          endpoint,
          details: tokenResponse,
        }
      );
    }

    tokenCache = {
      accessToken,
      expiresAtMs: now + (Number.isFinite(expiresInSeconds) ? expiresInSeconds * 1000 : 3_600_000),
    };

    return accessToken;
  }

  async function authorizedRequest(
    operation,
    {
      method = "GET",
      params = null,
      body = null,
      query = null,
      headers = {},
      correlationId = null,
      idempotencyKey = null,
      contentType = "application/json",
      options = {},
    } = {}
  ) {
    const cfg = resolveConfig({ key, name, envPrefix, defaults });
    const endpointTemplate = endpointFor(cfg, operation);
    const endpoint = compileEndpointTemplate(endpointTemplate, params || {});

    const payload = invokeHook(cfg.hooks, operation, "request", body, {
      adapter: cfg,
      operation,
      params,
      query,
      options,
    });

    const baseHeaders = {
      ...headers,
      "X-Correlation-Id": correlationId || makeCorrelationId(),
    };
    if (idempotencyKey) {
      baseHeaders["Idempotency-Key"] = idempotencyKey;
    }

    const token = await getTokenInternal(cfg, { forceRefresh: false });

    try {
      const response = await requestRaw(cfg, endpoint, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...baseHeaders,
        },
        body: payload,
        query,
        contentType,
      });
      return invokeHook(cfg.hooks, operation, "response", response, {
        adapter: cfg,
        operation,
        params,
        query,
        options,
      });
    } catch (error) {
      const shouldRetryAuth =
        error instanceof InsurerGatewayError
        && error.status === 401
        && (error.code === "UNAUTHORIZED" || error.code === null);

      if (!shouldRetryAuth) throw error;

      const refreshedToken = await getTokenInternal(cfg, { forceRefresh: true });
      const retryResponse = await requestRaw(cfg, endpoint, {
        method,
        headers: {
          Authorization: `Bearer ${refreshedToken}`,
          ...baseHeaders,
        },
        body: payload,
        query,
        contentType,
      });
      return invokeHook(cfg.hooks, operation, "response", retryResponse, {
        adapter: cfg,
        operation,
        params,
        query,
        options,
        retried: true,
      });
    }
  }

  return {
    key,
    name,
    mode: "direct-insurer",

    getConfigSnapshot() {
      return resolveConfig({ key, name, envPrefix, defaults });
    },

    async health(options = {}) {
      const cfg = resolveConfig({ key, name, envPrefix, defaults });
      const endpoint = endpointFor(cfg, "health");
      return requestRaw(cfg, endpoint, {
        method: "GET",
      });
    },

    async getToken(options = {}) {
      const cfg = resolveConfig({ key, name, envPrefix, defaults });
      return getTokenInternal(cfg, options);
    },

    async vehicleLookup(payload, options = {}) {
      return authorizedRequest("vehicleLookup", {
        method: "POST",
        body: payload,
        correlationId: options.correlationId,
        options,
      });
    },

    async createQuoteJob(payload, options = {}) {
      return authorizedRequest("createQuoteJob", {
        method: "POST",
        body: payload,
        correlationId: options.correlationId,
        idempotencyKey: options.idempotencyKey || makeIdempotencyKey("quotejob"),
        options,
      });
    },

    async getQuoteJobStatus(jobId, options = {}) {
      return authorizedRequest("getQuoteJobStatus", {
        method: "GET",
        params: { jobId },
        query: { stage: options.stage },
        correlationId: options.correlationId,
        options,
      });
    },

    async getQuoteResult(jobId, options = {}) {
      return authorizedRequest("getQuoteResult", {
        method: "GET",
        params: { jobId },
        query: { ready: options.ready },
        correlationId: options.correlationId,
        options,
      });
    },

    async repriceQuote(quoteId, payload, options = {}) {
      return authorizedRequest("repriceQuote", {
        method: "POST",
        params: { quoteId },
        body: payload,
        correlationId: options.correlationId,
        options,
      });
    },

    async createProposal(payload, options = {}) {
      return authorizedRequest("createProposal", {
        method: "POST",
        body: payload,
        correlationId: options.correlationId,
        idempotencyKey: options.idempotencyKey || makeIdempotencyKey("proposal"),
        options,
      });
    },

    async submitProposal(proposalId, payload = {}, options = {}) {
      return authorizedRequest("submitProposal", {
        method: "POST",
        params: { proposalId },
        body: payload,
        correlationId: options.correlationId,
        options,
      });
    },

    async createPaymentIntent(payload, options = {}) {
      return authorizedRequest("createPaymentIntent", {
        method: "POST",
        body: payload,
        correlationId: options.correlationId,
        idempotencyKey: options.idempotencyKey || makeIdempotencyKey("payment"),
        options,
      });
    },

    async confirmPaymentIntent(paymentIntentId, payload = {}, options = {}) {
      return authorizedRequest("confirmPaymentIntent", {
        method: "POST",
        params: { paymentIntentId },
        body: payload,
        correlationId: options.correlationId,
        options,
      });
    },

    async issuePolicy(payload, options = {}) {
      return authorizedRequest("issuePolicy", {
        method: "POST",
        body: payload,
        correlationId: options.correlationId,
        idempotencyKey: options.idempotencyKey || makeIdempotencyKey("policy"),
        options,
      });
    },
  };
}

export default createDirectInsurerAdapter;
