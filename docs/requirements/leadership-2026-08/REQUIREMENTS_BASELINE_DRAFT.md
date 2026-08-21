# Requirements Baseline Draft

**Date:** 2026-08-21
**Status:** DRAFT
**Source:** Leadership originals (LEAD-001 through LEAD-022)

---

## Role / Permission

| ID         | Requirement                       | Source   | Status      |
| ---------- | --------------------------------- | -------- | ----------- |
| MF-REQ-001 | RBAC with customizable roles      | LEAD-001 | implemented |
| MF-REQ-002 | Role-based access per module      | LEAD-001 | implemented |
| MF-REQ-003 | MFA for admin/accountant/operator | LEAD-001 | partial     |
| MF-REQ-004 | JWT auth with role claims         | LEAD-001 | implemented |

## Catalog

| ID         | Requirement                                         | Source       | Status      |
| ---------- | --------------------------------------------------- | ------------ | ----------- |
| MF-REQ-010 | Product card lifecycle (9-state machine)            | LEAD-001/005 | implemented |
| MF-REQ-011 | 44 catalog attributes with schema versioning        | LEAD-001     | implemented |
| MF-REQ-012 | GTIN/NTIN validation (GS1 mod10)                    | LEAD-005     | implemented |
| MF-REQ-013 | TN VED classification with auto-suggestion          | LEAD-001/005 | implemented |
| MF-REQ-014 | Fuzzy duplicate detection                           | LEAD-001     | implemented |
| MF-REQ-015 | Field-level audit trail for moderation              | LEAD-001     | implemented |
| MF-REQ-016 | Partial unique index: same tenant+gtin active cards | LEAD-001     | implemented |

## 1ecom Import

| ID         | Requirement                               | Source       | Status             |
| ---------- | ----------------------------------------- | ------------ | ------------------ |
| MF-REQ-020 | 1ecom counterparty verification           | LEAD-001     | implemented (mock) |
| MF-REQ-021 | 1ecom product catalog sync                | LEAD-001/005 | implemented (mock) |
| MF-REQ-022 | Manual resolution of pending verification | LEAD-001     | implemented        |

## Billing / Invoice

| ID         | Requirement                                   | Source   | Status      |
| ---------- | --------------------------------------------- | -------- | ----------- |
| MF-REQ-040 | Double-entry ledger                           | LEAD-014 | implemented |
| MF-REQ-041 | Reserve/release/settle with idempotency       | LEAD-014 | implemented |
| MF-REQ-042 | Invoice creation with VAT                     | LEAD-014 | implemented |
| MF-REQ-043 | Payment matching (Kaspi webhook)              | LEAD-014 | implemented |
| MF-REQ-044 | DECISION NEEDED: Tariff pricing 0.84 vs 8 KZT | ROADMAP  | conflict    |
| MF-REQ-045 | Balance available/reserved/captured           | LEAD-014 | implemented |

## Code Order

| ID         | Requirement                     | Source   | Status      |
| ---------- | ------------------------------- | -------- | ----------- |
| MF-REQ-050 | Order state machine (12 states) | LEAD-004 | implemented |
| MF-REQ-051 | PG sequence for order numbers   | W0-02R   | implemented |
| MF-REQ-052 | Idempotency key per order       | LEAD-004 | implemented |
| MF-REQ-053 | Business place ID validation    | LEAD-004 | implemented |

## Code Vault

| ID         | Requirement                                          | Source   | Status      |
| ---------- | ---------------------------------------------------- | -------- | ----------- |
| MF-REQ-060 | Encrypted code storage (gtin open, serial encrypted) | LEAD-004 | implemented |
| MF-REQ-061 | AES-256-GCM with per-row nonce                       | LEAD-004 | implemented |
| MF-REQ-062 | Label key: content-addressed PNG                     | LEAD-006 | implemented |
| MF-REQ-063 | Code status machine (9 states)                       | LEAD-004 | implemented |
| MF-REQ-064 | Append-only audit log                                | LEAD-004 | implemented |

## Print / Application

