# Phase B readiness — first real STAGE mutating (prep only)

Документ **A6 / Prep-B**. Это **не** разрешение на POST. Агенты, CI и этот PR **не** вызывают `test.markirovka.kz` / `prod.markirovka.kz` и **не** меняют поведение `createOrder` / `submitUtilisation` / `submitImport` / `submitWithdrawal`.

Источники: `docs/CONTRACT-IS-MPT.md`, `docs/MPT-GET-CONTRACT-AUDIT.md` (A3 + A4 P0), `AGENTS.md` §5, ADR-024 в `docs/DECISIONS.md`, код на factory `6ca0e7b`.

Phase A (read-only, человек на VPS): **auth 200**, **GET /api/orders 200** `orders_count=0` на issuer + `productGroup=autofluids`. A5 не форсировали: кабинет пустой. Mutating — только после явного «да» Harith.

---

## 1. Goal of Phase B

Один **утверждённый узкий** mutating-кейс на STAGE **после** Harith «да». Не выбирать метод в этом PR.

Кандидаты (Harith выбирает):

| Option | Когда имеет смысл | Сейчас (пустой кабинет) |
| ------ | ----------------- | ----------------------- |
| **A. `createOrder` tiny qty** (`POST /api/orders`, qty=1, `productGroup=autofluids`, `cisType=UNIT`, `serialNumberType=OPERATOR`) | Нет существующих READY/CLOSED заказов | **Вероятный первый шаг после «да»** — иначе нечего наносить |
| **B. Utilisation существующих кодов** (`POST /api/utilisation` + poll `GET /api/utilisation/<reportId>`) | Есть коды в кабинете / Vault со статуса READY | **Недоступно:** A5 не делали, `orders_count=0`, probe C/D без id |

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

