# Factory setup — Cursor Ultra

## OPS-02-filter-ci-fix (2026-09-06)

- [x] Hotfix after #27 merged with red CI: `GET /operations` re-binds `@Query type/status` (calling `this.list(req)` dropped Nest injection)
- [x] Invalid non-blank type/status → 400 + fieldErrors; type+status intersection; AT `ops-journal-filters.spec.ts`
- [ ] Merge — **запрещено** до «да» Harith. Draft PR only. No STAGE HTTP.

## OPS-02-journal-filters / MAR-8 (2026-09-06)

- [x] `GET /documents` + alias `GET /operations` — optional `type` (IMPORT|WITHDRAWAL|UTILISATION) and `status` (EXPECTED|SUBMITTED|IN_PROCESS|PARTIALLY_PROCESSED|SUCCESS|ERROR); 400 + fieldErrors on invalid
- [x] UI `docs.tsx`: type/status selects + deep-link query params; OPS-28 empty (journal or filter)
- [x] AT: `ops-journal-filters.spec.ts` + `docs.spec.tsx` (Prisma seed / mock-only, no STAGE HTTP)
- [x] #27 merged with red CI — follow-up `feature/OPS-02-filter-ci-fix`
- [ ] Merge hotfix — **запрещено** до «да» Harith. Draft PR only. No STAGE HTTP.

## HOME-03-recent-events / MAR-7 (2026-09-06)

- [x] `GET /dashboard/summary` — `recentEvents` (≤10) from Order / ProductCard / Import+Withdrawal+Utilisation / CodeEvent; newest first; tenant-scoped; KM mask only
- [x] HOME UI: «Последние события»; empty = «Нет событий»; no HOME-01/02 KPI rewrite
- [x] AT/unit: helpers + dashboard.spec + dashboard.spec.tsx; CI mock-only
- [ ] Merge — **запрещено** до «да» Harith. Draft PR only. No STAGE HTTP.

## HOME-02-ops-kpi / MAR-6 (2026-09-06)

- [x] `GET /dashboard/summary` — `operationsToday` / `operationsYesterday` / `operationsDeltaPct` / `operationsLast7d` from ImportDocument + Withdrawal + Utilisation + CodeEvent + Order (tenant-scoped, UTC day)
- [x] HOME UI: live «Операции сегодня» (+N% к вчера) and «Рабочая динамика» 7d bars; empty = 0 / «нет операций за сегодня» / chart «Нет данных»
- [x] AT/unit: helpers + dashboard.spec + dashboard.spec.tsx; CI mock-only
- [ ] Merge — **запрещено** до «да» Harith. Draft PR only. No STAGE HTTP.

## ORD-releaseMethodType (2026-09-06)

- [x] DTO + validation: PRIMARY|REMAINS|COMISSION|REMARK, default PRIMARY
- [x] Persist on Order + pass through poller createOrder input
- [x] HttpMptAdapter.createOrder body includes releaseMethodType (body only)
- [x] Web «Цель маркировки» radios → wire field
- [ ] Mutating STAGE — **запрещено**. This PR does not POST to test.markirovka.kz

## Factory Finn loop

Playbook: `docs/FACTORY.md`. Роли Chief / MS-PM (Linear|Notion, без Cloud Agents на код) / MS-Dev (один тикет → один draft PR в `chore/cursor-agent-factory`). Merge и STAGE POST — только после «да» Harith. Tip 2026-09-06: A read-only закрыта; #17 P0 safety влит; P2 STAGE-LK-FIELDS + GTIN-14 влиты; Phase B закрыта.

---

## P2-C ORD/CAT GTIN-14 (2026-09-03)

- [x] Order/catalog create: GTIN-14 only; 13-digit → `Длина должна быть равна 14`
- [x] Order create defaults `productGroup=autofluids`; UI МОД display; `.env.example` `MPT_BUSINESS_PLACE_ID=803` (not 36 / motor-oils)
- [ ] Mutating STAGE (`createOrder`) — **запрещено** до «да» Harith. This PR is DTO/UI/validation only.

---

## P2-D STAGE ЛК field inventory (2026-09-03)

- [x] `docs/STAGE-LK-FIELDS.md` — create-order steps, product-card fields, GTIN-14, МОД **803**, moderation gate, MarkFlow mapping
- [x] Pointers only: `docs/CONTRACT-IS-MPT.md`, `docs/MPT-PHASE-B-READINESS.md`, `CONTEXT.md`, `tasks/lessons.md`
- [ ] Mutating STAGE (`createOrder` / utilisation / doc) — **запрещено** до отдельного «да» Harith
- [ ] Этот файл не авторизует POST и не меняет wire-методы CONTRACT

