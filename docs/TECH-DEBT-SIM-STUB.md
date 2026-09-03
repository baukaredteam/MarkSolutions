# Tech debt: simulator / mock / StubPage

Inventory only (Agent R2). **No refactor plan.** Surfaces below are debt to **displace**, not keep as an MVP product path.

`HttpMptAdapter`, STAGE healthcheck scripts, and Vitest local `startMock()` servers are **not** this list: they are the replacement path or legitimate test doubles. CI stays on mock until a human-gated STAGE contract exists — flipping `.github/workflows/ci.yml` to `ADAPTERS_*=http` is **not** the displacement.

Snapshot: `chore/cursor-agent-factory` @ `2df8f3a`. Sources: `CONTEXT.md`, `docs/CONTRACT-IS-MPT.md`, `docs/INTEGRATIONS.md`, `docs/MPT-PHASE-B-READINESS.md`, `docs/agents/module-gap-matrix.md`, `docs/source/MARK_FLOW_*`. Replacement targets are only ports and docs that already exist — no invented vendor APIs.

## Phase legend

| Phase | Meaning |
| ----- | ------- |
| **A** | STAGE read-only (`docs/STAGE-MPT-READONLY-GET.md`). Human on VPS. Nest runtime may still be mock. |
| **B** | Mutating ИС МПТ after Harith «да» (`docs/MPT-PHASE-B-READINESS.md`). `ADAPTERS_MPT=http` + `HttpMptAdapter` on VPS. |
| **C** | НКТ (NTIN). Official NKT spec still expected (`CONTEXT.md`); port is `INktAdapter`. |
| **D** | 1С file/XML exchange (`ADR-010`; `docs/CONTRACT-1C.md` referenced, file absent). |
| **UI** | Real MarkFlow module pages displace `StubPage` / in-page placeholders. |
| **GS1** | GS1 Kazakhstan registry (ROADMAP Oct wave; same season as C). |
| **1ecom** | 1ecom.kz by contract (ROADMAP Nov; no public API today). |
| **W0** | Infra: OpenBao, MinIO — not A–D, banned in production (`AGENTS.md` §5). |

---

## 1. MPT mock / simulator emission

Default Nest path: `createMptAdapter` → `MockMptAdapter` unless `ADAPTERS_MPT=http`. Simulator is Prisma-backed and time-based (`status = f(now, createdAt, SIM_MPT_EMISSION_MS)`). Do not extend it (`docs/MPT-PHASE-B-READINESS.md`).

