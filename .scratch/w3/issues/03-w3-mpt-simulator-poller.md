# 03 — W3: симулятор ИС МПТ + поллер-сверка (ORD-029)

**What to build:** симулятор ИС МПТ ведёт себя строго по CONTRACT-IS-MPT.md (stateless, эмитит коды один раз, идемпотентный GET /api/codes); поллер MarkFlow догоняет пропущенные статусы и закрывает заказ при READY; таймаут и расхождение количества уходят оператору.

**Blocked by:** 02 (W3: заказ КМ)

**Status:** done (feat/w3-simulator)

- [x] Симулятор stateless, без setTimeout: status = f(now, createdAt, SIM_MPT_EMISSION_MS); PENDING пока now−createdAt < задержки, затем READY
- [x] POST /api/orders (идемпотентно по orderId), GET /api/orders (CREATED|PENDING|READY|REJECTED|CLOSED), GET /api/codes только для READY/CLOSED (CONTRACT-IS-MPT) — порт IMptAdapter (ADR-005), мок в БД (MptOrder/MptCode)
- [x] Коды генерируются ОДИН раз при первом переходе в READY и сохраняются; GET /api/codes идемпотентен; serial уникальны по (gtin) между заказами (composite @@unique[gtin,serial]), 7-значные по п.19; form base|extended (ADR-006)
- [x] Поллер MarkFlow (MPT_POLL_MS): outbox send-order-to-mpt → Sent (at-least-once, re-check CANCELLED перед SENT); опрашивает ВСЕ незакрытые (Sent/Processing/Partially), догоняет статусы
- [x] MPT_ORDER_TIMEOUT_MS: PENDING дольше → Failed + RELEASE (идемпотентный) + задача (outbox mpt-order-timeout FAILED)
- [x] READY → Completed; REJECTED → Rejected + RELEASE + задача; граница с тикетом 04: коды остаются в симуляторе (инджест в Vault — тикет 04)
- [x] ORD-029: поллер = сверка; дневного джоба нет; расхождение quantity (мок-шов gtin с 999999 → quantity−1) → Partially Completed + задача, без авто-финкорректировки
- [x] Стоп-тесты: restart не теряет статусы; GET /api/codes идемпотентен; ручной READY (сдвиг createdAt) догоняется; таймаут → Failed+RELEASE+задача; расхождение → Partially; Cancelled не отправляется/не эмитит (cancel нейтрализует outbox + re-check в поллере)

## Ограничения

- SIM_MPT_EMISSION_MS: демо-дефолт 45 000 мс, тесты 50–100 мс, читается динамически.
- Эволюция (после боевой интеграции): ежедневная сверка как независимый контрольный контур.

## /ocr-review 68d4861 — LOW (принято, не блокер)

- **Dead code `mptPollMs`** (outbox-poller.ts:24-26): `MPT_POLL_MS` определён, но не используется — reconciliation крутится на `OUTBOX_POLL_MS` (pollMs). Конфиг-интент «отдельный интервал поллера МПТ» не соблюдён (функционально ок). Исправить: задействовать mptPollMs или убрать геттер.
- **Гонка таймаута по `order.updatedAt`**: `age = now − order.updatedAt` — если поллер был выключен, а READY уже наступил, заказ в SENT старше таймаута → FAILED, хотя коды готовы. Узкая гонка, приемлемо для MVP; заметить при инджесте в Vault (тикет 04).
- **Симулятор эмитит только `form:"base"`** (ai91/ai92 = null): extended-КМ не генерируются в MVP. Структура ADR-006 готова; extended-рендер расширится в тикете 04 при инджесте/экспорте.
