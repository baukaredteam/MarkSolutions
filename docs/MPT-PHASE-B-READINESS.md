# Phase B readiness — first real STAGE mutating (prep only)

Документ **A6 / Prep-B** + **P0 safety PR** (code). Это **не** разрешение на POST. Агенты, CI и этот PR **не** вызывают `test.markirovka.kz` / `prod.markirovka.kz`.

P0 code gaps (retry POST / outbox re-POST / false RELEASE / dropped STAGE orderId / default `motor-oils`) addressed in the follow-up PR on factory after `#16` / `2df8f3a`. Behavior: timeout/uncertain POST → `UNKNOWN_RESULT` → GET reconcile; never blind re-POST.

Источники: `docs/CONTRACT-IS-MPT.md`, `docs/MPT-GET-CONTRACT-AUDIT.md` (A3 + A4 P0), `AGENTS.md` §5, ADR-024 в `docs/DECISIONS.md`, код на factory `2df8f3a` + P0 safety PR.

Phase A (read-only, человек на VPS): **auth 200**, **GET /api/orders 200** `orders_count=0` на issuer + `productGroup=autofluids`. A5 не форсировали: кабинет пустой. Mutating — только после явного «да» Harith.

---

## 1. Goal of Phase B

Один **утверждённый узкий** mutating-кейс на STAGE **после** Harith «да». Не выбирать метод в этом PR.

Кандидаты (Harith выбирает):

| Option                                                                                                                            | Когда имеет смысл                             | Сейчас (пустой кабинет)                                          |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| **A. `createOrder` tiny qty** (`POST /api/orders`, qty=1, `productGroup=autofluids`, `cisType=UNIT`, `serialNumberType=OPERATOR`) | Нет существующих READY/CLOSED заказов         | **Вероятный первый шаг после «да»** — иначе нечего наносить      |
| **B. Utilisation существующих кодов** (`POST /api/utilisation` + poll `GET /api/utilisation/<reportId>`)                          | Есть коды в кабинете / Vault со статуса READY | **Недоступно:** A5 не делали, `orders_count=0`, probe C/D без id |

После выбранного POST — только **GET** сверка (`GET /api/orders`, при READY — `GET /api/codes`). Не close, не `doc/*`, не печать, не второй POST.

---

## 2. Hard rules

- **Ни агент, ни CI** не делают STAGE mutating. Скрипты `mpt:*` не в `npm test` / `verify`.
- **Никакого POST** на STAGE, пока Harith не напишет «да» на конкретный метод + qty + GTIN + МОД.
- **Idempotency-Key** на `POST /api/orders` = MarkFlow `orderId` (ADR-024 / AT-07). Другой ключ — только если задокументирован до «да».
- **Timeout после mutating** → внутренний `UNKNOWN_RESULT` → **RECONCILIATION** через GET. **Запрещён** слепой повторный POST до сверки (`AGENTS.md` §5).
- **RESERVE / SETTLE / RELEASE** остаются в ledger MarkFlow (`BillingService`). ИС МПТ не списывает тенге MarkFlow.
- **Полные КМ не в логах / UI / APM** — маска (`VaultService.maskOf`). Секреты (`MPT_PASSWORD`, токены) не в репо и не в stdout.

---

## 3. As-is vs to-be

