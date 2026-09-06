# STAGE ИС МПТ — фаза 1: read-only GET (план + пробы)

Документ для **человека на VPS**. Агенты и CI **не** вызывают `test.markirovka.kz` / `prod.markirovka.kz` и не запрашивают учётки.

Auth-проба уже есть: `docs/STAGE-MPT-HEALTHCHECK.md` → `npm run mpt:auth-healthcheck` (на VPS получен `status=200`).

Этот документ — **фаза 1**: опциональные **read-only GET** после успешного authenticate. Mutating (`POST /api/orders`, `POST /api/utilisation`, `doc/*`, createOrder / submitUtilisation / submitImport / submitWithdrawal) **запрещены**, пока человек отдельно не скажет «да».

Пути только из `docs/CONTRACT-IS-MPT.md` и существующих GET в `HttpMptAdapter`. Новых POST нет.

## Предусловия

1. Auth healthcheck ок (`status=200`).
2. Файл учёток: `~/.config/marksolutions/mpt.env` (не в репо).

Имена (значения логина/пароля только на VPS; в репо пустые):

```
ADAPTERS_MPT=http
MPT_BASE_URL=https://test.markirovka.kz
MPT_LOGIN=
MPT_PASSWORD=
MPT_PRODUCT_GROUP=autofluids
MPT_BUSINESS_PLACE_ID=36
MPT_MAX_RETRIES=2
MPT_REQUEST_TIMEOUT_MS=15000
```

`MPT_BUSINESS_PLACE_ID=36` — известный идентификатор площадки, не секрет.

Дополнительно для проб C/D (человек подставляет реальные STAGE id, не выдумывать):

```
MPT_PROBE_ORDER_ID=
MPT_PROBE_GTIN=
MPT_PROBE_QUANTITY=
MPT_PROBE_REPORT_ID=
```

Скрипты сами читают `~/.config/marksolutions/mpt.env` (уже заданные в процессе переменные побеждают). Не коммитить файл. Не печатать пароль, токен, полный КМ.

## Порядок для человека

### A) Auth — уже сделано

```
set -a && source ~/.config/marksolutions/mpt.env && set +a
npm run mpt:auth-healthcheck
```

Ожидание: `status=200`. Если нет — дальше не идти.

### B) Optional: `GET /api/orders` (список / статус)

```
npm run mpt:get-orders-healthcheck
```

Всегда шлёт документированный query `productGroup` (официальная таблица: параметр есть; обязательность в таблице — «Нет»). Значение: `MPT_PRODUCT_GROUP` из `mpt.env` / окружения; если не задан — `autofluids`.

**KZ STAGE UI (Harith):** код товарной группы для моторных масел — `autofluids`. Категория `category_autofluids_motor` — **не** `productGroup`. Default `motor-oils` в `HttpMptAdapter` / старом `.env.example` — legacy и **неверный** для KZ; этот скрипт больше его не использует. Адаптер в этом PR не трогаем.

- Без `MPT_PROBE_ORDER_ID` → `GET /api/orders?productGroup=<pg>`.
- Если задан `MPT_PROBE_ORDER_ID` → `GET /api/orders?productGroup=<pg>&orderId=...` (оба фильтра из официальной таблицы; `orderId` в таблице тоже «Нет»).
- `MPT_ORDERS_BARE=1` → голый `GET /api/orders` без query (как официальный curl; все query в таблице «Нет»).
- Скрипт **не** добавляет выдуманные `cursor`/`limit` и другие query, кроме `productGroup` / `orderId` выше.
- GET шлёт `Accept: */*` (ЛОВУШКА 3) и `Content-Type: application/json` (таблица запроса для GET /api/orders).

