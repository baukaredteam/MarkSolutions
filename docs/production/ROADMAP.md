# MarkFlow Production Roadmap

## 1. Baseline and scope

The reference baseline requested by the product owner is commit [`30f182b`](https://github.com/baukaredteam/MarkSolutions/commit/30f182b554fe8380498f722b0afffa99a11cba42), titled `feat: UI-04 — Orders+Vault`. The currently fetched `main` head is `d1d3aaa`; it already contains later billing, 1ecom and integration work. The local worktree also contains uncommitted MPT HTTP adapter and split-settlement changes. They must be reviewed, tested and committed as a dedicated work package; they are not an implicit production baseline.

The target is the 16-module MarkFlow platform described in management materials. The delivery strategy is **vertical production slices**, not a sequence of unconnected UI pages. Every slice ends with real persistence, authorization, background processing, observability and a Stage acceptance test.

> A screen is not a module. A module is complete only when its command/query contract, domain state, migration, audit events, asynchronous behavior, error path and tests exist.

## 2. Architecture guardrails

| Layer | Production responsibility |
|---|---|
| React web console | Human workflow, role-scoped read models, preflight, confirmation, progress and error recovery. Never holds long-lived secrets or makes direct vendor calls. |
| Nest API / BFF | Authentication, tenant/RBAC enforcement, command validation, query APIs, audit and outbox creation. |
| Domain services | Catalog, orders, billing, vault, print, documents, operations, shipments, production, warehouse and task rules. |
| Job workers | Durable import, export, print dispatch, MPT exchange, reconciliation, settlement, sync, notification and scheduled jobs. |
| Integration Gateway | Versioned adapters for IS MPT, 1ecom, GS1, NKT/KMT, bank/payment provider, 1C/ERP/WMS, OФД, ЭДО and marketplaces. |
| PostgreSQL | Transactional source of truth, tenant-scoped entities, ledger, outbox/inbox, state transitions and audit references. |
| MinIO/S3 + KMS | Encrypted files, source uploads, generated archives, evidence and envelope keys. |
| Observability | Structured logs, metrics, traces, audit query, DLQ and alerts with correlation ID. |

## 3. Delivery waves

| Wave | Goal | Main modules | Production exit gate |
|---|---|---|---|
| W0 | Establish a reliable engineering baseline | Platform foundation | CI green, migration discipline, secrets/storage/backup gates passed |
| W1 | Deliver Stage-ready core marking slice | CAT, BILL, ORD, MPT, Vault, PRINT, Documents | One organization can complete a controlled Stage flow end-to-end |
| W2 | Make exceptions and legal traceability operational | TASK, OPS, Documents, Search | Every failure becomes a traceable task; corrections are versioned and auditable |
| W3 | Add physical movement | SHP, AGG, WMS/TSD | Shipment and receiving work with scan events, discrepancies and offline reconciliation |
| W4 | Add factory flow | PRD, Print, AGG, WMS | Production batch reserves, applies, rejects and reports codes |
| W5 | Add management plane | HOME, RPT, SET, KB | Role dashboards, search, reporting, organization policies and runbooks work |
| W6 | Add controlled assistance | AI | Assistant is source-grounded, permission-scoped, confirmation-gated and audited |

## 4. W0 — production foundation

### Scope

W0 removes demo-only infrastructure and makes later work safe to merge. It introduces configuration validation, strict environment profiles, PostgreSQL migrations, production object storage, KMS/OpenBao, durable job infrastructure, outbox/inbox, request correlation, error taxonomy, backup/restore drill, CI quality gates and an operational runbook.

### Required work

| Work package | Required outcome |
|---|---|
| W0-01 Configuration | Fail fast if secrets, environment mode, storage, KMS, DB or MPT configuration is incomplete. Ban `dev-secret`, file KMS and local storage in `production`. |
| W0-02 Database | Make `db:generate`, migration validation and tests reproducible. Add migration review checklist and rollback/forward-fix policy. |
| W0-03 Storage/KMS | Implement production MinIO/S3 adapter, envelope encryption, key rotation metadata, file checksum and retention. |
| W0-04 Jobs | Replace in-process-only polling with durable queue/outbox/inbox, bounded retries, DLQ and reconciliation scheduler. |
| W0-05 Observability | Correlation ID through HTTP → command → outbox → adapter → task. Add structured redaction and health/readiness checks. |
| W0-06 CI | Run lint, typecheck, Prisma generation, migration validation, unit/integration tests, contract tests, secret scan and dependency audit. |

### Exit gate

The test suite must bootstrap Prisma without missing `.prisma/client/default`; the current failure pattern is a blocking defect. A clean disposable database must migrate and seed. A restore drill must prove that PostgreSQL and MinIO data can be recovered. No production profile may boot with mock adapters, file KMS or local storage.

## 5. W1 — controlled Stage marking vertical slice

### Canonical flow

```text
Organization and RBAC
→ Product card / GTIN or NTIN validation
→ Internal and external moderation
→ Invoice / payment matching / available balance
→ Code-order preflight and reserve
→ Outbox → IS MPT Stage
→ Reconciliation / partial result
→ Encrypted Code Vault
→ Print job and quality result
→ Utilisation report
→ Document version / audit / task if needed
```

### Acceptance behavior

Catalog sources must remain attributable: manual, 1ecom, WB/OZON template, GS1, NKT/KMT or document import. User-entered fields cannot be silently overwritten by external sync. Every order line has a deterministic line id, source snapshot, tariff snapshot and individual result. A timeout after an MPT POST enters reconciliation; it never triggers an automatic duplicate POST.

Billing must keep available, reserved, captured, released, refunded, settlement-pending and settled state separate. The payer, importer, service recipient, operator cost and MarkFlow margin must be explicit ledger dimensions. Finalize the tariff decision before W1: management material illustrates `0.84 KZT/code`, while the prior commercial direction is `8 KZT/code`; no agent may invent the production rule.

### Stage test ladder

| Step | External effect | Human approval |
|---|---|---|
| MPT auth/profile/product group read | Read-only | Not needed once credentials are securely configured |
| List/order-status reconciliation | Read-only | Not needed |
| Minimal test order | Creates Stage external object | Required |
| Fetch test codes | Reads sensitive code payload | Required role and audit |
| Print test label | Local print action | Required operator confirmation |
| Submit utilisation/document | Creates Stage external document | Required |

## 6. W2 — operations, documents and task center

Build one Operations domain with typed commands for introduction, withdrawal, write-off, return, movement, relabeling, correction, cancellation and aggregation links. Each command gets an explicit allowed-state table, preflight, document link, partial outcome and compensating path. Documents must be versioned, source-linked and immutable after posting.

Build Task Center as a cross-module service. It creates a task for rejected external responses, payment exceptions, unknown MPT outcome, warehouse discrepancy, print failure or approval need. A task has owner, role route, SLA, escalation, source object, priority, actions and full history.

## 7. W3 — shipment, aggregation and warehouse/TSD

Introduce first-class Shipment, ShipmentLine, Receiving, Discrepancy, Warehouse, Zone, Bin, WarehouseTask, Device and DeviceEvent models. Shipments are inbound, outbound or internal and move from `DRAFT` to `COMPLETED` through explicit dispatch and receiving states. Aggregate hierarchy remains separate from warehouse execution; TSD receives assigned tasks and produces append-only scan events.

Offline TSD is a controlled local queue. It can continue only preloaded work. Server conflict checks happen upon sync; the server never silently overwrites a competing event. Quarantine changes physical availability only; legal marking-code status changes remain in Operations.

## 8. W4 — production

Introduce ProductionOrder, Batch, Line, Shift, planned quantity, code reservation, print/apply task, reject, aggregation and completion document. A production batch cannot capture codes twice, and rejected codes must remain traceable to the original reserved range. Production completion creates warehouse availability and any required marking operation/document.

## 9. W5 and W6 — control and intelligence

W5 adds read models for HOME/RPT/SEARCH/SET/KB. Search indexes products, GTIN/NTIN, code lookup metadata, operations, documents, shipments and tasks with tenant filters. Reporting is based on derived read models, never heavy synchronous aggregation in an API request.

W6 adds AI only after knowledge, audit and authorization are stable. AI can explain, retrieve and draft. It can execute only whitelisted commands under the current actor's permission and an explicit confirmation; all tool actions are logged.

## 10. Definition of Done for every work package

| Category | Required evidence |
|---|---|
| Requirement | Traceability row linking management requirement, acceptance criteria and implemented code path |
| Design | State machine, ownership, events, failure and compensation paths recorded |
| Data | Additive migration, indexes, tenant scope and data retention defined |
| API | Request/response schema, idempotency, correlation ID, error taxonomy and permissions |
| Async | Job/outbox/retry/reconciliation/DLQ behavior for long or external work |
| UI | Real data, loading/empty/error/partial state, role restrictions and accessible confirmation |
| Security | No secret/code leak, redacted logs and audited sensitive action |
| Tests | Unit, integration, contract and regression test coverage; all quality gates pass |
| Operations | Metrics, alert condition, runbook and rollback/forward-fix note |

## 11. Current decision register

| ID | Decision required before implementation | Owner |
|---|---|---|
| D-01 | Confirm client tariff and operator cost for each product group; resolve `0.84` vs `8` KZT | Product + Finance |
| D-02 | Confirm lawful payer/importer/service-recipient/operator settlement model | Product + Finance + Legal |
| D-03 | Obtain current IS MPT Stage API contract, allowed calls and data fixtures | Integration owner |
| D-04 | Confirm GS1, NKT/KMT, 1ecom, bank, ERP/WMS and marketplace integration access model | Product + Integration owner |
| D-05 | Approve production data retention, document storage and key management policy | Security + Legal |
| D-06 | Approve supported first product group and first Stage end-to-end scenario | Product |
