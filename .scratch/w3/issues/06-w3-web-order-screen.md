# 06 — W3-web: экраны дорожки «Заказы кодов» (ADR-008)

**What to build:** веб-морда дорожки «Заказы кодов» на конфигурируемых таблицах EntityList (не новые страницы где можно): баланс и пополнение файлом, создание заказа из карточки с превью расчёта, список заказов со статусами и масками КМ, «Скачать коды», форма «Отчет о нанесении».

**Blocked by:** 02 (W3: заказ КМ), 04 (W3: Code Vault), 05 (W3: нанесение + таймер)

**Status:** done (feat/w3-web)

- [x] EntityList data-driven (ADR-008): компонент `entity-list.tsx` + unit-тесты (заголовки колонок, render-колонки, empty state)
- [x] Баланс + пополнение: `balance.tsx` — GET /billing/balance (balance/reserved/available), POST /billing/payments/import {ref1c, amount} (MVP JSON-форма); идемпотентность ref1c визуально (повтор → 200 → «Проводка уже существует»)
- [x] Создание заказа: `order-form.tsx` — превью «места × штук = quantity», валидация 1 ≤ quantity ≤ произведение (тост), тариф GET /billing/tariff/active + totalPrice; POST /orders с Idempotency-Key = crypto.randomUUID(); 402 → тост «Недостаточно средств»; cisType=UNIT/serialNumberType=OPERATOR (UI не даёт выбрать SELF_MADE/GROUP/SET)
- [x] Список заказов tenant: `orders.tsx` — GET /orders (EntityList: id/gtin/quantity/totalPrice/status/createdAt), детали с масками КМ (GET /api/codes через Vault), кнопка «Скачать коды»
- [x] «Скачать коды»: POST /codes/export → скачивание CSV (BOM/«;») + тост «Аудит записан (CV-032)»; повторное скачивание тоже аудируется
- [x] Форма «Отчет о нанесении»: `utilisation-form.tsx` — orderId, releaseType (PRODUCTION/IMPORT/CIRCULATION), expirationDate/productionDate/manufacturerCountry (ISO2) → POST /utilisation; поллинг статуса через идемпотентный POST с тем же Idempotency-Key → SUCCESS → «Нанесение зарегистрировано, коды списаны» / ERROR → rejectReason
- [x] Дашборд «Алерты/Задачи»: `dashboard.tsx` — GET /moderation/exceptions, вкладки «Дедлайны 30 дней» (payload.reason содержит deadline) и «Все исключения»
- [x] api.ts: postRaw с Idempotency-Key header + postBlob (CSV) + unit-тесты
- [x] Routes/nav: /balance, /orders, /dashboard + layout-ссылки
- [x] e2e-browser.mjs: домcontentloaded фикс (vite HMR ломает networkidle) + W3-web стоп-тесты (баланс, пополнение идемпотентно, заказы, дашборд) — 8/8 PASS

## Ограничения

- Каталог заморожен (ADR-023) — экраны читают существующие карточки, не меняют их.