| Path / symbol | What it is today | Replaced by | Phase |
| ------------- | ---------------- | ----------- | ----- |
| `apps/api/src/integrations.ts` `MockMptAdapter` | In-process ИС МПТ simulator: `createOrder`, `getOrder`, `getCodes`, `submitUtilisation`, `getUtilisation`, `submitImport`, `submitWithdrawal`, `getDocument`. Fake 7-digit serials; gtin `999999` → quantity−1 test hook. | Same `IMptAdapter` methods on existing `HttpMptAdapter` (`apps/api/src/http-mpt.adapter.ts`) per `docs/CONTRACT-IS-MPT.md`. VPS: `ADAPTERS_MPT=http`, `MPT_BASE_URL=https://test.markirovka.kz`. | **B** (mutating). **A** already uses standalone GET scripts, not this class. |
| `apps/api/src/http-mpt.adapter.ts` `createMptAdapter` | `ADAPTERS_MPT === "http"` → `HttpMptAdapter`, **else** `MockMptAdapter`. | Explicit `ADAPTERS_MPT=http` on VPS/`NODE_ENV=stage`. Leave unset/mock only for local + CI. | **A** (if Nest should serve STAGE GET) / **B** (required before any POST). |
| `apps/api/src/app.module.ts` `MPT_ADAPTER` factory | Wires the factory above into Nest DI. | Same factory, env `http` on VPS. | **B** |
| `SIM_MPT_EMISSION_MS` (`MockMptAdapter.emissionMs`) | Fake emission delay (demo 45s, tests 50–100ms). | Real STAGE emission timing; knob unused when mock is off. | **B** |
| `UTIL_SLA_MS` / `DOC_SLA_MS` | Fake SUCCESS after 3s for utilisation / `doc/*`. | STAGE `getUtilisation` / document GET poll (`CONTRACT-IS-MPT`). | **B** |
| `packages/db/prisma/schema.prisma` `MptOrder` `MptCode` `MptUtilisation` `MptDocument` | Simulator-only persistence. `HttpMptAdapter` does not read these tables. | ИС МПТ as source of truth; MarkFlow keeps `Order` / `CodeVault` / `UtilisationReport` / `ImportDocument` / `WithdrawalDocument`. | **B** |
| `apps/api/src/outbox-poller.ts` comments + `sendToMpt` / `pollMptOrders` / `reconcileOrder` | Same poller; comments still say «симулятор». Behavior follows injected adapter. | Same poller + `HttpMptAdapter`; timeout → `UNKNOWN_RESULT` → GET reconciliation (no repeat POST). | **B** |
| `apps/api/src/document.service.ts` / `utilisation.service.ts` | Domain services that call `IMptAdapter` (comments: «симулятор»). | Unchanged ports; http adapter on VPS. | **B** |
| `apps/api/src/integrations.controller.ts` MPT row | `last: "Симулятор (ADR-005)"`, hardcoded `latencyP95: 820`. `mode` from env. | Copy + metrics from live `ADAPTERS_MPT=http` / Gateway; no fake p95. | **B** |
| `.env.example` `ADAPTERS_MPT="mock"` | Documented default = simulator. | VPS template `http` + STAGE creds (already commented). Dev/CI may stay mock. | **A**/**B** |
| `apps/api/src/config-validation.ts` adapters default `"mock"` | `buildAppConfig().adapters.mpt` defaults mock; prod/stage **reject** mock. | Fail-closed already; confirm `NODE_ENV=stage` on VPS process. | **A**/**B** |

Legitimate (keep, not displace): `apps/api/test/mpt-simulator.spec.ts` and other specs that pin `SIM_MPT_EMISSION_MS` / `ADAPTERS_MPT=mock`; `scripts/mpt-*-healthcheck.spec.ts` `startMock()` on `127.0.0.1`; `HttpMptAdapter.setFetch` unit fakes. `RUN_MPT_STAGE_CONTRACT` STAGE test stays human-opt-in, never CI.

---

## 2. StubPage / shell placeholders

`StubPage` in `apps/web/src/app.tsx` is a shell heading + violet «Stub» badge. It does not call the API or imitate ИС МПТ. Displacement = real module (domain service + Prisma + API + UI), not a prettier empty page. Canon: 16-module menu (`docs/source/MARK_FLOW_16_modules_exact_layout_v2.html`, `docs/agents/module-gap-matrix.md`).

### 2.1 Still `StubPage` — canon 16