| Concern                                              | As-is in code (`file:symbol`)                                                                                                                                                                                                                                                                         | To-be for B                                                                                                                                                                              | Gap                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Idempotency-Key on createOrder HTTP**              | `HttpMptAdapter.createOrder` шлёт `Idempotency-Key: input.orderId` (`apps/api/src/http-mpt.adapter.ts:createOrder`). `OrderService.create` требует клиентский header; в БД это `order.idempotencyKey`; на провод МПТ уходит **`order.id`**, не клиентский ключ. ADR-024: «Idempotency-Key = orderId». | Один стабильный ключ = MarkFlow `order.id` на каждом POST `/api/orders`. Повтор с тем же ключом не создаёт второй заказ на STAGE.                                                        | **Малый.** Ключ на HTTP уже есть. Нужно не сменить его «на всякий случай». Клиентский Idempotency-Key ≠ STAGE key — это ок, если не путать.                                                                                                                                                                                    |
| **Retry / backoff on 5xx**                           | `HttpMptAdapter.request`: GET 5xx/504/network ретраятся до `MPT_MAX_RETRIES`. Mutating POST (`createOrder` / `submitUtilisation` / `submitImport` / `submitWithdrawal`) — **один** attempt; timeout/5xx/network → `MptUnknownResultError` (`unknownResult`). 4xx → `MptPermanentError`.               | После **первого** mutating POST, который оборвался (timeout/5xx), **не** ретраить POST. Статус `UNKNOWN_RESULT`, сверка GET. Retry GET — да.                                             | **Closed in P0 safety PR.** Idempotency-Key на createOrder по-прежнему = MarkFlow `order.id`.                                                                                                                                                                                                                                  |
| **401 refresh**                                      | `request`: ровно один `refresh()` на 401, затем повтор **того же** запроса (тот же body + Idempotency-Key). Второй 401 → `MptPermanentError`. `ensureToken` / `refresh` — `apps/api/src/http-mpt.adapter.ts`.                                                                                         | Оставить один refresh. Повтор после refresh допустим (тот же operation + key). Не логировать токен.                                                                                      | **Ок для B.** Refresh — POST `/api/users/tokens/refresh`, не заказ.                                                                                                                                                                                                                                                            |
| **Outbox `send-order-to-mpt`**                       | `sendToMpt`: success → PROCESSED + SENT + persist `externalOrderId`. Permanent → FAILED + задача. UNKNOWN_RESULT → PROCESSED + `payload.unknownResult` + SENT (не PENDING). Дальше только `reconcileOrder` / GET.                                                                                     | После первой попытки POST: PROCESSED _или_ `UNKNOWN_RESULT` (не PENDING). Дальше только `reconcileOrder` / GET.                                                                          | **Closed in P0 safety PR.**                                                                                                                                                                                                                                                                                                    |
| **`reconcileOrder` + getOrder / getCodes (post-A4)** | `createOrder` returns STAGE `orderId`; `Order.externalOrderId` persisted; `getOrder`/`getCodes` use `externalOrderId ?? order.id`. `sendToMpt` passes order `productGroup` / `businessPlaceId` when set; adapter default `MPT_PRODUCT_GROUP` = **`autofluids`**. `getOrder` also returns `found`.     | Сверка **до** любого повторного POST. Маппить STAGE `orderId` из ответа create. `getOrder` query `productGroup` — A4 **P1**.                                                             | **P0 closed** (orderId + autofluids + send fields). `releaseMethodType` в теле create **нет** — follow-up, not this PR.                                                                                                                                                                                                        |
| **Utilisation poll `reportStatus`**                  | `UtilisationService.pollReports` → `reconcile` → `mpt.getUtilisation` (A4: `reportStatus`, fallback `status`). SUCCESS → SETTLE + коды `UTILISED` + `releaseOn` в одной tx.                                                                                                                           | Poll только после успешного POST + сохранённого `reportId`. Не считать «готово» по факту POST.                                                                                           | **GET-сторона ок (A4).** Submit **не** готов: `UtilisationService.submit` зовёт `mpt.submitUtilisation` **синхронно в HTTP**, не через outbox. HTTP POST **без** Idempotency-Key; `operationId` = `util-${Date.now()}`. `sntins` = **serial**, не полный КМ (комментарий адаптера). Кабинет пуст → utilisation не первый кейс. |
| **RELEASE on timeout / reject**                      | READY/CLOSED first. `REJECTED` → RELEASE. Aged + `found===false` + stored STAGE id → FAILED + RELEASE. CREATED/PENDING even if `age > timeout` → wait, no RELEASE. Default `MPT_ORDER_TIMEOUT_MS` = **30 min** (`DEFAULT_MPT_ORDER_TIMEOUT_MS`).                                                      | RELEASE только если сверка доказала REJECTED / нет заказа на STAGE. Не RELEASE, пока GET показывает CREATED/PENDING.                                                                     | **Closed in P0 safety PR.**                                                                                                                                                                                                                                                                                                    |
| **Dual `ADAPTERS_MPT=http` vs mock**                 | `createMptAdapter`: `ADAPTERS_MPT === "http"` → `HttpMptAdapter`, иначе `MockMptAdapter` (`http-mpt.adapter.ts:createMptAdapter`, `app.module.ts`). CI/тесты пинят `ADAPTERS_MPT=mock`.                                                                                                               | VPS API: только `http` + `MPT_BASE_URL=https://test.markirovka.kz`. CI: **никогда** `http` (нет учёток, нельзя стучать в STAGE). Не путать mock-эмиссия с STAGE.                         | **Операционный.** Полллер-комменты ещё говорят «симулятор». Случайный `ADAPTERS_MPT=http` в CI или `mock` на VPS — разный класс аварии.                                                                                                                                                                                        |
| **`NODE_ENV=stage` fail-closed**                     | `validateProductionConfig` (`config-validation.ts`): `NODE_ENV` `production` **или** `stage` отвергает `ADAPTERS_*=mock`, `KMS_PROFILE=file`, `JWT_SECRET=dev-secret`, `STORAGE_DIR`, пустые MPT creds. `test`/`development`/unset — **не** проверяет.                                                | Процесс API на VPS, который может POST: `NODE_ENV=stage` (или `production`) + OpenBao + `ADAPTERS_MPT=http`. Healthcheck-скрипты — отдельный Node, не Nest; fail-closed их не закрывает. | **Процесс.** Если API на VPS запущен с пустым/`development` NODE_ENV — mock допустим валидатором. Для B: подтвердить env процесса, не только `mpt.env` скриптов.                                                                                                                                                               |

