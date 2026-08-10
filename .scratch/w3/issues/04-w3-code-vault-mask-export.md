# 04 — W3: Code Vault (шифрование + маска + экспорт)

**What to build:** полученные КМ хранятся в зашифрованном виде (AES-256-GCM, ключи через KMS), клиенту показываются маски, полные КМ доступны только привилегированным операциям (печать/экспорт) с аудитом каждой выдачи; «Скачать коды» = CSV.

**Blocked by:** 03 (W3: симулятор + поллер)

**Status:** done (feat/w3-vault)

- [x] Vault-строка: gtin ОТКРЫТЫЙ + зашифрованный {serial, ai91, ai92} (AES-256-GCM, per-row nonce (12) || tag (16) || ciphertext, base64) + метадата {orderId, cardId, tenantId, status, createdAt, mask}; ключи через KMS_ADAPTER + KMS_PROFILE (file-KMS dev / VaultKmsAdapter-заглушка prod), без правок кода при переключении
- [x] Негативный тест CV-030: дамп БД (raw JSON vault) не содержит plaintext serial; ciphertext ≠ serial
- [x] Маска КМ: mask = `{gtin}:{первые2…последние2}` при length>6, иначе «••••»; CV-031: serial не в ответах GET /api/codes и не в ciphertext
- [x] GET /api/codes отдаёт {gtin, mask, quantity, status, orderId} (одна строка на заказ, без полных serial)
- [x] Экспорт CSV (CV-032): колонки gtin, serial, ai91, ai92, form, km_full, orderId; km_full с литералом <GS> (текст, не байт 0x1D), сериализация из структуры ADR-006; UTF-8 BOM («\uFEFF»), «;», кавычки; только COMPLETED/PARTIALLY (иначе 409); tenant-scoped (чужой → 404); каждая выгрузка = аудит VaultExport (actor, время, orderId, причина, count); повторный экспорт разрешён и тоже аудируется
- [x] Полный КМ — только печать (POST /codes/print) и экспорт, каждая с аудит-записью (CV-032)
- [x] Инджест из симулятора (граница с тикетом 03): поллер при COMPLETED/PARTIALLY читает GET /api/codes → VaultService.ingest → CodeVault (ACTIVE); идемпотентно (count>0 → skip)
- [x] Расширенный рендер ADR-006: KMS_EXTENDED_CODES=true → ai91=gtin, ai92=tnved, form=extended; дефолт false → base

## Ограничения

- Хешей полного КМ нет (не усложняем).
- Структура base|extended — по ADR-006; рендер/парсинг только из структуры.

## /ocr-review ca316e9 — LOW (принято, не блокер)

- **`void attrs`** (vault.controller.ts:134,155): `attrs` вычисляется, но не используется — extended-логика уже в `revealForExport` (withExtended через card). Мёртвый код; убрать.
- **`reveal` (print) возвращает `form:"base"` всегда** (vault.service.ts:87): vault хранит только base (симулятор эмитит base), extended применяется только в export с KMS_EXTENDED_CODES — консистентно, но print не учитывает extended-КМ (по спеке extended только для экспорта).
- **`masks()` перезаписывает mask последней строкой** (vault.controller.ts:89 `cur.mask = i.mask`): для одного заказа все serial-маски одинаковы (первые2…последние2), утечки нет, косметика.
- **log-scan CV-031**: тест проверяет отсутствие serial в ответах GET /api/codes и ciphertext ≠ serial; полного перехвата console.log нет — но serial физически не логируется (сериал только в seal/open, в open не логируется). При желании добавить spy на console.log в тесте.
- **`ingest` не проверяет tenant на входе**: находит order по id, создаёт vault с `order.tenantId` — поллер вызывает только для своих заказов, безопасно; при прямом вызове извне — доверять вызывающему.
