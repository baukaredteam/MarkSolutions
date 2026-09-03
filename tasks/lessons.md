# Lessons

## 2026-09-03 — P2-C: STAGE GTIN is 14 digits; ТГ autofluids; МОД 803 in env only

- STAGE ЛК GTIN is 14 digits (`04650063110374`). Reject 13 with `Длина должна быть равна 14`; do not silently pad unless checksum-proven.
- Catalog tariff group `motor-oils` ≠ STAGE `productGroup=autofluids`. Persist autofluids on order create so a later human «да» is not blocked by the wrong ТГ.
- МОД default 803 belongs in `.env.example` / tenant-or-order field, not hardcoded in `http-mpt.adapter.ts`. This PR does not call STAGE and does not change POST retry.

## 2026-09-03 — STAGE ЛК recon: МОД 803, GTIN-14, published card before createOrder

- Default `MPT_BUSINESS_PLACE_ID=803` (Хранение, Астана/Есиль). Legacy env `36` is wrong; healthcheck docs still mention it.
- UI product group «Смазочные материалы и специальные жидкости» = wire `autofluids`. Category `category_autofluids_motor` is not `productGroup`.
- Create-order GTIN field is exactly 14 chars; pad 13 with a leading zero. Lookup fails until the product card is **Опубликованные** (UI has «Отправить на модерацию», not Publish). Block MarkFlow createOrder until that gate.
- Do not invent ИС МПТ lookup/publish endpoints. Wire stays `docs/CONTRACT-IS-MPT.md`. This recon is not Harith «да» for POST. Inventory: `docs/STAGE-LK-FIELDS.md`.

## 2026-09-03 — Factory PRs need `chore/cursor-agent-factory` on CI pull_request

- `ci.yml` used to trigger only on PRs into `main`, so factory PRs reported zero checks. Adding the factory branch to `on.pull_request.branches` is what makes “wait for green CI then merge” possible. Still mock-only; never `ADAPTERS_MPT=http`.

## 2026-09-03 — Real-contour roadmap is a new file, not a rewrite of W1–W4

- Canon for the live contour is `docs/ROADMAP-REAL.md` (A read-only → B mutating after Harith «да» → C NKT → D 1С). `docs/ROADMAP.md` stays archive (OpenCode W1–W4 + sim). Do not keep adding sprint weeks or «к 01.02.2027 сдаём» as product dates; 01.02.2026 / 01.02.2027 are regulatory anchors in RULES-MM, not MarkFlow delivery.
- Horizons (GS1 api11.gs1.kz, NKT, 1С, Markmobile, ЭДО, РФ) are sequenced, not parallel, and never instead of MPT. Sim/StubPage are debt to displace with Http MPT / real modules — do not expand them as the goal. P0 safety is PR #17 (code, rebased after #18+#19); a docs PR does not merge it.

## 2026-09-01 — P0 before Phase B: UNKNOWN_RESULT, not re-POST

- Mutating POST (orders/utilisation/import/withdrawal) must not retry on 5xx/timeout/network. GET still may. 401 refresh replay of the same request is not a retry loop.
- Outbox `send-order-to-mpt` after first createOrder attempt: PROCESSED or FAILED, never PENDING. Unknown → SENT + GET `reconcileOrder`.
- Do not RELEASE because age>timeout while STAGE status is CREATED/PENDING. Default `MPT_ORDER_TIMEOUT_MS` = 30 min. RELEASE on REJECTED, or aged + proven absent (`found===false` and stored STAGE id).
- Persist STAGE `orderId` on `Order.externalOrderId`. Adapter default `MPT_PRODUCT_GROUP=autofluids`. Catalog tariff group `motor-oils` is not the STAGE ТГ.
- Still no STAGE call and no Harith «да» for Phase B mutating. `releaseMethodType` and utilisation Idempotency-Key are follow-ups. Prep-only rebase/merge of #17 is not authorization for STAGE POST.

