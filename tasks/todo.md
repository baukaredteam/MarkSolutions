# Factory setup — Cursor Ultra

## MPT GET contract audit A3 (2026-09-01)

- [x] `docs/MPT-GET-CONTRACT-AUDIT.md` — official GET vs `HttpMptAdapter` (no STAGE call, no mutating change)
- [x] Pointers: `docs/STAGE-MPT-READONLY-GET.md`, comment in adapter (query fact only)
- [ ] A4 (separate PR): P0 parse `orderInfos.orderStatus` + `reportStatus`; `getCodes` official `orderId+gtin+quantity` + `codes[]` strings
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
