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
- storage docs/search (статусы CREATED|VALIDATING|IN_PROCESS|PARTIALLY_PROCESSED|SUCCESS|ERROR), docs/:id, json/:id, errors/:id (propertyName, index, errorCode).

Ошибки: 200/400/401/403/404/405/500/503/504. Retry только идемпотентные+временные, backoff+jitter.