| Path / symbol | What it is today | Replaced by | Phase |
| ------------- | ---------------- | ----------- | ----- |
| `apps/web/src/app.tsx` `StubPage` | Shared placeholder component. | Deleted once no route uses it. | **UI** |
| `MODULE_STUB_IDS` `search` → `/search` | Stub. Topbar Enter and dashboard quick-link land here. | **SEARCH** — `docs/source/MARK_FLOW_Глобальный_поиск_детальный_финальный.md`. `/codecheck` is a different real page (single-code lookup). | **UI** |
| `MODULE_STUB_IDS` `aggregation` → `/aggregation` | Stub. Prisma `AggregationUnit` / `AggregationMember` exist; no HTTP/UI. | **AGG** — `docs/source/MARK_FLOW_Агрегация_детальный_финальный.md`. | **UI** (physical flow; MPT aggregation API is out of current `IMptAdapter`) |
| `MODULE_STUB_IDS` `shipments` → `/shipments` | Stub. Dashboard CTA «Создать поставку». No `Shipment*` API. | **SHP** — `docs/source/MARK_FLOW_Поставки_детальный_финальный (1).md` + `doc/*` when STAGE allows. | **UI** + **B** |
| `MODULE_STUB_IDS` `production` → `/production` | Stub. No `Production*` models. | **PRD** — `docs/source/MARK_FLOW_Производство_детальный_финальный (1).md`. | **UI** |
| `MODULE_STUB_IDS` `warehouse` → `/warehouse` | Stub. **`defaultRoute` for role `warehouse`** (`apps/web/src/roles.ts`). | **WMS** — `docs/source/MARK_FLOW_Склад_и_ТСД_детальный_финальный.md`. | **UI** |
| `MODULE_STUB_IDS` `reports` → `/reports` | Stub. `UtilisationReport` is a marking document, not analytics. | **RPT** — `docs/source/MARK_FLOW_Reports_Analytics_Final.md` + 1С closing exports. | **UI** + **D** |
| `MODULE_STUB_IDS` `ai` → `/ai` | Stub. No assistant API. | **AI** — `docs/source/MARK_FLOW_AI_Assistant_Final.md`. | **UI** |
| `MODULE_STUB_IDS` `knowledge` → `/knowledge` | Stub. No Knowledge API. | **KB** — `docs/source/MARK_FLOW_Knowledge_Base_Final.md`. | **UI** |
| `MODULE_STUB_IDS` `settings` → `/settings` | Stub. Partial SET lives at `/integrations`. | **SET** — `docs/source/MARK_FLOW_Settings_Final.md` (org, warehouses, roles, adapter profiles). | **UI** |

### 2.2 Still `StubPage` — legacy UI-SPEC v4 (not in 16-nav)

| Path / symbol | What it is today | Replaced by | Phase |
| ------------- | ---------------- | ----------- | ----- |
| `LEGACY_STUB_IDS` `organization` → `/organization` | Stub «Организация и доступ». | SET org/users/roles tabs (same mockup as `/settings`). | **UI** |
| `LEGACY_STUB_IDS` `support` → `/support` | Stub «Поддержка». Not KB. | UI-SPEC §4.15 SUP or drop if KB covers it. | **UI** |
| `LEGACY_STUB_IDS` `partners` → `/partners` | Stub «Контрагенты». Outside canon-16. | UI-SPEC §4.21 if product keeps the screen. | **UI** |
| `LEGACY_STUB_IDS` `exceptions` → `/exceptions` | Stub «Центр исключений». | Fold into `/tasks` + `/operator` (already partial). | **UI** |
| `LEGACY_STUB_IDS` `health` → `/health` | Stub «Состояние платформы» (web). API `/health` is real liveness. | UI-SPEC §4.24 ops metrics, or drop in favor of `/ready`. | **UI** |
| `LEGACY_STUB_IDS` `processes` → `/processes` | Stub «Конструктор процессов». | **Do not build** — ТЗ removed the constructor (`module-gap-matrix.md`). Route is leftover shell. | **wontfix** |

### 2.3 Already displaced (not debt)

These routes are **not** `StubPage`: `/dashboard`, `/tasks`, `/products`, `/productDetail/:id`, `/orders`, `/labels`, `/documents`, `/operations`, `/operations/utilisation`, `/billing`, `/vault`, `/codecheck`, `/integrations`, `/operator`, `/audit`, `/login`. Depth may still be thin (gap matrix: HOME partial, TASK/OPS minimal).

### 2.4 In-page placeholders (real route, fake or empty slice)

