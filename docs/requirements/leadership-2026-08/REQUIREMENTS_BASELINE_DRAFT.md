# Requirements Baseline Draft

> **DRAFT — NOT APPROVED FOR IMPLEMENTATION**
> Requires leadership approval, matrix normalization, and verified code/test evidence.

## Governance

| Item | Rule |
|------|------|
| Approval authority | Project Owner (acting for leadership) |
| Versioning | Approved revisions get version tags (v1.0); unapproved drafts unversioned |
| Change protocol | New requirements need LEAD-### reference + owner approval |
| Status values | `verified-implemented`, `partial`, `demo-only`, `mock-only`, `contract-stub`, `missing`, `conflict`, `decision-needed`, `unknown` |
| Evidence quality | `verified-implemented` = non-mock module + acceptance/integration test |
| Decision linkage | DECISION_LOG.md items must be approved before coding |

## Role / Permission (MF-REQ-001–004)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REQ-001 | RBAC with customizable roles | LEAD-001 | verified-implemented | 2026-08-21 | auth.spec.ts, rbac.spec.ts |
| MF-REQ-002 | Role-based access per module | LEAD-001 | verified-implemented | 2026-08-21 | rbac.spec.ts |
| MF-REQ-003 | MFA for admin/accountant/operator | LEAD-001 | partial | 2026-08-21 | config stub; no integration test |
| MF-REQ-004 | JWT auth with role claims | LEAD-001 | verified-implemented | 2026-08-21 | auth.spec.ts |

## Catalog (MF-REQ-010–016)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REQ-010 | Product card lifecycle (9-state) | LEAD-001/005 | verified-implemented | 2026-08-21 | moderation.spec.ts |
| MF-REQ-011 | 44 catalog attributes | LEAD-001 | verified-implemented | 2026-08-21 | products-cards.spec.ts |
| MF-REQ-012 | GTIN/NTIN validation | LEAD-005 | verified-implemented | 2026-08-21 | code-lookup.spec.ts |
| MF-REQ-013 | TN VED classification | LEAD-001/005 | verified-implemented | 2026-08-21 | catalog-import.spec.ts |
| MF-REQ-014 | Fuzzy duplicate detection | LEAD-001 | verified-implemented | 2026-08-21 | catalog-import.spec.ts |
| MF-REQ-015 | Field-level audit trail | LEAD-001 | verified-implemented | 2026-08-21 | moderation.spec.ts |
| MF-REQ-016 | Partial unique index | LEAD-001 | verified-implemented | 2026-08-21 | catalog-migration.spec.ts |

## 1ecom Import (MF-REQ-020–022)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REQ-020 | Counterparty verification | LEAD-001 | mock-only | 2026-08-21 | MockEcomAdapter; no real API |
| MF-REQ-021 | Product catalog sync | LEAD-001/005 | mock-only | 2026-08-21 | MockEcomAdapter; no real API |
| MF-REQ-022 | Manual resolution | LEAD-001 | mock-only | 2026-08-21 | MockEcomAdapter.resolve is in-memory only; no real 1ecom verification |

## Billing / Invoice (MF-REQ-040–045)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REQ-040 | Double-entry ledger | LEAD-014 | verified-implemented | 2026-08-21 | billing.spec.ts (invariant) |
| MF-REQ-041 | Reserve/release/settle | LEAD-014 | verified-implemented | 2026-08-21 | billing.spec.ts |
| MF-REQ-042 | Invoice creation + VAT | LEAD-014 | partial | 2026-08-21 | Invoice CRUD works; Kaspi webhook response not validated against real API |
| MF-REQ-043 | Payment matching | LEAD-014 | partial | 2026-08-21 | Webhook handler tested; no real Kaspi integration verified |
| MF-REQ-044 | Tariff pricing | ROADMAP | decision-needed | — | D-001 pending |
| MF-REQ-045 | Balance separation | LEAD-014 | verified-implemented | 2026-08-21 | billing.spec.ts |

## Code Order (MF-REQ-050–053)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REQ-050 | Order state machine | LEAD-004 | verified-implemented | 2026-08-21 | order.spec.ts |
| MF-REQ-051 | PG sequence numbers | W0-02R | verified-implemented | 2026-08-21 | order.spec.ts, db-bootstrap.spec.ts |
| MF-REQ-052 | Idempotency key | LEAD-004 | verified-implemented | 2026-08-21 | order.spec.ts |
| MF-REQ-053 | Business place ID | LEAD-004 | verified-implemented | 2026-08-21 | order.spec.ts |

