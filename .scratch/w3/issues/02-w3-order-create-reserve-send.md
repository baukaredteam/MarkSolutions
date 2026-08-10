# 02 — W3: заказ КМ (создание + резерв + отправка в симулятор)

**What to build:** пользователь заказывает коды из карточки товара: снимок единиц маркировки (места×штук=quantity), снимок тарифа, totalPrice; заказ создаётся в одной транзакции с резервом средств и outbox-событием отправки; заказ идемпотентен по Idempotency-Key; отмена до эмиссии освобождает резерв. Клиент видит свои заказы и баланс.

**Blocked by:** 01 (W3: биллинг-ядро)

**Status:** done (feat/w3-order)

- [x] POST /orders: одна транзакция = заказ (Draft) + RESERVE-проводка (CAS через tx) + outbox `send-order-to-mpt`; available-проверка ПОСЛЕ CAS внутри транзакции; недостаточно → заказ и резерв НЕ создаются (AT-06)
- [x] Снимок строки заказа: {places, unitsPerPlace, quantity, totalPrice, cisType, serialNumberType}; валидация 1 ≤ quantity ≤ places×unitsPerPlace; снимок тарифа {tariffId, pricePerCodeKZT}
- [x] ORD-026 машина заказа: Draft→Validating→Funds Reserved→Queued (в tx); Sent/Processing/Completed — тикет 03
- [x] ORD-025 идемпотентность: Idempotency-Key = orderId, 10 повторов = 1 заказ = 1 RESERVE (AT-07); RESERVE уникален по (orderId, kind)
- [x] ORD-028 отмена до эмиссии (до Sent/READY) → RELEASE + Cancelled; после (ручной SENT) → 409
- [x] GET /orders и GET /orders/:id — tenant-список со статусами, quantity, totalPrice (маски КМ — тикет 04)
- [x] GET /billing/balance — balance/reserved/available (сделано в тикете 01)
- [ ] Отказ/таймаут симулятора → заказ Failed + RELEASE + задача оператору (ID-017) — реализация поллера в тикете 03
- [x] cisType=UNIT, serialNumberType=OPERATOR; SELF_MADE/GROUP/SET → 400 с явным сообщением

## Ограничения

- Заказ MVP однопозиционный (1 товар на заказ); многопозиционность — позже, таблица OrderLine.
- isPaid в POST /api/orders всегда true (резерв уже есть).

## /ocr-review 514076c — итог

- HIGH (исправлено в `7bde880`): **конкурентный повтор Idempotency-Key** — два параллельных POST с одним ключом: оба проходят pre-check, один создаёт order, второй получает P2002 (unique idempotencyKey) → транзакция падала **500**. Фикс: try/catch вокруг tx, P2002 → вернуть существующий заказ (AT-07). Тест: Promise.all 2 POST → оба 201, один заказ, один RESERVE.
- LOW (принято как есть): sleep-ретраи CAS внутри interactive-транзакции держат write-lock на SQLite при конфликте (до 30 мс); на PG при росте конкуренции — вынести CAS-цикл из tx или перейти на FOR UPDATE. Пункт 9 чеклиста.
- LOW (принято как есть): `refOrderId` — plain-строка (не FK); reconciliation тикета 03 матчит проводки по `refOrderId` (RESERVE/RELEASE/SETTLE пишут `refOrderId = orderId`) — совместимо.
- Проверено и OK (да): атомарность tx (все операции через tx, включая activeReserve внутри reserveOn); AT-07 последовательный (10 повторов = 1 заказ = 1 RESERVE); AT-06 (402, заказ+резерв не созданы); снимки + валидация 1 ≤ quantity ≤ произведение + totalPrice = quantity × тариф (целые тенге); контракт (cisType≠UNIT→400, serialNumberType≠OPERATOR→400, isPaid=true); ORD-028 (отмена до → RELEASE+Cancelled, после SENT → 409, повторная отмена → 200 без нового RELEASE); IDOR (чужой tenant → 404, tenant-scoped, без JWT → 401); конкурентные заказы [201,402] + 1 заказ + 1 RESERVE + reserved=60000/balance=100000; все ответы в формате Приложения B (ADR-017).
