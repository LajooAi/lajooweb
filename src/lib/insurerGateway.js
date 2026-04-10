import { randomUUID } from 'node:crypto';

const DEFAULT_BASE_URL = 'http://localhost:4001/v1';
const DEFAULT_TIMEOUT_MS = 12000;

class InsurerGatewayError extends Error {
  constructor(message, { status = null, code = null, endpoint = '', details = null } = {}) {
    super(message);
    this.name = 'InsurerGatewayError';
    this.status = status;
    this.code = code;
    this.endpoint = endpoint;
    this.details = details;
  }
}

let tokenCache = {
  accessToken: null,
  expiresAtMs: 0,
};

function env(name, fallback = '') {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

function getBaseUrl() {
  return env('INSURER_API_BASE_URL', DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function getClientId() {
  return env('INSURER_API_CLIENT_ID', 'lajoo-client');
}

function getClientSecret() {
  return env('INSURER_API_CLIENT_SECRET', 'lajoo-secret');
}

function getTimeoutMs() {
  const parsed = Number(env('INSURER_API_TIMEOUT_MS', String(DEFAULT_TIMEOUT_MS)));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function buildUrl(endpoint, query = null) {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = new URL(`${getBaseUrl()}${normalizedEndpoint}`);

  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function makeCorrelationId(prefix = 'corr') {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function makeIdempotencyKey(prefix = 'idem') {
  return `${prefix}-${randomUUID()}`;
}

async function rawRequest(endpoint, { method = 'GET', headers = {}, body = null, query = null } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const response = await fetch(buildUrl(endpoint, query), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = safeJsonParse(text);

    if (!response.ok) {
      const firstError = payload?.errors?.[0];
      throw new InsurerGatewayError(
        firstError?.message || `HTTP ${response.status} from ${endpoint}`,
        {
          status: response.status,
          code: firstError?.code || null,
          endpoint,
          details: payload || text,
        }
      );
    }

    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new InsurerGatewayError(`Request timed out: ${endpoint}`, { endpoint });
    }
    if (error instanceof InsurerGatewayError) {
      throw error;
    }
    throw new InsurerGatewayError(error?.message || `Request failed: ${endpoint}`, { endpoint });
  } finally {
    clearTimeout(timeout);
  }
}

async function getToken({ forceRefresh = false } = {}) {
  const now = Date.now();

  if (!forceRefresh && tokenCache.accessToken && now < tokenCache.expiresAtMs - 30_000) {
    return tokenCache.accessToken;
  }

  const payload = await rawRequest('/oauth/token', {
    method: 'POST',
    body: {
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: 'client_credentials',
    },
  });

  const accessToken = payload?.data?.access_token;
  const expiresInSeconds = Number(payload?.data?.expires_in || 3600);

  if (!accessToken) {
    throw new InsurerGatewayError('Token response missing access_token', {
      endpoint: '/oauth/token',
      details: payload,
    });
  }

  tokenCache = {
    accessToken,
    expiresAtMs: now + (Number.isFinite(expiresInSeconds) ? expiresInSeconds * 1000 : 3_600_000),
  };

  return accessToken;
}

async function authorizedRequest(
  endpoint,
  { method = 'GET', body = null, query = null, correlationId = null, headers = {} } = {}
) {
  const requestHeaders = {
    ...headers,
    'X-Correlation-Id': correlationId || makeCorrelationId(),
  };

  const token = await getToken();

  try {
    return await rawRequest(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...requestHeaders,
      },
      body,
      query,
    });
  } catch (error) {
    // Retry once if token expired/invalid.
    const shouldRetryAuth = error instanceof InsurerGatewayError
      && error.status === 401
      && (error.code === 'UNAUTHORIZED' || error.code === null);

    if (!shouldRetryAuth) throw error;

    const freshToken = await getToken({ forceRefresh: true });
    return rawRequest(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${freshToken}`,
        ...requestHeaders,
      },
      body,
      query,
    });
  }
}

async function health() {
  return rawRequest('/health', { method: 'GET' });
}

async function vehicleLookup(payload, options = {}) {
  return authorizedRequest('/vehicle/lookup', {
    method: 'POST',
    body: payload,
    correlationId: options.correlationId,
  });
}

async function createQuoteJob(payload, options = {}) {
  return authorizedRequest('/quotes/jobs', {
    method: 'POST',
    body: payload,
    correlationId: options.correlationId,
    headers: {
      'Idempotency-Key': options.idempotencyKey || makeIdempotencyKey('quotejob'),
    },
  });
}

async function getQuoteJobStatus(jobId, options = {}) {
  return authorizedRequest(`/quotes/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    query: { stage: options.stage },
    correlationId: options.correlationId,
  });
}

async function getQuoteResult(jobId, options = {}) {
  return authorizedRequest(`/quotes/jobs/${encodeURIComponent(jobId)}/result`, {
    method: 'GET',
    query: { ready: options.ready },
    correlationId: options.correlationId,
  });
}

async function repriceQuote(quoteId, payload, options = {}) {
  return authorizedRequest(`/quotes/${encodeURIComponent(quoteId)}/reprice`, {
    method: 'POST',
    body: payload,
    correlationId: options.correlationId,
  });
}

async function createProposal(payload, options = {}) {
  return authorizedRequest('/proposals', {
    method: 'POST',
    body: payload,
    correlationId: options.correlationId,
    headers: {
      'Idempotency-Key': options.idempotencyKey || makeIdempotencyKey('proposal'),
    },
  });
}

async function submitProposal(proposalId, payload = {}, options = {}) {
  return authorizedRequest(`/proposals/${encodeURIComponent(proposalId)}/submit`, {
    method: 'POST',
    body: payload,
    correlationId: options.correlationId,
  });
}

async function createPaymentIntent(payload, options = {}) {
  return authorizedRequest('/payments/intents', {
    method: 'POST',
    body: payload,
    correlationId: options.correlationId,
    headers: {
      'Idempotency-Key': options.idempotencyKey || makeIdempotencyKey('payment'),
    },
  });
}

async function confirmPaymentIntent(paymentIntentId, payload = {}, options = {}) {
  return authorizedRequest(`/payments/intents/${encodeURIComponent(paymentIntentId)}/confirm`, {
    method: 'POST',
    body: payload,
    correlationId: options.correlationId,
  });
}

async function issuePolicy(payload, options = {}) {
  return authorizedRequest('/policies/issue', {
    method: 'POST',
    body: payload,
    correlationId: options.correlationId,
    headers: {
      'Idempotency-Key': options.idempotencyKey || makeIdempotencyKey('policy'),
    },
  });
}

export {
  InsurerGatewayError,
  makeCorrelationId,
  makeIdempotencyKey,
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
};

export default {
  InsurerGatewayError,
  makeCorrelationId,
  makeIdempotencyKey,
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
};