## Code Vault (MF-REQ-060–064)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REQ-060 | Encrypted code storage | LEAD-004 | development-only | 2026-08-21 | Uses FileKmsAdapter (dev key on disk); not production KMS |
| MF-REQ-061 | AES-256-GCM | LEAD-004 | development-only | 2026-08-21 | Uses FileKmsAdapter (local key); OpenBaoTransitKmsAdapter not production-validated |
| MF-REQ-062 | Label key PNG | LEAD-006 | verified-implemented | 2026-08-21 | label.spec.ts |
| MF-REQ-063 | Code status machine | LEAD-004 | verified-implemented | 2026-08-21 | code-event.spec.ts |
| MF-REQ-064 | Append-only audit | LEAD-004 | verified-implemented | 2026-08-21 | code-event.spec.ts |

## Print / Application (MF-REQ-070–072)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REQ-070 | PNG DataMatrix labels | LEAD-006 | verified-implemented | 2026-08-21 | label.spec.ts |
| MF-REQ-071 | Label print + audit | LEAD-006 | verified-implemented | 2026-08-21 | label.spec.ts |
| MF-REQ-072 | Reprint tracking | LEAD-006 | verified-implemented | 2026-08-21 | label.spec.ts |

## Document / Import-Export (MF-REQ-080–083)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REQ-080 | Import document submission | LEAD-009 | partial | 2026-08-21 | documents.spec.ts (no full lifecycle) |
| MF-REQ-081 | Withdrawal document | LEAD-009 | partial | 2026-08-21 | documents.spec.ts |
| MF-REQ-082 | Document status machine | LEAD-009 | partial | 2026-08-21 | documents.spec.ts |
| MF-REQ-083 | Document combinations | LEAD-009 | decision-needed | — | D-005 pending |

## Warehouse (MF-REQ-090–093)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REQ-090 | Shipment lifecycle | LEAD-012 | missing | — | — |
| MF-REQ-091 | Aggregation SSCC | LEAD-007 | missing | — | — |
| MF-REQ-092 | Warehouse zones/tasks | LEAD-012 | missing | — | — |
| MF-REQ-093 | TSD scan events | LEAD-012 | missing | — | — |

## MPT (MF-REF-100–105)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REF-100 | MPT auth/refresh | ROADMAP | mock-only | 2026-08-21 | MockMptAdapter |
| MF-REF-101 | MPT createOrder | ROADMAP | mock-only | 2026-08-21 | MockMptAdapter |
| MF-REF-102 | MPT getOrder/getCodes | ROADMAP | mock-only | 2026-08-21 | MockMptAdapter |
| MF-REF-103 | MPT submitUtilisation | ROADMAP | mock-only | 2026-08-21 | MockMptAdapter |
| MF-REF-104 | MPT document submission | ROADMAP | mock-only | 2026-08-21 | MockMptAdapter |
| MF-REF-105 | Pilot MPT write authority | ROADMAP | decision-needed | — | D-002 pending |

## Exception (MF-REQ-110–112)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REQ-110 | Timeout → reconciliation | ROADMAP | missing | — | — |
| MF-REQ-111 | Unknown outcome → task | LEAD-013 | missing | — | — |
| MF-REQ-112 | Rejection → traceable task | LEAD-013 | missing | — | — |

## Security (MF-REQ-120–123)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REQ-120 | No hardcoded secrets | AGENTS.md | verified-implemented | 2026-08-21 | secret-scan pass |
| MF-REQ-121 | Code Vault ciphertext redacted | AGENTS.md | partial | 2026-08-21 | Strips connection strings; does not cover all error paths |
| MF-REQ-122 | Encrypted payload not in logs | AGENTS.md | verified-implemented | 2026-08-21 | health.spec.ts |
| MF-REQ-123 | Production rejects mock/file/local | AGENTS.md | verified-implemented | 2026-08-21 | db-bootstrap.spec.ts |

## Observability (MF-REQ-130–132)

| ID | Requirement | Source | Status | Date | Evidence |
|----|-------------|--------|--------|------|----------|
| MF-REQ-130 | Correlation ID | ROADMAP | missing | — | — |
| MF-REQ-131 | Structured log redaction | ROADMAP | partial | 2026-08-21 | sanitizeHealthError only |
| MF-REQ-132 | Health/readiness probes | ROADMAP | partial | 2026-08-21 | Liveness ok; readiness checks adapters/KMS/storage but depends on mock adapters in test |

## Decision-Needed (MF-DEC-001–006)

| ID | Decision | Source | Status |
|----|----------|--------|--------|
| MF-DEC-001 | Tariff pricing (0.84 vs 8 KZT) | ROADMAP §5 | conflict |
| MF-DEC-002 | Pilot MPT write authority | ROADMAP §5 | decision-needed |
| MF-DEC-003 | Data ownership | ROADMAP | decision-needed |
| MF-DEC-004 | Code Vault retention | LEAD-004 | decision-needed |
| MF-DEC-005 | Document combinations | LEAD-009 | unknown |
| MF-DEC-006 | Role matrix | LEAD-001 | decision-needed |
