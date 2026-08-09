# 03 — W3: симулятор ИС МПТ + поллер-сверка (ORD-029)

**What to build:** симулятор ИС МПТ ведёт себя строго по CONTRACT-IS-MPT.md (stateless, эмитит коды один раз, идемпотентный GET /api/codes); поллер MarkFlow догоняет пропущенные статусы и закрывает заказ при READY; таймаут и расхождение количества уходят оператору.

**Blocked by:** 02 (W3: заказ КМ)

**Status:** ready-for-agent

- [ ] Симулятор stateless, без setTimeout: status = f(now, createdAt, SIM_MPT_EMISSION_MS); PENDING пока now−createdAt < задержки, затем READY
- [ ] POST /api/orders (productGroup, products[gtin, quantity, serialNumberType=OPERATOR, cisType=UNIT], businessPlaceId, releaseMethodType, isPaid=true) → orderId; GET /api/orders (CREATED|PENDING|READY|REJECTED|CLOSED); GET /api/codes только для READY/CLOSED (CONTRACT-IS-MPT)
- [ ] Коды генерируются ОДИН раз при первом переходе в READY и сохраняются; GET /api/codes идемпотентен (те же коды при повторе); serial уникальны по (gtin) между заказами, валидны по п.19 + ADR-006
- [ ] Поллер MarkFlow (MPT_POLL_MS, конфиг): опрашивает ВСЕ незакрытые заказы (Sent/Accepted/Processing), догоняет пропущенные статусы (тест: вручную READY → догоняется ≤ 2 интервалов)
- [ ] MPT_ORDER_TIMEOUT_MS: PENDING дольше → заказ Failed + RELEASE + задача оператору (ID-017)
- [ ] Внешние CREATED|PENDING|READY → внутренняя машина ORD-026 (Sent→Processing→Completed); READY → Completed + коды в Code Vault (интерфейс Vault готов, реализация в тикете 04)
- [ ] ORD-029: поллер = сверка; дневного джоба нет; расхождение quantity → Partially Completed + задача оператору, без авто-финкорректировки (мок-шов quantity−1 в тесте)

## Ограничения

- SIM_MPT_EMISSION_MS: демо-дефолт 45 000 мс, тесты 50–100 мс, читается динамически.
- Эволюция (после боевой интеграции): ежедневная сверка как независимый контрольный контур.