## R1 — real-contour roadmap (2026-09-03)

- [x] PR `feature/R1-roadmap-real` → `chore/cursor-agent-factory` — https://github.com/baukaredteam/MarkSolutions/pull/18 (`docs/ROADMAP-REAL.md`, канон A→B→C→D). **squash-merged.**
- [x] Канон роадмапа = `docs/ROADMAP-REAL.md`, не архивный `docs/ROADMAP.md`

---

## R2 sim/mock/StubPage inventory (2026-09-03)

- [x] `docs/TECH-DEBT-SIM-STUB.md` — path → replaced-by → phase A/B/C/D (displace, not MVP)

---

## MPT P0 safety before Phase B (2026-09-01)

- [x] No mutating POST retry on 5xx/timeout/network (`MptUnknownResultError`)
- [x] Outbox UNKNOWN_RESULT → SENT + reconcile GET, not PENDING re-POST
- [x] `reconcileOrder`: no RELEASE while CREATED/PENDING; default timeout 30 min
- [x] Persist STAGE `orderId` → `Order.externalOrderId`; getOrder/getCodes use it
- [x] send path uses order `productGroup`/`businessPlaceId`; adapter default `autofluids`
- [ ] A4 P1 — **не** этот PR
- [ ] Mutating STAGE (`createOrder` / utilisation / doc) — **запрещено** до отдельного «да» Harith
- [x] `releaseMethodType` on createOrder body — CONTRACT PRIMARY\|REMAINS\|COMISSION\|REMARK, default PRIMARY (ORD-releaseMethodType). **Not** STAGE POST.

## MPT Phase B readiness A6 (2026-09-01)

- [x] `docs/MPT-PHASE-B-READINESS.md` — goal, hard rules, as-is vs to-be, Harith checklist, proposal only
- [x] Pointers: `tasks/lessons.md`, `docs/STAGE-MPT-READONLY-GET.md`, `docs/CONTRACT-IS-MPT.md`, comment-only in adapter/outbox
- [x] P0 code gaps closed in follow-up PR (see above)
- [ ] A4 P1 — **не** этот PR
- [ ] Mutating STAGE (`createOrder` / utilisation / doc) — **запрещено** до отдельного «да» Harith

## MPT GET contract audit A3 (2026-09-01)

- [x] `docs/MPT-GET-CONTRACT-AUDIT.md` — official GET vs `HttpMptAdapter` (no STAGE call, no mutating change)
- [x] Pointers: `docs/STAGE-MPT-READONLY-GET.md`, comment in adapter (query fact only)
- [x] A4 P0: parse `orderInfos.orderStatus` + `reportStatus`; `getCodes` official `orderId+gtin+quantity` + `codes[]` strings
- [ ] A4 P1: optional `productGroup` on getOrder; GET Content-Type; document status enum / errors GET
- [ ] Mutating STAGE / adapter POST — **запрещено** до отдельного «да»

## MPT GET /api/orders safe error (2026-09-01)

- [x] Script default `productGroup=autofluids` (KZ STAGE UI; not `category_autofluids_motor`; `motor-oils` is legacy)
- [x] Non-200 GET prints `path=` (path+query only) and `error=` (sanitized; tokens/KM → `redacted`)
- [x] Mock 400 `{ message: "productGroup required" }` → status/path/error, no secrets
- [x] GET sends `Content-Type: application/json` + `Accept: */*` (shared helper)
- [x] status≥400: `body_len=` `content_type=` `error=empty_body|non_json|<sanitized>`
- [x] `MPT_ORDERS_BARE=1` → official curl path `/api/orders` (no query)
- [x] sanitize also digs nested `error` object, `errors[]`, `errorCode`+`errorMessage`, RFC7807 title/detail
- [x] `globalErrors[].error` + `errorCode` → `error=No permission for operation (201)` (STAGE 74-byte body)
- [ ] Harith: pull, re-run get-orders — expect `error=No permission for operation (201)`. Real fix = STAGE ЛК permissions (`MARKING-CODE-ORDER.READ`), not query
- [x] Default path stays `?productGroup=autofluids` (bare vs pg irrelevant for this 400)
- [ ] `HttpMptAdapter` untouched this PR
- [ ] Mutating STAGE — **запрещено** до отдельного «да»

## MPT GET /api/orders productGroup (2026-09-01)