## 2026-09-01 — A6 Phase B prep is docs, not the first POST

- Phase A ended on empty cabinet (GET orders 200, `orders_count=0`). First mutating after Harith «да» is almost certainly `createOrder` qty=1, not utilisation.
- As-is already sends `Idempotency-Key=orderId` on HTTP createOrder, but `request()` retries 5xx/timeout on POST and `sendToMpt` leaves outbox PENDING → another POST. Gate is UNKNOWN_RESULT → GET reconcile; do not implement that in a docs PR.
- `reconcileOrder` RELEASE on `MPT_ORDER_TIMEOUT_MS` default 60s _before_ treating READY — too short for STAGE. Raise env on VPS before «да»; do not RELEASE while GET is CREATED/PENDING.
- `createOrder` drops STAGE `orderId`; poller does not pass `productGroup`/`businessPlaceId` (adapter default `motor-oils`). Document only. No A4 P1, no sim expand, no STAGE call.

## 2026-09-01 — A4 P0: parse official GET bodies, do not invent quantity on list

- `getOrder` status from `orderInfos[].orderStatus` (match orderId or single entry); Http `quantity` is always 0 — poller already sums OrderLine. `getCodes` port is `{orderId,gtin,quantity,lastPackId?}` → `{codes:string[],packId?}`; parse ADR-006 before `vault.ingest`. `getUtilisation` prefers `reportStatus`, one fallback to `status`. No STAGE, no POST, no sim emission change.

## 2026-09-01 — Phase A3 is GET audit docs, not adapter rewrite

- Official GET /api/orders query params are all optional (`orderId`, `productGroup`, `cursor`/`limit` = «Нет»). Do not invent required cursor/limit. STAGE list 200 (issuer + `productGroup=autofluids`) is practice, not a spec mandate.
- Adapter `getOrder` still `?orderId=` only and reads root `status`/`quantity`; official body is `orderInfos[].orderStatus` (no quantity on list). `getCodes` official requires `gtin`+`quantity`; adapter sends only `orderId` and maps object codes vs official `string[]`. `getUtilisation` reads `status`, official field is `reportStatus`.
- A4 = those three P0 parses/queries only. Shared `request()` omits Content-Type on GET (healthcheck sends it). Do not change POST / simulator / STAGE scripts in the audit PR.

## 2026-09-01 — GET /api/orders 400 globalErrors errorCode 201 is permission

- Harith body (74 bytes): `{"globalErrors":[{"error":"No permission for operation","errorCode":201}]}`. Auth 200; same 400 on bare and with productGroup. Not a query bug.
- Official API needs `MARKING-CODE-ORDER.READ` and/or `MARKING-CODE-CONTRACTOR-ORDER.READ`. Fix STAGE ЛК permissions + ТГ connected. Do not keep changing query params.
- Sanitizer missed `globalErrors[].error` (looked for errorMessage/message/field). Print `error=No permission for operation (201)`. Agents still do not call STAGE.

## 2026-09-01 — STAGE 400 is ~74-byte JSON; nested error object likely

- Harith matrix: A/B with productGroup and C/D bare (with/without Content-Type) all `status=400` `content_type=application/json` `body_len=74`. Query and Content-Type do not change outcome.
- Earlier missing `error=` was not empty body — JSON parsed but `sanitizeMptError` returned null (top-level `error` as object, or other nested shape). Dig `error.message` / `error.errorMessage` / `errors[]` / `errorCode`+`errorMessage` / RFC7807 `title`/`detail`.
- Do not flip default path to bare until Harith pastes keys=/body= of that 74-byte JSON. Agents still do not call STAGE.

## 2026-09-01 — STAGE GET /api/orders 400 had empty/non-JSON body

