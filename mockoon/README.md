# Lajoo Mockoon API Pack

This folder contains a production-style Mockoon environment for insurer testing (Takaful, Etiqa, Allianz) with 10 sample vehicles.

## Files

- `generate-lajoo-mockoon-env.mjs`: generator script
- `lajoo-insurer-sandbox-import.json`: importable Mockoon environment (use this file)
- `lajoo-insurer-sandbox.json`: your working copy once opened/saved by Mockoon

## 1) Regenerate the environment (optional)

```bash
node mockoon/generate-lajoo-mockoon-env.mjs
```

## 2) Import into Mockoon

1. Open Mockoon Desktop.
2. Click `Import`.
3. Choose `mockoon/lajoo-insurer-sandbox-import.json`.
4. Start the environment on port `4001`.

## 3) What is included

- Auth
  - `POST /v1/oauth/token`
  - `GET /v1/health`
- Reference
  - `GET /v1/reference/insurers`
  - `GET /v1/reference/addons`
  - `GET /v1/reference/roadtax-rules`
  - `GET /v1/reference/error-codes`
- Vehicle
  - `POST /v1/vehicle/lookup` (10 sample cars + validation + not found)
- Quotes
  - `POST /v1/quotes/jobs`
  - `GET /v1/quotes/jobs/:jobId`
  - `GET /v1/quotes/jobs/:jobId/result`
  - `POST /v1/quotes/:quoteId/reprice`
- Proposal
  - `POST /v1/proposals`
  - `POST /v1/proposals/:proposalId/submit`
- Payment
  - `POST /v1/payments/intents`
  - `POST /v1/payments/intents/:paymentIntentId/confirm`
- Policy
  - `POST /v1/policies/issue`
- Simulation
  - `GET /v1/simulate/rate-limit`
  - `GET /v1/simulate/downstream-timeout`
  - `GET /v1/simulate/internal-error`
  - `GET /v1/simulate/unauthorized`

## 4) Quick test flow (curl)

### 4.1 Get token

```bash
curl -s -X POST http://localhost:4001/v1/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"client_id":"lajoo-client","client_secret":"lajoo-secret","grant_type":"client_credentials"}'
```

### 4.2 Lookup vehicle (CAR01)

```bash
curl -s -X POST http://localhost:4001/v1/vehicle/lookup \
  -H 'Authorization: Bearer mock-access-token' \
  -H 'Content-Type: application/json' \
  -H 'X-Correlation-Id: corr-local-001' \
  -d '{"plate_number":"JRT9289","owner_id_type":"nric","owner_id":"951018145405","usage_type":"private"}'
```

### 4.3 Create quote job

```bash
curl -s -X POST http://localhost:4001/v1/quotes/jobs \
  -H 'Authorization: Bearer mock-access-token' \
  -H 'Idempotency-Key: idem-001' \
  -H 'Content-Type: application/json' \
  -d '{"sample_id":"CAR01","vehicle_ref_id":"veh-car01","coverage_type":"comprehensive","effective_date":"2026-04-05"}'
```

### 4.4 Poll job and fetch result

```bash
curl -s -X GET 'http://localhost:4001/v1/quotes/jobs/JOB-CAR01-0001?stage=done' \
  -H 'Authorization: Bearer mock-access-token'

curl -s -X GET 'http://localhost:4001/v1/quotes/jobs/JOB-CAR01-0001/result' \
  -H 'Authorization: Bearer mock-access-token'
```

### 4.5 Reprice selected quote

```bash
curl -s -X POST http://localhost:4001/v1/quotes/QT-CAR01-TAK-001/reprice \
  -H 'Authorization: Bearer mock-access-token' \
  -H 'Content-Type: application/json' \
  -d '{"owner_id_type":"nric","selected_addons":["windscreen","flood"],"roadtax_option":"digital_12m"}'
```

## 5) Sample IDs

- `CAR01` normal
- `CAR02` normal
- `CAR03` flood-prone
- `CAR04` high-cc
- `CAR05` claims-loading
- `CAR06` company vehicle (printed road tax eligible)
- `CAR07` foreign ID (printed road tax eligible)
- `CAR08` e-hailing usage
- `CAR09` underwriting referral
- `CAR10` underwriting decline

## 6) Important behavior toggles

- Job status complete: add query `?stage=done` on `/quotes/jobs/:jobId`
- Force result not-ready: add query `?ready=0` on `/quotes/jobs/:jobId/result`
- Force payment decline: send `{ "simulate": "decline" }` to payment confirm
- Force payment timeout: send `{ "simulate": "timeout" }` to payment confirm

## 7) Run adapter contract test from LAJOO app

From `lajooweb/` terminal:

```bash
# show adapters
npm run -s test:insurer:contract -- --list-adapters

# quote-path contract
npm run -s test:insurer:contract -- --adapter mockoon_aggregator --mode quote

# full-path contract (proposal/payment/policy)
npm run -s test:insurer:contract:full -- --adapter mockoon_aggregator

# batch run for all 10 sample cars
npm run -s test:insurer:contract:batch -- --adapter mockoon_aggregator
```
