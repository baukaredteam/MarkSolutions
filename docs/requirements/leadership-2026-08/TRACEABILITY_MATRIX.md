# Traceability Matrix (Corrected)

**Date:** 2026-08-21
**Status:** DRAFT — corrected per governance review

---

## Status vocabulary (controlled)

| Value | Definition |
|-------|-----------|
| `verified-implemented` | Non-mock module + acceptance/integration test exercises it |
| `partial` | Some paths work; others missing or incomplete |
| `demo-only` | Works in demo/local context only; no production path |
| `mock-only` | Only mock adapter; no real API/service integration |
| `contract-stub` | Interface defined; implementation is placeholder |
| `missing` | No implementation exists |
| `conflict` | Conflicting requirements or decisions unresolved |
| `decision-needed` | Awaits owner approval before coding |
| `unknown` | Insufficient evidence to classify |

---

| Req ID | Source | Module | Status | Limitation | Verification Date | Evidence Quality | Target WP |
|--------|--------|--------|--------|------------|------------------|-----------------|-----------|
| MF-REQ-001 | LEAD-001 | AuthService, guards | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-002 | LEAD-001 | TenantGuard, RolesGuard | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-003 | LEAD-001 | MFA config stub | partial | No TOTP/SMS integration; config flag only | 2026-08-21 | config only | W0-01+ |
| MF-REQ-004 | LEAD-001 | JwtModule, JWT_SECRET | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-010 | LEAD-001/005 | ModerationService | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-011 | LEAD-001 | ProductCard (44 attrs) | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-012 | LEAD-005 | GtinResolver, gs1Mod10Check | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-013 | LEAD-001/005 | tnvedHint, heuristicStrengthensFix | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-014 | LEAD-001 | fuzzyKeyOf, checkDuplicate | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-015 | LEAD-001 | audit field on ProductCard | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-016 | LEAD-001 | @@index + partial unique | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-020 | LEAD-001 | MockEcomAdapter.verify | mock-only | Mock adapter only; no real 1ecom API | 2026-08-21 | mock adapter | W0-01 |
| MF-REQ-021 | LEAD-001/005 | MockEcomAdapter.listProducts | mock-only | Mock adapter only; no real 1ecom API | 2026-08-21 | mock adapter | W0-01 |
| MF-REQ-022 | LEAD-001 | MockEcomAdapter.resolve | mock-only | Mock adapter only; resolve() is in-memory; no real 1ecom verification | 2026-08-21 | mock adapter | W0-01 |
| MF-REQ-040 | LEAD-014 | BillingService, LedgerEntry | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-041 | LEAD-014 | reserveOn, release, settle | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-042 | LEAD-014 | InvoiceService | partial | Invoice CRUD works; Kaspi webhook response not validated against real API | 2026-08-21 | integration test (no API) | W0-01+ |
| MF-REQ-043 | LEAD-014 | kaspiWebhook | partial | Webhook handler tested; no real Kaspi integration verified | 2026-08-21 | integration test (no API) | W0-01+ |
| MF-REQ-044 | ROADMAP | activeTariff | decision-needed | — | — | — | W0-03+ |
| MF-REQ-045 | LEAD-014 | getBalance, ledger invariant | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-050 | LEAD-004 | OrderService.create, state machine | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-051 | W0-02R | order_number_seq (PG sequence) | verified-implemented | — | 2026-08-21 | integration test | W0-02R |
| MF-REQ-052 | LEAD-004 | idempotencyKey unique | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-053 | LEAD-004 | businessPlaceId validation | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-060 | LEAD-004 | CodeVault, VaultService.seal | development-only | Uses FileKmsAdapter (dev key on disk); not production KMS | 2026-08-21 | dev-only test | W0-03a |
| MF-REQ-061 | LEAD-004 | kms.encrypt, AES-256-GCM | development-only | Uses FileKmsAdapter (local key); OpenBaoTransitKmsAdapter is available but not production-validated | 2026-08-21 | dev-only test | W0-03a |
| MF-REQ-062 | LEAD-006 | labelKey, PNG render | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-063 | LEAD-004 | CodeEvent status machine | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-064 | LEAD-004 | CodeEvent append-only | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-070 | LEAD-006 | LabelService.renderPng | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-071 | LEAD-006 | LabelService.print | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-072 | LEAD-006 | LabelService.reprint | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-080 | LEAD-009 | DocumentService | partial | CRUD works; async reconciliation not implemented | 2026-08-21 | integration test (no async) | W0-02 |
| MF-REQ-081 | LEAD-009 | WithdrawalDocument | partial | CRUD works; async reconciliation not implemented | 2026-08-21 | integration test (no async) | W0-02 |
| MF-REQ-082 | LEAD-009 | MptDocument status | partial | Status machine works; no async polling | 2026-08-21 | integration test (no async) | W0-02 |
| MF-REQ-083 | LEAD-009 | — | decision-needed | — | — | — | W0-03+ |
| MF-REQ-090 | LEAD-012 | — | missing | — | — | — | W0-03 |
| MF-REQ-091 | LEAD-007 | — | missing | — | — | — | W0-03 |
| MF-REQ-092 | LEAD-012 | — | missing | — | — | — | W0-03 |
| MF-REQ-093 | LEAD-012 | — | missing | — | — | — | W0-03 |
| MF-REF-100 | ROADMAP | MockMptAdapter | mock-only | Mock adapter only; no real Stage | 2026-08-21 | mock adapter | W0-01 |
| MF-REF-101 | ROADMAP | MockMptAdapter | mock-only | Mock adapter only; no real Stage | 2026-08-21 | mock adapter | W0-01 |
| MF-REF-102 | ROADMAP | MockMptAdapter | mock-only | Mock adapter only; no real Stage | 2026-08-21 | mock adapter | W0-01 |
| MF-REF-103 | ROADMAP | MockMptAdapter | mock-only | Mock adapter only; no real Stage | 2026-08-21 | mock adapter | W0-01 |
| MF-REF-104 | ROADMAP | MockMptAdapter | mock-only | Mock adapter only; no real Stage | 2026-08-21 | mock adapter | W0-01 |
| MF-REF-105 | ROADMAP §5 | — | decision-needed | — | — | — | W0-04+ |
| MF-REQ-110 | ROADMAP | — | missing | — | — | — | W0-04 |
| MF-REQ-111 | LEAD-013 | — | missing | — | — | — | W0-04 |
| MF-REQ-112 | LEAD-013 | — | missing | — | — | — | W0-04 |
| MF-REQ-120 | AGENTS.md | secret-scan, config-validation | verified-implemented | — | 2026-08-21 | CI pass | W0-01 |
| MF-REQ-121 | AGENTS.md | sanitizeHealthError | partial | Strips connection strings; does not cover all error paths | 2026-08-21 | health endpoint only | W0-05 |
| MF-REQ-122 | AGENTS.md | AllExceptionsFilter | verified-implemented | — | 2026-08-21 | integration test | W0-01 |
| MF-REQ-123 | AGENTS.md | validateProductionConfig | verified-implemented | — | 2026-08-21 | bootstrap test | W0-01 |
| MF-REQ-130 | ROADMAP | — | missing | — | — | — | W0-05 |
| MF-REQ-131 | ROADMAP | sanitizeHealthError | partial | Health endpoint only; not structured logging | 2026-08-21 | health endpoint only | W0-05 |
| MF-REQ-132 | ROADMAP | /health, /health/ready | partial | Liveness ok; readiness checks adapters/KMS/storage but depends on mock adapters in test | 2026-08-21 | integration test (mock env) | W0-05 |