**Почему голый `GET /api/orders` дал 400 на пустом кабинете (VPS, после PR #11).** Auth был `status=200` (токен ок). Кабинет без заказов. Ожидание по спеке: `200` и `{ "orderInfos": [] }` — пустой массив валиден. Получили `400`. **Hunch (не доказано вызовом STAGE из агента):** STAGE / xTrace часто требует `productGroup` на списке, даже если в таблице «Нет». Скрипт больше не ходит без `productGroup`. Это не «изобретённый» параметр — он есть в `docs/source/Описание API ИС МПТ Роль Пользователь.md`.

Рекомендуется явно задать `MPT_PRODUCT_GROUP=autofluids` в `~/.config/marksolutions/mpt.env` (для масел KZ). Пустой `orderInfos` при HTTP 200 — **ok** (нет заказов в группе), не ошибка.

Stdout: `status=<http>`. Если HTTP 200 и в JSON есть массив `orderInfos` — `orders_count=<n>`. На любом GET не-200 — строка `path=/api/orders?...` (только path+query, без host и без Authorization). На HTTP ≥ 400 — `body_len=<bytes>`, `content_type=<mime|none>`, и `error=`:

- пустое тело → `error=empty_body` (Harith 2026-09-01: 400 + path, без error= — тело было пустым или не JSON)
- тело есть, JSON не парсится → `error=non_json` (тело **не** печатать)
- JSON → sanitized excerpt (`globalErrors[].error` + optional `errorCode` as `text (201)`; `error` string or nested; `errors[]`; RFC7807 `title`/`detail`; токен/Bearer/КМ → `error=redacted`). Known STAGE 400: permission `errorCode` 201 — see below.

Тела заказов, raw JSON, пароль, токен **не** печатать.

**Caveat (query P1, не этот PR):** `HttpMptAdapter.getOrder` по-прежнему шлёт только `?orderId=` без `productGroup`. A4 P0 парсит `orderInfos[].orderStatus` и возвращает `quantity: 0` (list body qty нет). Человеку достаточно HTTP-статуса (+ опционально `orders_count`).

Таблица GET-only: адаптер vs официальный путь/query/заголовки — `docs/MPT-GET-CONTRACT-AUDIT.md` (Phase A3). A4 — узкие GET-фиксы по P0/P1 из того файла, не mutating.

### Если `status=400` и `error=` про permission / errorCode 201

Это **не** missing/invalid `productGroup`. Auth (`status=200`) ок; STAGE запрещает `GET /api/orders` (официально нужны `MARKING-CODE-ORDER.READ` и/или `MARKING-CODE-CONTRACTOR-ORDER.READ`).

Harith 2026-09-01: `body_len=74` `keys=globalErrors:object`  
`{"globalErrors":[{"error":"No permission for operation","errorCode":201}]}`  
Одинаково на bare GET и с `productGroup` / `Content-Type`.

**Что делать человеку:** в STAGE ЛК выдать права на чтение заказов КМ и убедиться, что товарная группа подключена. **Не** крутить query-параметры дальше. Агент STAGE не вызывает.

### C) `GET /api/codes` — нужен готовый заказ

Нужен реальный STAGE `orderId` в статусе **READY** или **CLOSED** (CONTRACT: коды только тогда) плюс `gtin` и `quantity` (официальные обязательные query). Человек кладёт их в `MPT_PROBE_ORDER_ID` / `MPT_PROBE_GTIN` / `MPT_PROBE_QUANTITY`.

```
# в mpt.env: MPT_PROBE_ORDER_ID / MPT_PROBE_GTIN / MPT_PROBE_QUANTITY
npm run mpt:get-codes-healthcheck
```

Путь как адаптер (A4 P0): `GET /api/codes?orderId=&gtin=&quantity=` (после authenticate, `Accept: */*`, `Content-Type: application/json`, Bearer). Адаптер парсит `codes` как `string[]` (+ `packId` если есть).

Пустой `codes[]` при заказе не READY — **данные STAGE**, не обязательно баг.

Stdout: `status=<http>`. Если HTTP 200 и JSON содержит массив `codes` — вторая строка `codes_count=<n>` (длина массива). Значения кодов **не** печатать.

### D) `GET /api/utilisation/<reportId>` — нужен существующий отчёт

Человек кладёт существующий STAGE `reportId` в `MPT_PROBE_REPORT_ID`. **Не создавать** отчёт (`POST /api/utilisation` — mutating, вне фазы 1).

```
# в mpt.env: MPT_PROBE_REPORT_ID=<существующий STAGE reportId>
npm run mpt:get-utilisation-healthcheck
```

Путь как адаптер: `GET /api/utilisation/<reportId>` (`Accept: */*`, `Content-Type: application/json`).

Stdout: `status=<http>`. Если HTTP 200 — вторая строка `report_status=<IN_PROCESS|SUCCESS|ERROR|other>` из официального `reportStatus` (fallback на `status`, если поля нет). Любое иное → `other`. `rejectReason` **не** печатать (там может оказаться КМ).

## Что сообщить обратно

Только строки `status=` / `path=` / `error=` / `body_len=` / `content_type=` (и опционально `orders_count` / `codes_count` / `report_status`). Не копировать тело ответа.

- `status=200` + exit 0 — ok (в т.ч. пустой список: `orders_count=0`)
- `status=401` / `400` / `404` / иное + exit 1 — fail; пришлите `path=` `error=` `body_len=` `content_type=` если скрипт их напечатал
- `status=network` + exit 1 — сеть / таймаут ~15 с
- `missing env` + exit 1 — нет обязательных имён (`MPT_BASE_URL` / `MPT_LOGIN` / `MPT_PASSWORD`; для C ещё `MPT_PROBE_ORDER_ID` + `MPT_PROBE_GTIN` + `MPT_PROBE_QUANTITY`; для D ещё `MPT_PROBE_REPORT_ID`). Скрипт **не** говорит, какого ключа не хватает.

Тело ответа, `accessToken`, пароль, полный КМ — не копировать. Если коды пришли — только **число** и факт наличия маски в голове («коды есть / пусто»), никогда сырые значения.

## Mutating по-прежнему запрещено

Не вызывать: `POST /api/orders`, `POST /api/utilisation`, `POST /api/order/close`, любые `doc/*`, refresh ради пробы, печать, резерв, списание.

**Phase B (первый реальный POST)** ещё не открыта. Чеклист и gaps: `docs/MPT-PHASE-B-READINESS.md`. Пока Harith не скажет «да» — только этот read-only документ и GET-скрипты.

Не менять и не «проверять» mutating-методы `HttpMptAdapter` (`createOrder`, `submitUtilisation`, `submitImport`, `submitWithdrawal`) этим PR.

## Известные блокеры (фаза 0) — задокументировать, не чинить вызовом STAGE

1. **`getOrder` query без `productGroup` (P1).** A4 P0: адаптер парсит `orderInfos[].orderStatus`, `quantity: 0`; `getCodes` шлёт `orderId+gtin+quantity` и читает `string[]`; `getUtilisation` читает `reportStatus` (fallback `status`). Query `productGroup` на getOrder и GET Content-Type — P1, не этот PR.
2. **Utilisation / import на http-пути** отдали бы serial / codeKey, не полный КМ. Это **mutating** и **вне фазы 1**. Не слать КМ и не POST utilisation/import.
3. **`NODE_ENV=stage` fail-closed** для OpenBao и прочей прод-инфры — **не этот PR**.

Пустые коды, если заказ не READY — данные стенда, не обязательно дефект кода.

## Команды на VPS (человек)

```
set -a && source ~/.config/marksolutions/mpt.env && set +a
npm run mpt:auth-healthcheck
npm run mpt:get-orders-healthcheck
# после того как известен READY/CLOSED orderId:
npm run mpt:get-codes-healthcheck
# после того как известен существующий reportId (без POST utilisation):
npm run mpt:get-utilisation-healthcheck
```

Скрипты **не** подключены к `npm test` / `npm run verify` (у CI нет учёток STAGE).

## Что этот PR не делает

- Не ходит в STAGE из CI и агентов
- Не делает P1/P2 (productGroup на getOrder, GET Content-Type, sub-orders, default autofluids в адаптере)
- Не добавляет POST orders / utilisation / `doc/*`
- Не мержит сам себя
