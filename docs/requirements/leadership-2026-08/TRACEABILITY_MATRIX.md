# Traceability Matrix

**Date:** 2026-08-21
**Status:** DRAFT

---

| Req ID | Source | Module | Demo Screen | Status | Verification Date | Evidence Quality | Target WP |
|--------|--------|--------|-------------|--------|------------------|-----------------|-----------|
| MF-REQ-001 | LEAD-001 | AuthService, guards | Login | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-002 | LEAD-001 | TenantGuard, RolesGuard | Module access | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-003 | LEAD-001 | MFA config stub | MFA prompt | partial | 2026-08-21 | config only | W0-01+ |
| MF-REQ-004 | LEAD-001 | JwtModule, JWT_SECRET | Login | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-010 | LEAD-001/005 | ModerationService | Card moderation | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-011 | LEAD-001 | ProductCard (44 attrs) | Card detail | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-012 | LEAD-005 | GtinResolver, gs1Mod10Check | GTIN validation | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-013 | LEAD-001/005 | tnvedHint, heuristicStrengthensFix | Card form | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-014 | LEAD-001 | fuzzyKeyOf, checkDuplicate | Card form | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-015 | LEAD-001 | audit field on ProductCard | Moderation | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-016 | LEAD-001 | @@index + partial unique | Card list | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-020 | LEAD-001 | MockEcomAdapter.verify | Onboarding | mock-only | 2026-08-21 | mock adapter | W0-01 |
| MF-REQ-021 | LEAD-001/005 | MockEcomAdapter.listProducts | Products | mock-only | 2026-08-21 | mock adapter | W0-01 |
| MF-REQ-022 | LEAD-001 | MockEcomAdapter.resolve | Onboarding | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-040 | LEAD-014 | BillingService, LedgerEntry | Billing | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-041 | LEAD-014 | reserveOn, release, settle | Billing | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-042 | LEAD-014 | InvoiceService | Invoice | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-043 | LEAD-014 | kaspiWebhook | Invoice | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-044 | ROADMAP | activeTariff | Billing | decision-needed | — | — | W0-03+ |
| MF-REQ-045 | LEAD-014 | getBalance, ledger invariant | Billing | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-050 | LEAD-004 | OrderService.create, state machine | Order list | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-051 | W0-02R | order_number_seq (PG sequence) | Order list | verified-implemented | 2026-08-21 | integration test | W0-02R |
| MF-REQ-052 | LEAD-004 | idempotencyKey unique | Order list | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-053 | LEAD-004 | businessPlaceId validation | Order form | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-060 | LEAD-004 | CodeVault, VaultService.seal | Code vault | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-061 | LEAD-004 | kms.encrypt, AES-256-GCM | Code vault | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-062 | LEAD-006 | labelKey, PNG render | Label print | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-063 | LEAD-004 | CodeEvent status machine | Code vault | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-064 | LEAD-004 | CodeEvent append-only | Code vault | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-070 | LEAD-006 | LabelService.renderPng | Label print | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-071 | LEAD-006 | LabelService.print | Label print | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-072 | LEAD-006 | LabelService.reprint | Label print | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-080 | LEAD-009 | DocumentService | Documents | partial | 2026-08-21 | integration (no lifecycle) | W0-02 |
| MF-REQ-081 | LEAD-009 | WithdrawalDocument | Documents | partial | 2026-08-21 | integration (no lifecycle) | W0-02 |
| MF-REQ-082 | LEAD-009 | MptDocument status | Documents | partial | 2026-08-21 | integration (no async) | W0-02 |
| MF-REQ-083 | LEAD-009 | — | — | decision-needed | — | — | W0-03+ |
| MF-REQ-090 | LEAD-012 | — | — | missing | — | — | W0-03 |
| MF-REQ-091 | LEAD-007 | — | — | missing | — | — | W0-03 |
| MF-REQ-092 | LEAD-012 | — | — | missing | — | — | W0-03 |
| MF-REQ-093 | LEAD-012 | — | — | missing | — | — | W0-03 |
| MF-REF-100 | ROADMAP | HttpMptAdapter.ensureToken | MPT | mock-only | 2026-08-21 | mock adapter | W0-01 |
| MF-REF-101 | ROADMAP | HttpMptAdapter.createOrder | MPT | mock-only | 2026-08-21 | mock adapter | W0-01 |
| MF-REF-102 | ROADMAP | HttpMptAdapter.getOrder | MPT | mock-only | 2026-08-21 | mock adapter | W0-01 |
| MF-REF-103 | ROADMAP | HttpMptAdapter.submitUtilisation | MPT | mock-only | 2026-08-21 | mock adapter | W0-01 |
| MF-REF-104 | ROADMAP | HttpMptAdapter.submitImport | MPT | mock-only | 2026-08-21 | mock adapter | W0-01 |
| MF-REF-105 | ROADMAP §5 | — | — | decision-needed | — | — | W0-04+ |
| MF-REQ-110 | ROADMAP | — | — | missing | — | — | W0-04 |
| MF-REQ-111 | LEAD-013 | — | — | missing | — | — | W0-04 |
| MF-REQ-112 | LEAD-013 | — | — | missing | — | — | W0-04 |
| MF-REQ-120 | AGENTS.md | secret-scan, config-validation | — | verified-implemented | 2026-08-21 | CI pass | W0-01 |
| MF-REQ-121 | AGENTS.md | sanitizeHealthError | Health | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-122 | AGENTS.md | AllExceptionsFilter | Error | verified-implemented | 2026-08-21 | integration test | W0-01 |
| MF-REQ-123 | AGENTS.md | validateProductionConfig | Startup | verified-implemented | 2026-08-21 | bootstrap test | W0-01 |
| MF-REQ-130 | ROADMAP | — | — | missing | — | — | W0-05 |
| MF-REQ-131 | ROADMAP | sanitizeHealthError | Health | partial | 2026-08-21 | health endpoint only | W0-05 |
| MF-REQ-132 | ROADMAP | /health, /health/ready | Health | verified-implemented | 2026-08-21 | integration test | W0-01 |