| ID         | Requirement                             | Source   | Status      |
| ---------- | --------------------------------------- | -------- | ----------- |
| MF-REQ-070 | PNG DataMatrix label generation         | LEAD-006 | implemented |
| MF-REQ-071 | Label print with reason + audit         | LEAD-006 | implemented |
| MF-REQ-072 | Reprint tracking with reason validation | LEAD-006 | implemented |

## Document / Import-Export

| ID         | Requirement                            | Source   | Status  |
| ---------- | -------------------------------------- | -------- | ------- |
| MF-REQ-080 | Import document submission             | LEAD-009 | partial |
| MF-REQ-081 | Withdrawal document                    | LEAD-009 | partial |
| MF-REQ-082 | Document status machine                | LEAD-009 | partial |
| MF-REQ-083 | DECISION NEEDED: Document combinations | LEAD-009 | unknown |

## Warehouse

| ID         | Requirement                | Source   | Status  |
| ---------- | -------------------------- | -------- | ------- |
| MF-REQ-090 | Shipment lifecycle         | LEAD-012 | missing |
| MF-REQ-091 | Aggregation with SSCC      | LEAD-007 | missing |
| MF-REQ-092 | Warehouse zones/bins/tasks | LEAD-012 | missing |
| MF-REQ-093 | TSD scan events            | LEAD-012 | missing |

## MPT

| ID         | Requirement                                | Source  | Status             |
| ---------- | ------------------------------------------ | ------- | ------------------ |
| MF-REF-100 | MPT auth/refresh                           | ROADMAP | implemented (mock) |
| MF-REF-101 | MPT createOrder                            | ROADMAP | implemented (mock) |
| MF-REF-102 | MPT getOrder/getCodes                      | ROADMAP | implemented (mock) |
| MF-REF-103 | MPT submitUtilisation                      | ROADMAP | implemented (mock) |
| MF-REF-104 | MPT document submission                    | ROADMAP | implemented (mock) |
| MF-REF-105 | DECISION NEEDED: Pilot MPT write authority | ROADMAP | decision-needed    |

## Exception

| ID         | Requirement                         | Source   | Status  |
| ---------- | ----------------------------------- | -------- | ------- |
| MF-REQ-110 | Timeout → reconciliation            | ROADMAP  | missing |
| MF-REQ-111 | Unknown outcome → operator task     | LEAD-013 | missing |
| MF-REQ-112 | External rejection → traceable task | LEAD-013 | missing |

## Security

| ID         | Requirement                                | Source    | Status      |
| ---------- | ------------------------------------------ | --------- | ----------- |
| MF-REQ-120 | No hardcoded secrets                       | AGENTS.md | implemented |
| MF-REQ-121 | Code Vault ciphertext redacted             | AGENTS.md | implemented |
| MF-REQ-122 | Encrypted code payload never in logs       | AGENTS.md | implemented |
| MF-REQ-123 | Production profile rejects mock/file/local | AGENTS.md | implemented |

## Observability

| ID         | Requirement                                | Source  | Status      |
| ---------- | ------------------------------------------ | ------- | ----------- |
| MF-REQ-130 | Correlation ID through HTTP→command→outbox | ROADMAP | missing     |
| MF-REQ-131 | Structured log redaction                   | ROADMAP | missing     |
| MF-REQ-132 | Health/readiness probes                    | ROADMAP | implemented |

## Decision-Needed

| ID         | Requirement                             | Source     | Status          |
| ---------- | --------------------------------------- | ---------- | --------------- |
| MF-DEC-001 | Tariff pricing (0.84 vs 8 KZT/code)     | ROADMAP §5 | conflict        |
| MF-DEC-002 | Pilot MPT write authority               | ROADMAP §5 | decision-needed |
| MF-DEC-003 | Data ownership (MarkFlow vs client)     | ROADMAP    | decision-needed |
| MF-DEC-004 | Code Vault cryptotext retention policy  | LEAD-004   | decision-needed |
| MF-DEC-005 | Document combinations (invoice/customs) | LEAD-009   | unknown         |
| MF-DEC-006 | Role matrix (full permission map)       | LEAD-001   | decision-needed |
