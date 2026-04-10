# Insurer API Onboarding Checklist (One Page)

Use this checklist before and during integration calls with insurer technical teams.

## 1) Commercial + Scope

- Confirm products in scope: `comprehensive`, `third-party`, motorcycle/commercial (if any).
- Confirm journey scope: `renewal only` or `new business + renewal`.
- Confirm countries/states and regulatory constraints.
- Confirm support SLA and production support contacts.

## 2) Environment Access

- Sandbox base URL provided.
- Production base URL provided.
- Client credentials issued (`client_id`, `client_secret`).
- IP allowlist requirements documented.
- TLS/mTLS and certificate requirements documented.

## 3) Auth + Security

- OAuth/token endpoint path confirmed.
- Token grant type confirmed (`client_credentials` or other).
- Token expiry and refresh strategy confirmed.
- Required headers documented (`Authorization`, `X-Correlation-Id`, `Idempotency-Key`).
- Error format and trace IDs documented.

## 4) Contract Mapping (Lajoo Standard)

- Vehicle lookup mapping confirmed:
  - input: `plate_number`, `owner_id_type`, `owner_id`, `usage_type`
  - output: `sample_id/vehicle_ref`, vehicle details, eligibility, NCD
- Quotes mapping confirmed:
  - async job create/status/result contract
  - quote card structure (premium, add-ons, underwriting decision)
- Reprice mapping confirmed:
  - selected add-ons
  - road-tax option handling and validation
- Proposal mapping confirmed:
  - quote selection
  - customer info validation
- Payment mapping confirmed:
  - payment intent create
  - payment confirm outcome
- Policy mapping confirmed:
  - issue request
  - response with policy number and document links

## 5) Business Rules

- Underwriting statuses handled: `ACCEPTED`, `REFERRED`, `DECLINED`.
- Printed road tax eligibility rules confirmed.
- Add-on eligibility rules confirmed (`windscreen`, `flood`, `ehailing`).
- NCD and loading behavior confirmed.

## 6) Operational Controls

- Rate-limit policy confirmed (`429`, retry windows).
- Timeout behavior confirmed (`503` or equivalent).
- Idempotency behavior confirmed for create endpoints.
- Duplicate transaction handling confirmed.

## 7) Testing Plan

- Positive flow test completed:
  - vehicle lookup -> quote -> reprice -> proposal -> payment -> policy issue
- Negative tests completed:
  - invalid token
  - missing required fields
  - underwriting decline/referral
  - payment decline/timeout
  - rate-limit scenario
- Contract runner executed:
  - `npm run test:insurer:contract`
  - `npm run test:insurer:contract:full`

## 8) Go-Live Readiness

- Production credentials received and stored securely.
- Monitoring and alerting in place for insurer calls.
- Runbook and rollback plan documented.
- Final sign-off from insurer technical owner.

## Notes Template (fill during insurer meeting)

- Insurer name:
- API version:
- Auth method:
- Base URLs (sandbox/prod):
- Mandatory headers:
- Special mapping notes:
- Known edge cases:
- SLA / escalation contacts:
