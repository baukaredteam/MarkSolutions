# W1 Pilot UI Traceability — first controlled Stage flow

> **Documentation only.** This file maps the first controlled pilot flow to
> leadership modules, MF-REQ IDs, roles, API commands/queries, state transitions,
> audit events, error/recovery states and future production routes.
>
> All existing demo/static screens are **`reference only`** — they are not
> production routes and must not be promoted without a separate W1 ticket.

## Pilot flow (ordered)

### 1. Settings/RBAC

| Field             | Value                                                       |
| ----------------- | ----------------------------------------------------------- |
| Leadership module | Settings → RBAC                                             |
| MF-REQ IDs        | MF-REQ-001, MF-REQ-002 (D-006)                              |
| Role              | Administrator                                               |
| API command       | `POST /auth/login`, `POST /auth/select-legal-entity`        |
| State transition  | unauthenticated → authenticated + activeLegalEntityId       |
| Audit event       | login success/failure (correlationId)                       |
| Error/recovery    | 403 zero-membership; 409 multi-membership → selection token |
| Production route  | `/settings/rbac`                                            |

### 2. Catalogue

| Field             | Value                                                                            |
| ----------------- | -------------------------------------------------------------------------------- |
| Leadership module | Catalogue → Product cards                                                        |
| MF-REQ IDs        | MF-REQ-010..019 (CAT-013)                                                        |
| Role              | admin \| manager                                                                 |
| API command/query | `GET /products/cards`, `POST /products/cards`, `POST /products/cards/:id/submit` |
| State transition  | DRAFT → VALIDATING → SUBMITTED → IN_REVIEW → APPROVED                            |
| Audit event       | card status change in `attributes.audit[]`                                       |
| Error/recovery    | 409 duplicate GTIN; NEEDS_CORRECTION with fieldReasons                           |
| Production route  | `/catalogue/products`                                                            |

### 3. Billing

| Field             | Value                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------- |
| Leadership module | Billing → Invoices / Balance                                                            |
| MF-REQ IDs        | MF-REQ-030..034 (W5-07)                                                                 |
| Role              | admin \| accountant                                                                     |
| API command/query | `POST /billing/invoices`, `POST /billing/invoices/:id/confirm`, `GET /billing/balance`  |
| State transition  | ISSUED → PAID; LedgerEntry TOPUP (double-entry ADR-007)                                 |
| Audit event       | LedgerEntry created (ref1c idempotent)                                                  |
| Error/recovery    | 402 insufficient funds; 409 number conflict (retry P2002); PAYMENTS_ENABLED=false → 403 |
| Production route  | `/billing/invoices`, `/billing/balance`                                                 |

### 4. Code Order

| Field             | Value                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Leadership module | Ordering → Code order                                                                           |
| MF-REQ IDs        | MF-REQ-040..048 (ORD-024..029, ADR-024)                                                         |
| Role              | admin \| manager                                                                                |
| API command/query | `POST /orders` (Idempotency-Key), `GET /orders/:id`                                             |
| State transition  | DRAFT → VALIDATING → FUNDS_RESERVED → QUEUED → SENT → ACCEPTED → PROCESSING → COMPLETED         |
| Audit event       | outbox `send-order-to-mpt`; reconciliation events                                               |
| Error/recovery    | 402 insufficient funds; REJECTED → RELEASE + task operator (ID-017); timeout → FAILED + RELEASE |
| Production route  | `/ordering/code-orders`                                                                         |

### 5. Code Vault

| Field             | Value                                                |
| ----------------- | ---------------------------------------------------- |
| Leadership module | Code Vault                                           |
| MF-REQ IDs        | MF-REQ-050..055 (CV-030..033, ADR-024/025)           |
| Role              | admin \| manager \| marking                          |
| API command/query | `GET /api/codes`, `GET /codes/:orderId/codes`        |
| State transition  | codes ingested ACTIVE (from MPT COMPLETED/PARTIALLY) |
| Audit event       | ingest event per code batch                          |
| Error/recovery    | ingest failure → outbox FAILED + задача оператору    |
| Production route  | `/vault/codes`                                       |

### 6. Print

| Field             | Value                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| Leadership module | Printing → Label print                                                     |
| MF-REQ IDs        | MF-REQ-056..058 (LBL-037..040, W4-02)                                      |
| Role              | admin \| manager \| marking                                                |
| API command/query | `POST /labels/:codeKey/print`, `POST /labels/:codeKey/reprint`             |
| State transition  | ACTIVE → PRINTED → APPLIED (scan roundtrip)                                |
| Audit event       | CodeEvent PRINTED / REPRINTED (reasonCode обязательный)                    |
| Error/recovery    | 409 код уже APPLIED (перемаркировка = REMARK, не MVP); скан mismatch → 400 |
| Production route  | `/printing/labels`                                                         |

### 7. Operations/Documents

| Field             | Value                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Leadership module | Operations → Documents (import/withdrawal/utilisation)                                            |
| MF-REQ IDs        | MF-REQ-060..064 (W4-04, Q5/Q9, п.26/28 Правил)                                                    |
| Role              | admin \| manager \| marking                                                                       |
| API command/query | `POST /import`, `POST /withdrawal`, `POST /utilisation`                                           |
| State transition  | EXPECTED/SUBMITTED → SUCCESS/ERROR; коды → INTRODUCED / WITHDRAWN / UTILISED                      |
| Audit event       | CodeEvent INTRODUCED/WITHDRAWN/WRITTEN_OFF/UTILISED; ImportDocument/WithdrawalDocument созданы    |
| Error/recovery    | 409 дубль ДТ; ERROR → rejectReason + задача оператору (ID-017); таймер 30 дней → UtilisationAlert |
| Production route  | `/operations/documents`                                                                           |

### 8. Task Center

| Field             | Value                                                               |
| ----------------- | ------------------------------------------------------------------- |
| Leadership module | Task Center (ID-017 pattern)                                        |
| MF-REQ IDs        | MF-REQ-080..082 (W2, D-003 audit retention)                         |
| Role              | operator (глобальный, без tenant); tenant admin видит свои          |
| API command/query | `GET /dashboard/summary` (exceptions counter), `GET /audit/journal` |
| State transition  | OPEN → RESOLVED                                                     |
| Audit event       | AuditJournal entries (actor/action/at/object/source)                |
| Error/recovery    | SLA escalation — эволюция (не MVP); алерты 7/3/1 день до дедлайна   |
| Production route  | `/tasks/center`                                                     |

---

## Demo/static screens — `reference only`

| Screen                                    | Status         | Note                                  |
| ----------------------------------------- | -------------- | ------------------------------------- |
| `demo/*` endpoints                        | reference only | DEMO_ENABLED gate; не для Stage/prod  |
| Seed fixtures (`seed-invoice`, `w4-seed`) | reference only | Тестовые данные, не бизнес-операции   |
| TUI dashboard (pre-W1)                    | reference only | Заменяется EntityList конфигами в W1+ |

## Traceability to delegated decisions

| Decision ID | Relevance                                                                            |
| ----------- | ------------------------------------------------------------------------------------ |
| D-003       | Client Organization owns data scoped by LegalEntity — dual-scope boundary throughout |
| D-006       | 8 default roles, deny-by-default, resource:action:scope primitive                    |
| D-005       | Retention/legal-hold before export/deletion — RESTRICT on protected FKs              |

## Token store

| Model                | Classification  | Rationale                                                                            |
| -------------------- | --------------- | ------------------------------------------------------------------------------------ |
| `UsedSelectionToken` | global/platform | Selection-token replay guard; hashed (SHA-256), user/tenant-bound; no business data. |