- [x] Script always sends `productGroup` (`MPT_PRODUCT_GROUP` / default now `autofluids`); optional `orderId`
- [x] Docs: empty `orderInfos` is 200; bare GET 400 on STAGE is the productGroup hunch
- [x] Mock tests: list `?productGroup=autofluids`; probe includes both; empty list `orders_count=0`
- [ ] Human on VPS re-check: `npm run mpt:get-orders-healthcheck` → report `status=` / `path=` / `error=` (and `orders_count=` if 200)
- [ ] `HttpMptAdapter.getOrder` still `?orderId=` only — out of this PR
- [ ] Mutating STAGE — **запрещено** до отдельного «да»

## MPT Phase 1 — read-only GET (2026-09-01)

- [x] Docs: `docs/STAGE-MPT-READONLY-GET.md` + pointers from healthcheck / `.env.example`
- [x] Scripts: `mpt:get-orders-healthcheck`, `mpt:get-codes-healthcheck`, `mpt:get-utilisation-healthcheck` (не в `npm test`/`verify`)
- [x] Shared helper `scripts/lib/mpt-auth-env.mjs` (reuse auth; no secret logs)
- [x] Mock tests on `127.0.0.1` (`scripts/mpt-readonly-get-healthcheck.spec.ts`)
- [ ] Human on VPS: A auth (`status=200`) → B `GET /api/orders?productGroup=` (был 400 на голом пути; ждать повтор) → C codes (`MPT_PROBE_ORDER_ID` READY/CLOSED) → D utilisation GET (`MPT_PROBE_REPORT_ID` existing). Report ok/fail + HTTP status only
- [ ] `?orderId=` vs CONTRACT — next fix-PR after human STAGE report; not this PR
- [ ] Mutating STAGE (createOrder / utilisation / doc) — **запрещено** до отдельного «да»
- [ ] `NODE_ENV=stage` fail-closed (OpenBao/etc) — не этот PR

## MPT auth healthcheck (2026-08-31)

- [x] `scripts/mpt-auth-healthcheck.mjs` + `npm run mpt:auth-healthcheck` (auth-only; не в `npm test`/`verify`)
- [x] Mock tests on `127.0.0.1` (`scripts/mpt-auth-healthcheck.spec.ts`)
- [x] Docs: `docs/STAGE-MPT-HEALTHCHECK.md` + pointer in `.env.example`
- [x] Human on VPS: source `~/.config/marksolutions/mpt.env` → run script → `status=200`
- [ ] Mutating STAGE (createOrder / utilisation / doc) — **запрещено** до отдельного «да»

## Factory PRs (2026-08-31)

- [x] PR #3 Architect — `docs/agents/module-gap-matrix.md` — **squash-merged** into `chore/cursor-agent-factory`.
- [x] PR #4 UI-Shell — `feature/ui-shell-16-modules` — **squash-merged** into `chore/cursor-agent-factory`.
- [x] PR #5 Catalog-Orders — `feature/catalog-orders-skeleton` — **squash-merged** into `chore/cursor-agent-factory`.
- [x] PR #6 MS-Reviewer docs close-out — **squash-merged** into `chore/cursor-agent-factory`.
- [x] PR #7 HOME-01 + dark navy sidebar — **squash-merged** into `chore/cursor-agent-factory`.
- [x] PR #8 TASK minimal — **squash-merged** into `chore/cursor-agent-factory` (sha 754970f).

## OPS journal slice (2026-08-31)

- [x] `/operations` — real journal (reuse `docs.tsx`), not StubPage; `/documents` same page (no second journal)
- [x] `GET /operations` alias of tenant-scoped `GET /documents` (import + withdrawal + utilisation)
- [x] `utilisation-form.tsx` routed at `/operations/utilisation`; link from journal
- [x] Honest tenant-isolation AT: `apps/api/test/ops-journal-tenant-isolation.spec.ts`
- [ ] Full OPS-01…29 (create wizard, DT, act of acceptance AT-14, bulk, aggregation-from-journal) — out of slice
- [x] Draft PR `feature/ops-journal-slice` → `chore/cursor-agent-factory` — https://github.com/baukaredteam/MarkSolutions/pull/9 opened, **do not merge**

## Статус: done (2026-08-31)

- [x] 1. Структура: `tasks/`, `.cursor/rules/`, `.cursor/skills/`, `docs/agents/`
- [x] 2. Переписать `AGENTS.md` (Cursor Ultra + Grok Bot, без OpenCode)
- [x] 3. Rules `00`–`04`
- [x] 4. Skills (project-local SKILL.md + `markirovka-integration`; npx отложен — нет Node)
- [x] 5. Память: `tasks/todo.md` + `tasks/lessons.md`
- [x] 6. `.cursorignore`
- [x] 7. Шапка `CONTEXT.md`
- [x] 8. Хендофф в чате: файлы, ручные команды, чеклист первой задачи

Не делалось (намеренно): docker/prod, commit, npx skills, Compound plugin install, agentmemory.
