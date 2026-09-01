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
MPT_PRODUCT_GROUP=motor-oils
MPT_BUSINESS_PLACE_ID=36
MPT_MAX_RETRIES=2
MPT_REQUEST_TIMEOUT_MS=15000
```

`MPT_BUSINESS_PLACE_ID=36` — известный идентификатор площадки, не секрет.

Дополнительно для проб C/D (человек подставляет реальные STAGE id, не выдумывать):

```
MPT_PROBE_ORDER_ID=
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

- Без `MPT_PROBE_ORDER_ID` → `GET /api/orders` (список). CONTRACT: статусы `CREATED|PENDING|READY|REJECTED|CLOSED|OUTSOURCED`, упоминает `cursor`/`limit`. Скрипт **не** добавляет выдуманные query — голый список.
- Если задан `MPT_PROBE_ORDER_ID` → как `HttpMptAdapter.getOrder`: `GET /api/orders?orderId=...`.

**Caveat (не чинить этим PR):** CONTRACT **не** описывает фильтр `?orderId=`. Адаптер так ходит. На STAGE возможен `400`/`404` — это рассинхрон адаптер/CONTRACT, не «чинить» вызовом STAGE из агента. Следующий fix-PR: согласовать query/response с контрактом (и эмпирией человека).

Форма ответа адаптера (`status` + `quantity`) на STAGE **не доказана**. CONTRACT говорит про список заказов. Человеку достаточно HTTP-статуса.

### C) `GET /api/codes` — нужен готовый заказ

Нужен реальный STAGE `orderId` в статусе **READY** или **CLOSED** (CONTRACT: коды только тогда). Человек кладёт id в `MPT_PROBE_ORDER_ID`.

```
# в mpt.env: MPT_PROBE_ORDER_ID=<готовый STAGE orderId>
npm run mpt:get-codes-healthcheck
```

Путь как адаптер: `GET /api/codes?orderId=...` (после authenticate, `Accept: */*`, Bearer).

Пустой `codes[]` при заказе не READY — **данные STAGE**, не обязательно баг. `?orderId=` в CONTRACT для codes тоже не расписан так же подробно, как путь; адаптер уже так фильтрует.

Stdout: `status=<http>`. Если HTTP 200 и JSON содержит массив `codes` — вторая строка `codes_count=<n>` (длина массива). Значения кодов **не** печатать.

### D) `GET /api/utilisation/<reportId>` — нужен существующий отчёт

Человек кладёт существующий STAGE `reportId` в `MPT_PROBE_REPORT_ID`. **Не создавать** отчёт (`POST /api/utilisation` — mutating, вне фазы 1).

```
# в mpt.env: MPT_PROBE_REPORT_ID=<существующий STAGE reportId>
npm run mpt:get-utilisation-healthcheck
```

Путь как адаптер: `GET /api/utilisation/<reportId>`.

Stdout: `status=<http>`. Если HTTP 200 и в JSON есть поле `status` — вторая строка `report_status=<IN_PROCESS|SUCCESS|ERROR|other>` (значения из CONTRACT; любое иное → `other`). `rejectReason` **не** печатать (там может оказаться КМ).

## Что сообщить обратно

Только **ok/fail** и HTTP-статус (плюс опциональные `codes_count` / `report_status` выше).

- `status=200` + exit 0 — ok
- `status=401` / `400` / `404` / иное + exit 1 — fail (статус достаточнен)
- `status=network` + exit 1 — сеть / таймаут ~15 с
- `missing env` + exit 1 — нет обязательных имён (`MPT_BASE_URL` / `MPT_LOGIN` / `MPT_PASSWORD`; для C ещё `MPT_PROBE_ORDER_ID`; для D ещё `MPT_PROBE_REPORT_ID`). Скрипт **не** говорит, какого ключа не хватает.

Тело ответа, `accessToken`, пароль, полный КМ — не копировать. Если коды пришли — только **число** и факт наличия маски в голове («коды есть / пусто»), никогда сырые значения.

## Mutating по-прежнему запрещено

Не вызывать: `POST /api/orders`, `POST /api/utilisation`, `POST /api/order/close`, любые `doc/*`, refresh ради пробы, печать, резерв, списание.

Не менять и не «проверять» mutating-методы `HttpMptAdapter` (`createOrder`, `submitUtilisation`, `submitImport`, `submitWithdrawal`) этим PR.

## Известные блокеры (фаза 0) — задокументировать, не чинить вызовом STAGE

1. **`getOrder` / `getCodes` и `?orderId=`.** В CONTRACT список заказов описан как `GET /api/orders` (`cursor`/`limit`), без явного `?orderId=`. Адаптер шлёт `?orderId=`. Форма ответа на STAGE не доказана. Возможен 400/404, пока адаптер и CONTRACT не выровняют отдельным PR.
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
- Не чинит query/response `HttpMptAdapter` (следующий fix-PR после отчёта человека)
- Не добавляет POST orders / utilisation / `doc/*`
- Не мержит сам себя
