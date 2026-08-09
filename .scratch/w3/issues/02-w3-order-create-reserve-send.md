# 02 — W3: заказ КМ (создание + резерв + отправка в симулятор)

**What to build:** пользователь заказывает коды из карточки товара: снимок единиц маркировки (места×штук=quantity), снимок тарифа, totalPrice; заказ создаётся в одной транзакции с резервом средств и outbox-событием отправки; заказ идемпотентен по Idempotency-Key; отмена до эмиссии освобождает резерв. Клиент видит свои заказы и баланс.

**Blocked by:** 01 (W3: биллинг-ядро)

**Status:** ready-for-agent

- [ ] POST /orders: одна транзакция = заказ (Draft) + RESERVE-проводка (CAS) + outbox `send-order-to-mpt`; available-проверка ПОСЛЕ CAS внутри транзакции; недостаточно → заказ и резерв НЕ создаются (AT-06)
- [ ] Снимок строки заказа: {places, unitsPerPlace, quantity, totalPrice, cisType, serialNumberType}; валидация 1 ≤ quantity ≤ places×unitsPerPlace; снимок тарифа {tariffId, pricePerCodeKZT}
- [ ] ORD-026 машина заказа: Draft→Validating→Funds Reserved→Queued→Sent→Accepted→Processing→Partially Completed→Completed/Rejected/Cancelled/Failed
- [ ] ORD-025 идемпотентность: Idempotency-Key = orderId, 10 повторов = 1 заказ = 1 RESERVE (AT-07); RESERVE уникален по (orderId, kind)
- [ ] ORD-028 отмена до эмиссии (до READY) → RELEASE (компенсация, не откат); после эмиссии → 409
- [ ] GET /orders — список заказов tenant со статусами (читает UI тикета 06)
- [ ] GET /billing/balance — balance/reserved/available (читает UI тикета 06)
- [ ] Отказ/таймаут симулятора → заказ Failed + RELEASE + задача оператору (паттерн ID-017) — интерфейс готов, реализация поллера в тикете 03
- [ ] cisType=UNIT, serialNumberType=OPERATOR; SELF_MADE/GROUP/SET → 400 с явным сообщением

## Ограничения

- Заказ MVP однопозиционный (1 товар на заказ); многопозиционность — позже, таблица OrderLine.
- isPaid в POST /api/orders всегда true (резерв уже есть).