Другие факты (не чинить здесь): `createOrder` не шлёт `releaseMethodType`; 4xx excerpt в `MptPermanentError` режет JSON до 200 символов — теоретический риск КМ на utilisation 4xx; `submitImport` / `submitWithdrawal` без Idempotency-Key, operationId у withdrawal = timestamp.

---

## 4. Pre-flight checklist for Harith (human)

Перед «да» — всё отмечено человеком на VPS. Агент пункты не выполняет и STAGE не зовёт.

- [ ] Роль **issuer** на STAGE ещё действует (тот же кабинет, что дал GET orders 200).
- [ ] Права заказа: `MARKING-CODE-ORDER.CREATE` (+ READ / ADMINISTRATION для сверки и кодов).
- [ ] Товарная группа подключена: **`autofluids`** (не `category_autofluids_motor`, не legacy `motor-oils`).
- [ ] Повторный read-only: `npm run mpt:auth-healthcheck` → `status=200`; `npm run mpt:get-orders-healthcheck` → `status=200` (пустой список ок).
- [ ] **`businessPlaceId` / МОД** подтверждён в ЛК (в env скриптов было `MPT_BUSINESS_PLACE_ID=36` — сверить с ЛК, не из этого файла).
- [ ] Баланс / тариф ИС МПТ в кабинете позволяет **1** код; тариф MarkFlow seeded (`BillingService.activeTariff`).
- [ ] Карточка tenant с валидным GTIN (та же ТГ `autofluids`); qty=1 проходит `1 ≤ quantity ≤ places×unitsPerPlace`.
- [ ] На VPS API: `ADAPTERS_MPT=http`, `MPT_BASE_URL=https://test.markirovka.kz`, `MPT_PRODUCT_GROUP=autofluids`. **CI без `ADAPTERS_MPT=http`.**
- [ ] Процесс Nest: `NODE_ENV=stage` (fail-closed), не `development` с молчаливым mock.
- [ ] `MPT_ORDER_TIMEOUT_MS` на VPS **≫** ожидаемой эмиссии STAGE (код default 30 min; не ставить 60s).
- [ ] Ledger: достаточно available для RESERVE 1×тариф; RESERVE/SETTLE не путать с оплатой ИС МПТ (`isPaid=true` на проводе).
- [ ] Выбран **один** mutating-метод (см. §1). Рекомендация при пустом кабинете: **createOrder qty=1**. Utilisation — только если уже есть коды.
- [ ] Зафиксированы: GTIN, qty (**1**), `releaseMethodType` (предложение: `PRIMARY` — в коде сейчас **не** уходит; решить до «да», не в этом PR).
- [ ] Runbook застрявшего заказа (человек, без второго POST):
  1. Не повторять `POST /api/orders`.
  2. `GET /api/orders?productGroup=autofluids` (и/или `orderId=`).
  3. Если CREATED/PENDING — ждать; не RELEASE в MarkFlow вручную «на всякий случай».
  4. Если READY — `GET /api/codes` (маска/count only); сверить Vault.
  5. Если пусто и timeout локальный — сверка, задача оператору; повторный POST только после доказательства «заказа нет» + новое «да».
- [ ] Секреты только в `~/.config/marksolutions/mpt.env`. В отчёт — `status=` / `orders_count=` / `codes_count=`, не body / token / KM.
- [ ] Окно: один заказ, один человек, API не под параллельным create с тем же ключом.

---

## 5. Recommended first mutating slice (proposal only)

**Не авторизовано.** После «да» на **createOrder**: в MarkFlow создать заказ qty=**1** (UNIT / OPERATOR / `autofluids` / подтверждённый МОД) → outbox `send-order-to-mpt` → **один** `POST /api/orders` с `Idempotency-Key=orderId` → сразу GET `/api/orders` (и при READY — GET `/api/codes`, только count/маска). Если POST оборвался — **не** повторять POST; сверка GET. Utilisation / import / withdrawal / close / печать — не в первом срезе. Это предложение; Harith может выбрать иначе или отложить B.

---

## 6. Explicit non-goals (этот PR и ближайший B)

- Нет A4 **P1** (`productGroup` на `getOrder`, GET `Content-Type`, enum `getDocument`).
- Нет A4 **P2** (sub-orders, packs, party, doc search/json/errors).
- Нет НКТ, GS1 «настоящий», 1С, Markmobile, ЭДО, ОФД, агрегации.
- Симулятор (`MockMptAdapter` / `SIM_MPT_EMISSION_MS`) **не** расширять.
- P0 POST safety (no retry / UNKNOWN_RESULT / STAGE orderId / autofluids) — **сделано** в follow-up PR. Всё ещё нет STAGE вызовов и нет «да» на mutating.
- Нет новых npm-скриптов на STAGE, нет CI job с `ADAPTERS_MPT=http`.
- Нет merge этого PR «чтобы начать POST».
- A5 (зонды C/D на пустом кабинете) по-прежнему не форсировать.

Когда Harith скажет «да», отдельный PR/ран на VPS: узкий mutating + сверка. До того статус = **ready-for-human** на чеклист, не «готово к эмиссии».