- Harith after safe-error PR: `status=400` + `path=/api/orders?productGroup=autofluids`, **no** `error=`. That means `result.json` was null (empty body or parse fail) — sanitize correctly stayed silent.
- Official table: all GET /api/orders query params optional; example curl is bare `/api/orders`; request lists `Content-Type: application/json` on this GET. 400 = missing/invalid param; 406 empty = Accept (we already send `*/*`).
- Next probe: send `Content-Type: application/json` on shared GET helper; on ≥400 always print `body_len=` / `content_type=` / `error=empty_body|non_json|<excerpt>`. Optional `MPT_ORDERS_BARE=1` matches official curl. Never dump body. Adapter still untouched.

## 2026-09-01 — STAGE GET /api/orders 400: show sanitized error, use autofluids

- After PR #12 (`productGroup` on GET) Harith still got `status=400` on empty cabinet. Script discarded the STAGE body, so we could not see why.
- Print `path=` (path+query only) on non-200 GET and one `error=` line from JSON (`globalErrors`/`error`/`message`/…). Never raw JSON, tokens (`eyJ`, `accessToken`, `refreshToken`, `Bearer `), or full KM — then `error=redacted`.
- KZ STAGE UI: product group code is `autofluids`, category is `category_autofluids_motor`. Do not send the category as `productGroup`. Script default `motor-oils` (and adapter `.env.example` default) is legacy/wrong for KZ motor oils. Adapter left unchanged this PR.
- Agents still do not call STAGE. Harith: pull, re-run get-orders, return only `status=` / `path=` / `error=`.

## 2026-09-01 — STAGE GET /api/orders 400 on empty cabinet: send productGroup

- Harith: auth healthcheck `200`, get-orders `400`, кабинет без заказов. Ожидание — `200` + `{ orderInfos: [] }`.
- Официальная таблица помечает `productGroup` как необязательный («Нет»). **Hunch:** STAGE/xTrace всё равно 400 без него (как Accept). Не выдумывать другие query; слать только `productGroup` из `MPT_PRODUCT_GROUP` (default `motor-oils`) и опционально `orderId`.
- Пустой `orderInfos` — валидный 200, не баг. Адаптер `getOrder` в этом PR не трогали.
- Агенты STAGE не вызывают; перепроверка только человеком на VPS (`status=` / `orders_count=`).

## 2026-09-01 — MPT Phase 1 is docs + mock GET probes, not STAGE

