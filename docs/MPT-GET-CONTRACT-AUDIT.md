# ИС МПТ GET: official vs `HttpMptAdapter` (Phase A3)

Аудит **только GET**. Источники: `docs/CONTRACT-IS-MPT.md`, `docs/source/Описание API ИС МПТ Роль Пользователь.md`, `apps/api/src/http-mpt.adapter.ts` (sha factory `92e875b` / PR #13). Healthcheck-скрипты — справка, что уже зондирует человек; новых STAGE-вызовов нет.

## Summary

Phase A (read-only): человек на VPS получил **auth 200** и **GET /api/orders 200** с issuer-учёткой и `productGroup=autofluids`. Пустой `orderInfos` при 200 — валидный ответ, не ошибка. Голый `GET /api/orders` ранее давал 400 (permission 201, затем после прав — 200 с `productGroup`). Этот документ сравнивает **GET-методы адаптера** с официальной таблицей и CONTRACT. Mutating (POST orders / utilisation / doc/* / close) **не** аудируются на правку. Симулятор не расширяем. Агент STAGE / `test.markirovka.kz` / prod **не** вызывает.

Общий провод адаптера: `request()` всегда шлёт `Accept: */*` (ЛОВУШКА 3 — верно) и `Authorization: Bearer` после `ensureToken`. `Content-Type: application/json` ставится **только** если есть `opts.json` — у всех GET тела нет, поэтому адаптер **не** шлёт Content-Type на GET. Healthcheck `authThenGet` шлёт оба: `Accept: */*` и `Content-Type: application/json` (как строка «Content-Type» в официальной таблице GET). `cursor`/`limit` в официальной таблице GET /api/orders помечены **«Нет»** (необязательные); CONTRACT упоминает их как параметры списка — **не** считать обязательными.

## Table

| Method (adapter) | Official path | Official query/headers | Adapter path/query/headers | Match? | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `authenticate` (out of scope; shared Accept) | `POST /api/users/authenticate` | `Content-Type: application/json`; Accept в общем разделе — `*/*` (иначе 406 пустое тело). Не GET. | `POST /api/users/authenticate`; `Content-Type: application/json`; `Accept: */*` | Yes (Accept) | — | Не GET. Зафиксировано: тот же `Accept: */*` уходит на все `request()` GET. Refresh — POST, вне аудита. |
| `getOrder` | `GET /api/orders` | Query (все **Нет**): `orderId`, `productGroup`, `status`, `contractorTin`, `dateFrom`, `dateTo`, `poNumber`, `cursor`, `limit`. Headers: `Content-Type: application/json`, `Authorization: Bearer`. Права: `MARKING-CODE-ORDER.READ` и/или `MARKING-CODE-CONTRACTOR-ORDER.READ`. Ответ: `{ orderInfos: [{ orderId, productGroup, orderStatus, releaseMethodType, createDate, isPaid, … }] }`. Официальный curl — голый `/api/orders`. | `GET /api/orders?orderId=<id>` **без** `productGroup`. `Accept: */*`. **Нет** `Content-Type`. Bearer через `request()`. Читает top-level `status` и `quantity`. | **No** | **P0** (parse) / **P1** (query) | Текущий код подтверждён: только `?orderId=`. Healthcheck списка шлёт `productGroup=autofluids` (STAGE 200); адаптер так не делает. `quantity` в официальном list-ответе нет (кол-ва — у sub-orders). `orderStatus` в `orderInfos[]`, не `status` на корне. `cursor`/`limit` не слать «на всякий случай». |
| *(list, нет отдельного метода)* | `GET /api/orders` | те же optional query; пустой `orderInfos` = валидный 200 | нет list-метода; `getOrder` всегда добавляет `orderId` | Partial | P1 | Список без `orderId` есть только у человека (`mpt:get-orders-healthcheck`). Адаптер не умеет «все заказы ТГ». |
| `getCodes` | `GET /api/codes` | Query: `orderId` **Да**, `gtin` **Да**, `quantity` **Да** (int32), `lastPackId` **Нет**. Только заказ `READY` (первый + повтор) или `CLOSED` (только ранее полученные). Headers: `Content-Type: application/json`, Bearer. Право: `MARKING-CODE-ORDER.ADMINISTRATION`. Ответ: `{ codes: string[], packId }`. | `GET /api/codes?orderId=<id>` — **нет** `gtin`, **нет** `quantity`. `Accept: */*`. Нет Content-Type. Мапит `codes[]` как объекты `{ gtin, serial, ai91, ai92, form }`. | **No** | **P0** | Healthcheck C зеркалит адаптер (`?orderId=` only) — это **не** официальный обязательный набор. CONTRACT пишет `codes[]` + `packId`, без таблицы обязательных query; официальный md — три обязательных. Полные КМ в `codes[]` — маска в логах/UI. |
| `getUtilisation` | `GET /api/utilisation/<reportid>` | Path `reportId` **Да**. Query нет. Headers: `Content-Type: application/json`, Bearer. Право: `DOCUMENT.READ` + привилегия `MARKING-CODES-DOCUMENTS`. Ответ: `{ reportId, reportStatus, createdTimestamp }` (`reportStatus`: `IN_PROCESS` \| `SUCCESS` \| `ERROR`); `rejectReason` опц. | `GET /api/utilisation/<reportId>` (path совпадает). `Accept: */*`. Нет Content-Type. Читает **`status`**, не `reportStatus`. | Partial (path) / **No** (field) | **P0** | Path совпал. CONTRACT описывает статусы как `IN_PROCESS\|SUCCESS\|ERROR`; официальное имя поля — `reportStatus`. При официальном JSON поллер увидит fallback `IN_PROCESS`. Healthcheck D тоже читает `status` (как адаптер). |
| `getDocument` | `GET /public/api/v1/doc/storage/docs/:documentId` | Path `documentId` **Да**. Query нет. Headers: `Content-Type: application/json`, Bearer. Ответ: `{ documentId, type, status, createDate, … }` (`status`: `CREATED` \| `VALIDATING` \| `IN_PROCESS` \| `PARTIALLY_PROCESSED` \| `SUCCESS` \| `ERROR`). `rejectReason` на этом GET нет. | `GET /public/api/v1/doc/storage/docs/<id>` (path совпадает). `Accept: */*`. Нет Content-Type. Читает `status` + `rejectReason`. | Partial | **P1** | Имя поля `status` совпало. Адаптер сужает enum до `IN_PROCESS\|SUCCESS\|ERROR` (остальное → `IN_PROCESS`). Детали ошибок официально — `GET …/errors/:documentId`, не `rejectReason` на docs/:id. |
| *(shared GET headers)* | любой GET в таблице | Таблицы методов пишут `Content-Type: application/json` + Bearer. Общий раздел: `Accept: */*` обязателен. | GET: `Accept: */*` + Bearer; **без** Content-Type | Partial | P1 | Healthcheck GET (STAGE 200 на orders) шлёт оба заголовка. Не доказано агентом, что CT обязателен; официальная таблица его указывает. Одна правка shared `request()` затронет и POST — в A4 трогать GET-only или явный GET-header, не «переписать request». |

### Official GET без метода в `HttpMptAdapter`

Не вызывать STAGE, чтобы «добавить». Фиксируем отсутствие:

| Official GET | Official query (факт таблицы) | Adapter | Priority | Notes |
| --- | --- | --- | --- | --- |
| `GET /api/orders/sub-orders` | все **Нет**: `orderId`, `gtin`, `cisType`, `status`, `dateFrom`, `dateTo`, `cursor`, `limit`. Ответ `subOrderInfos[]` (`availableCodes`, `leftInBuffer`, `totalPassed`, `lastPackId`, `bufferStatus`). | нет | P2 | Единственное официальное место, где есть количества по подзаказу. `getOrder.quantity` из list неоткуда взять. |
| `GET /api/codes/packs` | `orderId` **Да**, `gtin` **Да** | нет | P2 | Пачки для повторного `lastPackId`. |
| `GET /public/api/v1/party/parties/{tin}/status` | path `tin` **Да**. Заголовок доки пишет POST, описание — GET (ЛОВУШКА 2 / CONTRACT). `PARTY.READ`. | нет | P2 | Не GET-баг адаптера — метода нет. |
| `GET /public/api/v1/doc/storage/docs/search` | optional: `documentId`, `productGroups`, `status`, `types`, `dateFrom`, `dateTo`, `limit`, `cursor` | нет | P2 | |
| `GET /public/api/v1/doc/storage/json/:documentId` | path `documentId` **Да** | нет | P2 | Тело документа as-stored. |
| `GET /public/api/v1/doc/storage/errors/:documentId` | path **Да**; optional `propertyName`, `lastIndex`, `limit`. Ответ `documentErrors[]` (`propertyName`, `index`, `errorCode`). | нет | P2 | Кандидат вместо выдуманного `rejectReason` на docs/:id. |
| `GET /public/api/cod/exports/:exportId/status` | path `exportId` **Да** → `CREATED\|IN_PROCESSING\|SUCCESS\|ERROR\|EXPIRED` | нет | P2 | |
| `GET /public/api/cod/exports/:exportId/result` | path **Да** → ZIP | нет | P2 | Accept `*/*` критичен (ZIP vs JSON error). |

## Verified findings (код, не догадки)

- **`getOrder` сейчас:** `` `/api/orders?orderId=${encodeURIComponent(orderId)}` `` — только `orderId`, **без** `productGroup`. Комментарий адаптера это допускает («фильтр по заказу уточняется на STAGE»).
- **Healthcheck list** (`scripts/mpt-get-orders-healthcheck.mjs`): default `productGroup=autofluids` (или `MPT_PRODUCT_GROUP`); опционально `orderId`; `MPT_ORDERS_BARE=1` = голый путь. **Не** добавляет `cursor`/`limit`. Пустой `orderInfos` при HTTP 200 — ok.
- **Официальный list:** почти все query **необязательны**; права `MARKING-CODE-ORDER.READ` / `MARKING-CODE-CONTRACTOR-ORDER.READ`. Не изобретать обязательность `cursor`/`limit` или `productGroup`. STAGE-практика фазы A: список 200 с `productGroup=autofluids` у issuer; это **не** делает параметр обязательным в спеке.
- **`getCodes` сейчас:** только `?orderId=`. Официальная таблица требует ещё `gtin` и `quantity`.
- **`getUtilisation` сейчас:** path как в спеке; поле ответа `status` ≠ официальное `reportStatus`.
- **`getDocument` сейчас:** path как в CONTRACT (`storage/docs/:id`); `rejectReason` в официальном ответе этого GET нет.
- **Default `MPT_PRODUCT_GROUP` в адаптере** = `motor-oils` (legacy). На GET `getOrder` не уходит. Для KZ oils код ТГ — `autofluids` (не `category_autofluids_motor`). Менять default — отдельное решение, не этот PR.

## Out of scope (mutating — не менять здесь)

Присутствуют в адаптере, **не** входят в A3/A4 GET-fix:

- `createOrder` → `POST /api/orders`
- `submitUtilisation` → `POST /api/utilisation`
- `submitImport` → `POST /public/api/v1/doc/import`
- `submitWithdrawal` → `POST /public/api/v1/doc/withdrawal`
- `authenticate` / `refresh` — POST (кроме уже отмеченного Accept)
- Официальный `POST /api/order/close` — в адаптере **нет** метода (не добавлять в этом PR)
- Прочие POST `doc/*`, `cod/*` — нет в адаптере; не симулятор, не STAGE

Shared `request()` / `ensureToken` трогать в A4 только если GET-заголовок нельзя добавить локально у GET-вызовов. Поведение POST не менять.

## Recommended next (A4) — bullets only

Узкие GET-only правки, по приоритету. Без «переписать адаптер». Без новых STAGE-скриптов в том PR, пока человек не попросит.

- **P0** — `getOrder`: парсить официальный `{ orderInfos[] }`. Статус брать из `orderInfos[].orderStatus` (фильтр по переданному `orderId`). Не читать корневой `status`/`quantity` как контракт STAGE. `quantity` для сверки — из своих `OrderLine` или отдельного **P2** `sub-orders`, не выдумывать из list.
- **P0** — `getCodes`: слать официальные обязательные `orderId` + `gtin` + `quantity` (сигнатура порта / caller; не угадывать quantity на проводе). Парсить `codes` как `string[]` + `packId`; маска КМ. Не оставлять маппинг «объект с serial», пока STAGE не доказал другую форму.
- **P0** — `getUtilisation`: читать `reportStatus` (fallback на `status` только если поле отсутствует — один раз, явно).
- **P1** — `getOrder` query: опционально добавить `productGroup` из конфига (`autofluids` для KZ oils), **не** делая его обязательным в спеке. Не добавлять `cursor`/`limit`, пока нет пагинации.
- **P1** — GET `Content-Type: application/json` как в официальной таблице и в healthcheck, не ломая POST. Если трогать `request()`, только ветка без body.
- **P1** — `getDocument`: принять официальный набор `status` (хотя бы не схлопывать `CREATED`/`VALIDATING`/`PARTIALLY_PROCESSED` в ложный `IN_PROCESS` без записи). `rejectReason` — с `GET …/errors/:id` в отдельном шаге, не invent на docs/:id.
- **P2** — методы, которых нет: `sub-orders` (количества), `codes/packs`, party status, doc search/json/errors — только когда появится caller. Не заранее.

Не в A4: mutating POST, close, simulator, новые npm-скрипты на STAGE, смена host.
