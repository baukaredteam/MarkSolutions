# OpenCode Prompt Pack — MarkFlow Production

## Use order

Run the global prompt once at the start of every OpenCode session. Then run exactly one bounded work-package prompt. Do not start parallel work packages that edit the same domain, migration set or state machine. At the end of a package, run the independent review prompt before committing.

The prompts deliberately mention the installed capabilities named by the product owner: persistent memory, code review, code graph, engineering methodology, TypeScript engineering skills and design review. If a named capability is unavailable in the local OpenCode session, state that clearly in the work log and continue with the equivalent manual check; do not fabricate a tool result.

## Global session prompt

```text
You are the principal production engineer for MarkFlow. Work only in this repository and treat AGENTS.md and docs/production/ROADMAP.md as mandatory policy.

Mission: convert the current MVP into a production-grade, multi-tenant marking and traceability platform. Do not create placeholders, fake success paths, demo-only adapters, UI-only behavior, direct vendor calls from React, hardcoded tenant IDs, raw-secret logs or irreversible commands without idempotency and audit.

At session start:
1. Load the persistent project memory and summarize the active work package, prior decisions, outstanding blockers and changed files.
2. Use the code graph to map the affected route, controller, service, Prisma model, outbox/job, adapter and tests before editing.
3. Read AGENTS.md, the relevant roadmap section and the existing ADRs/contracts.
4. State the exact acceptance criteria, non-goals, migration impact, rollback/forward-fix plan and tests you will run.

During implementation:
- Keep tenant authorization server-side and query-scoped.
- Use commands, state machines, correlation IDs, idempotency keys, audit events and durable jobs for external/long-running work.
- Store money in integer minor units and keep tariff snapshots immutable after reserve/accrual.
- Treat all files and vendor responses as untrusted input.
- Preserve legal/document history through versions or compensating objects; do not overwrite posted facts.
- Stop and ask for a decision if a commercial rule, external API contract or legal action is ambiguous.

Before finish:
1. Run targeted tests, repository lint, typecheck, Prisma generation/validation, secret scan and migration validation as relevant.
2. Use independent code review on the final diff, including security, tenancy, money, idempotency and error handling.
3. Update the work log with changed contracts, commands, results, unresolved risks and exact follow-up.
4. Do not claim completion when a required gate is failing.
```

## P0-00 — establish baseline and remove demo-only production paths

```text
Apply the Global session prompt. Implement roadmap W0 only.

Goal: make the repository reproducible and safe for future production work without changing product behavior. Start by comparing commit 30f182b with current main and the uncommitted worktree. Preserve uncommitted MPT/billing changes; do not absorb them into this package.

Deliverables:
- a documented environment matrix: local, test, stage, production;
- startup validation that rejects production mode with mock adapters, FileKMS, LocalStorage, dev JWT secret or missing required variables;
- deterministic Prisma generate/migrate/test bootstrap so all existing suites load Prisma Client;
- CI commands for lint, typecheck, Prisma validation, tests, secret scan and dependency audit;
- operational runbook for PostgreSQL/MinIO backup and restore;
- correlation ID and structured log redaction policy.

Acceptance: no production profile can boot with demo adapters; full test discovery no longer fails due to missing `.prisma/client/default`; every change is additive and documented. Do not introduce new product modules in this package.
```

## P0-01 — real integration gateway and IS MPT Stage contract

```text
Apply the Global session prompt. Implement only the Integration Gateway and IS MPT Stage contract hardening.

Review the existing HttpMptAdapter and MockMptAdapter against the current official Stage contract before editing. Build a typed adapter boundary for auth/refresh, product groups, business places, code order submission, order status, code retrieval, utilisation, import/withdrawal documents and error normalization.

Requirements:
- server-only configuration and secret redaction;
- timeout, bounded retry and circuit-breaker policy;
- idempotency key per outbound command;
- unknown POST outcome must enter reconciliation, not retry blindly;
- map external HTTP/JSON/binary errors to typed internal errors;
- preserve raw response evidence only in protected/audited storage;
- Stage smoke script supports read-only checks by default;
- any state-changing Stage scenario requires a named test case and explicit operator confirmation.

Deliver contract tests using a simulator and a recorded non-secret fixture set. Do not send a real Stage order in this package.
```

## P0-02 — catalog sources and moderation

```text
Apply the Global session prompt. Implement production CAT work package.

Goal: make product-card lifecycle real for one approved product group. Support manual card creation, 1ecom sync, supplier/WB template import, GS1/NTIN resolution, TN VED/KMT checks, internal validation, external moderation, correction and status synchronization.

Create a typed field-provenance model: source value, user value, resolved value, source timestamp, conflict and audit. A sync must never overwrite a manual value without the configured merge rule and user-visible conflict state. Build background status sync and task creation on external changes.

Use the supplied workbook only as an input-template example. Implement preview, mapping, validation, duplicate report and human-confirmed import according to docs/production/WB_DOCUMENT_IMPORT_CONTRACT.md.

Acceptance: no mock result in production profile, configuration-driven product group schema, migration/test coverage for lifecycle and conflict handling, real UI loading/empty/error states.
```

## P0-03 — billing and immutable settlement