- Harith: фаза 1 = read-only GET docs/план, агент STAGE не вызывает. Mutating (createOrder, POST utilisation, doc/*) ждёт отдельное «да».
- `HttpMptAdapter.getOrder`/`getCodes` шлют `?orderId=`; CONTRACT для списка заказов пишет `cursor`/`limit`, не этот query. Не «чинить» адаптер вызовом STAGE — задокументировать, ждать отчёт человека (400/404 возможен).
- Пробы: auth как healthcheck (`Accept: */*`, JSON login/password), затем один GET. Stdout `status=<http>`; для codes только `codes_count`; для utilisation только CONTRACT `report_status` (`other` если иное). Никогда body / token / KM / `rejectReason`.
- Env имён для человека: `MPT_PROBE_ORDER_ID`, `MPT_PROBE_REPORT_ID` (+ существующие `MPT_*`). Не в `npm test`/`verify`.

## 2026-08-31 — MPT auth healthcheck is human-on-VPS, not agent-on-STAGE

- Script may target STAGE when a human sources `~/.config/marksolutions/mpt.env`. Agents/CI must not HTTP-call markirovka; tests bind `127.0.0.1` and fail if a test URL hostname is `markirovka.kz`.
- Stdout is one line (`status=200|401|network` or `missing env`). Never print body, tokens, password, or which env key is missing.
- Do not wire `mpt:auth-healthcheck` into `npm test` / `verify` — CI has no credentials. Auth-only: no GET codes, utilisation, refresh, doc/*.

Цикл: после любой правки пользователя — одна запись сюда. Коротко: что сломалось / что поправили / как не повторять.

## 2026-08-31 — OPS journal already existed under /documents

- Gap matrix row 8 said `/operations` = StubPage. On factory after UI-shell/HOME it was a **redirect** to `/documents`; `docs.tsx` already listed import + withdrawal + utilisation via `GET /documents`. Fold into `/operations` (same component), do not duplicate two journals.
- Isolation AT must seed Prisma rows for **all three** types and assert tenant B list does not contain tenant A ids. Existing `documents.spec.ts` GET only checks types for one tenant.
- Do not add mutating ИС МПТ/STAGE for a journal slice: reuse `document.service.list` + existing utilisation POST. Wire `utilisation-form.tsx` as a route wrapper, do not rebuild the form.

## 2026-08-31 — TASK minimal: KPI source ≠ HOME-01 composite

- HOME-01 KPI «Требуют внимания» был суммой exceptions+ДТ+дедлайн+карточки без GTIN. TASK slice меняет **только число KPI** на `openTasks` (проекция Outbox FAILED + UtilisationAlert). Коды без нанесения остаются на карточке «Кодов в работе».
- Tenant AT для задач должен бить в HTTP list/create и `openTasks` другого tenant, не в отсутствие маршрута (404) и не в soft `toBeDefined()`. PR #5: false-green isolation недопустима.
- Materialize на GET/POST `/tasks` и на `dashboard.summary` — иначе KPI=0, пока никто не открыл Центр задач.

## 2026-08-31 — UI canon is the 16-module MARK FLOW mockup

- Visual contract = **manager 16-module MARK FLOW**, не старый v4-прототип (23 экрана, grouped nav).
- Канон: `docs/source/MARK_FLOW_16_modules_exact_layout_v2.html` (`openM(0)`…`openM(15)`, HOME-01), `docs/source/MarkSolutions_Detailed_Mockups_Final (1).md`, `docs/source/MarkSolutions_Detailed_Mockups_v2.html`, `docs/source/MARK_FLOW_Главная_финальная_v3.md`.
- Архив (не вести новый UI): `docs/ui-reference.html` + `docs/UI-SPEC.md` (v4, 2026-08-11).
- PR #4 уже выровнял `apps/web` nav на 16-модульный канон.

## 2026-08-31 — Factory review round (A → B+C → D)

- Оркестрация: **A** (Architect, docs-only gap matrix) → **B+C** параллельно (UI-Shell vs Catalog-Orders, без пересечения `apps/`) → **D** (MS-Reviewer: комментарии, без merge). Harith мержит, не ревьюер.
- Ревьюер не «чинит» чужие PR. Findings — только GitHub-комментарий. Свой PR — только `tasks/*`.
- `volumeL?: number` в CAT DTO — литры (физический объём), не деньги. Float-money stop-rule не применять, пока поле не идёт в биллинг/резерв.
- Tenant-isolation AT должен бить в tenant-check, не в более раннюю валидацию. `fixTnved` режет out-of-list ТНВЭД (`2710198100`) до `findFirst({ tenantId })` — тест зелёный даже без изоляции. Для mutate-AT слать in-list код (`2710198200`) и проверять, что чужой draft не изменился.
- Два Nest-инстанса `ModerationService`/`GtinResolver` (CatalogModule vs AppModule) — follow-up на `ModerationModule`, не stop-rule, пока оба ходят в Prisma с `tenantId`.
- Gap-matrix пути стареют в тот же час, когда UI-Shell меняет маршруты (`/codecheck` → `/search`, `/operations` → `/documents`). Снимок = SHA factory; после merge B матрицу A надо ребейзить или пометить superseded.

## 2026-08-31 — Cursor factory bootstrap

- На этом VPS нет Node/npm: `npx skills add …` и полный Archify renderer недоступны. Skills вендорены как `SKILL.md`; полный Archify/compound — ручная установка человеком после Node.
- Не ставить agentmemory/ai-memory без спроса. Файловая память = `tasks/todo.md` + этот файл.
- Windows-путь `C:\Users\Бауыржан\Desktop\MarkFlow` агенту недоступен: человек кладёт ТЗ/мокапы в `docs/source` или `fixtures`.
