# 01 — W3: биллинг-ядро (Ledger + тарифы + пополнение файлом «из 1С»)

**What to build:** у tenant появляется счёт с двойной записью: пополнение файлом «из 1С» (PaymentImport, идемпотентно по ref1c), резерв/релиз/списание через проводки, тариф на КМ как данные. Баланс всегда равен сумме проводок; денежные операции конкурентоспособны через optimistic CAS.

**Blocked by:** None — can start immediately

**Status:** done (feat/w3-billing)

- [x] LedgerEntry (double-entry, ADR-007): виды TOPUP (кредит), RESERVE, RELEASE, SETTLE; amount BigInt минорные; refOrderId + причина; Account.balance = материализованный кэш, обновляется в той же CAS-транзакции
- [x] Tariff {id, validFrom, validTo, pricePerCodeKZT BigInt, unit="KM", currency="KZT"} — seed (одна активная строка); выбор = активный на дату; нет активного → «тариф не настроен»
- [x] PaymentImport (ADR-010): пополнение, идемпотентно по ref1c (повтор не создаёт второй TOPUP); транспорт MVP = JSON-строка (файловый парсер — в тикете 06 при UI)
- [x] Optimistic CAS на Account.version (UPDATE...WHERE id AND version), портабельно SQLite↔PG, без FOR UPDATE; конфликт → до 3 ретраев с backoff, затем 409
- [x] available = balance − SUM(активных RESERVE); инвариант-тест: SUM(проводок по kind) == Account.balance после каждой операции
- [x] AT-06: операция при 0 баланса отклоняется (402), проводок нет
- [x] Конкурентный стоп-тест: два параллельных резерва на сумму > available → ровно один успех (201+402), один RESERVE

## Ограничения (решения грилля W3)

- Резерв уникален по (orderId, kind) — идемпотентность (для тикета 02).
- Цена карточки/инвойса в биллинге не участвует (ADR-023); priceUsd — закупочная цена, вне биллинга.

## /ocr-review 6a791f3 — итог

- HIGH (исправлено в fix-коммите): **двойной RELEASE инфлейтил available** — повторный release того же orderId создавал вторую RELEASE-проводку → activeReserve отрицательный → available = balance + amount. Фикс: release идемпотентен (повтор → существующая проводка), тест.
- MEDIUM (исправлено): **SETTLE без проверки available** — мог увести balance в минус (overdraw). Фикс: checkAvailable = balance − активные резервы ≥ amount; тест (списание 50000 → баланс 0, повторное 10000 → 402).
- LOW (принято как есть): CAS-ретраев 3 суммарно (по гриллю «до 3» — приемлемо); PaymentImport принимает JSON, а не файл — по ADR-010 апдейт эндпоинт расширяемый, multipart-загрузка в тикете 06.
- Проверено и OK: валюта целые тенге (ийын/tyiyn нет нигде); seed-тариф=100; CAS внутри цикла + конкурентный тест [201,402] один резерв; инвариант ledger==balance после каждого метода; AT-06 402; «тариф не настроен» 409; все ответы в формате Приложения B; tenant-guard (AT-16) на всех billing-эндпоинтах.
