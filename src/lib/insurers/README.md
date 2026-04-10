# Insurer Adapter Layer

This folder contains the insurer integration architecture used by LAJOO.

## Why this exists

LAJOO should expose one stable contract to the chat/UI while supporting many insurer partners behind the scenes.

- One LAJOO API for frontend
- Many insurer adapters behind it
- Adapter selected by environment variable

## Current adapters

- `mockoon_aggregator` (active default)
- `allianz_direct` (direct template ready)
- `etiqa_direct` (direct template ready)
- `takaful_direct` (direct template ready)

## Environment switch

Set one of:

```bash
INSURER_PLATFORM_ADAPTER=mockoon_aggregator
# or
INSURER_API_PROVIDER=mockoon
```

If no value is set, it falls back to `mockoon_aggregator`.

## Direct Adapter Template

Direct adapters are generated via:

- `adapters/directInsurerAdapterFactory.js`

Each direct adapter has full method coverage:

- `health`
- `getToken`
- `vehicleLookup`
- `createQuoteJob`
- `getQuoteJobStatus`
- `getQuoteResult`
- `repriceQuote`
- `createProposal`
- `submitProposal`
- `createPaymentIntent`
- `confirmPaymentIntent`
- `issuePolicy`

## Env Contract (example: Allianz)

Required minimum:

```bash
INSURER_PLATFORM_ADAPTER=allianz_direct
ALLIANZ_API_BASE_URL=https://sandbox.allianz.example/v1
ALLIANZ_API_CLIENT_ID=xxx
ALLIANZ_API_CLIENT_SECRET=yyy
```

Optional:

```bash
ALLIANZ_API_TIMEOUT_MS=12000
ALLIANZ_API_TOKEN_SCOPE=vehicle quotes proposals payments policies
ALLIANZ_API_TOKEN_GRANT_TYPE=client_credentials
ALLIANZ_API_TOKEN_CONTENT_TYPE=application/json
```

Endpoint overrides (if insurer paths differ from normalized defaults):

```bash
ALLIANZ_API_ENDPOINT_HEALTH=/health
ALLIANZ_API_ENDPOINT_TOKEN=/oauth/token
ALLIANZ_API_ENDPOINT_VEHICLE_LOOKUP=/vehicle/lookup
ALLIANZ_API_ENDPOINT_QUOTES_JOBS_CREATE=/quotes/jobs
ALLIANZ_API_ENDPOINT_QUOTES_JOBS_STATUS=/quotes/jobs/:jobId
ALLIANZ_API_ENDPOINT_QUOTES_JOBS_RESULT=/quotes/jobs/:jobId/result
ALLIANZ_API_ENDPOINT_QUOTES_REPRICE=/quotes/:quoteId/reprice
ALLIANZ_API_ENDPOINT_PROPOSALS_CREATE=/proposals
ALLIANZ_API_ENDPOINT_PROPOSALS_SUBMIT=/proposals/:proposalId/submit
ALLIANZ_API_ENDPOINT_PAYMENTS_INTENTS_CREATE=/payments/intents
ALLIANZ_API_ENDPOINT_PAYMENTS_INTENTS_CONFIRM=/payments/intents/:paymentIntentId/confirm
ALLIANZ_API_ENDPOINT_POLICIES_ISSUE=/policies/issue
```

Use the same pattern for `ETIQA_API_*` and `TAKAFUL_API_*`.

## Extension plan for new insurers

1. Create a new adapter file in `adapters/`.
2. Build it via `createDirectInsurerAdapter({ key, name, envPrefix, defaults })`.
3. Register the adapter in `registry.js`.
4. Add adapter-level mapping hooks if insurer payload differs.
5. Add tests for success, decline, timeout, and mapping edge cases.

## Contract runner (adapter verification)

Use CLI contract checks before integration or demo sessions:

```bash
# List adapters
npm run -s test:insurer:contract -- --list-adapters

# Quote-path contract (health -> token -> lookup -> quote -> reprice)
npm run -s test:insurer:contract -- --adapter mockoon_aggregator --mode quote

# Full-path contract (includes proposal/payment/policy)
npm run -s test:insurer:contract:full -- --adapter mockoon_aggregator

# Batch quote-path contract for all 10 Mockoon sample cars
npm run -s test:insurer:contract:batch -- --adapter mockoon_aggregator
```

Optional sample override:

```bash
npm run -s test:insurer:contract -- \
  --adapter mockoon_aggregator \
  --plate WXY1234 \
  --owner-id-type nric \
  --owner-id 900101105544
```

## Meeting checklist

Use this before meeting insurer API teams:

- `docs/insurer-onboarding-checklist.md`