| Path / symbol | What it is today | Replaced by | Phase |
| ------------- | ---------------- | ----------- | ----- |
| `apps/web/src/pages/balance.tsx` «Закрывающие документы» | Empty row: «эволюция тикета 05». | `POST /1c/export` ServiceAct + MovementJournal (`ADR-010`, CONTEXT). | **D** + **UI** |
| `apps/web/src/pages/balance.tsx` Kaspi button | Toast `Kaspi: оплата счёта … (мок)`. No bank adapter. | Bank/выписки (ROADMAP Oct). No API in repo — do not invent. | Oct / bank |
| `apps/web/src/pages/labels.tsx` printers | Hardcoded `Zebra ZT411 #1/#2`; client print queue. | PRINT device registry (`docs/source/MARK_FLOW_Печать_и_этикетки_детальный_финальный.md`). | **UI** |
| `apps/web/src/pages/code-check.tsx` camera | Toast «Камера … эволюция». | Scan / SEARCH integration. | **UI** |
| `apps/web/src/pages/login.tsx` ЭЦП | Toast «ЭЦП … фаза 3». | ЭДО/ЭЦП (ROADMAP Nov). | post-MVP |
| `apps/web/src/pages/product-detail.tsx` edit | Toast «Редактирование — эволюция (CAT-011)». | CAT versioned edit + **C** NKT register. | **UI** + **C** |
| `apps/web/src/pages/operator.tsx` KPIs | Two counters hardcoded `0`. | Onboarding + billing exception feeds. | **UI** |
| `apps/api/src/app.module.ts` `ProductsController.list` | `GET /api/products` → `{ items: [] }`. Real catalog is other controllers. | Remove leftover or point at catalog list. | **UI** |
| `apps/api/src/app.module.ts` `AdminController.probe` | `return { ok: true }`. | Production-forbidden pattern (`AGENTS.md` §5); real admin command or delete. | W0 |

---

## 3. NKT / GS1 / 1С / 1ecom mocks

`ADAPTERS_NKT` / `ADAPTERS_GS1` / `ADAPTERS_1ECOM` change **validation + `/integrations/status` badges only**. `app.module.ts` always binds `Mock*` — there is no `createNktAdapter` / HTTP class.

| Path / symbol | What it is today | Replaced by | Phase |
| ------------- | ---------------- | ----------- | ----- |
| `apps/api/src/integrations.ts` `MockNktAdapter` + `INktAdapter` | In-memory Map; `submitProduct` / `getStatus`; after `NKT_SLA_MS` (3s) → synthetic `ntin = 0{gtin}001`; hooks `nktResult=reject\|hang`. Wired `useClass: MockNktAdapter`. | HTTP adapter on the **same** `INktAdapter` port once the official NKT/KMT spec is in `docs/` (`CONTEXT.md`: «спеки ожидаются»). Do not invent endpoints. Outbox `nkt-register` already exists (`outbox-poller.ts` `processNkt`). | **C** |
| `NKT_SLA_MS` / `NKT_TIMEOUT_MS` | Mock SLA / timeout. | Real NKT status poll. | **C** |
| `apps/api/src/integrations.controller.ts` NKT row | `last: "SLA 3с (мок)"`. | Live NKT status copy. | **C** |
| `apps/api/src/integrations.ts` `MockGs1Adapter` + `IGs1Adapter` | Local `verifyGs1Mod10` only → `PENDING_REAL` / `REJECTED`. No registry. Always `useClass: MockGs1Adapter`. | GS1 Kazakhstan verify/register on the same port (`docs/INTEGRATIONS.md`). Keep mod10 as local pre-check (`packages/shared` `verifyGs1Mod10`). | **GS1** (Oct, with C) |
| `apps/api/src/seed.service.ts` `gtinCache` VERIFIED | Demo RAVENOL/codes_success seeded as verified. | Cache filled from real GS1 responses. | **GS1** |
| `apps/api/src/ecom.adapter.ts` `MockEcomAdapter` | First `verify(bin)` → `PENDING_EXTERNAL`; retry → `VERIFIED`; `listProducts()` = 8 hardcoded SKUs. Always mock. | 1ecom.kz by **contract** (ADR-004). `CONTEXT.md`: no public API — port + operator manual mode until the contract lands. | **1ecom** (Nov) |
| `apps/api/src/billing.service.ts` `importPayment` | Real JSON TOPUP by `ref1c` (not a stub). File multipart parser deferred (ADR-010). | Same idempotent core + file ingest per 1С contract. | **D** (transport) |
| `POST /1c/export` (CONTEXT / ADR-010 / ADR-025) | **Documented, not implemented.** No controller. `integrations` still shows `last: "Файлы v1 (ADR-010)"`, `mode` from unset `ADAPTERS_1C` → `"mock"`. `docs/CONTRACT-1C.md` **missing**. | Implement documented `POST /1c/export {dateFrom,dateTo}` → ServiceAct + MovementJournal CSV (`kmHash`, no full КМ). Then XML with the 1С integrator. | **D** |
| Bank adapter | **Absent.** Only Kaspi toast. No `ADAPTERS_BANK`. | Bank/выписки after a real spec. | Oct / bank |

