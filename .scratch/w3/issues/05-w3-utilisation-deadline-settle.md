# 05 — W3: отчёт о нанесении + таймер 30 дней + списание

**What to build:** регистрация сведений о нанесении через симулятор ИС МПТ (POST /api/utilisation) списывает КМ с баланса (п.26); таймер 30 дней от получения КМ алертит 7/3/1 и аннулирует неиспользованные коды (смена статуса, не удаление).

**Blocked by:** 03 (W3: симулятор + поллер), 04 (W3: Code Vault)

**Status:** done (feat/w3-utilisation)

- [x] Симулятор: POST /api/utilisation (sntins[], businessPlaceId, releaseType, expirationDate/productionDate/manufacturerCountry обяз) → reportId; GET /api/utilisation/:reportId → IN_PROCESS|SUCCESS|ERROR(+rejectReason); неизвестный код (serial не в MptCode) или уже нанесённый (used) → ERROR сразу
- [x] MarkFlow: POST /utilisation {orderId, releaseType, даты, страна} → полные КМ из Vault (reveal + аудит CV-032) → submitUtilisation → UtilisationReport; поллер (pollReports) доводит до SUCCESS/ERROR
- [x] SUCCESS = SETTLE (п.26): BillingService.settle(totalPrice из снимка заказа, refOrderId+reason), коды → UTILISED, резерв заказа гасится (RELEASE); идемпотентно по settled
- [x] ERROR → списания НЕТ; задача оператору (mpt-order-timeout FAILED) с rejectReason
- [x] Таймер 30 дней (ADR-012): UTIL_DEADLINE_DAYS (конфиг, дедлайн=данные), отсчёт от order.updatedAt; поллер алертов 7/3/1 (UtilisationAlert + задача) и аннулирование после дедлайна = EXPIRED (смена статуса, не удаление)
- [x] Стоп-тесты: без expirationDate → 400; SETTLE только после SUCCESS; повторное нанесение того же кода → ERROR («code already used»); аннулирование не удаляет строки Vault
- [x] e2e: SUCCESS → коды UTILISED, balance −= totalPrice, резерв заказа погашен (RELEASE); ERROR → без списания + задача; сдвиг даты → алерты 7/3/1 + EXPIRED

## Ограничения

- Финансовая корректировка при расхождении — вручную (SETTLE по фактическому количеству + RELEASE разницы оператором); авто-корректировка — пост-интеграционная фаза.