```text
Apply the Global session prompt. Implement production BILL work package after D-01 and D-02 are approved.

Build versioned tariffs, invoice creation, payment matching, account balance, reserve, capture, release, refund, operator settlement and MarkFlow margin. Persist all money in tiyn/minor units. Never rely on a seed fallback for a production tariff.

Each accrual stores tenant, payer, importer, service recipient, product group, quantity, tariff version, operator cost, platform margin, tax mode, source object and immutable calculation snapshot. Settlement must be idempotent and batchable. A failed MPT request must not capture funds; an unknown result remains reserved until reconciliation.

Implement period close, correction/storno instead of destructive mutation, audit and a bank statement matching workflow. Include financial roles and approval policy.

Acceptance: double submit cannot double charge; tariff value is traceable to an approved version; every balance change reconciles to ledger; tests cover reserve/release/capture/partial/refund/settlement.
```

## P0-04 — code order, Vault and print vertical slice

```text
Apply the Global session prompt. Implement ORD + Vault + PRINT as one vertical slice after P0-01, P0-02 and P0-03.

Support composition from catalog, Excel/CSV, invoice and MarkFlow document. Preflight every line; merge duplicates deterministically; split >100 product cards into child orders; persist line-level state and immutable source/tariff snapshots. Run all long work through jobs/outbox and expose progress, partial results and retry-only-failed.

Code Vault stores encrypted code payloads, key reference, source order/line, state and audit metadata. Full-code export or print requires purpose-bound permission and audit. Implement print templates/versioning, test print, print job, device/agent status, reprint reason, quality/reject state and utilisation linkage.

Acceptance: controlled Stage order test can be planned and executed only after explicit approval; code retrieval, export and print are tenant-scoped; partial success never repeats successful lines; tests cover timeout/reconciliation and redaction.
```

## P1-01 — operations, documents and task center

```text
Apply the Global session prompt. Implement OPS + Documents + TASK together.

Create typed operation commands: introduction, withdrawal, write-off, return, movement, relabeling, correction, cancellation and aggregation links. Each command must declare permitted prior states, required documents, role/approval policy, partial result behavior and compensation path.

Create versioned documents with source file evidence, line positions, links to operations/orders/shipments/production, version history and immutable posted versions. Implement a cross-module Task Center with source object, owner, role routing, SLA, escalation, priority, notifications, comments and audit.

Acceptance: external rejection, unknown outcome, payment issue, print failure and warehouse discrepancy create traceable tasks; cancellation displays dependencies and blocks illegal reversal; UI is no longer a stub.
```

## P1-02 — shipments, aggregation and WMS/TSD

```text
Apply the Global session prompt. Implement SHP + AGG + WMS/TSD in two migrations if needed, but one coherent data model.

Create inbound/outbound/internal Shipment state machines, shipment lines, package references, receiving, discrepancy, quarantine and document links. Add aggregation hierarchy with immutable membership events. Add warehouse, zone, bin, warehouse task, device and append-only device scan-event models.

TSD offline mode may process only preloaded tasks. It persists local idempotency keys and sync cursor; server validates conflicts and returns a resolvable conflict instead of overwriting facts. Aggregate editing remains in AGG; TSD executes scanning only.

Acceptance: a shipment creates receiving tasks, scans update fact composition, discrepancies trigger tasks, and the full history is auditable; UI stubs are replaced by real flows and tests.
```

## P1-03 — production

```text
Apply the Global session prompt. Implement PRD with explicit ProductionOrder, Batch, Line, Shift, code reservation, print/application work, reject, aggregation, warehouse receipt and completion document.

Production may use only approved product cards and ready code ranges. It must reserve before physical work, prevent duplicate application/capture, record rejects, preserve code-to-batch lineage and produce the required utilisation/document flow. Link production costs to billing only through approved tariff rules.

Acceptance: one production batch can be executed through a deterministic test scenario with all state changes, audit events, documents and compensations verified.
```

## P2-01 — search, reporting, knowledge and AI

```text
Apply the Global session prompt. Implement SEARCH and RPT first, then KB, then AI.

Search indexes product/card, GTIN/NTIN, code metadata, order, operation, document, shipment, task and counterparty with server-enforced tenant and role filters. Reporting uses derived read models and export jobs. Knowledge documents are versioned and permission-scoped.

Only after those gates add AI. The assistant may retrieve and explain. Execution requires a whitelisted tool, current-user authorization, explicit confirmation and an immutable audit record with inputs, sources, tool call and result. It must not expose Code Vault payloads by default.
```

## Independent review prompt

```text
Act as an independent production reviewer. Do not edit code initially.

Use the code graph to trace every changed path from UI/API through domain service, database, outbox/job and external adapter. Compare it with AGENTS.md and the relevant roadmap work package.

Review specifically for: tenant escape, missing role checks, hardcoded/demo paths, unsafe secret/code logging, money precision, tariff snapshotting, double submit, missing idempotency, unknown external outcomes, retry loops, state-machine gaps, migration safety, N+1/heavy queries, stale UI state, missing loading/error/partial states, untested compensation, and release risk.

Return findings grouped as Blocker, High, Medium and Low. Each finding must contain exact file/line, exploit or failure scenario, desired behavior and minimal safe fix. If no blocker exists, list residual operational risks and exact tests still required before Stage.
```