---

## 4. CI and env pinned to mock

| Path / symbol | What it is today | Replaced by | Phase |
| ------------- | ---------------- | ----------- | ----- |
| `.github/workflows/ci.yml` `ADAPTERS_MPT: mock` | Entire `npm test` job forced onto the simulator. Also `MPT_BASE_URL: https://httpbin.org` (unused while mock). | **Keep mock in CI.** Never `ADAPTERS_MPT=http` in GitHub Actions (no STAGE accounts; `MPT-PHASE-B-READINESS.md`). Displacement is VPS/prod env, not this file. | keep (CI) / **B** (VPS) |
| `.github/workflows/ci.yml` `ADAPTERS_GS1/NKT/1ECOM: mock` | Pins display/validation env. DI is mock anyway. | Keep mock in CI until HTTP adapters + contract tests exist and are **opt-in**, not this job. | keep (CI) / **C**/**GS1**/**1ecom** (VPS) |
| `.github/workflows/ci.yml` `KMS_PROFILE: file` + `STORAGE_DIR` | File-KMS + local disk in CI. | Keep in CI. Prod: OpenBao + MinIO (`KMS_PROFILE=openbao`, no `STORAGE_DIR`). | keep (CI) / **W0** (VPS) |
| `validateProductionConfig` vs missing HTTP adapters | Prod/stage **reject** `ADAPTERS_GS1/NKT/1ECOM=mock`, but no HTTP implementations exist. | Adding `=http` without an adapter would still run `Mock*` (DI gap). Real HTTP classes on existing ports before any prod boot. | **C** / **GS1** / **1ecom** |

CI workflow `on.pull_request.branches` includes `main` and `chore/cursor-agent-factory` (so factory PRs get the mock CI job). Still never `ADAPTERS_MPT=http` in Actions.

---

## 5. Adjacent production-forbidden stubs (not A–D, still displace)

| Path / symbol | What it is today | Replaced by | Phase |
| ------------- | ---------------- | ----------- | ----- |
| `apps/api/src/kms.adapter.ts` `FileKmsAdapter` | Dev AES key file. CI/`.env.example` `KMS_PROFILE=file`. | OpenBao envelope (`KMS_PROFILE=openbao`). | **W0** |
| `apps/api/src/kms.adapter.ts` `VaultKmsAdapter` | Throws `OpenBao не подключён`. | Working OpenBao transit. | **W0** |
| `packages/shared/src/storage.adapter.ts` `LocalStorageAdapter` | Only storage impl; `STORAGE_DIR`. | MinIO/S3 adapter (env already validated; **no class**). | **W0** |
| `JwtModule` `JWT_SECRET ?? "dev-secret"` | Fallback secret. `.env.example` still `dev-secret`. | Required strong secret (already rejected in stage/prod). | **W0** |
| `apps/api/src/guards.ts` / `auth.service.ts` MFA | IAM-006 stub: `MFA_ENABLED=true` → 403 without a second factor. | Real MFA when SET/IAM ships. | **UI** / SET |

---

## 6. How not to read this file

- **Do not** treat the simulator as the production marking path. Demo semantics in `CONTEXT.md` describe the **current** mock, not the target.
- **Do not** extend `MockMptAdapter` / `SIM_MPT_*` / quantity−1 hooks for STAGE.
- **Do not** invent NKT, GS1, 1ecom, or bank URLs. Ports exist; official specs do not all exist.
- **Do not** flip CI to `ADAPTERS_*=http`.
- **Do not** delete `StubPage` in this inventory — replacement is the matching TZ module, phase **UI** (plus **B**/**C**/**D** when the module talks to a vendor).
