# Контракт ИС МПТ (xTrace ver 1.0) — факты и ловушки

Хосты: PROD https://prod.markirovka.kz, STAGE https://test.markirovka.kz.

Auth: POST /api/users/authenticate (JSON login/password) → accessToken (BEARER, expiresIn "1800000"=30 мин) + refreshToken. Refresh: POST /api/users/tokens/refresh, Content-Type x-www-form-urlencoded, body refreshToken=...

ЛОВУШКА 1: в таблице доки URL refresh указан как /authenticate (копипаст) — верить curl: /api/users/tokens/refresh.
ЛОВУШКА 2: party-status в заголовке POST, в описании GET — правильно GET /public/api/v1/party/parties/{tin}/status (PARTY.READ).
ЛОВУШКА 3: Accept: _/_ ОБЯЗАТЕЛЕН (ответ JSON или ZIP), иначе 406 с пустым телом.
ЛОВУШКА 4: documentBody во всех doc/* = base64(JSON, ключи отсортированы A–Z ПЕРЕД base64; массивы кодов AS IS).
ЛОВУШКА 5: businessPlaceId плавает string/int32 — нормализуем в int32.
ЛОВУШКА 6: лимиты в спеке все «-» — НЕ выдумывать; замерить эмпирически на STAGE.

Методы:

- POST /api/orders (MARKING-CODE-ORDER.CREATE; productGroup, products[gtin, quantity int32, serialNumberType SELF_MADE|OPERATOR, cisType UNIT|GROUP|SET], businessPlaceId, releaseMethodType PRIMARY|REMAINS|COMISSION|REMARK, isPaid) → orderId.
- GET /api/orders (статусы CREATED|PENDING|READY|REJECTED|CLOSED|OUTSOURCED; cursor/limit).
- GET /api/orders/sub-orders (bufferStatus PENDING|ACTIVE|EXHAUSTED|REJECTED|CLOSED; availableCodes, leftInBuffer, totalPassed, lastPackId).
- POST /api/order/close (order READY/OUTSOURCED; подзаказ ACTIVE/EXHAUSTED).
- GET /api/codes (ТОЛЬКО READY/CLOSED; → codes[], packId; MARKING-CODE-ORDER.ADMINISTRATION).
- GET /api/codes/packs.
- POST /api/utilisation (sntins[], businessPlaceId int32, releaseType PRODUCTION|IMPORT|CIRCULATION, expirationDate ОБЯЗ, productionDate ОБЯЗ, manufacturerCountry ОБЯЗ ISO2, seriesNumber) → reportId; GET /api/utilisation/<reportid> → IN_PROCESS|SUCCESS|ERROR (+rejectReason). Не «готово» по факту отправки!
- public/cod: public/codes (краткая; isHadExtendedCode), private/codes (полная; MARKING-CODE.READ; 307-redirect на public при отсутствии прав; baseCode/extendedCode), exports → id; exports/:id/status (CREATED|IN_PROCESSING|SUCCESS|ERROR|EXPIRED); exports/:id/result (ZIP).
- doc/: correction (CODE-CORRECTION), validation (printQualityClass A|B|C|D|F), aggregation (AGGREGATION; aggregationUnits[shouldBeUnbundled, aggregationItemsCount, aggregationUnitCapacity, codes, unitSerialNumber]), transport-code-disaggregation, import (CODES-IMPORT; customsDeclaration{date, number обяз, authorityCode}), withdrawal (WITHDRAWAL; withdrawalType WITHDRAWAL|WRITE_OFF, withdrawalReason, childrenWriteOff, withdrawPartialQuantity, primaryDocument, codes[partialQuantity]).

### POST /public/api/v1/doc/import (CODES-IMPORT, Q5, W4-04)

Вход (JSON):

- `codes` string[] — коды маркировки (codeKey из Vault), **обязательно**
- `customsDeclaration` object — **обязателен**: `date` (обяз), `number` (обяз), `authorityCode` (опц.)

Валидация симулятора: `customsDeclaration.date` + `number` непустые; каждый код — tenant-scoped и `APPLIED`. Выход: `{documentId, status: IN_PROCESS|ERROR}` (паттерн utilisation). При SUCCESS MarkFlow пишет `INTRODUCED`-событие по каждому коду заказа (write-through CodeVault.status=INTRODUCED). При ERROR статус кодов не меняется + задача оператору (outbox `mpt-order-timeout` FAILED).

### POST /public/api/v1/doc/withdrawal (WITHDRAWAL, Q9, W4-04)

Вход (JSON):

- `withdrawalType` string — `WITHDRAWAL` | `WRITE_OFF`, **обязателен**
- `withdrawalReason` string — словарик `{DEFECT, LOST, EXPIRY, RETURN_SUPPLIER, DESTRUCTION, OTHER}`; OTHER → comment ≥5
- `childrenWriteOff` boolean — рекурсивный вывод членов агрегата
- `withdrawPartialQuantity` boolean — `true` → 400 «не поддерживается в MVP-1»
- `primaryDocument` object {type, date, number} — опц.
- `codes` — codeKey или `{code, partialQuantity}` (partialQuantity → 400)

Маппинг статусов: `WITHDRAWAL → WITHDRAWN`, `WRITE_OFF → WRITTEN_OFF`. При childrenWriteOff=true на активном агрегате — `DISAGGREGATED`-события для членов + вывод членов. Член активного (SEALED/OPEN) агрегата в одиночку → 409 «сначала расформирование». Повторный вывод (уже WITHDRAWN/WRITTEN_OFF/EXPIRED) → 409.

- storage docs/search (статусы CREATED|VALIDATING|IN_PROCESS|PARTIALLY_PROCESSED|SUCCESS|ERROR), docs/:id, json/:id, errors/:id (propertyName, index, errorCode).

Ошибки: 200/400/401/403/404/405/500/503/504. Retry только идемпотентные+временные, backoff+jitter.

Phase B (первый mutating на STAGE) — не из этого файла: `docs/MPT-PHASE-B-READINESS.md`. POST orders/utilisation/doc/* с агента/CI запрещены до «да» человека. Timeout после mutating → UNKNOWN_RESULT → GET-сверка, не повторный POST.
