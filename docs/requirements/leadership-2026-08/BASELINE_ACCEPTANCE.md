# Baseline Acceptance Statement

**Date:** 2026-08-21
**Branch:** `requirements/traceability-evidence-correction`

---

## (a) What is approved as governance

The following governance structure is approved:

- **Status vocabulary:** `verified-implemented`, `partial`, `demo-only`, `mock-only`, `development-only`, `contract-stub`, `missing`, `conflict`, `decision-needed`, `unknown`
- **Evidence standard:** `verified-implemented` requires a non-mock module name AND an acceptance/integration test that actually exercises it against a real database/service
- **Change protocol:** new requirements require LEAD-### source reference + owner approval
- **Decision linkage:** DECISION_LOG.md items must be approved before coding begins
- **Versioning:** approved revisions receive version tags; unapproved drafts are unversioned
- **Approval authority:** Project Owner (acting for leadership)

## Cross-file consistency rule

`TRACEABILITY_MATRIX.md` is the **sole source of truth** for implementation status, evidence quality, and verification date. `REQUIREMENTS_BASELINE_DRAFT.md` is the source of requirement wording and owner approval status. When a row is updated in the matrix, the corresponding baseline entry must be synchronized. The following seven statuses are synchronized from the matrix to the baseline:

| MF-REQ | Matrix Status | Matrix Limitation |
|--------|--------------|-------------------|
| MF-REQ-022 | mock-only | MockEcomAdapter.resolve is in-memory only; no real 1ecom verification |
| MF-REQ-042 | partial | Invoice CRUD works; Kaspi webhook response not validated against real API |
| MF-REQ-043 | partial | Webhook handler tested; no real Kaspi integration verified |
| MF-REQ-060 | development-only | Uses FileKmsAdapter (dev key on disk); not production KMS |
| MF-REQ-061 | development-only | Uses FileKmsAdapter (local key); OpenBaoTransitKmsAdapter not production-validated |
| MF-REQ-121 | partial | Strips connection strings; does not cover all error paths |
| MF-REQ-132 | partial | Liveness ok; readiness checks adapters/KMS/storage but depends on mock adapters in test |

**No row may be upgraded to `verified-implemented` in the baseline without a matching matrix update.**

## (b) What remains draft

The entire `REQUIREMENTS_BASELINE_DRAFT.md` remains **DRAFT — NOT APPROVED FOR IMPLEMENTATION**. Specifically:

- All requirement IDs (`MF-REQ-###`) are candidate entries pending owner sign-off
- The traceability matrix status classifications are based on code inspection, not leadership approval
- No requirement may be used to drive implementation without explicit owner approval
- The baseline becomes authoritative only after the six decision-log items are resolved and every `verified-implemented` row has code/test evidence matching the approved quality boundary

## (c) Six leadership decisions still awaiting owner approval

| ID | Decision | Current State | Required for |
|----|----------|---------------|--------------|
| D-001 | Tariff pricing (0.84 vs 8 KZT/code) | Conflict — seed uses 800 t. (8 KZT); management material shows 0.84 | W0-03+ billing implementation |
| D-002 | Pilot MPT write authority | Decision-needed — no real Stage integration yet | W0-03c MPT contract verification |
| D-003 | Data ownership (MarkFlow vs client) | Decision-needed | W1+ production deployment |
| D-004 | Code Vault cryptotext retention | Decision-needed | W0-03a KMS adapter implementation |
| D-005 | Document combinations (invoice/customs) | Unknown — no explicit rules in leadership docs | W0-03+ document workflows |
| D-006 | Role matrix (full permission map) | Decision-needed — base roles defined; no full permission matrix | W0-01+ RBAC completion |

**These six decisions must be approved before any W0-03+ coding that depends on them.**

## (d) Requirements completion policy

No product code may claim requirements completion without:

1. An approved traceability row in `TRACEABILITY_MATRIX.md` (not draft)
2. A non-mock module name (or explicit `mock-only` / `demo-only` classification)
3. An acceptance/integration test that actually exercises the module against a real database/service
4. Owner sign-off on the row's status classification

**Rows marked `mock-only` or `development-only` are explicitly NOT approved as production requirement fulfillment.** They represent current state for development purposes only.