| Concern | As-is in code (`file:symbol`) | To-be for B | Gap |
| ------- | ----------------------------- | ----------- | --- |
| **Idempotency-Key on createOrder HTTP** | `HttpMptAdapter.createOrder` шлёт `Idempotency-Key: input.orderId` (`apps/api/src/http-mpt.adapter.ts:createOrder`). `OrderService.create` требует клиентский header; в БД это `order.idempotencyKey`; на провод МПТ уходит **`order.id`**, не клиентский ключ. ADR-024: «Idempotency-Key = orderId». | Один стабильный ключ = MarkFlow `order.id` на каждом POST `/api/orders`. Повтор с тем же ключом не создаёт второй заказ на STAGE. | **Малый.** Ключ на HTTP уже есть. Нужно не сменить его «на всякий случай». Клиентский Idempotency-Key ≠ STAGE key — это ок, если не путать. |
| **Retry / backoff on 5xx** | `HttpMptAdapter.request` + `backoffMs`: 5xx/504/network/abort ретраятся до `MPT_MAX_RETRIES` (default 2) с jitter. 4xx → `MptPermanentError`, без ретрая. Тот же цикл для GET и **POST**. | После **первого** mutating POST, который оборвался (timeout/5xx), **не** ретраить POST. Статус `UNKNOWN_RESULT`, сверка GET. Retry GET — да. | **P0 для B.** In-adapter retry POST = слепой повтор. Idempotency-Key смягчает, если STAGE чтит ключ — **не доказано**. |
| **401 refresh** | `request`: ровно один `refresh()` на 401, затем повтор **того же** запроса (тот же body + Idempotency-Key). Второй 401 → `MptPermanentError`. `ensureToken` / `refresh` — `apps/api/src/http-mpt.adapter.ts`. | Оставить один refresh. Повтор после refresh допустим (тот же operation + key). Не логировать токен. | **Ок для B.** Refresh — POST `/api/users/tokens/refresh`, не заказ. |
| **Outbox `send-order-to-mpt`** | `OrderService.create`: одна tx = заказ + `billing.reserveOn` + `outbox` `aggregate: "send-order-to-mpt"`. `OutboxPoller.sendToMpt`: `mpt.createOrder(...)`. Permanent → outbox `FAILED` + задача `mpt-order-timeout`. Temporary throw → outbox остаётся **PENDING** → **следующий тик снова POST**. | После первой попытки POST: PROCESSED *или* `UNKNOWN_RESULT` (не PENDING). Дальше только `reconcileOrder` / GET. | **P0 для B.** At-least-once поллер + in-adapter retry = много POST. |
| **`reconcileOrder` + getOrder / getCodes (post-A4)** | `OutboxPoller.reconcileOrder`: `mpt.getOrder` (A4: `orderInfos[].orderStatus`, `quantity: 0`) → при READY/CLOSED `mpt.getCodes({orderId, gtin, quantity})` (A4: official query + `string[]`) → `parseAdr006Km` → `vault.ingest`. | Сверка **до** любого повторного POST. Маппить STAGE `orderId` из ответа create, если он ≠ MarkFlow id. `getOrder` query `productGroup` — A4 **P1**, не блокер если GET по `orderId` находит запись. | **Средний.** `createOrder` **отбрасывает** STAGE `orderId` (читает `d.status`, дефолт `CREATED`, возвращает только `requestId`). `getOrder` ищет MarkFlow UUID. Если STAGE выдаёт свой UUID — сверка пустая. `releaseMethodType` в теле create **нет** (CONTRACT требует). `sendToMpt` **не** передаёт `productGroup` / `businessPlaceId` с заказа — адаптер берёт env (`MPT_PRODUCT_GROUP` default **`motor-oils`**, не `autofluids`). |
| **Utilisation poll `reportStatus`** | `UtilisationService.pollReports` → `reconcile` → `mpt.getUtilisation` (A4: `reportStatus`, fallback `status`). SUCCESS → SETTLE + коды `UTILISED` + `releaseOn` в одной tx. | Poll только после успешного POST + сохранённого `reportId`. Не считать «готово» по факту POST. | **GET-сторона ок (A4).** Submit **не** готов: `UtilisationService.submit` зовёт `mpt.submitUtilisation` **синхронно в HTTP**, не через outbox. HTTP POST **без** Idempotency-Key; `operationId` = ``util-${Date.now()}``. `sntins` = **serial**, не полный КМ (комментарий адаптера). Кабинет пуст → utilisation не первый кейс. |
| **RELEASE on timeout / reject** | `reconcileOrder`: `age > MPT_ORDER_TIMEOUT_MS` (default **60s**) → `billing.release` + `FAILED` **до** проверки READY. `REJECTED` → RELEASE + задача. `OrderService.cancel` → RELEASE до SENT. Util SUCCESS → SETTLE + RELEASE остатка. | RELEASE только если сверка доказала REJECTED / нет заказа на STAGE. Не RELEASE, пока GET показывает CREATED/PENDING (эмиссия STAGE ≫ 60s). Не SETTLE до SUCCESS нанесения. | **P0 для B.** Локальный 60s timeout на SENT заказ, который STAGE ещё эмитит → ложный FAILED + RELEASE, коды могут прийти позже. Для B: поднять `MPT_ORDER_TIMEOUT_MS` на VPS **до** «да»; не менять код в этом PR. |
| **Dual `ADAPTERS_MPT=http` vs mock** | `createMptAdapter`: `ADAPTERS_MPT === "http"` → `HttpMptAdapter`, иначе `MockMptAdapter` (`http-mpt.adapter.ts:createMptAdapter`, `app.module.ts`). CI/тесты пинят `ADAPTERS_MPT=mock`. | VPS API: только `http` + `MPT_BASE_URL=https://test.markirovka.kz`. CI: **никогда** `http` (нет учёток, нельзя стучать в STAGE). Не путать mock-эмиссия с STAGE. | **Операционный.** Полллер-комменты ещё говорят «симулятор». Случайный `ADAPTERS_MPT=http` в CI или `mock` на VPS — разный класс аварии. |
| **`NODE_ENV=stage` fail-closed** | `validateProductionConfig` (`config-validation.ts`): `NODE_ENV` `production` **или** `stage` отвергает `ADAPTERS_*=mock`, `KMS_PROFILE=file`, `JWT_SECRET=dev-secret`, `STORAGE_DIR`, пустые MPT creds. `test`/`development`/unset — **не** проверяет. | Процесс API на VPS, который может POST: `NODE_ENV=stage` (или `production`) + OpenBao + `ADAPTERS_MPT=http`. Healthcheck-скрипты — отдельный Node, не Nest; fail-closed их не закрывает. | **Процесс.** Если API на VPS запущен с пустым/`development` NODE_ENV — mock допустим валидатором. Для B: подтвердить env процесса, не только `mpt.env` скриптов. |

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
- [ ] `MPT_ORDER_TIMEOUT_MS` на VPS **≫** ожидаемой эмиссии STAGE (не оставлять default 60s).
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
- **Нет правок POST** (`createOrder` / `submitUtilisation` / `submitImport` / `submitWithdrawal`) в этом PR — только комментарии-указатели.
- Нет новых npm-скриптов на STAGE, нет CI job с `ADAPTERS_MPT=http`.
- Нет merge этого PR «чтобы начать POST».
- A5 (зонды C/D на пустом кабинете) по-прежнему не форсировать.

Когда Harith скажет «да», отдельный PR/ран на VPS: узкий mutating + сверка. До того статус = **ready-for-human** на чеклист, не «готово к эмиссии».
